// Unit tests for lib/marketplace/billing/monthly-subscription.ts — the #139 P2
// proof. A FAKE Stripe is the ONLY Stripe: it records the SessionCreateParams +
// options + the recurring-price create-or-lookup so we can assert mode:
// "subscription", a recurring MONTHLY price at the real amount, the 5%
// application_fee_percent, the seller transfer destination, and the idempotency
// key. The skip paths (flag OFF / not connected / not monthly / no key) must make
// ZERO Stripe calls and persist NO row — no real charge is ever reachable.
//
// No network, no real key, no db: everything is DI'd.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import type Stripe from "stripe";
import { createMonthlyAgentSubscription } from "../../../../src/lib/marketplace/billing/monthly-subscription";
import type {
  RecurringCheckoutListing,
  RecurringPriceRef,
  ResolveRecurringPriceParams,
  SubscriptionCheckoutDeps,
  SubscriptionCheckoutSeam,
  ConnectStatus,
} from "../../../../src/lib/marketplace/billing/subscription-deps";
import type {
  MarketplacePurchaseRow,
  NewMarketplacePurchase,
} from "../../../../src/db/schema/marketplace-purchases";

// ─── fakes ───────────────────────────────────────────────────────────────────

type RecordedCreate = {
  params: Stripe.Checkout.SessionCreateParams;
  options?: Stripe.RequestOptions;
};

/** A fake Stripe that records every checkout.sessions.create + resolveRecurringPrice. */
function makeFakeStripe(opts?: { sessionId?: string; url?: string; priceId?: string; meterId?: string | null }) {
  const sessionId = opts?.sessionId ?? "cs_test_sub_123";
  const url = opts?.url ?? "https://checkout.stripe.test/cs_test_sub_123";
  const priceId = opts?.priceId ?? "price_monthly_1";
  const meterId = opts?.meterId ?? null;
  const calls: RecordedCreate[] = [];
  const priceCalls: ResolveRecurringPriceParams[] = [];
  const stripe: SubscriptionCheckoutSeam = {
    checkout: {
      sessions: {
        async create(params, options) {
          calls.push({ params, options });
          return { id: sessionId, url };
        },
      },
    },
    async resolveRecurringPrice(params): Promise<RecurringPriceRef> {
      priceCalls.push(params);
      return { priceId, meterId };
    },
  };
  return { stripe, calls, priceCalls };
}

function makeFakeStore() {
  const inserted: NewMarketplacePurchase[] = [];
  const createPurchase = async (values: NewMarketplacePurchase): Promise<MarketplacePurchaseRow> => {
    inserted.push(values);
    return {
      id: "purchase-sub-1",
      listingId: values.listingId,
      slug: values.slug,
      buyerOrgId: values.buyerOrgId,
      sellerOrgId: values.sellerOrgId,
      priceModel: values.priceModel,
      amountCents: values.amountCents ?? 0,
      feeCents: values.feeCents ?? 0,
      stripeMode: values.stripeMode ?? "test",
      stripeCustomerId: values.stripeCustomerId ?? null,
      stripeCheckoutId: values.stripeCheckoutId ?? null,
      stripeSubscriptionId: values.stripeSubscriptionId ?? null,
      status: values.status ?? "pending",
      createdAt: new Date("2026-06-28T00:00:00Z"),
      updatedAt: new Date("2026-06-28T00:00:00Z"),
    };
  };
  return { inserted, createPurchase };
}

const MONTHLY: RecurringCheckoutListing = {
  id: "listing-m1",
  slug: "speed-to-lead",
  name: "Speed to Lead",
  description: "Texts new leads in seconds.",
  priceModel: "monthly",
  // The onetime column stays 0 for a monthly listing; the amount is in monthly_price_cents.
  price: 0,
  monthlyPriceCents: 2900, // $29/mo
};

const READY: ConnectStatus = { ready: true, accountId: "acct_seller_m" };

function makeDeps(over: Partial<SubscriptionCheckoutDeps> = {}): {
  deps: SubscriptionCheckoutDeps;
  calls: RecordedCreate[];
  priceCalls: ResolveRecurringPriceParams[];
  inserted: NewMarketplacePurchase[];
} {
  const fake = over.getStripe ? null : makeFakeStripe();
  const { inserted, createPurchase } = makeFakeStore();
  const deps: SubscriptionCheckoutDeps = {
    getStripe: () => fake?.stripe ?? null,
    readConnectStatus: async () => READY,
    createPurchase,
    env: { SF_MARKETPLACE_BILLING: "true" },
    baseUrl: "https://app.seldonframe.com",
    now: () => new Date("2026-06-28T12:34:56Z"),
    ...over,
  };
  return { deps, calls: fake?.calls ?? [], priceCalls: fake?.priceCalls ?? [], inserted };
}

const INPUT = { listing: MONTHLY, buyerOrgId: "org-buyer-m", sellerOrgId: "org-seller-m" };

// ─── happy path ──────────────────────────────────────────────────────────────

