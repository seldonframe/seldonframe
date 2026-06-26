// Self-Improving Generator — L5.2 — Task 5: the REAL Haiku-backed grader.
//
// judge.ts (T4) is the pure maker≠checker SEAM — it awaits an injected
// `AgentGrader`, defends against garbage, and FAILS OPEN. This module is the one
// real implementation of that seam: a small, strict Anthropic call that reviews
// an auto-generated bundle against the user's original sentence and flags
// mismatches (wrong trigger/channel, missing implied tools, unsafe/empty
// guardrails), proposing only LOW-RISK plumbing fixes.
//
// It MIRRORS classify-llm.ts byte-for-byte in how it acquires the client and
// reads the model:
//   • the client comes from an injectable `getClient` (defaults to
//     getAnthropicClient) — tests inject a fake, production gets the platform
//     Anthropic client (or null when no key);
//   • the model id is read at CALL time (process.env … || a Haiku default), so a
//     test/env that sets it later still wins;
//   • the response text blocks are joined, fence-stripped, and JSON-parsed
//     DEFENSIVELY — any failure mode (no key, network error, non-JSON, wrong
//     shape) collapses to `{ ok:true, issues:[] }` (fail OPEN). The grader NEVER
//     throws and NEVER blocks a generation; judge.ts wraps it with the same
//     guarantee (belt + suspenders).
//
// NOT "use server": this is a plain module of async fns/factories the "use
// server" action injects (it also exports the MODEL constant + a factory, so it
// must stay a plain module — same split classify-llm.ts uses). It performs I/O
// (the Anthropic call) but is DI-friendly: callers pass the produced grader as
// `judge` and the unit tests inject their own in-memory client.

import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient } from "@/lib/ai/client";
import type { AgentBundle } from "@/lib/agents/generate/agent-bundle";
import type {
  AgentGrader,
  JudgeIssue,
  JudgeResult,
} from "@/lib/agents/generate/judge";

// ─── model + budget ──────────────────────────────────────────────────────────

/**
 * The judge is a tiny, strict JSON call — pick the cheapest capable model.
 * Overridable via ANTHROPIC_JUDGE_MODEL; defaults to a Haiku-tier model so a
 * review never costs what a full draft does. (Read at call time, not module
 * load, so a test/env that sets it later still wins — mirrors classify-llm.)
 */
export const DEFAULT_JUDGE_MODEL = "claude-haiku-4-5";

/** A verdict needs only a little JSON back. Keep it tight so a runaway model
 *  can't turn a review into an expensive generation. */
const JUDGE_MAX_TOKENS = 512;

// ─── system prompt (strict, JSON-only) ───────────────────────────────────────

const JUDGE_SYSTEM = [
  "You are reviewing an auto-generated agent against the user's request.",
  'Return ONLY a JSON object of the shape: {"ok": boolean, "issues": [{"field": string, "problem": string, "fix"?: object}]}.',
  "field MUST be one of: trigger | verify | guardrails | connectors | skill | channel.",
  "A fix may ONLY set trigger, verify, guardrails, or connectors — never skill, channel, name, prose, or persona. Omit fix for issues you cannot safely auto-correct (the operator resolves those).",
  "Flag: a trigger or channel that contradicts the sentence (e.g. the sentence says 'after a booking' but the trigger is inbound); tools the sentence clearly implies but the bundle is missing; unsafe or empty guardrails on an outbound agent.",
  "Be conservative. If the bundle looks right for the request, return {\"ok\": true, \"issues\": []}. Do not invent problems.",
  "Do not include any prose, explanation, or markdown fences. Output JSON only.",
].join("\n");

// ─── compact bundle view ─────────────────────────────────────────────────────

/**
 * The minimal, stable slice of a bundle the grader needs — name/description +
 * the blueprint's trigger / skill-prose presence / channel / connectors. We do
 * NOT ship the full prompt prose (the judge must never rewrite the voice, and a
 * huge prompt would blow the token budget); we send just enough to spot a
 * trigger/channel mismatch or a missing tool. Pure; never throws.
 */
