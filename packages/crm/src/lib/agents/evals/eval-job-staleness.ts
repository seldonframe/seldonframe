// Staleness guard for eval_run_jobs — the eval twin of supervised-run's
// resolveRunningRunGuard (F1 class, opus review 2026-07-12 finding #1).
//
// The eval work runs inside `after()` with NO internal timeout; if the
// function instance dies or exceeds the platform's 300s ceiling, the job row
// strands at 'running' and the Run-evals button would spin forever for that
// session. The poll read (getEvalRunJobAction) uses this pure decision to
// treat an over-age 'running' row as failed — lazily reconciling the row in
// the same code path so the stranding can never outlive one poll.

export const STALE_EVAL_JOB_MS = 10 * 60 * 1000; // 10 minutes

export type EvalJobStatusDecision =
  | { kind: "as_is" }
  | { kind: "stale_failed"; error: string };

/**
 * Pure decision: a 'running' eval job older than STALE_EVAL_JOB_MS is
 * presumed stranded (platform killed the after() work before it could
 * finish the row) and reads as failed. Terminal rows and fresh running
 * rows pass through untouched. Never throws.
 */
export function resolveEvalJobStatus(
  row: { status: string; startedAt: Date },
  now: Date,
): EvalJobStatusDecision {
  if (row.status !== "running") return { kind: "as_is" };
  const ageMs = now.getTime() - row.startedAt.getTime();
  if (ageMs < STALE_EVAL_JOB_MS) return { kind: "as_is" };
  return {
    kind: "stale_failed",
    error: "Eval run timed out (stale) — the background work never finished. Run evals again.",
  };
}