describe("createMonthlyAgentSubscription — happy path", () => {
  test("creates a SUBSCRIPTION Session with a monthly price, 5% fee %, + destination", async () => {
    const { deps, calls, priceCalls, inserted } = makeDeps();
    const result = await createMonthlyAgentSubscription(INPUT, deps);

    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("unreachable");
    assert.equal(result.url, "https://checkout.stripe.test/cs_test_sub_123");
    assert.equal(result.stripeMode, "test");

    // The recurring price was created-or-looked-up at the REAL monthly amount.
    assert.equal(priceCalls.length, 1);
    assert.equal(priceCalls[0].unitAmountCents, 2900);
    assert.equal(priceCalls[0].interval, "month");
    assert.equal(priceCalls[0].usageType, "licensed");
    assert.equal(priceCalls[0].connectedAccountId, "acct_seller_m");

    // Exactly one Checkout Session call.
    assert.equal(calls.length, 1);
    const { params, options } = calls[0];

    // mode subscription.
    assert.equal(params.mode, "subscription");

    // Line item references the resolved recurring price.
    assert.equal(params.line_items?.length, 1);
    assert.equal(params.line_items?.[0]?.price, "price_monthly_1");
    assert.equal(params.line_items?.[0]?.quantity, 1);

    // 5% application fee PERCENT + seller destination on subscription_data.
    assert.equal(params.subscription_data?.application_fee_percent, 5);
    assert.equal(params.subscription_data?.transfer_data?.destination, "acct_seller_m");

    // Idempotency key = (buyerOrg, listing) — day-independent so a re-attempt reuses it.
    assert.equal(options?.idempotencyKey, "mkt-monthly-org-buyer-m-listing-m1");

    // Metadata routes the webhook to the #139 recurring settlement.
    assert.equal(params.metadata?.type, "marketplace_agent_subscription");
    assert.equal(params.metadata?.priceModel, "monthly");
    assert.equal(params.metadata?.listingId, "listing-m1");
    assert.equal(params.metadata?.buyerOrgId, "org-buyer-m");

    // A pending purchase row persisted with the checkout id + resolved mode.
    assert.equal(inserted.length, 1);
    const row = inserted[0];
    assert.equal(row.status, "pending");
    assert.equal(row.stripeMode, "test");
    assert.equal(row.priceModel, "monthly");
    assert.equal(row.amountCents, 2900);
    assert.equal(row.buyerOrgId, "org-buyer-m");
    assert.equal(row.sellerOrgId, "org-seller-m");
    assert.equal(row.stripeCheckoutId, "cs_test_sub_123");
  });

  test("stripeMode is 'live' only with the go-live flag + a live key", async () => {
    const { deps, inserted } = makeDeps({
      env: {
        SF_MARKETPLACE_BILLING: "true",
        SF_MARKETPLACE_BILLING_LIVE: "true",
        STRIPE_SECRET_KEY: "sk_live_abc",
      },
    });
    const result = await createMonthlyAgentSubscription(INPUT, deps);
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("unreachable");
    assert.equal(result.stripeMode, "live");
    assert.equal(inserted[0].stripeMode, "live");
  });
});

// ─── money-safe skips: ZERO Stripe calls, NO row ─────────────────────────────

describe("createMonthlyAgentSubscription — money-safe skips", () => {
  test("flag OFF (default) → skipped, NO Stripe call, NO row", async () => {
    const { deps, calls, priceCalls, inserted } = makeDeps({ env: {} });
    const result = await createMonthlyAgentSubscription(INPUT, deps);
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.equal(result.reason, "billing_disabled");
    assert.equal(calls.length, 0);
    assert.equal(priceCalls.length, 0);
    assert.equal(inserted.length, 0);
  });

  test("not a monthly listing → skipped (not_monthly), NO Stripe call", async () => {
    const onetime: RecurringCheckoutListing = { ...MONTHLY, priceModel: "onetime", price: 4900, monthlyPriceCents: null };
    const { deps, calls, inserted } = makeDeps();
    const result = await createMonthlyAgentSubscription({ ...INPUT, listing: onetime }, deps);
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.equal(result.reason, "not_monthly");
    assert.equal(calls.length, 0);
    assert.equal(inserted.length, 0);
  });

  test("monthly with zero/unset amount → skipped (not_paid), NO Stripe call", async () => {
    const free: RecurringCheckoutListing = { ...MONTHLY, monthlyPriceCents: 0 };
    const { deps, calls, inserted } = makeDeps();
    const result = await createMonthlyAgentSubscription({ ...INPUT, listing: free }, deps);
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.equal(result.reason, "not_paid");
    assert.equal(calls.length, 0);
    assert.equal(inserted.length, 0);
  });

  test("seller not Connect-ready → skipped, NO Stripe call", async () => {
    const { deps, calls, inserted } = makeDeps({
      readConnectStatus: async () => ({ ready: false, accountId: null }),
    });
    const result = await createMonthlyAgentSubscription(INPUT, deps);
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.equal(result.reason, "seller_not_connected");
    assert.equal(calls.length, 0);
    assert.equal(inserted.length, 0);
  });

  test("no Stripe key (inert) → skipped, NO row", async () => {
    const { inserted: storeInserted, createPurchase } = makeFakeStore();
    const deps: SubscriptionCheckoutDeps = {
      getStripe: () => null,
      readConnectStatus: async () => READY,
      createPurchase,
      env: { SF_MARKETPLACE_BILLING: "true" },
      baseUrl: "https://app.seldonframe.com",
      now: () => new Date("2026-06-28T12:34:56Z"),
    };
    const result = await createMonthlyAgentSubscription(INPUT, deps);
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.equal(result.reason, "stripe_unconfigured");
    assert.equal(storeInserted.length, 0);
  });
});
