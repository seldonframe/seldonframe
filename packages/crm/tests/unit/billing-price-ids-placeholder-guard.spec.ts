// Hotfix H4b — pins isPlaceholderPriceId, the pure helper the
// /api/stripe/checkout route uses to fail soft (503, Stripe never called)
// instead of forwarding an unconfigured "price_PLACEHOLDER_*" fallback to
// Stripe (which rejects it with a raw "No such price" 500).
//
// The route handler itself has no existing spec/DI seam around the Stripe
// SDK call (stripe.checkout.sessions.create is invoked directly, not
// injected), so this pins the pure guard condition rather than scaffolding
// a new route-level harness.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  isPlaceholderPriceId,
  WORKSPACE_PRICE_ID,
  GROWTH_BASE_PRICE_ID,
} from "@/lib/billing/price-ids";

describe("isPlaceholderPriceId", () => {
  test("true for the unconfigured placeholder fallbacks", () => {
    assert.equal(isPlaceholderPriceId("price_PLACEHOLDER_workspace_49"), true);
    assert.equal(isPlaceholderPriceId("price_PLACEHOLDER_flat_29"), true);
    assert.equal(isPlaceholderPriceId("price_PLACEHOLDER_builder_19"), true);
  });

  test("false for real configured price ids", () => {
    assert.equal(isPlaceholderPriceId(GROWTH_BASE_PRICE_ID), false);
    assert.equal(isPlaceholderPriceId("price_1TRt9aJOtNZA0x7xkdenNgEu"), false);
  });

  test("false for null/undefined/empty", () => {
    assert.equal(isPlaceholderPriceId(null), false);
    assert.equal(isPlaceholderPriceId(undefined), false);
    assert.equal(isPlaceholderPriceId(""), false);
  });

  test("WORKSPACE_PRICE_ID resolves to a placeholder when the env var is unset (documents the pre-fix 500 trigger)", () => {
    // This mirrors the exact ground-truth bug: with no
    // STRIPE_WORKSPACE_PRICE_ID env var, the fallback is a placeholder id
    // that used to reach Stripe unguarded.
    if (!process.env.STRIPE_WORKSPACE_PRICE_ID) {
      assert.equal(isPlaceholderPriceId(WORKSPACE_PRICE_ID), true);
    }
  });
});
