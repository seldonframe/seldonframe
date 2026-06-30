// wallet top-up — the Stripe Checkout that funds the prepaid balance (spec
// 1ff09dcb, P2 Task 2). A FAKE Stripe is the ONLY Stripe: it records the
// SessionCreateParams + options so we assert mode:"payment", the line item at the
// top-up amount, the idempotency key, and the wallet_topup metadata (orgId +
// amountMicros so the webhook can credit the right wallet). The skip paths (flag
// OFF / no key / non-positive amount) make ZERO Stripe calls — no real charge is
// ever reachable.
//
// THE MONEY DIRECTION: this is the only Stripe call in the whole prepaid rail
// (money IN). Unlike the agent checkout it is a PLATFORM charge — the renter funds
// their OWN balance into SF's account, so there is NO { stripeAccount }, NO
// application_fee, NO Connect seller. The per-run drawdown (Task 3) is a pure
// ledger decrement with NO Stripe call.
//
// No network, no real key, no db: everything is DI'd.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import type Stripe from "stripe";
import {
  createWalletTopupCheckout,
  type CreateWalletTopupCheckoutDeps,
  type WalletTopupStripeSeam,
} from "../../../src/lib/build/wallet-topup";

type RecordedCreate = {
  params: Stripe.Checkout.SessionCreateParams;
  options?: Stripe.RequestOptions;
};

function makeFakeStripe(sessionId = "cs_test_topup_1", url = "https://checkout.stripe.test/cs_test_topup_1") {
  const calls: RecordedCreate[] = [];
  const stripe: WalletTopupStripeSeam = {
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

/** Build deps: flag ON, test mode (no live key), a fake Stripe by default. */
function makeDeps(over: Partial<CreateWalletTopupCheckoutDeps> = {}): {
  deps: CreateWalletTopupCheckoutDeps;
  calls: RecordedCreate[];
} {
  const { stripe, calls } = over.getStripe ? { stripe: null, calls: [] as RecordedCreate[] } : makeFakeStripe();
  const deps: CreateWalletTopupCheckoutDeps = {
    getStripe: () => stripe,
    env: { SF_MARKETPLACE_BILLING: "true" },
    baseUrl: "https://app.seldonframe.com",
    now: () => new Date("2026-06-30T12:00:00Z"),
    ...over,
  };
  return { deps, calls };
}

const INPUT = { orgId: "org-1", amountCents: 2000 }; // $20.00 top-up

describe("createWalletTopupCheckout — happy path", () => {
  test("creates a PLATFORM payment Session for the top-up amount with wallet_topup metadata", async () => {
    const { deps, calls } = makeDeps();
    const result = await createWalletTopupCheckout(INPUT, deps);

    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("unreachable");
    assert.equal(result.url, "https://checkout.stripe.test/cs_test_topup_1");
    assert.equal(result.stripeMode, "test");

    assert.equal(calls.length, 1);
    const { params, options } = calls[0]!;

    // mode payment.
    assert.equal(params.mode, "payment");

    // PLATFORM charge: NO stripeAccount (the renter funds their own balance into
    // SF's account), NO application fee, NO transfer_data.
    assert.equal(options?.stripeAccount, undefined);
    assert.equal(params.payment_intent_data?.application_fee_amount, undefined);

    // Line item at the top-up amount in cents.
    assert.equal(params.line_items?.length, 1);
    const li = params.line_items?.[0];
    assert.equal(li?.quantity, 1);
    assert.equal(li?.price_data?.unit_amount, 2000);
    assert.equal(li?.price_data?.currency, "usd");

    // Idempotency key bound to (org, amount, UTC day).
    assert.ok(typeof options?.idempotencyKey === "string" && options.idempotencyKey.includes("org-1"));

    // Metadata the webhook reads to credit the right wallet: type + orgId +
    // amountMicros ($20.00 = 2000¢ × 10_000 micros/¢ = 20_000_000 micros).
    assert.equal(params.metadata?.type, "wallet_topup");
    assert.equal(params.metadata?.orgId, "org-1");
    assert.equal(params.metadata?.amountMicros, "20000000");
    assert.equal(params.metadata?.stripeMode, "test");
  });

  test("stripeMode is 'live' (key-derived) when a live key is present", async () => {
    const { deps, calls } = makeDeps({
      env: { SF_MARKETPLACE_BILLING: "true", STRIPE_SECRET_KEY: "sk_live_abc" },
    });
    const result = await createWalletTopupCheckout(INPUT, deps);
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("unreachable");
    assert.equal(result.stripeMode, "live");
    assert.equal(calls[0]!.params.metadata?.stripeMode, "live");
  });
});

describe("createWalletTopupCheckout — money-safe skips", () => {
  test("flag OFF (default) → skipped, NO Stripe call", async () => {
    const { deps, calls } = makeDeps({ env: {} });
    const result = await createWalletTopupCheckout(INPUT, deps);
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.equal(result.reason, "billing_disabled");
    assert.equal(calls.length, 0);
  });

  test("no Stripe key (inert) → skipped, NO Stripe call", async () => {
    const result = await createWalletTopupCheckout(INPUT, {
      getStripe: () => null,
      env: { SF_MARKETPLACE_BILLING: "true" },
      baseUrl: "https://app.seldonframe.com",
      now: () => new Date("2026-06-30T12:00:00Z"),
    });
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.equal(result.reason, "stripe_unconfigured");
  });

  test("non-positive / junk amount → skipped, NO Stripe call (no zero-dollar checkout)", async () => {
    for (const amountCents of [0, -50, Number.NaN]) {
      const { deps, calls } = makeDeps();
      const result = await createWalletTopupCheckout({ orgId: "org-1", amountCents }, deps);
      assert.equal(result.ok, false);
      if (result.ok) throw new Error("unreachable");
      assert.equal(result.reason, "invalid_amount");
      assert.equal(calls.length, 0);
    }
  });

  test("missing orgId → skipped, NO Stripe call", async () => {
    const { deps, calls } = makeDeps();
    const result = await createWalletTopupCheckout({ orgId: "", amountCents: 2000 }, deps);
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.equal(result.reason, "invalid_org");
    assert.equal(calls.length, 0);
  });
});
