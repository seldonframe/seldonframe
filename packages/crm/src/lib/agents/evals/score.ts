// Agent Eval Harness — E3: the composed transcript scorer (deterministic + LLM grader).
//
// `scoreTranscriptDeterministic` (E1) is the always-on FLOOR — safety + mustNotDo
// hard gates and a lenient mustDo heuristic, decided purely by inspecting strings.
// This module ADDS the nuance: an optional, dependency-injected LLM grader that
// reads the whole transcript + the scenario's `successCriteria` and reports which
// criteria were met and which were missed. The composed `scoreEvalTranscript`
// folds the grader's verdict into one `EvalScore`.
//
// The grader is purely ADDITIVE and can NEVER override a safety/mustNotDo failure:
//   • `passed` = the deterministic HARD gates pass AND no `successCriteria` is
//     missed. A missed safety/mustNotDo gate fails the run no matter what the
//     grader says (FAIL-CLOSED). A perfectly-graded transcript that quoted a firm
//     price still fails.
//   • `score` = fraction of ALL checks (the deterministic floor's checks PLUS one
//     criterion-check per `successCriteria`) that passed — so adding criteria can
//     only refine the fraction, it can't erase a hard-gate failure from `passed`.
//
// FAIL-SOFT, NEVER THROWS: no grader supplied → just the deterministic score
// (unchanged). A grader that throws → the deterministic score + an explanatory
// `notes` (we degrade to the floor, we do not blow up). Mirrors the L5 judge
// guarantee: failing to grade must never break the eval.
//
// PURE seam: no I/O of its own — the grader is injected (the real Haiku-backed one
// lives in `score-llm.ts`, behind `makeLlmEvalGrader`). No "use server"; safe from
// a route handler, an action, the runtime, or a test.

import { scoreTranscriptDeterministic } from "./score-deterministic";
import type {
  EvalCheck,
  EvalScenario,
  EvalScore,
  EvalTranscript,
} from "./eval-types";
import type { VerifyRubric } from "../verify/agent-verify";

/**
 * The LLM grader seam. Given the finished transcript + its scenario, it reads the
 * scenario's `successCriteria` and reports which it judged MET and which MISSED
 * (plus optional `notes`). The real implementation is `makeLlmEvalGrader`
 * (score-llm.ts); tests inject a fake. It SHOULD fail-soft to `{met:[],missed:[]}`
 * itself, and `scoreEvalTranscript` also guards against a throw — belt + braces.
 */
export type EvalGrader = (args: {
  transcript: EvalTranscript;
  scenario: EvalScenario;
}) => Promise<{ met: string[]; missed: string[]; notes?: string }>;

/** Non-empty string guard. */
function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

