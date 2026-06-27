// Agent Eval Harness — E3: eval failures → Brain lessons (closing the loop).
//
// This is where the conversation eval feeds the self-improving generator GROUND
// TRUTH. The judge (L5) gives an opinion; an eval gives a measured outcome — the
// agent actually failed "no-heat emergency at 11pm". When a scenario FAILS, we
// record a `{pattern, mistake, correction}` lesson via the EXISTING L5.3 Brain
// loop-memory (`recordGeneratorLesson`), so the author + judge compound on what
// real customers exposed, not just on a reviewer's guess.
//
// Reuse, don't reinvent: this rides `recordGeneratorLesson` verbatim — the lessons
// land in the SAME org-scoped `_generator/lessons` Brain note the judge-fix and
// operator-correction lessons use, behind the SAME injected `AgentMemoryStore`. No
// new table, no new persistence path. (`recordGeneratorLesson` already dedupes on
// pattern+correction, so re-running evals never piles up duplicate lessons.)
//
// We record a lesson ONLY for FAILED scenarios (`score.passed === false`):
//   • pattern    = the scenario title (the recognizable situation, e.g.
//                  "no-heat emergency at 11pm");
//   • mistake    = "failed eval: " + the names of the checks that failed (so a
//                  future generation sees exactly WHAT went wrong);
//   • correction = "satisfy: " + the success criteria the scenario demanded (what
//                  a good outcome looks like — the thing to honor next time).
//
// Best-effort + NEVER THROWS: `recordGeneratorLesson` already swallows store
// errors, and we additionally guard the whole loop — failing to record a lesson
// must NEVER break an eval run. PURE seam: no I/O of its own (the store is
// injected), no "use server".

import { recordGeneratorLesson } from "@/lib/agents/generate/generator-lessons";
import type { AgentMemoryStore } from "@/lib/agents/memory/agent-memory";
import type { EvalScenario, EvalScore } from "./eval-types";

/** Non-empty string guard. */
function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

/**
 * The check names that explain a FAILURE — the hard-gate checks (`safety:`,
 * `mustNotDo:`, `criteria:`) that did NOT pass. mustDo heuristics are soft and
 * don't gate `passed`, so they're excluded from the "why it failed" summary.
 * Falls back to a generic phrase when nothing nameable is present (e.g. an empty
 * transcript scored all-fail with zero checks).
 */
function failedCheckNames(score: EvalScore): string {
  const checks = Array.isArray(score?.checks) ? score.checks : [];
  const failed = checks
    .filter(
      (c) =>
        !c.passed &&
        (c.name.startsWith("safety:") ||
          c.name.startsWith("mustNotDo:") ||
          c.name.startsWith("criteria:")),
    )
    .map((c) => c.name);
  if (failed.length > 0) return failed.join("; ");
  // No nameable failing check (e.g. empty transcript → all-fail, no checks). Use
  // the note if we have one, else a generic marker.
  return isNonEmptyString(score?.notes) ? score.notes : "did not pass";
}

/**
 * The success criteria a scenario demanded, joined for the `correction`. Falls
 * back to the scenario title when a scenario has no explicit criteria (so the
 * correction is never empty — an empty correction would be dropped by
 * `recordGeneratorLesson`).
 */
function criteriaSummary(scenario: EvalScenario): string {
  const criteria = Array.isArray(scenario?.successCriteria)
    ? scenario.successCriteria.filter(isNonEmptyString)
    : [];
  if (criteria.length > 0) return criteria.join("; ");
  return isNonEmptyString(scenario?.title) ? scenario.title : "the scenario's intended outcome";
}

/**
 * Record a Brain lesson for every FAILED scenario in `results`. For each result
 * whose `score.passed === false`, calls `recordGeneratorLesson` with:
 *   pattern    = scenario.title
 *   mistake    = "failed eval: " + failed-check names
 *   correction = "satisfy: " + the missed success criteria
 *
 * Passed scenarios record nothing. Best-effort: every call is guarded — a store
 * that throws is swallowed (per-result and overall), so a failed Brain write can
 * never break the eval. Never throws.
 *
 * `agentKey` is accepted (and threaded into the lesson context as part of the
 * pattern only when it adds signal) to keep the call-site stable with the spec's
 * signature; the lessons themselves live in the org-wide `_generator/lessons`
 * note (the generator learns across all its agents).
 */
export async function recordEvalLessons(
  store: AgentMemoryStore,
  args: {
    orgId: string;
    agentKey: string;
    results: { scenario: EvalScenario; score: EvalScore }[];
  },
): Promise<void> {
  try {
    const { orgId, results } = args;
    if (!isNonEmptyString(orgId) || !Array.isArray(results)) return;

    for (const result of results) {
      const scenario = result?.scenario;
      const score = result?.score;
      // Only FAILED scenarios become lessons. Guard the shape defensively.
      if (!scenario || !score || score.passed !== false) continue;

      const pattern = isNonEmptyString(scenario.title) ? scenario.title : scenario.id;
      if (!isNonEmptyString(pattern)) continue; // nothing to key the lesson on.

      const mistake = `failed eval: ${failedCheckNames(score)}`;
      const correction = `satisfy: ${criteriaSummary(scenario)}`;

      // recordGeneratorLesson already swallows store errors + dedupes; the await is
      // inside the try so even an unexpected throw can't escape this loop.
      await recordGeneratorLesson(store, {
        orgId,
        lesson: { pattern, mistake, correction },
      });
    }
  } catch {
    // Defense-in-depth: failing to record eval lessons must never break the run.
  }
}
