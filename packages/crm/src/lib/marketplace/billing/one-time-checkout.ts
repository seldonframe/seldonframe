// #139 P1 — one-time agent Checkout on the SELLER's connected account.
//
// THE PROOF: a Stripe Connect Checkout Session (mode:"payment") for a `onetime`
// paid marketplace agent, with the 5% MARKETPLACE_FEE_PERCENT as the
// application_fee_amount and the remainder routed to the seller via
// transfer_data.destination — plus an idempotency key and a persisted
// marketplace_purchases row (status:'pending'). This MIRRORS the existing
// installAgentListingAction Stripe call (lib/marketplace/actions.ts) but adds the
// money-safety gating, the idempotency key, the resolved stripeMode, and the
// settlement row that today's free-install path lacks.
//
// ─────────────────────────────────────────────────────────────────────────────
// MONEY-SAFETY (non-negotiable):
//   • Everything is DI'd (the Stripe client, the connect-status read, the store,
//     the clock, the env) so the unit tests run with a FAKE Stripe — no network,
//     no real key, no charge.
//   • The function is INERT without a Stripe key: deps.getStripe() returns null
//     (getStripeClient() returns null when STRIPE_SECRET_KEY is unset) → we skip
//     and never touch Stripe.
//   • It charges ONLY when ALL hold: the SF_MARKETPLACE_BILLING feature flag is
//     ON (default OFF), the listing is `onetime` with a positive price, and the
//     seller's Connect account is ready (charges_enabled / isActive). Any miss →
//     { skipped, reason } and NO Stripe call (today's free-install behavior).
//   • resolveBillingMode decides 'test' vs 'live'; a 'live' charge additionally
//     needs the go-live flag + a live key (so dev/test can never charge for real).
// ─────────────────────────────────────────────────────────────────────────────

import type Stripe from "stripe";
import { computeMarketplaceFeeCents } from "@/lib/billing/gmv";
import {
  storefrontPriceFromRow,
  type StorefrontPricingRow,
} from "@/lib/marketplace/pricing-model";
import type {
  MarketplacePurchaseRow,
  MarketplaceStripeMode,
  NewMarketplacePurchase,
} from "@/db/schema/marketplace-purchases";
import {
  canChargeListing,
  isBillingEnabled,
  resolveBillingMode,
  type BillingEnv,
} from "./billing-mode";

/** The minimal listing shape this function needs (a subset of marketplace_listings
 *  — the pricing columns + the seller Connect account + identity). Extends the
 *  pricing row so storefrontPriceFromRow reads the same columns. */
export type OneTimeCheckoutListing = StorefrontPricingRow & {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  /** The seller's Stripe Connect account id (acct_…). Null → not payable. */
  stripeConnectAccountId?: string | null;
};

export type CreateOneTimeAgentCheckoutInput = {
  listing: OneTimeCheckoutListing;
  buyerOrgId: string;
  /** The seller / agent-creator's org (the fee-attribution + ledger side). */
  sellerOrgId: string;
};

/** The Connect-status read result (mirrors readConnectStatus): ready + acct id. */
export type ConnectStatus = {
  /** charges_enabled / stripe_connections.isActive === true. */
  ready: boolean;
  /** The seller's Stripe Connect account id, or null. */
  accountId: string | null;
};

/** The narrow Stripe seam we actually call — just checkout.sessions.create. The
 *  real dep passes the live Stripe client (which satisfies this); the test passes
 *  a fake that records the params. Typed against the real Stripe param/return so
 *  the call site can't drift from the SDK. */
export type StripeCheckoutSeam = {
  checkout: {
    sessions: {
      create(
        params: Stripe.Checkout.SessionCreateParams,
        options?: Stripe.RequestOptions,
      ): Promise<Pick<Stripe.Checkout.Session, "id" | "url">>;
    };
  };
};

export type CreateOneTimeAgentCheckoutDeps = {
  /** The Stripe client, or null when no key is configured (→ inert/skip). */
  getStripe: () => StripeCheckoutSeam | null;
  /** Resolve the seller org's Connect status (the real impl wraps the
   *  stripe_connections read; tests pass a fake). */
  readConnectStatus: (sellerOrgId: string) => Promise<ConnectStatus>;
  /** Persist the pending purchase row (the real impl is createPurchase). */
  createPurchase: (values: NewMarketplacePurchase) => Promise<MarketplacePurchaseRow>;
  /** The environment (for the flags + the live-key check). */
  env: BillingEnv;
  /** Base URL for the success/cancel redirects. */
  baseUrl: string;
  /** Clock — used for the per-day idempotency key. */
  now: () => Date;
};

