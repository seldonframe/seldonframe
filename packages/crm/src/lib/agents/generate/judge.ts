// Self-Improving Generator — L5.2 — Task 4: the maker≠checker generation-time judge.
//
// agent-bundle.ts is the deterministic MAKER: it classifies an English sentence
// into an AgentIntent and assembles a safe, guard-railed bundle. This module is
// the optional CHECKER on top of it — a different, stronger grader reviews each
// generated bundle against the original sentence and flags mismatches (e.g. "the
// sentence says 'after a booking' but the trigger is inbound"), proposing
// LOW-RISK fixes. That's the maker≠checker value at GENERATION time: the model
// that wrote the agent never grades its own homework.
//
// IMPORTANT — this MIRRORS the L2 llm-checker seam (lib/agents/verify/llm-checker
// .ts) but with the OPPOSITE failure bias:
//   • the L2 verify checker FAILS CLOSED — a broken grader BLOCKS a SEND, because
//     a bad outbound message reaching a customer is the costly failure.
//   • this generation judge FAILS OPEN — a broken grader must NEVER block a
//     GENERATION. The bundle the maker produced is already safe (the assembler
//     wired every default trigger/verify/guardrail), so the worst case of a
//     missing judge is an un-reviewed-but-safe agent the operator can still edit.
//     Blocking generation on an LLM hiccup would be strictly worse than shipping
//     the deterministic bundle.
//
// Design:
//   • `AgentGrader` is the DI seam — the abstract "review this bundle" call.
//     Tests inject a fake; production injects a real Haiku-backed grader
//     (judge-llm.ts, Task 5). This module does NOT call any LLM itself — it stays
//     a pure seam so it's testable with no network.
//   • `judgeGeneratedAgent(args, {grader})` awaits the grader and DEFENSIVELY
//     normalizes its verdict; a throw OR any malformed shape → `{ok:true,
//     issues:[]}` (fail open). It NEVER throws.
//   • `applyJudgeFixes(bundle, result)` is PURE — it returns a NEW bundle with
//     each issue's `fix` shallow-merged into the blueprint, but ONLY for the
//     allow-listed LOW-RISK fields (trigger / verify / guardrails / connectors).
//     A fix that targets anything else — especially the prompt prose or the
//     agent's name/identity — is IGNORED: the judge corrects PLUMBING, never
//     rewrites the agent's voice. Issues without a `fix` are left untouched
//     (surfaced to the operator to resolve).
//
// No "use server" — this is a pure seam (no I/O of its own). A real grader's LLM
// call lives in the operator-/action-supplied `AgentGrader`, NOT here.

import type { AgentBundle } from "./agent-bundle";
import type { AgentBlueprint } from "@/db/schema/agents";

// ─── public types ────────────────────────────────────────────────────────────

/**
 * One problem the judge found with a generated bundle. `field` names the
 * blueprint field at fault (for the operator-facing message), `problem` is the
 * human-readable explanation, and `fix` (OPTIONAL) is a proposed low-risk patch.
 *
 * `fix` is a `Partial<AgentBlueprint>`, but `applyJudgeFixes` only ever merges
 * the ALLOWED low-risk fields from it (see `ALLOWED_FIX_FIELDS`) — a fix may name
 * any blueprint field, yet only plumbing fields are applied. An issue WITHOUT a
 * `fix` is surfaced to the operator to resolve by hand.
 */
export type JudgeIssue = {
  field: string;
  problem: string;
  fix?: Partial<AgentBlueprint>;
};

/** The judge's verdict: `ok:true` (no issues) or `ok:false` with the issues. */
export type JudgeResult = { ok: boolean; issues: JudgeIssue[] };

/**
 * The DI'd "review this generated agent" call — the seam a real LLM grader plugs
 * into. Given the original sentence and the assembled bundle, it returns a
 * `JudgeResult`. It MAY throw (network/timeout/parse) and MAY return a malformed
 * object — `judgeGeneratedAgent` defends against both and fails OPEN. Keeping
 * this minimal makes it trivial to back with any LLM call.
 *
 * `priorLessons` (L5.3 self-improving loop) is an OPTIONAL rendered block of
 * past generator corrections — when present a real grader folds it into its
 * prompt so it catches a mistake we've fixed before. Pure/fake graders ignore it.
 */
export type AgentGrader = (args: {
  sentence: string;
  bundle: AgentBundle;
  priorLessons?: string;
}) => Promise<JudgeResult>;

// ─── the allow-list (what a fix may touch) ───────────────────────────────────

/**
 * The ONLY blueprint fields a judge `fix` is allowed to change — the low-risk
 * "plumbing" the deterministic assembler already owns and clamps:
 *   • `trigger`    — what fires the agent (resolveAgentTrigger re-clamps it);
 *   • `verify`     — the maker≠checker verify rubric;
 *   • `guardrails` — the brakes (quiet hours / caps / kill switch);
 *   • `connectors` — the bound external tools.
 * Everything else — the prompt prose (`customSkillMd`, `greeting`, `faq`), the
 * capabilities, the persona/voice — is OFF LIMITS: the judge must never rewrite
 * the agent's voice or grant it new powers. A fix naming any other field is
 * ignored.
 */
