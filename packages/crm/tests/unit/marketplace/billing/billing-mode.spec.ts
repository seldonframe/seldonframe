// Unit tests for lib/marketplace/billing/billing-mode.ts — the PURE money-safety
// gates. No I/O, no Stripe. The mode is now KEY-DERIVED: the label ALWAYS matches
// the actual Stripe key in play (a live key → 'live', anything else → 'test'), so
// the 'live' label can never disagree with the key that created the row. Charging
// is gated separately by the single SF_MARKETPLACE_BILLING enable flag.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  canChargeListing,
  isBillingEnabled,
  isLiveStripeKey,
  resolveBillingMode,
} from "../../../../src/lib/marketplace/billing/billing-mode";

// ─── resolveBillingMode (key-derived) ────────────────────────────────────────

describe("resolveBillingMode", () => {
  test("live iff STRIPE_SECRET_KEY is a live key (sk_live_)", () => {
    assert.equal(resolveBillingMode({ STRIPE_SECRET_KEY: "sk_live_abc123" }), "live");
  });

  test("a restricted live key (rk_live_) → live", () => {
    assert.equal(resolveBillingMode({ STRIPE_SECRET_KEY: "rk_live_x" }), "live");
  });

  test("a TEST key → test", () => {
    assert.equal(resolveBillingMode({ STRIPE_SECRET_KEY: "sk_test_abc123" }), "test");
  });

  test("a restricted TEST key (rk_test_) → test", () => {
    assert.equal(resolveBillingMode({ STRIPE_SECRET_KEY: "rk_test_x" }), "test");
  });

  test("no key → test (inert)", () => {
    assert.equal(resolveBillingMode({}), "test");
  });

  test("empty key → test", () => {
    assert.equal(resolveBillingMode({ STRIPE_SECRET_KEY: "" }), "test");
  });
});

// ─── isLiveStripeKey ─────────────────────────────────────────────────────────

describe("isLiveStripeKey", () => {
  test("sk_live_ / rk_live_ are live", () => {
    assert.equal(isLiveStripeKey("sk_live_abc"), true);
    assert.equal(isLiveStripeKey("rk_live_abc"), true);
  });

  test("sk_test_ and empty/undefined are not live", () => {
    assert.equal(isLiveStripeKey("sk_test_abc"), false);
    assert.equal(isLiveStripeKey(""), false);
    assert.equal(isLiveStripeKey(undefined), false);
    assert.equal(isLiveStripeKey(null), false);
  });
});

// ─── isBillingEnabled ────────────────────────────────────────────────────────

describe("isBillingEnabled", () => {
  test("ON only when SF_MARKETPLACE_BILLING === 'true' (default OFF)", () => {
    assert.equal(isBillingEnabled({ SF_MARKETPLACE_BILLING: "true" }), true);
    assert.equal(isBillingEnabled({ SF_MARKETPLACE_BILLING: "false" }), false);
    assert.equal(isBillingEnabled({ SF_MARKETPLACE_BILLING: "1" }), false);
    assert.equal(isBillingEnabled({}), false);
  });
});

// ─── canChargeListing ────────────────────────────────────────────────────────

describe("canChargeListing", () => {
  test("onetime + connected + enabled → true", () => {
    assert.equal(
      canChargeListing({ priceModel: "onetime", connectReady: true, billingEnabled: true }),
      true,
    );
  });

  test("monthly → true (P2 — wired)", () => {
    assert.equal(
      canChargeListing({ priceModel: "monthly", connectReady: true, billingEnabled: true }),
      true,
    );
  });

  test("per_usage / per_outcome → true (P3 — wired)", () => {
    assert.equal(
      canChargeListing({ priceModel: "per_usage", connectReady: true, billingEnabled: true }),
      true,
    );
    assert.equal(
      canChargeListing({ priceModel: "per_outcome", connectReady: true, billingEnabled: true }),
      true,
    );
  });

  test("unknown / legacy model → false (only the four known models settle)", () => {
    assert.equal(
      canChargeListing({ priceModel: "mystery", connectReady: true, billingEnabled: true }),
      false,
    );
    assert.equal(
      canChargeListing({ priceModel: null, connectReady: true, billingEnabled: true }),
      false,
    );
  });

  test("not connected → false even for onetime", () => {
    assert.equal(
      canChargeListing({ priceModel: "onetime", connectReady: false, billingEnabled: true }),
      false,
    );
  });

  test("flag OFF → false (the default — free install)", () => {
    assert.equal(
      canChargeListing({ priceModel: "onetime", connectReady: true, billingEnabled: false }),
      false,
    );
  });
});
