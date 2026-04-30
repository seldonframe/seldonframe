// Canonical mapping of public-tier offerings to live Stripe price IDs.
//
// April 30, 2026 — pricing migration. The old per-tier flat prices
// (Cloud Starter $49, Cloud Pro $99, Cloud Agency $149) were replaced
// with a usage-based model: Free + Growth ($29 base) + Scale ($99 base),
// each with optional metered overage prices for contacts and agent
// runs.
//
// Live tier base price IDs (provided by Maxime, hard-coded so checkout
// keeps working without redeploying when the env var is missing):
//   Growth base — `price_1TRt9aJOtNZA0x7xkdenNgEu` ($29/mo flat)
//   Scale  base — `price_1TRtA0JOtNZA0x7xgPKRqAEy` ($99/mo flat)
//
// Metered overage prices (created in Stripe Dashboard against the
// `seldonframe_contacts` + `seldonframe_agent_runs` meters) are env-
// only; if the env vars are unset, the checkout still creates a
// flat-base subscription and the meter events are reported but not
// billed. Add the env vars in Vercel + .env.local once the metered
// prices exist:
//   STRIPE_GROWTH_CONTACTS_PRICE_ID    — $0.02/contact/mo (sum/last over 500)
//   STRIPE_GROWTH_AGENT_RUNS_PRICE_ID  — $0.03/run         (sum over 1,000)
//   STRIPE_SCALE_AGENT_RUNS_PRICE_ID   — $0.02/run         (sum, all metered)
//
// Legacy price IDs (Cloud Starter / Cloud Pro / Cloud Agency) are kept
// in the allowlist so existing paying subscriptions don't 400 when
// Stripe replays an event after a deploy. They map to growth/scale via
// `tier-resolve.ts::resolveTierFromPriceId`.

function readEnv(name: string, fallback = ""): string {
  return process.env[name]?.trim() ?? fallback;
}

// ─── New tier base price IDs (April 30, 2026 pricing) ────────────────

/** Growth $29/mo flat base. Required for Growth checkout. */
export const GROWTH_BASE_PRICE_ID = readEnv(
  "STRIPE_GROWTH_BASE_PRICE_ID",
  "price_1TRt9aJOtNZA0x7xkdenNgEu"
);

/** Scale $99/mo flat base. Required for Scale checkout. */
export const SCALE_BASE_PRICE_ID = readEnv(
  "STRIPE_SCALE_BASE_PRICE_ID",
  "price_1TRtA0JOtNZA0x7xgPKRqAEy"
);

// ─── Metered overage prices (optional — env-only) ────────────────────

/** Growth contacts overage: $0.02/contact/mo beyond 500 (last aggregation). */
export const GROWTH_CONTACTS_PRICE_ID = readEnv("STRIPE_GROWTH_CONTACTS_PRICE_ID");

/** Growth agent runs overage: $0.03/run beyond 1,000 (sum aggregation). */
export const GROWTH_AGENT_RUNS_PRICE_ID = readEnv("STRIPE_GROWTH_AGENT_RUNS_PRICE_ID");

/** Scale agent runs: $0.02/run, all metered (sum aggregation). */
export const SCALE_AGENT_RUNS_PRICE_ID = readEnv("STRIPE_SCALE_AGENT_RUNS_PRICE_ID");

// ─── Legacy price IDs (kept for backward-compat replay) ──────────────

/** Legacy Cloud Starter $49/mo. Now resolves to Growth. */
export const LEGACY_CLOUD_STARTER_PRICE_ID = "price_1TQzh7JOtNZA0x7xLOTicHkW";

/** Legacy Cloud Pro $99/mo. Now resolves to Scale. */
export const LEGACY_CLOUD_PRO_PRICE_ID = "price_1TNY81JOtNZA0x7xsulCSP6x";

/** Legacy Cloud Agency $149/mo. Now resolves to Scale. */
export const LEGACY_CLOUD_AGENCY_PRICE_ID = "price_1TQzjrJOtNZA0x7xV4UFxWrH";

/** Legacy per-additional-workspace add-on. Resolves to Growth. Kept
 *  in the allowlist so existing subscriptions don't 400, but new
 *  flows never create this — Growth includes 3 workspaces, Scale is
 *  unlimited. */
export const WORKSPACE_ADDON_MONTHLY_PRICE_ID = "price_1TMC7UJOtNZA0x7xNrl2VDVE";

// ─── Backward-compat aliases (kept until callers migrate) ────────────

/** @deprecated Use GROWTH_BASE_PRICE_ID + tier="growth". Kept for
 *  callers that still hard-code the legacy id — they'll resolve to
 *  growth via tier-resolve. */
export const CLOUD_STARTER_MONTHLY_PRICE_ID = LEGACY_CLOUD_STARTER_PRICE_ID;

/** @deprecated Use SCALE_BASE_PRICE_ID + tier="scale". */
export const SELF_SERVICE_WORKSPACE_MONTHLY_PRICE_ID = LEGACY_CLOUD_PRO_PRICE_ID;

/** @deprecated Use SCALE_BASE_PRICE_ID + tier="scale". */
export const CLOUD_AGENCY_MONTHLY_PRICE_ID = LEGACY_CLOUD_AGENCY_PRICE_ID;

// ─── Allowlist + helpers ─────────────────────────────────────────────

const ALLOWED_PRICE_IDS = new Set<string>([
  // New tier base prices
  GROWTH_BASE_PRICE_ID,
  SCALE_BASE_PRICE_ID,
  // Metered overages (only allowlisted when set; falsy strings are
  // filtered below)
  GROWTH_CONTACTS_PRICE_ID,
  GROWTH_AGENT_RUNS_PRICE_ID,
  SCALE_AGENT_RUNS_PRICE_ID,
  // Legacy IDs (replay safety + grandfathered subscriptions)
  LEGACY_CLOUD_STARTER_PRICE_ID,
  LEGACY_CLOUD_PRO_PRICE_ID,
  LEGACY_CLOUD_AGENCY_PRICE_ID,
  WORKSPACE_ADDON_MONTHLY_PRICE_ID,
].filter(Boolean));

export function isAllowedCheckoutPriceId(priceId: string): boolean {
  return ALLOWED_PRICE_IDS.has(priceId);
}

/** Marks the price IDs that activate the self-service workspace path.
 *  Both tier base prices (growth + scale) flip the per-org
 *  `selfServiceEnabled` flag — they only differ in tier-specific
 *  entitlements. Legacy tier price IDs stay in the set so existing
 *  subscriptions keep their self-service flags. */
const SELF_SERVICE_TIER_PRICE_IDS = new Set<string>([
  GROWTH_BASE_PRICE_ID,
  SCALE_BASE_PRICE_ID,
  LEGACY_CLOUD_STARTER_PRICE_ID,
  LEGACY_CLOUD_PRO_PRICE_ID,
  LEGACY_CLOUD_AGENCY_PRICE_ID,
].filter(Boolean));

export function isSelfServiceCheckoutPriceId(priceId: string | null | undefined) {
  return typeof priceId === "string" && SELF_SERVICE_TIER_PRICE_IDS.has(priceId);
}

/** True if the given price ID is one of the new tier base prices
 *  (vs. a metered overage or legacy id). Used by the checkout flow
 *  to decide whether the priceId requested by the client maps to a
 *  tier we can build a multi-price subscription for. */
export function isTierBasePriceId(priceId: string): boolean {
  return priceId === GROWTH_BASE_PRICE_ID || priceId === SCALE_BASE_PRICE_ID;
}
