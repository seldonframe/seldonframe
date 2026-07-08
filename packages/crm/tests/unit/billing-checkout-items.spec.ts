// Unit tests for checkout line-item assembly. Pins the contract used by
// /api/stripe/checkout so a tier-config change can't silently break the
// subscription item array.
//
// 2026-07-08 pricing ladder — checkout offers exactly the 5 SELLABLE
// tiers (builder $29 / managed $49 / agency_starter $99 / agency_growth
// $199 / agency_scale $299). Grandfathered legacy tiers ("workspace",
// "agency") still resolve via tierFromBasePriceId (so old checkout
// links / webhook replays keep working) but buildCheckoutLineItemsForTier
// is exercised here only for the sellable set — money-safe: a
// PLACEHOLDER price id must never reach Stripe (isPlaceholderPriceId
// gate, tested at the route level in the checkout route's own tests).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  buildCheckoutLineItemsForTier,
  tierFromBasePriceId,
} from "@/lib/billing/checkout-items";
import {
  BUILDER_PRICE_ID,
  MANAGED_PRICE_ID,
  AGENCY_STARTER_PRICE_ID,
  AGENCY_GROWTH_PRICE_ID,
  AGENCY_SCALE_PRICE_ID,
  WORKSPACE_PRICE_ID,
  AGENCY_BASE_PRICE_ID,
  isPlaceholderPriceId,
} from "@/lib/billing/price-ids";

describe("buildCheckoutLineItemsForTier — 5 sellable tiers", () => {
  test("returns null for inactive (no checkout)", () => {
    assert.equal(buildCheckoutLineItemsForTier("inactive"), null);
  });

  test("builder → single base flat price, quantity 1", () => {
    const items = buildCheckoutLineItemsForTier("builder")!;
    assert.equal(items.length, 1);
    assert.equal(items[0].price, BUILDER_PRICE_ID);
    assert.equal(items[0].quantity, 1);
  });

  test("managed → single base flat price, quantity 1", () => {
    const items = buildCheckoutLineItemsForTier("managed")!;
    assert.equal(items.length, 1);
    assert.equal(items[0].price, MANAGED_PRICE_ID);
    assert.equal(items[0].quantity, 1);
  });

  test("agency_starter → single base flat price, quantity 1", () => {
    const items = buildCheckoutLineItemsForTier("agency_starter")!;
    assert.equal(items.length, 1);
    assert.equal(items[0].price, AGENCY_STARTER_PRICE_ID);
    assert.equal(items[0].quantity, 1);
  });

  test("agency_growth → single base flat price, quantity 1", () => {
    const items = buildCheckoutLineItemsForTier("agency_growth")!;
    assert.equal(items.length, 1);
    assert.equal(items[0].price, AGENCY_GROWTH_PRICE_ID);
    assert.equal(items[0].quantity, 1);
  });

  test("agency_scale → single base flat price, quantity 1", () => {
    const items = buildCheckoutLineItemsForTier("agency_scale")!;
    assert.equal(items.length, 1);
    assert.equal(items[0].price, AGENCY_SCALE_PRICE_ID);
    assert.equal(items[0].quantity, 1);
  });

  test("a PLACEHOLDER price id never reaches this layer un-flagged — isPlaceholderPriceId gate exists", () => {
    // Sanity: unless Max has set the env vars, every new tier's resolved
    // price id is still the placeholder fallback. buildCheckoutLineItemsForTier
    // returns it as-is (money-safety is enforced one layer up, in the
    // checkout route, via isPlaceholderPriceId — see checkout route tests).
    for (const tier of ["builder", "managed", "agency_starter", "agency_growth", "agency_scale"] as const) {
      const items = buildCheckoutLineItemsForTier(tier)!;
      // Either it's a real configured price OR it's a recognizable placeholder —
      // never empty/undefined.
      assert.ok(items[0].price.length > 0);
      if (isPlaceholderPriceId(items[0].price)) {
        assert.ok(items[0].price.startsWith("price_PLACEHOLDER"));
      }
    }
  });
});

describe("tierFromBasePriceId", () => {
  test("maps each SELLABLE base id to its tier", () => {
    assert.equal(tierFromBasePriceId(BUILDER_PRICE_ID), "builder");
    assert.equal(tierFromBasePriceId(MANAGED_PRICE_ID), "managed");
    assert.equal(tierFromBasePriceId(AGENCY_STARTER_PRICE_ID), "agency_starter");
    assert.equal(tierFromBasePriceId(AGENCY_GROWTH_PRICE_ID), "agency_growth");
    assert.equal(tierFromBasePriceId(AGENCY_SCALE_PRICE_ID), "agency_scale");
  });

  test("GRANDFATHERED legacy base ids still resolve (existing subscriptions / replay)", () => {
    // 2026-07-08 SECOND post-review fix wave (BLOCKING): BUILDER_PRICE_ID
    // now EQUALS WORKSPACE_PRICE_ID (both tiers share the one live-
    // configured $29 Stripe price until Max creates a distinct Builder
    // price — see price-ids.ts). tierFromBasePriceId's if-chain checks
    // "builder" before "workspace", so a bare priceId lookup on the
    // shared price now resolves to the NEW sellable tier ("builder"),
    // not the frozen grandfathered one — this is the intentional
    // direction (a priceId-only checkout resolution should prefer the
    // currently-sellable tier, mirroring the webhook's metadata-first
    // preference for the new tier over silently relabeling to
    // grandfathered). This does NOT affect existing workspace
    // subscribers' STORED tier — that's set once at their original
    // checkout and never re-derived from a bare priceId lookup again
    // (see the webhook's metadata-first fix + the "existing workspace
    // subscriber" pins in billing-webhook-state-consolidation.spec.ts).
    assert.equal(tierFromBasePriceId(WORKSPACE_PRICE_ID), "builder");
    assert.equal(tierFromBasePriceId(AGENCY_BASE_PRICE_ID), "agency");
  });

  test("returns null for unknown / nullish ids", () => {
    assert.equal(tierFromBasePriceId("price_unknown_xxx"), null);
    assert.equal(tierFromBasePriceId(""), null);
    assert.equal(tierFromBasePriceId(null), null);
    assert.equal(tierFromBasePriceId(undefined), null);
  });
});
