// Unit tests for lib/marketplace/billing/metered-subscription.ts — the #139 P3
// proof. A FAKE Stripe is the ONLY Stripe.
//
//   • createMeteredAgentSubscription → a SUBSCRIPTION Session whose recurring
//     price is METERED (usage-based), 5% application_fee_percent, the seller
//     destination, the idempotency key; a pending row persisted. Skip paths
//     (flag OFF / not metered / not paid / not connected / no key) make ZERO
//     Stripe calls and persist NO row.
//   • reportAgentUsage → pushes ONE usage record with the quantity; is a NO-OP
//     when flag-off / no-key / no-item / non-positive; and NEVER throws (a Stripe
//     error is swallowed → { skipped }).
//
// No network, no real key, no db: everything is DI'd.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import type Stripe from "stripe";
import {
  createMeteredAgentSubscription,
  reportAgentUsage,
  type ReportAgentUsageDeps,
  type UsageReportSeam,
} from "../../../../src/lib/marketplace/billing/metered-subscription";
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

// ─── fakes (checkout) ────────────────────────────────────────────────────────

type RecordedCreate = {
  params: Stripe.Checkout.SessionCreateParams;
  options?: Stripe.RequestOptions;
};

function makeFakeStripe(opts?: { priceId?: string; meterId?: string | null }) {
  const priceId = opts?.priceId ?? "price_metered_1";
  const meterId = opts?.meterId ?? "mtr_1";
  const calls: RecordedCreate[] = [];
  const priceCalls: ResolveRecurringPriceParams[] = [];
  const stripe: SubscriptionCheckoutSeam = {
    checkout: {
      sessions: {
        async create(params, options) {
          calls.push({ params, options });
          return { id: "cs_test_metered_1", url: "https://checkout.stripe.test/cs_test_metered_1" };
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
      id: "purchase-metered-1",
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

const PER_USAGE: RecurringCheckoutListing = {
  id: "listing-u1",
  slug: "review-responder-metered",
  name: "Review Responder (metered)",
  description: "Per-call billing.",
  priceModel: "per_usage",
  price: 0,
  perCallPriceCents: 200, // $2 per call
};

const PER_OUTCOME: RecurringCheckoutListing = {
  id: "listing-o1",
  slug: "booking-bot",
  name: "Booking Bot",
  priceModel: "per_outcome",
  price: 0,
  perOutcomePriceCents: 1000, // $10 per booking
  outcomeType: "booking",
};

const READY: ConnectStatus = { ready: true, accountId: "acct_seller_u" };

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

const INPUT = { listing: PER_USAGE, buyerOrgId: "org-buyer-u", sellerOrgId: "org-seller-u" };

// ─── createMeteredAgentSubscription happy path ───────────────────────────────

describe("createMeteredAgentSubscription — happy path", () => {
  test("per_usage → a metered SUBSCRIPTION Session at the per-call amount", async () => {
    const { deps, calls, priceCalls, inserted } = makeDeps();
    const result = await createMeteredAgentSubscription(INPUT, deps);

    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("unreachable");
    assert.equal(result.url, "https://checkout.stripe.test/cs_test_metered_1");

    // A METERED recurring price at the per-call amount.
    assert.equal(priceCalls.length, 1);
    assert.equal(priceCalls[0].usageType, "metered");
    assert.equal(priceCalls[0].unitAmountCents, 200);
    assert.equal(priceCalls[0].interval, "month");

    assert.equal(calls.length, 1);
    const { params, options } = calls[0];
    assert.equal(params.mode, "subscription");
    // A metered line item carries the price, NO quantity (Stripe bills usage).
    assert.equal(params.line_items?.length, 1);
    assert.equal(params.line_items?.[0]?.price, "price_metered_1");
    assert.equal(params.line_items?.[0]?.quantity, undefined);

    // 5% fee % + seller destination.
    assert.equal(params.subscription_data?.application_fee_percent, 5);
    assert.equal(params.subscription_data?.transfer_data?.destination, "acct_seller_u");

    // Idempotency + metadata + the meter id surfaced.
    assert.equal(options?.idempotencyKey, "mkt-metered-org-buyer-u-listing-u1");
    assert.equal(params.metadata?.type, "marketplace_agent_subscription");
    assert.equal(params.metadata?.priceModel, "per_usage");
    assert.equal(params.metadata?.meterId, "mtr_1");

    // Pending row at the per-unit amount.
    assert.equal(inserted.length, 1);
    assert.equal(inserted[0].priceModel, "per_usage");
    assert.equal(inserted[0].amountCents, 200);
    assert.equal(inserted[0].status, "pending");
    assert.equal(inserted[0].stripeCheckoutId, "cs_test_metered_1");
  });

  test("per_outcome → a metered subscription at the per-outcome amount", async () => {
    const { deps, calls, priceCalls, inserted } = makeDeps();
    const result = await createMeteredAgentSubscription({ ...INPUT, listing: PER_OUTCOME }, deps);
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("unreachable");
    assert.equal(priceCalls[0].unitAmountCents, 1000);
    assert.equal(priceCalls[0].usageType, "metered");
    assert.equal(calls[0].params.metadata?.priceModel, "per_outcome");
    assert.equal(inserted[0].priceModel, "per_outcome");
    assert.equal(inserted[0].amountCents, 1000);
  });
});

// ─── createMeteredAgentSubscription money-safe skips ─────────────────────────

describe("createMeteredAgentSubscription — money-safe skips", () => {
  test("flag OFF → skipped, NO Stripe call, NO row", async () => {
    const { deps, calls, priceCalls, inserted } = makeDeps({ env: {} });
    const result = await createMeteredAgentSubscription(INPUT, deps);
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.equal(result.reason, "billing_disabled");
    assert.equal(calls.length, 0);
    assert.equal(priceCalls.length, 0);
    assert.equal(inserted.length, 0);
  });

  test("monthly/onetime listing → skipped (not_metered), NO Stripe call", async () => {
    const monthly: RecurringCheckoutListing = { ...PER_USAGE, priceModel: "monthly", perCallPriceCents: null, monthlyPriceCents: 2900 };
    const { deps, calls, inserted } = makeDeps();
    const result = await createMeteredAgentSubscription({ ...INPUT, listing: monthly }, deps);
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.equal(result.reason, "not_metered");
    assert.equal(calls.length, 0);
    assert.equal(inserted.length, 0);
  });

  test("metered with zero amount → skipped (not_paid), NO Stripe call", async () => {
    const free: RecurringCheckoutListing = { ...PER_USAGE, perCallPriceCents: 0 };
    const { deps, calls, inserted } = makeDeps();
    const result = await createMeteredAgentSubscription({ ...INPUT, listing: free }, deps);
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
    const result = await createMeteredAgentSubscription(INPUT, deps);
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
    const result = await createMeteredAgentSubscription(INPUT, deps);
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.equal(result.reason, "stripe_unconfigured");
    assert.equal(storeInserted.length, 0);
  });
});

// ─── reportAgentUsage ────────────────────────────────────────────────────────

function makeUsageDeps(over: Partial<ReportAgentUsageDeps> & { throws?: boolean; nullReporter?: boolean } = {}): {
  deps: ReportAgentUsageDeps;
  pushes: Array<{ subscriptionItemId: string; quantity: number; idempotencyKey: string }>;
} {
  const pushes: Array<{ subscriptionItemId: string; quantity: number; idempotencyKey: string }> = [];
  const reporter: UsageReportSeam = {
    async reportUsage(input) {
      if (over.throws) throw new Error("stripe boom");
      pushes.push(input);
    },
  };
  const deps: ReportAgentUsageDeps = {
    getUsageReporter: () => (over.nullReporter ? null : reporter),
    env: over.env ?? { SF_MARKETPLACE_BILLING: "true" },
  };
  return { deps, pushes };
}

describe("reportAgentUsage", () => {
  test("pushes ONE usage record with the quantity + idempotency key", async () => {
    const { deps, pushes } = makeUsageDeps();
    const result = await reportAgentUsage(
      { subscriptionItemId: "si_1", quantity: 1, idempotencyKey: "key-1" },
      deps,
    );
    assert.equal(result.ok, true);
    assert.equal(pushes.length, 1);
    assert.deepEqual(pushes[0], { subscriptionItemId: "si_1", quantity: 1, idempotencyKey: "key-1" });
  });

  test("NO-OP when the flag is OFF (no push)", async () => {
    const { deps, pushes } = makeUsageDeps({ env: {} });
    const result = await reportAgentUsage({ subscriptionItemId: "si_1", quantity: 1, idempotencyKey: "k" }, deps);
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.equal(result.reason, "billing_disabled");
    assert.equal(pushes.length, 0);
  });

  test("NO-OP when no Stripe key (reporter null)", async () => {
    const { deps, pushes } = makeUsageDeps({ nullReporter: true });
    const result = await reportAgentUsage({ subscriptionItemId: "si_1", quantity: 1, idempotencyKey: "k" }, deps);
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.equal(result.reason, "stripe_unconfigured");
    assert.equal(pushes.length, 0);
  });

  test("NO-OP when no subscription item / non-positive quantity", async () => {
    const { deps, pushes } = makeUsageDeps();
    const noItem = await reportAgentUsage({ subscriptionItemId: "", quantity: 1, idempotencyKey: "k" }, deps);
    assert.equal(noItem.ok, false);
    if (noItem.ok) throw new Error("unreachable");
    assert.equal(noItem.reason, "no_subscription_item");

    const zero = await reportAgentUsage({ subscriptionItemId: "si_1", quantity: 0, idempotencyKey: "k" }, deps);
    assert.equal(zero.ok, false);
    if (zero.ok) throw new Error("unreachable");
    assert.equal(zero.reason, "non_positive_quantity");
    assert.equal(pushes.length, 0);
  });

  test("NEVER throws — a Stripe error is swallowed → { skipped, report_failed }", async () => {
    const { deps, pushes } = makeUsageDeps({ throws: true });
    // Must resolve (not reject) even though the seam throws.
    const result = await reportAgentUsage({ subscriptionItemId: "si_1", quantity: 1, idempotencyKey: "k" }, deps);
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.equal(result.reason, "report_failed");
    assert.equal(pushes.length, 0);
  });
});
