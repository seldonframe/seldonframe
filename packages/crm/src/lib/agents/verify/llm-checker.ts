// Agent Loop — L2 Verify (maker ≠ checker) — Task T4: the OPTIONAL LLM checker seam.
//
// agent-verify.ts is the always-on DETERMINISTIC gate. This module is the
// OPTIONAL "stronger separate grader" layer on top of it: an LLM (or evals)
// judge that scores the output against the rubric — both the structural checks
// AND soft quality (on-brand / accurate / not misleading) a regex can't see.
// That's the maker≠checker value: a different, stronger model grades what the
// client's agent wrote before it's sent.
//
// IMPORTANT — this is AVAILABLE, not enabled. Deterministic-only stays the
// production default (run-event-agent ships with no `checker`). An operator
// opts a real grader in by constructing one here and passing it as the
// `checker` dep; turning it on by default in the live send path is a future
// (L4) concern, not this task.
//
// Design:
//   • `LlmGrader` is the DI seam — the abstract "raw model verdict" call. It
//     takes `{ output, criteria }` (human-readable rubric lines) and returns
//     `{ pass, failures? }`. Tests inject a fake; production injects a real
//     LLM/evals-backed grader. This module does NOT call any LLM itself — it
//     stays pure/seam-only so it's testable with no network.
//   • `rubricToCriteria` is PURE — it turns a VerifyRubric's checks into short,
//     readable instructions a grader can follow, plus one general quality line.
//   • `makeLlmChecker(grader)` returns a `Checker` (the agent-verify contract):
//     it builds criteria, calls the grader, maps the verdict to a VerifyResult,
//     and FAILS CLOSED — a grader throw OR a malformed return → pass:false with
//     a single "llm_checker_error" failure. It NEVER throws (verifyOutput AND-s
//     it with the deterministic result; a broken grader must block, not wave
//     through).
//
// No "use server" — this is a pure seam (no I/O of its own). A real grader's
// LLM call lives in the operator-supplied `LlmGrader`, NOT here.
//
// ── Why no `makeEvalsChecker` wired to `run_agent_evals` ─────────────────────
// `runEvalSuite` (src/lib/agents/eval-runner.ts, the `run_agent_evals` MCP tool)
// is NOT a text-against-criteria grader and is NOT cleanly callable from this
// layer: it is a "use server" action that requires `{ agentId, orgId }`, hits
// the DB (creates ephemeral test conversations, inserts agent_evals rows), and
// grades an agent's ARCHETYPE SCENARIOS by replaying them through `executeTurn`
// — not an arbitrary string against an arbitrary rubric. Importing it here would
// drag the whole DB + runtime + "use server" surface into the pure verify layer.
// Per the plan ("wire only if cleanly callable; else stub the seam"), we expose
// the abstract `LlmGrader` instead. An operator wires a real grader by writing a
// small `LlmGrader` over their LLM client (see HOW TO SUPPLY A REAL GRADER below).

import type { Checker, VerifyCheck, VerifyRubric, VerifyResult } from "./agent-verify";

/**
 * The DI'd "raw model verdict" call — the seam a real LLM/evals grader plugs
 * into. Given the output and a list of human-readable rubric criteria, it
 * returns a plain pass/fail with optional per-criterion failure reasons.
 *
 * It MAY throw (network/timeout/parse) — `makeLlmChecker` catches that and fails
 * closed. It MAY return a malformed object — `makeLlmChecker` defends against
 * that too. Keeping this minimal (no VerifyResult, no rubric internals) makes it
 * trivial to back with any LLM call or evals service.
 */
export type LlmGrader = (args: {
  output: string;
  /** Human-readable rubric criteria derived from the VerifyRubric. */
  criteria: string[];
}) => Promise<{ pass: boolean; failures?: string[] }>;

/** Truncate a value for inclusion in a criterion line so a giant URL/blob does
 *  not dominate it. Mirrors agent-verify's `preview` for consistent phrasing. */
function preview(value: string, max = 80): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

/**
 * Turn ONE deterministic check into a short, readable grader instruction. The
 * phrasing intentionally matches what the check enforces so the LLM grades the
 * SAME structural rules as the deterministic gate (belt-and-suspenders) — e.g.
 * a `must_include "<url>"` becomes `Must contain the text "<url>"`.
 */
function checkToCriterion(check: VerifyCheck): string {
  switch (check.kind) {
    case "max_length":
      return `Must be at most ${check.max} characters.`;
    case "min_length":
      return `Must be at least ${check.min} characters (must not be empty).`;
    case "must_include": {
      const what = check.label ? `${check.label} — the text "${preview(check.value)}"` : `the text "${preview(check.value)}"`;
      return `Must contain ${what}.`;
    }
    case "must_include_any": {
      const list = check.values.map((v) => `"${preview(v)}"`).join(", ");
      const what = check.label ? `${check.label} (one of ${list})` : `at least one of ${list}`;
      return `Must contain ${what}.`;
    }
    case "must_not_include": {
      const what = check.label ? `${check.label} — the text "${preview(check.value)}"` : `the text "${preview(check.value)}"`;
      return `Must NOT contain ${what}.`;
    }
    case "must_match": {
      const what = check.label ? `${check.label} (regular expression /${check.pattern}/)` : `the regular expression /${check.pattern}/`;
      return `Must match ${what}.`;
    }
    default: {
      // Forward-compat: an unknown kind becomes a benign, ignorable line rather
      // than throwing — the deterministic gate already fails an unknown kind.
      const unknown = check as { kind?: unknown };
      return `Must satisfy the rubric check "${String(unknown.kind)}".`;
    }
  }
}

