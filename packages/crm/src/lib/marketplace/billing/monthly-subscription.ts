// #139 P2 — monthly agent SUBSCRIPTION Checkout as a DIRECT charge on the seller.
//
// THE PROOF: a Stripe Checkout Session in `mode:"subscription"` for a `monthly`
// paid marketplace agent listing, created ON the SELLER's connected account
// ({ stripeAccount }). Stripe creates the Subscription on that account and runs
// the recurring monthly billing for us. The recurring monthly Price is
// created-or-looked-up on the SAME connected account; the 5% MARKETPLACE_FEE_PERCENT
// rides as `subscription_data.application_fee_percent` and there is NO transfer_data
// (a DIRECT charge — the customer + subscription + price live on the connected
// account, the seller is the settlement merchant and BEARS Stripe's processing
// fee, and SF's 5% arrives clean). An idempotency key keeps a re-attempt from
// creating a duplicate session, and a pending marketplace_purchases row is
// persisted (the subscription id itself arrives via the P4 webhook →
// updatePurchaseBySubscriptionId; the webhook receives CONNECT events,
// event.account = the seller).
//
// WHY direct (not destination): a destination charge debits the PLATFORM balance
// for Stripe's processing fee, so SF's 5% goes net-negative at low prices. A
// direct charge debits it from the seller. Trade-off (correct for a marketplace):
// the seller bears dispute/refund liability + the settlement currency.
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
import { MARKETPLACE_FEE_PERCENT, computeMarketplaceFeeCents } from "@/lib/billing/gmv";
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
  // The fee is a PERCENT on a subscription (Stripe computes + withholds the cents
  // each cycle via application_fee_percent). We ALSO snapshot the first-cycle fee
  // in cents on the ledger row so the earnings dashboard's platform-cut isn't
  // undercounted (a flat monthly price → the same cents every cycle).
  const feePercent = MARKETPLACE_FEE_PERCENT;
  const feeCents = computeMarketplaceFeeCents(amountCents);
  const idempotencyKey = `mkt-monthly-${buyerOrgId}-${listing.id}`;

  // 6) Create-or-lookup a recurring MONTHLY price on the SELLER's CONNECTED
  //    account for this listing's amount. The price + subscription live on the
  //    connected account (a direct charge); SF takes the % application fee.
  const priceRef: RecurringPriceRef = await stripe.resolveRecurringPrice({
    listingId: listing.id,
    listingName: listing.name,
    unitAmountCents: amountCents,
    interval: "month",
    usageType: "licensed",
    connectAccountId: destination,
  });

  // 7) Create the SUBSCRIPTION Checkout Session as a DIRECT charge ON the seller's
  //    connected account ({ stripeAccount: destination }). Stripe creates the
  //    subscription on that account + handles recurring billing; the seller bears
  //    Stripe's fee and SF takes subscription_data.application_fee_percent. NO
  //    transfer_data (a direct charge already settles to the connected account).
  const session = await stripe.checkout.sessions.create(
    {
      mode: "subscription",
      success_url: `${deps.baseUrl}/marketplace/${listing.slug}?purchased=true`,
      cancel_url: `${deps.baseUrl}/marketplace/${listing.slug}`,
      line_items: [{ quantity: 1, price: priceRef.priceId }],
      subscription_data: {
        application_fee_percent: feePercent,
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
    { idempotencyKey, stripeAccount: destination },
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
    // First-cycle platform cut (5% of the monthly amount). Stripe withholds the
    // % each cycle; this snapshot keeps fee_cents non-zero so earnings reconcile.
    feeCents,
    stripeMode,
    stripeCheckoutId: session.id,
    status: "pending",
  } satisfies NewMarketplacePurchase);

  return { ok: true, url: session.url ?? null, purchaseId: purchase.id, stripeMode };
}