/** The scenario's de-duplicated, non-empty success criteria (defensive). */
function criteriaOf(scenario: EvalScenario): string[] {
  const raw = Array.isArray(scenario?.successCriteria) ? scenario.successCriteria : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of raw) {
    if (!isNonEmptyString(c)) continue;
    if (seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out;
}

/**
 * Recompute `passed` + `score` over a check list that already includes BOTH the
 * deterministic floor's checks AND the criterion checks.
 *  - `passed` = every HARD-gate check passes. The hard gates are the deterministic
 *    `safety:`/`mustNotDo:` checks AND every `criteria:` check (a missed criterion
 *    fails the run). `mustDo:` heuristics never gate.
 *  - `score`  = fraction of ALL checks passed (0 checks → 1).
 */
function recompose(scenarioId: string, checks: EvalCheck[], notes?: string): EvalScore {
  const hardGatesPass = checks
    .filter(
      (c) =>
        c.name.startsWith("safety:") ||
        c.name.startsWith("mustNotDo:") ||
        c.name.startsWith("criteria:"),
    )
    .every((c) => c.passed);

  const total = checks.length;
  const passedCount = checks.filter((c) => c.passed).length;
  const score = total === 0 ? 1 : passedCount / total;

  return {
    scenarioId,
    passed: hardGatesPass,
    score,
    checks,
    ...(isNonEmptyString(notes) ? { notes } : {}),
  };
}

/**
 * Append a `notes` line to whatever `notes` a base score already carries (so we
 * keep the deterministic floor's note — e.g. "no agent turns" — and add ours).
 */
function withNote(base: EvalScore, note: string): EvalScore {
  const existing = isNonEmptyString(base.notes) ? `${base.notes} ` : "";
  return { ...base, notes: `${existing}${note}`.trim() };
}

/**
 * Score a finished transcript against its scenario, combining the deterministic
 * floor with an OPTIONAL injected LLM grader.
 *
 * Always runs `scoreTranscriptDeterministic` first (the hard gates + heuristics).
 * Then, if `deps.grader` is present, calls it and adds ONE `criteria:` EvalCheck
 * per `successCriteria` — `met → passed`, `missed → failed` — and merges the
 * grader's `notes`. Combine rules (see module header):
 *   • `passed` = the deterministic hard gates pass AND no criterion is missed
 *     (a missed safety/mustNotDo can NEVER be overridden by a glowing grader —
 *     fail-closed);
 *   • `score`  = fraction of ALL checks (deterministic + criteria) passed.
 *
 * Fail-soft + never throws: no grader → the deterministic score verbatim. A grader
 * that throws → the deterministic score plus an explanatory note (degrade to the
 * floor). Any unexpected internal error also degrades to the deterministic score.
 */
export async function scoreEvalTranscript(
  transcript: EvalTranscript,
  scenario: EvalScenario,
  deps?: { grader?: EvalGrader; rubric?: VerifyRubric },
): Promise<EvalScore> {
  // The deterministic floor — pure, never throws.
  const base = scoreTranscriptDeterministic(transcript, scenario, { rubric: deps?.rubric });

  // No grader → just the floor.
  if (!deps?.grader) return base;

  // An empty transcript already scored all-fail with a note; there's nothing for a
  // grader to judge, and we must not let the grader's "all met" resurrect it. Keep
  // the floor verdict.
  if (base.checks.length === 0 && base.passed === false) {
    return base;
  }

  const scenarioId = base.scenarioId;
  const criteria = criteriaOf(scenario);

  let verdict: { met: string[]; missed: string[]; notes?: string };
  try {
    verdict = await deps.grader({ transcript, scenario });
  } catch {
    // Fail-soft: degrade to the deterministic score + a note. NEVER throws.
    return withNote(base, "LLM grader unavailable — deterministic score only.");
  }

  // Defend against a malformed verdict (the real grader fail-softs to empties, but
  // a fake/buggy one might return junk). Treat non-arrays as empty.
  const missedSet = new Set(
    (Array.isArray(verdict?.missed) ? verdict.missed : []).filter(isNonEmptyString),
  );

  // One criterion check per success criterion: missed → failed, otherwise passed.
  // We key off the scenario's OWN criteria list (not the grader's echo) so an
  // omitted criterion defaults to PASS (additive, can't silently fail the run) and
  // a hallucinated extra criterion from the grader is ignored.
  const criteriaChecks: EvalCheck[] = criteria.map((c) => {
    const missed = missedSet.has(c);
    return {
      name: `criteria: ${c}`,
      passed: !missed,
      ...(missed ? { detail: "grader: criterion not met" } : {}),
    };
  });

  const checks: EvalCheck[] = [...base.checks, ...criteriaChecks];

  // Merge notes: the floor's note (if any) + the grader's note (if any).
  const noteParts: string[] = [];
  if (isNonEmptyString(base.notes)) noteParts.push(base.notes);
  if (isNonEmptyString(verdict?.notes)) noteParts.push(verdict.notes.trim());
  const mergedNotes = noteParts.length > 0 ? noteParts.join(" ") : undefined;

  return recompose(scenarioId, checks, mergedNotes);
}
