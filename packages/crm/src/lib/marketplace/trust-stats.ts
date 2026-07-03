// Improve verb + trust rail (2026-07-02) — Task 13: the platform-verified
// eval badge's PURE build decision.
//
// `buildTrustStats` is the ONE place that decides whether a marketplace
// listing gets a trust badge and what it says. Anti-gaming by construction:
// a badge can only exist when a REAL eval_runs row (T1/T2) backs it —
// `latest: null` (the subject has never been run) ALWAYS maps to `null`,
// never a fabricated zero/empty badge. Callers (the seller publish
// copy-through) must never synthesize a `latest` row; they read it from
// `getLatestEvalRun` (eval-runs-store.ts) and pass it straight through.
//
// `improveAcceptRate` is a declared stub for this task — the improve verb's
// accept-rate wiring (proposals applied ÷ proposed) is a later follow-on —
// and stays `null` here on purpose, not merely "not yet implemented".
//
// NOT "use server": a plain, pure lib module (mirrors eval-runs-store.ts /
// persist-template-run.ts), imported by "use server" actions that call it.

import type { EvalRun } from "@/db/schema/eval-runs";
import type { ListingTrustStats } from "@/db/schema/marketplace";

/** Clamp a percentage to the valid [0, 100] range. Defensive: the eval_runs
 *  column is already clamped at persist time (eval-runs-store.ts), but the
 *  badge must never render an out-of-range number even if a caller (or a
 *  future writer of the column) supplies one. */
function clampPercent(value: number): number {
  const n = Number.isFinite(value) ? value : 0;
  return Math.min(100, Math.max(0, n));
}

/**
 * PURE. Build the buyer-facing trust badge snapshot from the subject's
 * latest eval_runs row + its total run count. Returns `null` when `latest`
 * is `null` — a subject with no eval history gets NO badge, ever (never a
 * fake "0% across 0 scenarios" placeholder).
 *
 * `runsCount` is carried through VERBATIM (not re-derived from `latest`),
 * matching the `NewEvalRun` summarizer's convention of trusting the caller's
 * count (listEvalRunsForSubject's row count) as authoritative.
 */
export function buildTrustStats(args: {
  latest: EvalRun | null;
  runsCount: number;
}): ListingTrustStats | null {
  const { latest, runsCount } = args;

  if (!latest) {
    return null;
  }

  return {
    evalPassRate: clampPercent(latest.passRate),
    scenarioCount: latest.scenarioCount,
    graderModel: latest.graderModel ?? null,
    lastRunAt: latest.createdAt.toISOString(),
    runsCount,
    // Declared stub — the improve verb's accept-rate wiring is a later
    // follow-on. Never fabricate a number here.
    improveAcceptRate: null,
  };
}
