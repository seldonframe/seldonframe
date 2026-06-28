// #139 Recurring & Metered Agent Billing — the PURE money-safety gates.
//
// Two pure functions, no I/O, no Stripe import. They are the airtight switches
// that keep marketplace billing money-safe (mirrors lib/acp/processor.ts's
// resolveProcessor env-flag idiom, but pure + branchless so it's trivially
// testable):
//
//   • resolveBillingMode(env) → 'test' | 'live'. LIVE is only returned when BOTH
//     (a) SF_MARKETPLACE_BILLING_LIVE === "true" AND (b) a LIVE secret key is
//     present (sk_live_…). Anything else — flag unset, a test/restricted key, no
//     key — resolves to 'test'. So a row can only be stamped 'live' (i.e. a real
//     charge attempted) under an explicit, deliberate go-live.
//
//   • canChargeListing({ priceModel, connectReady, billingEnabled }) → boolean.
//     The per-install gate: charge ONLY a `onetime` listing whose seller is
//     Connect-ready AND when the SF_MARKETPLACE_BILLING feature flag is ON. Any
//     other model (monthly/per_usage/per_outcome — P2/P3), a not-ready seller, or
//     the flag OFF (the default) → false → keep today's free-install behavior.
//
// Neither function ever touches Stripe or the network; the inert-without-a-key
// guarantee is enforced separately by getStripeClient() returning null.

import type { MarketplacePriceModel, MarketplaceStripeMode } from "@/db/schema/marketplace-purchases";

/** The feature flag that turns marketplace fiat billing ON at all. Default OFF:
 *  an unset / non-"true" value keeps the current free-to-install behavior. */
export const MARKETPLACE_BILLING_FLAG = "SF_MARKETPLACE_BILLING";

/** The SEPARATE go-live flag. Even with billing ON, a 'live' (real-money) charge
 *  also requires this === "true" AND a live key. Default OFF → test mode. */
export const MARKETPLACE_BILLING_LIVE_FLAG = "SF_MARKETPLACE_BILLING_LIVE";

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
 * Resolve the Stripe billing mode from the environment. Returns 'live' ONLY when
 * the explicit go-live flag is "true" AND a live secret key is present. Every
 * other combination (flag off, test key, restricted, or no key) → 'test'. This
 * is the single place that decides whether a real charge is even possible.
 */
export function resolveBillingMode(env: BillingEnv): MarketplaceStripeMode {
  const liveFlag = (env[MARKETPLACE_BILLING_LIVE_FLAG] ?? "").trim() === "true";
  const liveKey = isLiveStripeKey(env.STRIPE_SECRET_KEY);
  return liveFlag && liveKey ? "live" : "test";
}

/** True when the marketplace billing FEATURE flag is ON (SF_MARKETPLACE_BILLING
 *  === "true"). Default OFF — keeps the free-install path. */
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

/**
 * The per-install charge gate. P1 wires ONLY the one-time Checkout, so this
 * returns true exclusively for `onetime` + a Connect-ready seller + billing ON.
 * Monthly / per_usage / per_outcome (P2/P3), a not-ready seller, or the flag OFF
 * all return false so the caller falls back to the free install. Pure.
 */
export function canChargeListing(input: CanChargeListingInput): boolean {
  if (!input.billingEnabled) return false;
  if (!input.connectReady) return false;
  // P1 scope: only the one-time model is settle-able today.
  return input.priceModel === "onetime";
}