export function compactBundleForJudge(bundle: AgentBundle): Record<string, unknown> {
  const bp = bundle?.blueprint ?? ({} as AgentBundle["blueprint"]);
  const connectors = Array.isArray(bp.connectors)
    ? bp.connectors.map((c) => ({ kind: c?.kind, id: c?.id }))
    : [];
  return {
    name: bundle?.name,
    description: bundle?.description,
    blueprint: {
      trigger: bp.trigger ?? null,
      // skill prose is summarized to a boolean — its CONTENT is off-limits to
      // the judge, but whether one exists is a useful signal.
      hasSkillPrompt: typeof bp.customSkillMd === "string" && bp.customSkillMd.trim().length > 0,
      capabilities: Array.isArray(bp.capabilities) ? bp.capabilities : [],
      channel: bp.trigger?.channel ?? null,
      connectors,
    },
  };
}

// ─── defensive parse ─────────────────────────────────────────────────────────

/** Strip a leading/trailing ```json … ``` (or ``` … ```) fence if the model
 *  wrapped its JSON despite the instruction not to. Mirrors classify-llm. */
function stripFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

/** Is `v` a plain object (not null, not an array)? */
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Parse the model's text into a JudgeResult, FAILING OPEN on anything malformed.
 * A parse error, a non-object, a non-boolean `ok`, or a non-array `issues` →
 * `{ ok:true, issues:[] }`. A well-formed verdict keeps `ok` and carries through
 * only the clean issue entries (object with string field/problem; an object
 * `fix` carried verbatim — judge.applyJudgeFixes allow-list-filters it later, so
 * a bad fix can never leak through). Never throws.
 */
export function parseJudgeResponse(raw: string): JudgeResult {
  const open: JudgeResult = { ok: true, issues: [] };
  if (typeof raw !== "string") return open;
  const stripped = stripFences(raw);
  if (!stripped) return open;

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    return open;
  }
  if (!isObject(parsed) || typeof parsed.ok !== "boolean" || !Array.isArray(parsed.issues)) {
    return open;
  }

  const issues: JudgeIssue[] = [];
  for (const raw of parsed.issues) {
    if (!isObject(raw)) continue;
    const field = raw.field;
    const problem = raw.problem;
    if (typeof field !== "string" || typeof problem !== "string") continue;
    const issue: JudgeIssue = { field, problem };
    if (isObject(raw.fix)) {
      issue.fix = raw.fix as JudgeIssue["fix"];
    }
    issues.push(issue);
  }

  return { ok: parsed.ok, issues };
}

// ─── the grader factory ──────────────────────────────────────────────────────

/**
 * Build a real Haiku-backed `AgentGrader`. The returned grader reviews a
 * generated bundle against its sentence and returns a JudgeResult — FAILING OPEN
 * on every failure mode (no key, network error, non-JSON, wrong shape →
 * `{ ok:true, issues:[] }`). It NEVER throws; judge.judgeGeneratedAgent wraps it
 * with the same guarantee.
 *
 * `getClient` is the DI seam — defaults to getAnthropicClient (the platform
 * Anthropic client, or null when ANTHROPIC_API_KEY is unset, in which case the
 * grader returns the open verdict and generation proceeds un-reviewed-but-safe).
 * Tests inject a fake client to exercise the parse without a network call.
 */
export function makeLlmAgentGrader(
  deps: { getClient?: () => Anthropic | null } = {},
): AgentGrader {
  const getClient = deps.getClient ?? getAnthropicClient;

  return async ({ sentence, bundle, priorLessons }): Promise<JudgeResult> => {
    const open: JudgeResult = { ok: true, issues: [] };

    const text = typeof sentence === "string" ? sentence.trim() : "";
    if (!text) return open;

    const client = getClient();
    if (!client) return open;

    const model = process.env.ANTHROPIC_JUDGE_MODEL?.trim() || DEFAULT_JUDGE_MODEL;

    // Fold past corrections (L5.3) into the system prompt, only when present, so
    // the grader catches a mistake we've fixed before. "" → prompt unchanged.
    const lessons = typeof priorLessons === "string" ? priorLessons.trim() : "";
    const system = lessons ? `${JUDGE_SYSTEM}\n\n${lessons}` : JUDGE_SYSTEM;

    try {
      const userContent = [
        `Request: ${text}`,
        `Generated agent: ${JSON.stringify(compactBundleForJudge(bundle))}`,
      ].join("\n\n");

      const resp = await client.messages.create({
        model,
        max_tokens: JUDGE_MAX_TOKENS,
        system,
        messages: [{ role: "user", content: userContent }],
      });

      const out = resp.content
        .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
        .map((b) => b.text)
        .join("\n");

      return parseJudgeResponse(out);
    } catch {
      // Fail OPEN: any LLM/network error → the safe verdict so generation
      // proceeds (the deterministic bundle is already guard-railed).
      return open;
    }
  };
}
