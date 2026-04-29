// Canonical mapping of public-tier offerings to live Stripe price IDs.
// MUST stay in sync with `plans.ts` (the source of truth for tier
// metadata). The claim-and-checkout API validates against this list —
// any priceId not listed here returns a 400 "A supported priceId is
// required" before reaching Stripe.
//
// Historical note: this file used to allow only the Cloud Pro price
// + a legacy workspace-addon, which made the Cloud Starter and Cloud
// Agency upgrade buttons silently fail with a 400. Fixed launch eve.

/** Cloud Starter — $49/mo (lookup_key: starter_monthly). */
export const CLOUD_STARTER_MONTHLY_PRICE_ID = "price_1TQzh7JOtNZA0x7xLOTicHkW";

/** Cloud Pro / Operator — $99/mo (lookup_key: cloud_pro_monthly). Used as
 *  both the self-service workspace add-on price and the headline tier
 *  for guest-token claim flows. */
export const SELF_SERVICE_WORKSPACE_MONTHLY_PRICE_ID = "price_1TNY81JOtNZA0x7xsulCSP6x";

/** Cloud Agency / Pro 3 — $149/mo (lookup_key: pro_3_monthly). */
export const CLOUD_AGENCY_MONTHLY_PRICE_ID = "price_1TQzjrJOtNZA0x7xV4UFxWrH";

/** Legacy per-additional-workspace add-on. Kept for backward compat
 *  with subscriptions minted on the older billing model. New flows
 *  should pick one of the three tier price IDs above. */
export const WORKSPACE_ADDON_MONTHLY_PRICE_ID = "price_1TMC7UJOtNZA0x7xNrl2VDVE";

export type SeldonCheckoutPriceId =
  | typeof CLOUD_STARTER_MONTHLY_PRICE_ID
  | typeof SELF_SERVICE_WORKSPACE_MONTHLY_PRICE_ID
  | typeof CLOUD_AGENCY_MONTHLY_PRICE_ID
  | typeof WORKSPACE_ADDON_MONTHLY_PRICE_ID;

const ALLOWED_PRICE_IDS = new Set<string>([
  CLOUD_STARTER_MONTHLY_PRICE_ID,
  SELF_SERVICE_WORKSPACE_MONTHLY_PRICE_ID,
  CLOUD_AGENCY_MONTHLY_PRICE_ID,
  WORKSPACE_ADDON_MONTHLY_PRICE_ID,
]);

export function isAllowedCheckoutPriceId(priceId: string): priceId is SeldonCheckoutPriceId {
  return ALLOWED_PRICE_IDS.has(priceId);
}

/** Marks the price IDs that activate the self-service workspace path
 *  (vs. the legacy per-seat add-on). Cloud Starter, Pro, and Agency
 *  all flip the same per-org `selfServiceEnabled` flag — they only
 *  differ in tier-specific entitlements (workspaces, custom domain,
 *  removeBranding) computed via plans.ts/entitlements.ts. */
const SELF_SERVICE_TIER_PRICE_IDS = new Set<string>([
  CLOUD_STARTER_MONTHLY_PRICE_ID,
  SELF_SERVICE_WORKSPACE_MONTHLY_PRICE_ID,
  CLOUD_AGENCY_MONTHLY_PRICE_ID,
]);

export function isSelfServiceCheckoutPriceId(priceId: string | null | undefined) {
  return typeof priceId === "string" && SELF_SERVICE_TIER_PRICE_IDS.has(priceId);
}
