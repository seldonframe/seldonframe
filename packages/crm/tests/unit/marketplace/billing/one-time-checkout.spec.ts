// Unit tests for lib/marketplace/billing/one-time-checkout.ts — the #139 P1
// proof. A FAKE Stripe is the ONLY Stripe: it records the SessionCreateParams +
// options so we can assert the 5% application fee, the seller destination, the
// real price line item, the idempotency key, and mode:"payment". The skip paths
// (flag OFF / not connected / monthly / no Stripe key) must make ZERO Stripe
// calls and persist NO row — i.e. no real charge is ever reachable.
//
// No network, no real key, no db: everything is DI'd.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import type Stripe from "stripe";
import {
  createOneTimeAgentCheckout,
  type ConnectStatus,
  type CreateOneTimeAgentCheckoutDeps,
  type OneTimeCheckoutListing,
  type StripeCheckoutSeam,
} from "../../../../src/lib/marketplace/billing/one-time-checkout";
import type {
  MarketplacePurchaseRow,
  NewMarketplacePurchase,
} from "../../../../src/db/schema/marketplace-purchases";

// ─── fakes ───────────────────────────────────────────────────────────────────

type RecordedCreate = {
  params: Stripe.Checkout.SessionCreateParams;
  options?: Stripe.RequestOptions;
};

/** A fake Stripe that records every checkout.sessions.create call. */
function makeFakeStripe(sessionId = "cs_test_fake_123", url = "https://checkout.stripe.test/cs_test_fake_123") {
  const calls: RecordedCreate[] = [];
  const stripe: StripeCheckoutSeam = {
    checkout: {
      sessions: {
        async create(params, options) {
          calls.push({ params, options });
          return { id: sessionId, url };
        },
      },
    },
  };
  return { stripe, calls };
}

