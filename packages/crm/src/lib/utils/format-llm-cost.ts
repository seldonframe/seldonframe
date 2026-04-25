// Display formatters for the workflow_runs cost columns.
// SLICE 9 PR 2 C5 per Max's PR 2 spec ("0.94x composition" — small,
// focused helpers reused across the runs list + drawer).
//
// Tested in tests/unit/format-llm-cost.spec.ts. Display rules:
//   - 0 / null / undefined / NaN → "—" (don't clutter)
//   - <$0.01 → up to 4 decimals so micro-costs are visible (Opus
//     can produce $0.0001 calls; we want operators to see them)
//   - >=$0.01 → standard 2-decimal currency
//
// Token counts use a compact "1.2k" / "2.3M" suffix scheme for the
// run-list density; the drawer shows raw integers separately.

const EM_DASH = "—";

export function formatLlmCost(value: number | string | null | undefined): string {
  if (value == null) return EM_DASH;
  const num = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(num) || num <= 0) return EM_DASH;
  if (num < 0.01) {
    // Trim to at most 4 fractional digits without trailing zeros being
    // stripped — operators want to see "$0.0050", not "$0.005".
    return `$${num.toFixed(4)}`;
  }
  return `$${num.toFixed(2)}`;
}

export function formatTokenCount(value: number | null | undefined): string {
  if (value == null) return EM_DASH;
  if (!Number.isFinite(value) || value <= 0) return EM_DASH;
  if (value < 1_000) return String(value);
  if (value < 1_000_000) return `${(value / 1_000).toFixed(1)}k`;
  return `${(value / 1_000_000).toFixed(1)}M`;
}
