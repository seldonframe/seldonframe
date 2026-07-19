// packages/crm/src/lib/billing/gmv.ts
// 2026-06-22 — Platform fees taken on payments processed THROUGH
// SeldonFrame's Stripe Connect. Two distinct rates by WHAT is sold:
//
//   • GMV_FEE_PERCENT (2%) — the SMB's OWN service sales (proposals,
//     payments-provider invoices + subscriptions — all of which pass
//     `{ stripeAccount }`). "We don't tax your work." Sell outside SF → no fee.
//   • MARKETPLACE_FEE_PERCENT (5%) — a builder selling/renting an agent, soul,
//     or block on SF's marketplace. That's SF's OWN marketplace product, so it
//     carries the higher cut.
//
// IMPORTANT: both fees apply ONLY to connected-account charges. They must
// NEVER touch SF's own PLATFORM subscription that bills the SMB their $29
// (app/api/stripe/checkout + claim-and-checkout) — that is SF charging the
// customer, not the SMB charging their customer.

/** Application-fee percentage SF takes on connected-account SMB sales. */
export const GMV_FEE_PERCENT = 2;

/**
 * Application-fee percentage SF takes on MARKETPLACE listing sales — i.e. when
 * a builder sells or rents an agent / soul / block on SeldonFrame's marketplace.
 * That's SF's OWN marketplace product, so it carries a higher cut than the 2%
 * `GMV_FEE_PERCENT` we charge on an SMB's own service sales ("we don't tax your
 * work"). Used by the soul/agent/block purchase charge sites and the seller
 * earnings dashboard.
 */
export const MARKETPLACE_FEE_PERCENT = 5;

/**
 * 2026-07-10 — Max's tier-scoped GMV decision: the flat 2% GMV fee applies
 * ONLY on solo tiers (builder $29 / managed $49) — agency tiers ($99+, incl.
 * the legacy grandfathered "agency") pay 0%, because the 2% is an UPGRADE
 * ESCALATOR (crossover ~$3.5k/mo GMV means the agency tier already saves
 * money), not a tax on agencies who are already paying for whitelabel.
 * `null`/`undefined`/`inactive` (pre-solo, no subscription yet) still pay 2%
 * when SF is the sales channel.
 */
export function gmvFeePercentForTier(
  tier: import("./features").BillingTier | null | undefined
): number {
  if (tier === "agency_starter" || tier === "agency_growth" || tier === "agency_scale" || tier === "agency") {
    return 0;
  }
  return GMV_FEE_PERCENT;
}

/**
 * Compute the Stripe `application_fee_amount` (in cents) for an invoice
 * whose item total is `totalCents`. Returns 0 for non-positive / non-
 * finite input — and callers MUST omit the field entirely when this is 0
 * (Stripe rejects `application_fee_amount: 0` on some invoice shapes).
 */
export function computeInvoiceApplicationFeeCents(totalCents: number): number {
  if (!Number.isFinite(totalCents) || totalCents <= 0) return 0;
  return Math.round((totalCents * GMV_FEE_PERCENT) / 100);
}

/**
 * Compute the Stripe `application_fee_amount` (in cents) for a MARKETPLACE
 * sale whose total is `totalCents` — the 5% cut SF takes on a soul / agent /
 * block listing sale. Mirrors `computeInvoiceApplicationFeeCents` exactly
 * (same rounding, same 0-for-non-positive/non-finite guard so callers can omit
 * the field when 0) except for the percentage.
 */
export function computeMarketplaceFeeCents(totalCents: number): number {
  if (!Number.isFinite(totalCents) || totalCents <= 0) return 0;
  return Math.round((totalCents * MARKETPLACE_FEE_PERCENT) / 100);
}