/** A fake purchases store that records inserted rows and echoes a row back. */
function makeFakeStore() {
  const inserted: NewMarketplacePurchase[] = [];
  const createPurchase = async (values: NewMarketplacePurchase): Promise<MarketplacePurchaseRow> => {
    inserted.push(values);
    return {
      id: "purchase-1",
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

const PAID_ONETIME: OneTimeCheckoutListing = {
  id: "listing-1",
  slug: "review-responder",
  name: "Review Responder",
  description: "Replies to reviews.",
  priceModel: "onetime",
  // $49.00 one-time → reads `price` (cents) for the onetime model.
  price: 4900,
  stripeConnectAccountId: "acct_seller_1",
};

const READY: ConnectStatus = { ready: true, accountId: "acct_seller_1" };

/** Build deps with sensible defaults; override per-test. The default env has the
 *  feature flag ON (so the happy path charges) but NO live flag/key (→ test mode). */
function makeDeps(
  over: Partial<CreateOneTimeAgentCheckoutDeps> = {},
): {
  deps: CreateOneTimeAgentCheckoutDeps;
  calls: RecordedCreate[];
  inserted: NewMarketplacePurchase[];
} {
  const { stripe, calls } = over.getStripe ? { stripe: null, calls: [] as RecordedCreate[] } : makeFakeStripe();
  const { inserted, createPurchase } = makeFakeStore();
  const deps: CreateOneTimeAgentCheckoutDeps = {
    getStripe: () => stripe,
    readConnectStatus: async () => READY,
    createPurchase,
    env: { SF_MARKETPLACE_BILLING: "true" },
    baseUrl: "https://app.seldonframe.com",
    now: () => new Date("2026-06-28T12:34:56Z"),
    ...over,
  };
  return { deps, calls, inserted };
}

const INPUT = { listing: PAID_ONETIME, buyerOrgId: "org-buyer-1", sellerOrgId: "org-seller-1" };

// ─── happy path: the Checkout params ─────────────────────────────────────────

describe("createOneTimeAgentCheckout — happy path", () => {
  test("creates a Session on the seller account with the 5% fee + destination", async () => {
    const { deps, calls, inserted } = makeDeps();
    const result = await createOneTimeAgentCheckout(INPUT, deps);

    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("unreachable");
    assert.equal(result.url, "https://checkout.stripe.test/cs_test_fake_123");
    assert.equal(result.stripeMode, "test");

    // Exactly one Stripe call.
    assert.equal(calls.length, 1);
    const { params, options } = calls[0];

    // mode payment.
    assert.equal(params.mode, "payment");

    // Line item at the REAL price (the onetime `price` column, cents).
    assert.equal(params.line_items?.length, 1);
    const li = params.line_items?.[0];
    assert.equal(li?.quantity, 1);
    assert.equal(li?.price_data?.unit_amount, 4900);
    assert.equal(li?.price_data?.currency, "usd");

    // 5% application fee + seller destination.
    assert.equal(params.payment_intent_data?.application_fee_amount, 245); // round(4900 * 5 / 100)
    assert.equal(params.payment_intent_data?.transfer_data?.destination, "acct_seller_1");

    // Idempotency key = (buyerOrg, listing, UTC day).
    assert.equal(options?.idempotencyKey, "mkt-onetime-org-buyer-1-listing-1-2026-06-28");

    // Metadata routes the webhook to the #139 settlement.
    assert.equal(params.metadata?.type, "marketplace_agent_purchase");
    assert.equal(params.metadata?.listingId, "listing-1");
    assert.equal(params.metadata?.buyerOrgId, "org-buyer-1");

    // A pending purchase row was persisted with the resolved mode + checkout id.
    assert.equal(inserted.length, 1);
    const row = inserted[0];
    assert.equal(row.status, "pending");
    assert.equal(row.stripeMode, "test");
    assert.equal(row.priceModel, "onetime");
    assert.equal(row.amountCents, 4900);
    assert.equal(row.feeCents, 245);
    assert.equal(row.buyerOrgId, "org-buyer-1");
    assert.equal(row.sellerOrgId, "org-seller-1");
    assert.equal(row.listingId, "listing-1");
    assert.equal(row.slug, "review-responder");
    assert.equal(row.stripeCheckoutId, "cs_test_fake_123");
  });

  test("stripeMode is 'live' only with the go-live flag + a live key", async () => {
    const { deps, inserted } = makeDeps({
      env: {
        SF_MARKETPLACE_BILLING: "true",
        SF_MARKETPLACE_BILLING_LIVE: "true",
        STRIPE_SECRET_KEY: "sk_live_abc",
      },
    });
    const result = await createOneTimeAgentCheckout(INPUT, deps);
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("unreachable");
    assert.equal(result.stripeMode, "live");
    assert.equal(inserted[0].stripeMode, "live");
  });
});

// ─── skip paths: ZERO Stripe calls, NO row ───────────────────────────────────

describe("createOneTimeAgentCheckout — money-safe skips", () => {
  test("flag OFF (default) → skipped, NO Stripe call, NO row", async () => {
    const { deps, calls, inserted } = makeDeps({ env: {} });
    const result = await createOneTimeAgentCheckout(INPUT, deps);
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.equal(result.skipped, true);
    assert.equal(result.reason, "billing_disabled");
    assert.equal(calls.length, 0);
    assert.equal(inserted.length, 0);
  });

  test("seller not Connect-ready → skipped, NO Stripe call", async () => {
    const { deps, calls, inserted } = makeDeps({
      readConnectStatus: async () => ({ ready: false, accountId: null }),
    });
    const result = await createOneTimeAgentCheckout(INPUT, deps);
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.equal(result.reason, "not_chargeable");
    assert.equal(calls.length, 0);
    assert.equal(inserted.length, 0);
  });

  test("monthly listing → skipped (not onetime), NO Stripe call", async () => {
    const monthly: OneTimeCheckoutListing = {
      ...PAID_ONETIME,
      priceModel: "monthly",
      price: 0,
      monthlyPriceCents: 2900,
    };
    const { deps, calls, inserted } = makeDeps();
    const result = await createOneTimeAgentCheckout({ ...INPUT, listing: monthly }, deps);
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.equal(result.reason, "not_onetime");
    assert.equal(calls.length, 0);
    assert.equal(inserted.length, 0);
  });

  test("free / zero-price onetime → skipped (not paid), NO Stripe call", async () => {
    const free: OneTimeCheckoutListing = { ...PAID_ONETIME, price: 0 };
    const { deps, calls, inserted } = makeDeps();
    const result = await createOneTimeAgentCheckout({ ...INPUT, listing: free }, deps);
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.equal(result.reason, "not_paid");
    assert.equal(calls.length, 0);
    assert.equal(inserted.length, 0);
  });

  test("no Stripe key (inert) → skipped, NO row", async () => {
    const { inserted: storeInserted, createPurchase } = makeFakeStore();
    const deps: CreateOneTimeAgentCheckoutDeps = {
      getStripe: () => null, // STRIPE_SECRET_KEY unset → getStripeClient() === null
      readConnectStatus: async () => READY,
      createPurchase,
      env: { SF_MARKETPLACE_BILLING: "true" },
      baseUrl: "https://app.seldonframe.com",
      now: () => new Date("2026-06-28T12:34:56Z"),
    };
    const result = await createOneTimeAgentCheckout(INPUT, deps);
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.equal(result.reason, "stripe_unconfigured");
    assert.equal(storeInserted.length, 0);
  });
});