/**
 * PURE: turn a VerifyRubric into readable grader criteria. Each check maps to a
 * short instruction (via `checkToCriterion`), and a general quality criterion is
 * ALWAYS appended so the grader scores soft quality (accuracy, on-brand, not
 * misleading) on top of the structural rules — the part a regex can't judge and
 * the reason a separate checker adds value over the deterministic gate alone.
 *
 * No I/O, no clock, no env. Safe anywhere.
 */
export function rubricToCriteria(rubric: VerifyRubric): string[] {
  const checks = rubric?.checks ?? [];
  const structural = checks.map(checkToCriterion);
  const quality =
    "Must be accurate, on-brand, and not misleading (no invented facts, prices, " +
    "or commitments; appropriate, professional tone).";
  return [...structural, quality];
}

/** Coerce the grader's failure list into a clean `string[]` (drops non-strings,
 *  tolerates a missing/garbage value). Never throws. */
function normalizeFailures(failures: unknown): string[] {
  if (!Array.isArray(failures)) return [];
  return failures.filter((f): f is string => typeof f === "string");
}

/**
 * Build a `Checker` (the agent-verify contract) from an `LlmGrader`.
 *
 * The returned checker:
 *   1. derives readable criteria from the rubric via `rubricToCriteria`;
 *   2. calls `grader({ output, criteria })`;
 *   3. maps `{ pass, failures }` → `VerifyResult` (`results: []` is fine — the
 *      deterministic layer owns the structured per-check results; this layer
 *      carries the grader's `failures` strings);
 *   4. FAILS CLOSED: a grader that throws OR returns a malformed object (no
 *      boolean `pass`) → `{ pass:false, results:[], failures:["llm_checker_error"] }`.
 *
 * It NEVER throws. `verifyOutput` AND-s this with the deterministic result, so a
 * broken grader BLOCKS the send (pass:false) rather than waving a bad message
 * through. When `pass` is true, any returned failures are dropped (a pass has no
 * failures); when false, the grader's reasons are surfaced (falling back to a
 * generic line if it returned none).
 */
export function makeLlmChecker(grader: LlmGrader): Checker {
  return async (output: string, rubric: VerifyRubric): Promise<VerifyResult> => {
    const criteria = rubricToCriteria(rubric);
    try {
      const raw = await grader({ output, criteria });
      // Defend against a malformed verdict: require a real boolean `pass`.
      // Anything else (undefined, null, missing field, non-boolean) is treated
      // as a broken grader → fail closed.
      if (!raw || typeof raw.pass !== "boolean") {
        return { pass: false, results: [], failures: ["llm_checker_error"] };
      }
      if (raw.pass) {
        return { pass: true, results: [], failures: [] };
      }
      const failures = normalizeFailures(raw.failures);
      return {
        pass: false,
        results: [],
        failures: failures.length > 0 ? failures : ["llm_checker_failed"],
      };
    } catch {
      // Fail closed: a throwing grader (timeout, network, parse) must block.
      return { pass: false, results: [], failures: ["llm_checker_error"] };
    }
  };
}

// ── HOW TO SUPPLY A REAL GRADER (operator opt-in; not enabled by default) ────
//
// There is no clean `run_agent_evals` text-grader to reuse (see the note at the
// top), so a real grader is a thin `LlmGrader` over an LLM call. Sketch:
//
//   import { getAnthropicClient } from "@/lib/ai/client";
//   const grader: LlmGrader = async ({ output, criteria }) => {
//     const client = await getAnthropicClient();
//     if (!client) return { pass: false, failures: ["no_llm_key"] }; // fail closed
//     const prompt =
//       `You are a strict reviewer. The message below must satisfy EVERY ` +
//       `criterion. Reply with JSON {"pass": boolean, "failures": string[]}.\n\n` +
//       `Criteria:\n${criteria.map((c, i) => `${i + 1}. ${c}`).join("\n")}\n\n` +
//       `Message:\n"""${output}"""`;
//     const res = await client.messages.create({
//       model: "claude-...", max_tokens: 300,
//       messages: [{ role: "user", content: prompt }],
//     });
//     // parse the JSON verdict out of res.content → { pass, failures }
//     // (any parse/throw → makeLlmChecker fails closed for you)
//   };
//
//   const checker = makeLlmChecker(grader);
//   // then pass `checker` into run-event-agent deps to OPT IN.
//
// Until an operator does that, run-event-agent runs with no checker and the
// deterministic gate is the only (always-on, zero-LLM-cost) layer.