export type CreateOneTimeAgentCheckoutResult =
  | { ok: true; url: string | null; purchaseId: string; stripeMode: MarketplaceStripeMode }
  | { ok: false; skipped: true; reason: string };

function skip(reason: string): CreateOneTimeAgentCheckoutResult {
  return { ok: false, skipped: true, reason };
}

/** The UTC calendar day (YYYY-MM-DD) for the idempotency key — so the same buyer
 *  re-attempting the same listing on the same day reuses one Stripe session
 *  instead of creating duplicates / double-charging. */
function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Build a one-time Stripe Connect Checkout Session for a paid `onetime` agent
 * listing on the SELLER's connected account, persist a pending purchase row, and
 * return the Checkout URL. Returns { skipped } (and makes NO Stripe call) when
 * the billing flag is OFF, the model isn't onetime, the price is non-positive,
 * the seller isn't Connect-ready, or no Stripe key is configured.
 */
export async function createOneTimeAgentCheckout(
  input: CreateOneTimeAgentCheckoutInput,
  deps: CreateOneTimeAgentCheckoutDeps,
): Promise<CreateOneTimeAgentCheckoutResult> {
  const { listing, buyerOrgId, sellerOrgId } = input;

  // 1) Feature-flag gate (default OFF → free install).
  const billingEnabled = isBillingEnabled(deps.env);
  if (!billingEnabled) return skip("billing_disabled");

  // 2) Pricing gate — read the SELECTED model's amount from the listing columns.
  const price = storefrontPriceFromRow(listing);
  if (listing.priceModel !== "onetime") return skip("not_onetime");
  if (!price.isPaid || price.priceCents <= 0) return skip("not_paid");

  // 3) Per-model charge gate (onetime + connect-ready + flag on). Reads connect
  //    status; a not-ready seller keeps the free-install fallback (no charge).
  const connect = await deps.readConnectStatus(sellerOrgId);
  const connectReady = connect.ready && Boolean(connect.accountId);
  if (!canChargeListing({ priceModel: listing.priceModel, connectReady, billingEnabled })) {
    return skip("not_chargeable");
  }
  const destination = connect.accountId;
  if (!destination) return skip("seller_not_connected");

  // 4) INERT without a Stripe key — no client → skip (never touch Stripe).
  const stripe = deps.getStripe();
  if (!stripe) return skip("stripe_unconfigured");

  // 5) Resolve test vs live (live only with the go-live flag + a live key).
  const stripeMode = resolveBillingMode(deps.env);

  const amountCents = price.priceCents;
  const feeCents = computeMarketplaceFeeCents(amountCents);
  const idempotencyKey = `mkt-onetime-${buyerOrgId}-${listing.id}-${utcDayKey(deps.now())}`;

  // 6) Create the Checkout Session on the SELLER's connected account. Mirrors the
  //    existing installAgentListingAction params: mode payment, one line item at
  //    the real price, the 5% application fee, transfer_data.destination = seller.
  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      success_url: `${deps.baseUrl}/marketplace/${listing.slug}?purchased=true`,
      cancel_url: `${deps.baseUrl}/marketplace/${listing.slug}`,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: amountCents,
            product_data: {
              name: `SeldonFrame Agent: ${listing.name}`,
              description: listing.description || undefined,
            },
          },
        },
      ],
      payment_intent_data: {
        application_fee_amount: feeCents,
        transfer_data: { destination },
      },
      metadata: {
        // Distinct from the legacy soul_purchase metadata so the P4 webhook can
        // route a #139 settlement to updatePurchaseByCheckoutId.
        type: "marketplace_agent_purchase",
        listingId: listing.id,
        listingSlug: listing.slug,
        buyerOrgId,
        sellerOrgId,
      },
    },
    { idempotencyKey },
  );

  // 7) Persist the pending settlement row with the resolved mode + the checkout id.
  const purchase = await deps.createPurchase({
    listingId: listing.id,
    slug: listing.slug,
    buyerOrgId,
    sellerOrgId,
    priceModel: "onetime",
    amountCents,
    feeCents,
    stripeMode,
    stripeCheckoutId: session.id,
    status: "pending",
  });

  return { ok: true, url: session.url ?? null, purchaseId: purchase.id, stripeMode };
}
