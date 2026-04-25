// Retry backoff computation for subscription deliveries.
//
// Shipped in SLICE 1 PR 2 Commit 3 per audit §4.7. Pure function —
// takes the retry policy + the next attempt number + the current
// time and returns when to retry. Deterministic per (policy, attempt,
// now).
//
// Attempt semantics: the `attempt` argument is the ordinal of the
// NEXT attempt, not the one that just failed. A delivery at
// attempt=1 that just failed passes attempt=2 here. Max policy
// comparison uses that: if attempt > policy.max, dispatcher marks
// dead without scheduling.
//
// Formulas:
//   exponential: initial_delay_ms * 2^(attempt - 1)
//   linear:      initial_delay_ms * attempt
//   fixed:       initial_delay_ms
//
// Jitter: not applied in v1. Deterministic delays make test
// assertions stable. If production scale requires thundering-herd
// avoidance, add ±10% jitter in a follow-up — the dispatcher stores
// nextAttemptAt as an absolute timestamp so moving to jittered
// values is a one-line change here.

export type RetryPolicy = {
  max: number;
  backoff: "exponential" | "linear" | "fixed";
  initial_delay_ms: number;
};

export function computeNextAttemptAt(
  policy: RetryPolicy,
  attempt: number,
  now: Date,
): Date {
  let delayMs: number;
  switch (policy.backoff) {
    case "exponential":
      delayMs = policy.initial_delay_ms * Math.pow(2, attempt - 1);
      break;
    case "linear":
      delayMs = policy.initial_delay_ms * attempt;
      break;
    case "fixed":
      delayMs = policy.initial_delay_ms;
      break;
  }
  return new Date(now.getTime() + delayMs);
}
