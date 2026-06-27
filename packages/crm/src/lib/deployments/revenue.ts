// ICP-3 — recurring-revenue PURE helper (no DB, no side effects).
//
// The Studio "Revenue" hero reframes the agents around the recurring income they
// generate: 30-day MRR = the sum of every ACTIVE deployment's monthly price
// (deployments.priceCents), and ARR = MRR × 12. Draft / paused / canceled
// deployments are NOT live revenue, so they're excluded — only `status:'active'`
// counts. Lives OUTSIDE store.ts so the server page AND the unit tests import the
// same math (mirrors margin.ts). Pure; never throws.

/** The fields this summary needs from a deployment row — a structural subset, so
 *  both the full `Deployment` and the lighter `DeploymentListItem` satisfy it. */
export type RevenueDeploymentInput = {
  /** Monthly amount the SMB client pays the builder, in cents. */
  priceCents: number;
  /** Deployment lifecycle status — only 'active' contributes to MRR. */
  status: string;
};

export type RevenueSummary = {
  /** 30-day Monthly Recurring Revenue: Σ priceCents over ACTIVE deployments. */
  mrrCents: number;
  /** Annual Recurring Revenue: mrrCents × 12. */
  arrCents: number;
  /** How many deployments contributed (active, with a non-zero price excluded?
   *  no — every active deployment counts toward the count even at $0, so the
   *  operator sees their live book size). */
  activeCount: number;
};

/** A deployment counts toward MRR iff it's live (active). Pure. */
function isLiveRevenue(status: string): boolean {
  return status === "active";
}

/**
 * Compute recurring-revenue totals across a builder's deployments. Pure.
 *
 *   mrrCents = Σ priceCents  for every deployment whose status is 'active'
 *   arrCents = mrrCents × 12
 *
 * Each `priceCents` is coerced to a finite, non-negative integer defensively (a
 * NaN / negative / fractional row never corrupts the total). Draft, paused, and
 * canceled deployments are skipped (not live revenue). An empty / all-inactive
 * list → `{ mrrCents: 0, arrCents: 0, activeCount: 0 }`.
 */
export function computeRevenueSummary(
  deployments: readonly RevenueDeploymentInput[],
): RevenueSummary {
  let mrrCents = 0;
  let activeCount = 0;

  for (const d of deployments ?? []) {
    if (!isLiveRevenue(d.status)) continue;
    activeCount += 1;
    const price = Math.max(0, Math.round(Number(d.priceCents) || 0));
    mrrCents += price;
  }

  return { mrrCents, arrCents: mrrCents * 12, activeCount };
}
