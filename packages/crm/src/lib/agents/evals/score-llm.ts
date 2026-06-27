// Agent Eval Harness — E3: the REAL Haiku-backed eval grader.
//
// score.ts owns the pure `EvalGrader` SEAM (it awaits an injected grader, defends
// against garbage, and FAILS SOFT to the deterministic floor). This module is the
// one real implementation of that seam: a small, strict Anthropic call that reads
// the finished transcript + the scenario's `successCriteria` and reports which
// criteria the conversation MET and which it MISSED.
//
// It MIRRORS judge-llm.ts byte-for-byte in how it acquires the client and reads
// the model:
//   • the client comes from an injectable `getClient` (defaults to
//     getAnthropicClient) — tests inject a fake; production gets the platform
//     Anthropic client (or null when no key);
//   • the model id is read at CALL time (process.env.ANTHROPIC_EVAL_MODEL || a
//     Haiku default), so a test/env that sets it later still wins;
//   • the response text blocks are joined, fence-stripped, and JSON-parsed
//     DEFENSIVELY — every failure mode (no key, network error, non-JSON, wrong
//     shape) collapses to `{ met:[], missed:[] }` (fail SOFT). The grader NEVER
//     throws; score.ts wraps it with the same guarantee (belt + suspenders).
//
// NOT "use server": this is a plain module of async fns/factories the "use server"
// action injects (it also exports the MODEL constant + a factory, so it must stay
// a plain module — the same split classify-llm/judge-llm use). It performs I/O
// (the Anthropic call) but is DI-friendly: callers pass the produced grader as
// `deps.grader` to `scoreEvalTranscript`, and the unit tests inject their own
// in-memory client.

import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient } from "@/lib/ai/client";
import type { EvalGrader } from "./score";
import type { EvalScenario, EvalTranscript, EvalTurn } from "./eval-types";

// ─── model + budget ──────────────────────────────────────────────────────────

/**
 * The grader is a tiny, strict JSON call — pick the cheapest capable model.
 * Overridable via ANTHROPIC_EVAL_MODEL; defaults to a Haiku-tier model so grading
 * a transcript never costs what running the agent did. (Read at call time, not at
 * module load, so a test/env that sets it later still wins — mirrors judge-llm.)
 */
export const DEFAULT_EVAL_MODEL = "claude-haiku-4-5";

/** A verdict needs only a little JSON back. Keep it tight so a runaway model can't
 *  turn grading into an expensive generation. */
const EVAL_MAX_TOKENS = 512;

// ─── system prompt (strict, JSON-only) ───────────────────────────────────────

const GRADER_SYSTEM = [
  "You are grading a finished conversation between a simulated CUSTOMER and an AI AGENT against a list of success criteria.",
  "You are given the scenario (the customer's situation) and the full transcript. Judge ONLY whether each success criterion was satisfied by what the AGENT actually did in the transcript.",
  'Return ONLY a JSON object of the shape: {"met": string[], "missed": string[], "notes"?: string}.',
  "Each string in `met` / `missed` MUST be copied VERBATIM from the provided success criteria list — do not paraphrase, invent, split, or merge criteria.",
  "Put a criterion in `met` if the transcript clearly satisfies it; put it in `missed` if it clearly does not (or there is no evidence it was satisfied). Every criterion belongs in exactly one of the two lists.",
  "Judge against the AGENT's turns only — the customer's lines are the test, not the agent's behavior. Be fair but strict: do not credit a criterion the agent merely gestured at.",
  "`notes` is an optional one-sentence summary of the most important miss (or why it went well). Keep it short.",
  "Do not include any prose, explanation, or markdown fences outside the JSON. Output JSON only.",
].join("\n");

// ─── compact transcript view ─────────────────────────────────────────────────

/** The max characters of transcript we ship to the grader. A long multi-turn
 *  conversation could blow the tight token budget, and the criteria-relevant
 *  behavior almost always lives in the agent's substantive replies; a generous
 *  head is enough to grade them while keeping the prompt cheap. */
const TRANSCRIPT_SLICE_CHARS = 6000;

/** Render the transcript as a simple "Customer:/Agent:" script (defensive: skips
 *  malformed turns) and trim to a budgeted head. Pure; never throws. */
function renderTranscript(transcript: EvalTranscript): string {
  const turns: EvalTurn[] = Array.isArray(transcript?.turns) ? transcript.turns : [];
  const lines: string[] = [];
  for (const t of turns) {
    if (!t || typeof t.text !== "string") continue;
    const who = t.role === "agent" ? "Agent" : "Customer";
    lines.push(`${who}: ${t.text}`);
  }
  const script = lines.join("\n");
  return script.length > TRANSCRIPT_SLICE_CHARS
    ? `${script.slice(0, TRANSCRIPT_SLICE_CHARS)}…`
    : script;
}

