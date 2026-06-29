// #139 Recurring & Metered Agent Billing — the PURE money-safety gates.
//
// Two pure functions, no I/O, no Stripe import. They are the airtight switches
// that keep marketplace billing money-safe (mirrors lib/acp/processor.ts's
// resolveProcessor env-flag idiom, but pure + branchless so it's trivially
// testable):
//
//   • resolveBillingMode(env) → 'test' | 'live'. The mode is KEY-DERIVED: it is
//     'live' iff STRIPE_SECRET_KEY is a live key (sk_live_… / rk_live_…), else
//     'test' (a test/restricted-test key or no key). Because the label is read
//     straight off the key in play, the 'live' stamp can NEVER disagree with the
//     key that actually created the row — there is no separate go-live flag to
//     fall out of sync with the configured key.
//
//   • canChargeListing({ priceModel, connectReady, billingEnabled }) → boolean.
//     The per-install gate: charge ONLY a settle-able listing whose seller is
//     Connect-ready AND when the SF_MARKETPLACE_BILLING feature flag is ON. A
//     not-ready seller, an unknown model, or the flag OFF (the default) → false →
//     keep today's free-install behavior.
//
// Neither function ever touches Stripe or the network; the inert-without-a-key
// guarantee is enforced separately by getStripeClient() returning null. The
// single enable switch is SF_MARKETPLACE_BILLING (isBillingEnabled); whether a
// charge is REAL is then purely a function of which Stripe key is configured.

import type { MarketplacePriceModel, MarketplaceStripeMode } from "@/db/schema/marketplace-purchases";

/** The feature flag that turns marketplace fiat billing ON at all. Default OFF:
 *  an unset / non-"true" value keeps the current free-to-install behavior. This
 *  is the SINGLE billing flag — there is no separate go-live flag; 'live' vs
 *  'test' is derived from the Stripe key (resolveBillingMode). */
export const MARKETPLACE_BILLING_FLAG = "SF_MARKETPLACE_BILLING";

/** A minimal env shape (so the gates take a plain record and stay pure/testable
 *  rather than reaching into process.env directly). */
export type BillingEnv = Record<string, string | undefined>;

/** True when a Stripe secret key string is a LIVE key (sk_live_… or rk_live_…).
 *  A test/restricted-test key (sk_test_…) or a missing key is NOT live. */
export function isLiveStripeKey(key: string | undefined | null): boolean {
  const k = (key ?? "").trim();
  if (!k) return false;
  return k.startsWith("sk_live_") || k.startsWith("rk_live_");
}

/**
 * Resolve the Stripe billing mode from the environment — KEY-DERIVED. Returns
 * 'live' iff STRIPE_SECRET_KEY is a live key (sk_live_… / rk_live_…); every other
 * case (a test/restricted-test key, or no key) → 'test'. The label therefore
 * always matches the actual key in play: a row can only be stamped 'live' when a
 * live key created it, so dev/test (a test key, or no key → inert) can never
 * mislabel — or attempt — a real charge.
 */
export function resolveBillingMode(env: BillingEnv): MarketplaceStripeMode {
  return isLiveStripeKey(env.STRIPE_SECRET_KEY) ? "live" : "test";
}

/** True when the marketplace billing FEATURE flag is ON (SF_MARKETPLACE_BILLING
 *  === "true"). Default OFF — keeps the free-install path. The single enable
 *  switch for marketplace fiat billing. */
export function isBillingEnabled(env: BillingEnv): boolean {
  return (env[MARKETPLACE_BILLING_FLAG] ?? "").trim() === "true";
}

export type CanChargeListingInput = {
  /** The listing's selected pricing model. */
  priceModel: MarketplacePriceModel | string | null | undefined;
  /** Whether the seller's Connect account is ready to charge (isActive + acct). */
  connectReady: boolean;
  /** Whether the billing feature flag is ON (isBillingEnabled(env)). */
  billingEnabled: boolean;
};

/** The pricing models that are settle-able today. P1 wired `onetime`; P2 adds
 *  `monthly`; P3 adds the metered `per_usage` / `per_outcome` subscriptions. */
const CHARGEABLE_MODELS = new Set<MarketplacePriceModel>([
  "onetime",
  "monthly",
  "per_usage",
  "per_outcome",
]);

/**
 * The per-install charge gate. Returns true for any settle-able pricing model
 * (`onetime` via P1's one-time Checkout; `monthly` via P2; `per_usage` /
 * `per_outcome` via P3's metered subscription) AND a Connect-ready seller AND
 * billing ON. A not-ready seller, the flag OFF (the default), or an
 * unknown/legacy model all return false so the caller falls back to the free
 * install. Pure.
 */
export function canChargeListing(input: CanChargeListingInput): boolean {
  if (!input.billingEnabled) return false;
  if (!input.connectReady) return false;
  return CHARGEABLE_MODELS.has(input.priceModel as MarketplacePriceModel);
}
