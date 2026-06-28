// Unit tests for lib/marketplace/billing/billing-mode.ts — the PURE money-safety
// gates. No I/O, no Stripe. The whole point is to prove a real ('live') charge is
// only ever reachable under an explicit flag + a live key, and that charging is
// off by default.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  canChargeListing,
  isBillingEnabled,
  isLiveStripeKey,
  resolveBillingMode,
} from "../../../../src/lib/marketplace/billing/billing-mode";

// ─── resolveBillingMode ──────────────────────────────────────────────────────

describe("resolveBillingMode", () => {
  test("live ONLY when the go-live flag is 'true' AND a live key is present", () => {
    assert.equal(
      resolveBillingMode({
        SF_MARKETPLACE_BILLING_LIVE: "true",
        STRIPE_SECRET_KEY: "sk_live_abc123",
      }),
      "live",
    );
  });

  test("flag 'true' but a TEST key → test (never live on a test key)", () => {
    assert.equal(
      resolveBillingMode({
        SF_MARKETPLACE_BILLING_LIVE: "true",
        STRIPE_SECRET_KEY: "sk_test_abc123",
      }),
      "test",
    );
  });

  test("a live key but the flag unset → test (no silent go-live)", () => {
    assert.equal(resolveBillingMode({ STRIPE_SECRET_KEY: "sk_live_abc123" }), "test");
  });

  test("flag 'true' but NO key → test (inert)", () => {
    assert.equal(resolveBillingMode({ SF_MARKETPLACE_BILLING_LIVE: "true" }), "test");
  });

  test("empty env → test", () => {
    assert.equal(resolveBillingMode({}), "test");
  });

  test("flag set to anything other than 'true' → test", () => {
    assert.equal(
      resolveBillingMode({ SF_MARKETPLACE_BILLING_LIVE: "1", STRIPE_SECRET_KEY: "sk_live_x" }),
      "test",
    );
    assert.equal(
      resolveBillingMode({ SF_MARKETPLACE_BILLING_LIVE: "TRUE", STRIPE_SECRET_KEY: "sk_live_x" }),
      "test",
    );
  });

  test("a restricted live key (rk_live_) counts as live", () => {
    assert.equal(
      resolveBillingMode({ SF_MARKETPLACE_BILLING_LIVE: "true", STRIPE_SECRET_KEY: "rk_live_x" }),
      "live",
    );
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

  test("monthly → false (P2, not wired yet)", () => {
    assert.equal(
      canChargeListing({ priceModel: "monthly", connectReady: true, billingEnabled: true }),
      false,
    );
  });

  test("per_usage / per_outcome → false (P3)", () => {
    assert.equal(
      canChargeListing({ priceModel: "per_usage", connectReady: true, billingEnabled: true }),
      false,
    );
    assert.equal(
      canChargeListing({ priceModel: "per_outcome", connectReady: true, billingEnabled: true }),
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
