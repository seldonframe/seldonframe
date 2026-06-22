// packages/crm/src/lib/billing/gmv.ts
// 2026-06-22 — The platform GMV fee taken on payments processed THROUGH
// SeldonFrame's Stripe Connect (the SMB's OWN sales: proposals
// subscriptions, payments-provider invoices + subscriptions — all of
// which pass `{ stripeAccount }`). Sell outside SF → no fee.
//
// IMPORTANT: this fee applies ONLY to connected-account / SMB-sales
// charges. It must NEVER touch SF's own PLATFORM subscription that bills
// the SMB their $29 (app/api/stripe/checkout + claim-and-checkout) — that
// is SF charging the customer, not the SMB charging their customer.

/** Application-fee percentage SF takes on connected-account SMB sales. */
export const GMV_FEE_PERCENT = 2;

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
