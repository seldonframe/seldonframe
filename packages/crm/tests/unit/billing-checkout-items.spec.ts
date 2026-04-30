// Unit tests for multi-price checkout assembly. Pins the contract
// used by both /api/stripe/checkout and /api/v1/billing/claim-and-checkout
// so a tier-config change can't silently break the subscription
// item array.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  buildCheckoutLineItemsForTier,
  tierFromBasePriceId,
} from "@/lib/billing/checkout-items";
import {
  GROWTH_BASE_PRICE_ID,
  GROWTH_CONTACTS_PRICE_ID,
  GROWTH_AGENT_RUNS_PRICE_ID,
  SCALE_BASE_PRICE_ID,
  SCALE_AGENT_RUNS_PRICE_ID,
} from "@/lib/billing/price-ids";

describe("buildCheckoutLineItemsForTier", () => {
  test("returns null for free (no checkout)", () => {
    assert.equal(buildCheckoutLineItemsForTier("free"), null);
  });

  test("growth subscription has the base flat price as item 0", () => {
    const items = buildCheckoutLineItemsForTier("growth");
    assert.ok(items, "growth must build a non-null item array");
    assert.equal(items![0].price, GROWTH_BASE_PRICE_ID);
    assert.equal(items![0].quantity, 1);
  });

  test("growth optionally adds metered overage prices when env-set", () => {
    const items = buildCheckoutLineItemsForTier("growth")!;
    const ids = items.map((i) => i.price);
    // Base is always present.
    assert.ok(ids.includes(GROWTH_BASE_PRICE_ID));
    // Metered ids only included when env-set. If they're set in this
    // test env, assert quantity is omitted (Stripe rejects quantity
    // on metered prices).
    if (GROWTH_CONTACTS_PRICE_ID) {
      const item = items.find((i) => i.price === GROWTH_CONTACTS_PRICE_ID);
      assert.ok(item, "growth contacts metered item missing");
      assert.equal(item!.quantity, undefined);
    }
    if (GROWTH_AGENT_RUNS_PRICE_ID) {
      const item = items.find((i) => i.price === GROWTH_AGENT_RUNS_PRICE_ID);
      assert.ok(item, "growth agent runs metered item missing");
      assert.equal(item!.quantity, undefined);
    }
  });

  test("scale subscription has the scale base flat price as item 0", () => {
    const items = buildCheckoutLineItemsForTier("scale")!;
    assert.equal(items[0].price, SCALE_BASE_PRICE_ID);
    assert.equal(items[0].quantity, 1);
  });

  test("scale optionally adds the agent_runs metered price when env-set", () => {
    const items = buildCheckoutLineItemsForTier("scale")!;
    if (SCALE_AGENT_RUNS_PRICE_ID) {
      const item = items.find((i) => i.price === SCALE_AGENT_RUNS_PRICE_ID);
      assert.ok(item, "scale agent runs metered item missing");
      assert.equal(item!.quantity, undefined);
    }
  });

  test("scale never adds a contacts metered line (contacts unlimited)", () => {
    const items = buildCheckoutLineItemsForTier("scale")!;
    if (GROWTH_CONTACTS_PRICE_ID) {
      // The growth contacts price MUST NOT appear in a scale
      // subscription — scale gets unlimited contacts in the base.
      assert.ok(
        !items.some((i) => i.price === GROWTH_CONTACTS_PRICE_ID),
        "scale subscription should not include the growth contacts metered line"
      );
    }
  });
});

describe("tierFromBasePriceId", () => {
  test("returns 'growth' for the growth base id", () => {
    assert.equal(tierFromBasePriceId(GROWTH_BASE_PRICE_ID), "growth");
  });
  test("returns 'scale' for the scale base id", () => {
    assert.equal(tierFromBasePriceId(SCALE_BASE_PRICE_ID), "scale");
  });
  test("returns null for unknown / metered / legacy ids", () => {
    assert.equal(tierFromBasePriceId("price_unknown_xxx"), null);
    assert.equal(tierFromBasePriceId(""), null);
    assert.equal(tierFromBasePriceId(null), null);
    assert.equal(tierFromBasePriceId(undefined), null);
  });
});
