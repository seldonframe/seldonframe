// Unit tests for checkout line-item assembly. Pins the contract used by
// /api/stripe/checkout and /api/v1/billing/claim-and-checkout so a
// tier-config change can't silently break the subscription item array.
//
// 2026-06-18 pricing migration — flat per-tier base price at checkout
// (Builder $19 / Workspace $49 / Agency $297). The agency $10 overage
// item is attached/synced post-activation (Phase 4), NOT at checkout.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  buildCheckoutLineItemsForTier,
  tierFromBasePriceId,
} from "@/lib/billing/checkout-items";
import {
  BUILDER_PRICE_ID,
  WORKSPACE_PRICE_ID,
  AGENCY_BASE_PRICE_ID,
} from "@/lib/billing/price-ids";

describe("buildCheckoutLineItemsForTier", () => {
  test("returns null for inactive (no checkout)", () => {
    assert.equal(buildCheckoutLineItemsForTier("inactive"), null);
  });

  test("builder → single base flat price, quantity 1", () => {
    const items = buildCheckoutLineItemsForTier("builder")!;
    assert.equal(items.length, 1);
    assert.equal(items[0].price, BUILDER_PRICE_ID);
    assert.equal(items[0].quantity, 1);
  });

  test("workspace → single base flat price, quantity 1", () => {
    const items = buildCheckoutLineItemsForTier("workspace")!;
    assert.equal(items.length, 1);
    assert.equal(items[0].price, WORKSPACE_PRICE_ID);
    assert.equal(items[0].quantity, 1);
  });

  test("agency → base flat price only at checkout (overage attached in Phase 4)", () => {
    const items = buildCheckoutLineItemsForTier("agency")!;
    assert.equal(items[0].price, AGENCY_BASE_PRICE_ID);
    assert.equal(items[0].quantity, 1);
    // The $10 quantity-licensed overage line is NOT added at checkout.
    assert.equal(items.length, 1);
  });
});

describe("tierFromBasePriceId", () => {
  test("maps each base id to its tier", () => {
    assert.equal(tierFromBasePriceId(BUILDER_PRICE_ID), "builder");
    assert.equal(tierFromBasePriceId(WORKSPACE_PRICE_ID), "workspace");
    assert.equal(tierFromBasePriceId(AGENCY_BASE_PRICE_ID), "agency");
  });

  test("returns null for unknown / nullish ids", () => {
    assert.equal(tierFromBasePriceId("price_unknown_xxx"), null);
    assert.equal(tierFromBasePriceId(""), null);
    assert.equal(tierFromBasePriceId(null), null);
    assert.equal(tierFromBasePriceId(undefined), null);
  });
});
