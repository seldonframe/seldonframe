// #139 P2 — monthly agent SUBSCRIPTION Checkout as a PLATFORM destination charge.
//
// THE PROOF: a Stripe Checkout Session in `mode:"subscription"` for a `monthly`
// paid marketplace agent listing, created on the PLATFORM (no { stripeAccount }).
// Stripe creates the Subscription and runs the recurring monthly billing for us
// (the simplest path + mirrors P1's hosted Checkout). The recurring monthly Price
// is created-or-looked-up on the PLATFORM (same account as the session); the 5%
// MARKETPLACE_FEE_PERCENT rides as `subscription_data.application_fee_percent` and
// the remainder routes to the seller via `subscription_data.transfer_data.destination`
// (a destination charge — the customer + subscription + price live on the
// platform). An idempotency key keeps a re-attempt from creating a duplicate
// session, and a pending marketplace_purchases row is persisted (the subscription
// id itself arrives via the P4 webhook → updatePurchaseBySubscriptionId).
//
// ─────────────────────────────────────────────────────────────────────────────
// MONEY-SAFETY (same contract as P1 — non-negotiable):
//   • Everything is DI'd (the Stripe seam, the connect-status read, the store,
//     the clock, the env) so the unit tests run with a FAKE Stripe — no network,
//     no real key, no charge.
//   • INERT without a Stripe key: deps.getStripe() returns null → skip, never
//     touch Stripe.
//   • Subscribes ONLY when ALL hold: SF_MARKETPLACE_BILLING is ON (default OFF),
//     the listing is `monthly` with a positive monthly price, the seller's
//     Connect account is ready, AND a Stripe key is configured. Any miss →
//     { skipped, reason } and NO Stripe call (today's free-install fallback).
//   • resolveBillingMode decides 'test' vs 'live'; 'live' additionally needs the
//     go-live flag + a live key — so dev/test can never charge for real.
// ─────────────────────────────────────────────────────────────────────────────

import { storefrontPriceFromRow } from "@/lib/marketplace/pricing-model";
import type {
  MarketplacePurchaseRow,
  MarketplaceStripeMode,
  NewMarketplacePurchase,
} from "@/db/schema/marketplace-purchases";
import { isBillingEnabled, resolveBillingMode } from "./billing-mode";
import { MARKETPLACE_FEE_PERCENT } from "@/lib/billing/gmv";
import {
  skip,
  type RecurringCheckoutListing,
  type RecurringPriceRef,
  type SubscriptionCheckoutDeps,
  type SubscriptionCheckoutResult,
} from "./subscription-deps";

export type CreateMonthlyAgentSubscriptionInput = {
  listing: RecurringCheckoutListing;
  buyerOrgId: string;
  /** The seller / agent-creator's org (the fee-attribution + ledger side). */
  sellerOrgId: string;
};

/**
 * Build a monthly SUBSCRIPTION Checkout Session for a paid `monthly` agent
 * listing as a PLATFORM destination charge (session + price + subscription on the
 * platform; seller paid via transfer_data.destination), persist a pending
 * purchase row, and return the Checkout URL. Returns { skipped } (and makes NO
 * Stripe call) when the billing flag is OFF, the model isn't `monthly`, the
 * monthly price is non-positive, the seller isn't Connect-ready, or no Stripe
 * key is configured.
 */
export async function createMonthlyAgentSubscription(
  input: CreateMonthlyAgentSubscriptionInput,
  deps: SubscriptionCheckoutDeps,
): Promise<SubscriptionCheckoutResult> {
  const { listing, buyerOrgId, sellerOrgId } = input;

  // 1) Feature-flag gate (default OFF → free install).
  if (!isBillingEnabled(deps.env)) return skip("billing_disabled");

  // 2) Pricing gate — this creator ONLY settles a `monthly` listing here.
  const price = storefrontPriceFromRow(listing);
  if (listing.priceModel !== "monthly") return skip("not_monthly");
  if (!price.isPaid || price.priceCents <= 0) return skip("not_paid");

  // 3) Connect gate — a not-ready seller keeps the free-install fallback.
  const connect = await deps.readConnectStatus(sellerOrgId);
  const destination = connect.accountId;
  if (!connect.ready || !destination) return skip("seller_not_connected");

  // 4) INERT without a Stripe key — no client → skip (never touch Stripe).
  const stripe = deps.getStripe();
  if (!stripe) return skip("stripe_unconfigured");

  // 5) Resolve test vs live (live only with the go-live flag + a live key).
  const stripeMode: MarketplaceStripeMode = resolveBillingMode(deps.env);

  const amountCents = price.priceCents;
  // The fee is a PERCENT on a subscription (Stripe computes the cents each cycle).
  const feePercent = MARKETPLACE_FEE_PERCENT;
  const idempotencyKey = `mkt-monthly-${buyerOrgId}-${listing.id}`;

  // 6) Create-or-lookup a recurring MONTHLY price on the PLATFORM for this
  //    listing's amount. The price + subscription live on the platform; the
  //    seller is paid via the session's transfer_data.destination (a destination
  //    charge), and SF takes the % application fee.
  const priceRef: RecurringPriceRef = await stripe.resolveRecurringPrice({
    listingId: listing.id,
    listingName: listing.name,
    unitAmountCents: amountCents,
    interval: "month",
    usageType: "licensed",
  });

  // 7) Create the SUBSCRIPTION Checkout Session on the PLATFORM (no stripeAccount).
  //    Stripe creates the subscription + handles recurring billing; the funds
  //    settle out to the seller via subscription_data.transfer_data.destination.
  const session = await stripe.checkout.sessions.create(
    {
      mode: "subscription",
      success_url: `${deps.baseUrl}/marketplace/${listing.slug}?purchased=true`,
      cancel_url: `${deps.baseUrl}/marketplace/${listing.slug}`,
      line_items: [{ quantity: 1, price: priceRef.priceId }],
      subscription_data: {
        application_fee_percent: feePercent,
        transfer_data: { destination },
      },
      metadata: {
        // Distinct from the legacy soul_purchase metadata so the P4 webhook can
        // route a #139 recurring settlement to updatePurchaseBySubscriptionId.
        type: "marketplace_agent_subscription",
        priceModel: "monthly",
        listingId: listing.id,
        listingSlug: listing.slug,
        buyerOrgId,
        sellerOrgId,
      },
    },
    { idempotencyKey },
  );

  // 8) Persist the pending settlement row. The subscription id is reconciled by
  //    the P4 webhook (checkout.session.completed → updatePurchaseBySubscriptionId);
  //    we store the checkout id now so the webhook can find this row.
  const purchase: MarketplacePurchaseRow = await deps.createPurchase({
    listingId: listing.id,
    slug: listing.slug,
    buyerOrgId,
    sellerOrgId,
    priceModel: "monthly",
    amountCents,
    // The recurring fee is a percent; the per-cycle cents are computed by Stripe.
    // We record 0 here and let the webhook/earnings rollup carry settled amounts.
    feeCents: 0,
    stripeMode,
    stripeCheckoutId: session.id,
    status: "pending",
  } satisfies NewMarketplacePurchase);

  return { ok: true, url: session.url ?? null, purchaseId: purchase.id, stripeMode };
}
