// Pure summary of a window of agent_reflection_events for the /dream loop's
// "Collect" step — computes the day's vision pass-rate + failure count so the
// dream routine (and the /api/cron/dream-collect endpoint) can report the
// metric without re-deriving it. See
// docs/superpowers/specs/2026-07-06-dream-loop-design.md.

/** Minimal shape the summary needs — a subset of ReflectionRow. */
export type ReflectionSummaryInput = {
  pass: boolean;
  skipped: string | null;
};

export type ReflectionSummary = {
  /** Rows where a real grade ran (skipped === null). The pass-rate denominator. */
  total: number;
  /** Genuine failures: a completed grade (skipped === null) that returned pass=false. */
  failures: number;
  /** Rows skipped (timeout/render_failed) — excluded from total/failures (fail-soft). */
  skipped: number;
  /** (total - failures) / total, or null when total === 0 (no real grades yet). */
  pass_rate: number | null;
};

export function summarizeReflections(rows: ReflectionSummaryInput[]): ReflectionSummary {
  let total = 0;
  let failures = 0;
  let skipped = 0;
  for (const r of rows) {
    if (r.skipped) {
      skipped += 1;
      continue;
    }
    total += 1;
    if (r.pass === false) failures += 1;
  }
  const pass_rate = total === 0 ? null : (total - failures) / total;
  return { total, failures, skipped, pass_rate };
}
