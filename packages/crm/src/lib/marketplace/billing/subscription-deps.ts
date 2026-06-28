// #139 P2/P3 — the SHARED recurring-Checkout seam + deps.
//
// Both the monthly subscription (P2) and the metered subscription (P3) drive the
// same `mode:"subscription"` Stripe Checkout with the same 5% application-fee
// percent + seller transfer destination + idempotency + persisted purchase row.
// They differ ONLY in the recurring Price they bill (a flat monthly licensed
// price vs a metered usage price). So the DI'd seam + the deps + the result type
// live here once and both creators import them.
//
// MONEY-SAFETY: the seam is narrow (just the three calls the creators make), so
// the unit tests fake it with no network / no real Stripe key / no db. The real
// production deps (real-deps.ts) wrap the live Stripe client + the
// stripe_connections read + createPurchase behind exactly this seam.

import type Stripe from "stripe";
import type {
  MarketplacePurchaseRow,
  MarketplaceStripeMode,
  NewMarketplacePurchase,
} from "@/db/schema/marketplace-purchases";
import type { StorefrontPricingRow } from "@/lib/marketplace/pricing-model";
import type { ConnectStatus } from "./one-time-checkout";

export type { ConnectStatus } from "./one-time-checkout";

/** The minimal listing shape a recurring creator needs — the pricing columns
 *  (so storefrontPriceFromRow reads the right amount) + identity. */
export type RecurringCheckoutListing = StorefrontPricingRow & {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
};

/** The reference to a recurring Price resolved on the seller's connected
 *  account. The metered path also returns the meter id it created/looked-up. */
export type RecurringPriceRef = {
  /** The Stripe Price id (price_…) the Checkout line item references. */
  priceId: string;
  /** For a metered price, the meter id (mtr_…) usage is reported against. */
  meterId?: string | null;
};

/** Params for create-or-lookup of a recurring Price on a connected account. */
export type ResolveRecurringPriceParams = {
  /** The seller's Stripe Connect account id the price is created on. */
  connectedAccountId: string;
  /** The listing id (used to make the lookup_key stable + idempotent). */
  listingId: string;
  /** The listing name (the product label on the connected account). */
  listingName: string;
  /** The flat unit amount in cents (per month for licensed; per unit for metered). */
  unitAmountCents: number;
  /** The recurring interval. v1 always "month". */
  interval: "month";
  /** licensed = flat monthly; metered = usage-based. */
  usageType: "licensed" | "metered";
};

/** The narrow Stripe seam the recurring creators call. Typed against the real
 *  Stripe param/return so the call site can't drift from the SDK. The real dep
 *  passes the live Stripe client (wrapped to satisfy this); the test passes a
 *  fake that records the params. */
export type SubscriptionCheckoutSeam = {
  checkout: {
    sessions: {
      create(
        params: Stripe.Checkout.SessionCreateParams,
        options?: Stripe.RequestOptions,
      ): Promise<Pick<Stripe.Checkout.Session, "id" | "url">>;
    };
  };
  /** Create-or-lookup the recurring Price on the seller's connected account.
   *  Real impl uses a stable lookup_key so a re-list reuses one price. */
  resolveRecurringPrice(params: ResolveRecurringPriceParams): Promise<RecurringPriceRef>;
};

export type SubscriptionCheckoutDeps = {
  /** The Stripe seam, or null when no key is configured (→ inert/skip). */
  getStripe: () => SubscriptionCheckoutSeam | null;
  /** Resolve the seller org's Connect status (real impl wraps the
   *  stripe_connections read; tests pass a fake). */
  readConnectStatus: (sellerOrgId: string) => Promise<ConnectStatus>;
  /** Persist the pending purchase row (real impl is createPurchase). */
  createPurchase: (values: NewMarketplacePurchase) => Promise<MarketplacePurchaseRow>;
  /** The environment (for the flags + the live-key check). */
  env: Record<string, string | undefined>;
  /** Base URL for the success/cancel redirects. */
  baseUrl: string;
  /** Clock (kept for parity with the one-time deps; recurring idempotency keys
   *  are day-independent so a buyer reuses one session per listing). */
  now: () => Date;
};

export type SubscriptionCheckoutResult =
  | { ok: true; url: string | null; purchaseId: string; stripeMode: MarketplaceStripeMode }
  | { ok: false; skipped: true; reason: string };

/** Build the { skipped } result (no Stripe call, free-install fallback). */
export function skip(reason: string): SubscriptionCheckoutResult {
  return { ok: false, skipped: true, reason };
}

// ─── install ROUTER decision ─────────────────────────────────────────────────

/** Which billing creator the install action runs for a listing's pricing model:
 *  - "onetime"  → createOneTimeAgentCheckout (P1)
 *  - "monthly"  → createMonthlyAgentSubscription (P2)
 *  - "metered"  → createMeteredAgentSubscription (P3, per_usage / per_outcome)
 *  - "free"     → no billing creator (the free-clone install path) */
export type InstallCreatorKind = "onetime" | "monthly" | "metered" | "free";

/**
 * Pure routing decision: map a listing's priceModel → the billing creator the
 * install action should invoke. `per_usage`/`per_outcome` both route to the
 * metered creator; `monthly` to the monthly creator; `onetime` to the one-time
 * creator; any unknown/legacy model → "free" (today's free-install path). This is
 * the single source of truth the install router and its test agree on.
 */
export function selectInstallCreator(priceModel: string | null | undefined): InstallCreatorKind {
  switch (String(priceModel ?? "onetime")) {
    case "monthly":
      return "monthly";
    case "per_usage":
    case "per_outcome":
      return "metered";
    case "onetime":
      return "onetime";
    default:
      return "free";
  }
}