const ALLOWED_FIX_FIELDS = [
  "trigger",
  "verify",
  "guardrails",
  "connectors",
] as const satisfies ReadonlyArray<keyof AgentBlueprint>;

type AllowedFixField = (typeof ALLOWED_FIX_FIELDS)[number];

// ─── defensive normalization ─────────────────────────────────────────────────

/** Is `v` a plain object (not null, not an array)? */
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Normalize ONE raw issue from a grader into a clean `JudgeIssue`, or `null` if
 * it's unusable (not an object, or missing a string `field`/`problem`). The
 * `fix`, if present and an object, is carried verbatim — `applyJudgeFixes` is the
 * one that allow-list-filters it, so a malformed fix here can never leak through.
 */
function normalizeIssue(raw: unknown): JudgeIssue | null {
  if (!isObject(raw)) return null;
  const field = raw.field;
  const problem = raw.problem;
  if (typeof field !== "string" || typeof problem !== "string") return null;
  const issue: JudgeIssue = { field, problem };
  if (isObject(raw.fix)) {
    issue.fix = raw.fix as Partial<AgentBlueprint>;
  }
  return issue;
}

/**
 * Coerce a grader's raw return into a well-formed `JudgeResult`, FAILING OPEN on
 * anything malformed. The rules:
 *   • not an object, or `ok` is not a boolean, or `issues` is not an array →
 *     `{ ok:true, issues:[] }` (we cannot trust a half-formed verdict to block);
 *   • a well-formed verdict → keep `ok`, but drop any garbage issue entries
 *     (non-objects / missing field/problem) so downstream code sees only clean
 *     issues.
 * Never throws.
 */
function normalizeResult(raw: unknown): JudgeResult {
  if (!isObject(raw) || typeof raw.ok !== "boolean" || !Array.isArray(raw.issues)) {
    return { ok: true, issues: [] };
  }
  const issues = raw.issues
    .map(normalizeIssue)
    .filter((i): i is JudgeIssue => i !== null);
  return { ok: raw.ok, issues };
}

// ─── the judge ───────────────────────────────────────────────────────────────

/**
 * Run the (DI'd) grader over a generated bundle and return its verdict.
 *
 * FAILS OPEN: if the grader throws, returns a non-object, or returns a malformed
 * result (missing boolean `ok` / non-array `issues`), this returns
 * `{ ok:true, issues:[] }` — generation is NEVER blocked by a broken judge (the
 * deterministic bundle is already safe). A well-formed verdict is passed through
 * with its issues defensively cleaned. NEVER throws.
 */
export async function judgeGeneratedAgent(
  args: { sentence: string; bundle: AgentBundle; priorLessons?: string },
  deps: { grader: AgentGrader },
): Promise<JudgeResult> {
  try {
    const raw = await deps.grader(args);
    return normalizeResult(raw);
  } catch {
    // Fail OPEN: a throwing judge must not block a (safe) generation.
    return { ok: true, issues: [] };
  }
}

// ─── applying fixes ──────────────────────────────────────────────────────────

/**
 * Return a NEW bundle with the judge's low-risk fixes applied. PURE — the input
 * bundle and its blueprint are never mutated.
 *
 * For each issue WITH a `fix`, only the ALLOWED low-risk blueprint fields
 * (`ALLOWED_FIX_FIELDS`: trigger / verify / guardrails / connectors) are
 * shallow-merged into the blueprint; any other field a fix names (prompt prose,
 * name, capabilities, …) is IGNORED. Issues are applied in order, so a later
 * fix to the same field wins (last-write). Issues WITHOUT a `fix` are left
 * untouched (the operator resolves them). When `result.ok` is true / there are
 * no fixes, an equivalent bundle is returned with the blueprint unchanged.
 *
 * Never throws.
 */
export function applyJudgeFixes(bundle: AgentBundle, result: JudgeResult): AgentBundle {
  // A fresh blueprint object so the input is never mutated. (Shallow is enough:
  // every value we write below is a whole replacement field the grader supplied,
  // and we never mutate the nested values we copy over.)
  const nextBlueprint: AgentBlueprint = { ...bundle.blueprint };

  const issues = Array.isArray(result?.issues) ? result.issues : [];
  for (const issue of issues) {
    const fix = issue?.fix;
    if (!isObject(fix)) continue;
    for (const key of ALLOWED_FIX_FIELDS) {
      // Only merge a field the fix actually carries (so an allowed-but-absent
      // field never clobbers an existing value with undefined).
      if (Object.prototype.hasOwnProperty.call(fix, key)) {
        const value = (fix as Record<AllowedFixField, unknown>)[key];
        if (value !== undefined) {
          // Each allowed field is assigned its replacement value. The cast is
          // safe: `key` is a real AgentBlueprint key and the grader supplies the
          // field's value; an out-of-shape value is the grader's contract to
          // honor (the runtime resolvers — resolveAgentTrigger / verifyOutput /
          // evaluateGuardrails — re-clamp loose shapes downstream).
          (nextBlueprint as Record<AllowedFixField, unknown>)[key] = value;
        }
      }
    }
  }

  // A NEW bundle every time. name/description/warnings are carried verbatim —
  // they are NOT blueprint fields and are never something a fix can change.
  return {
    name: bundle.name,
    description: bundle.description,
    blueprint: nextBlueprint,
    warnings: bundle.warnings,
  };
}