/** The minimal, stable slice of a scenario the grader needs to grade: its title +
 *  persona (so the model understands the customer's situation) + the criteria it
 *  must judge. Pure; never throws. */
function compactScenarioForGrader(scenario: EvalScenario): Record<string, unknown> {
  const criteria = Array.isArray(scenario?.successCriteria)
    ? scenario.successCriteria.filter((c) => typeof c === "string" && c.length > 0)
    : [];
  return {
    title: typeof scenario?.title === "string" ? scenario.title : "",
    persona: typeof scenario?.persona === "string" ? scenario.persona : "",
    successCriteria: criteria,
  };
}

// ─── defensive parse ─────────────────────────────────────────────────────────

/** Strip a leading/trailing ```json … ``` (or ``` … ```) fence if the model
 *  wrapped its JSON despite the instruction not to. Mirrors judge-llm. */
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

/** Coerce an unknown into a clean string[] (drop non-strings + empties). */
function stringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.length > 0);
}

/**
 * Parse the model's text into `{ met, missed, notes? }`, FAILING SOFT on anything
 * malformed. A parse error, a non-object, or a missing/garbage `met`/`missed` →
 * `{ met:[], missed:[] }`. A well-formed verdict keeps only the clean string
 * entries (and a string `notes` if present). Never throws.
 */
export function parseGraderResponse(raw: string): { met: string[]; missed: string[]; notes?: string } {
  const soft: { met: string[]; missed: string[] } = { met: [], missed: [] };
  if (typeof raw !== "string") return soft;
  const stripped = stripFences(raw);
  if (!stripped) return soft;

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    return soft;
  }
  if (!isObject(parsed)) return soft;

  const met = stringArray(parsed.met);
  const missed = stringArray(parsed.missed);
  const notes = typeof parsed.notes === "string" && parsed.notes.length > 0 ? parsed.notes : undefined;

  return { met, missed, ...(notes ? { notes } : {}) };
}

// ─── the grader factory ──────────────────────────────────────────────────────

/**
 * Build a real Haiku-backed `EvalGrader`. The returned grader reviews a finished
 * transcript against its scenario's `successCriteria` and returns
 * `{ met, missed, notes? }` — FAILING SOFT on every failure mode (no key, network
 * error, non-JSON, wrong shape → `{ met:[], missed:[] }`). It NEVER throws;
 * `scoreEvalTranscript` wraps it with the same guarantee.
 *
 * `getClient` is the DI seam — defaults to getAnthropicClient (the platform
 * Anthropic client, or null when ANTHROPIC_API_KEY is unset, in which case the
 * grader returns the soft verdict and scoring proceeds on the deterministic floor
 * alone). Tests inject a fake client to exercise the parse without a network call.
 *
 * When the scenario has NO success criteria there is nothing for the grader to
 * judge — it short-circuits to the soft verdict (no LLM call), so an agent with
 * only mustDo/mustNotDo rules never pays for an empty grade.
 */
export function makeLlmEvalGrader(
  deps: { getClient?: () => Anthropic | null } = {},
): EvalGrader {
  const getClient = deps.getClient ?? getAnthropicClient;

  return async ({ transcript, scenario }): Promise<{ met: string[]; missed: string[]; notes?: string }> => {
    const soft: { met: string[]; missed: string[] } = { met: [], missed: [] };

    const criteria = Array.isArray(scenario?.successCriteria)
      ? scenario.successCriteria.filter((c) => typeof c === "string" && c.length > 0)
      : [];
    if (criteria.length === 0) return soft;

    const client = getClient();
    if (!client) return soft;

    const model = process.env.ANTHROPIC_EVAL_MODEL?.trim() || DEFAULT_EVAL_MODEL;

    try {
      const userContent = [
        `Scenario: ${JSON.stringify(compactScenarioForGrader(scenario))}`,
        `Transcript:\n${renderTranscript(transcript)}`,
      ].join("\n\n");

      const resp = await client.messages.create({
        model,
        max_tokens: EVAL_MAX_TOKENS,
        system: GRADER_SYSTEM,
        messages: [{ role: "user", content: userContent }],
      });

      const out = resp.content
        .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
        .map((b) => b.text)
        .join("\n");

      return parseGraderResponse(out);
    } catch {
      // Fail SOFT: any LLM/network error → the soft verdict so scoring proceeds on
      // the deterministic floor (which is already guard-railed).
      return soft;
    }
  };
}
