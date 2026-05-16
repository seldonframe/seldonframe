// packages/crm/tests/unit/billing/stripe-checkout-gated.spec.ts
//
// Pins the contract for the Cut B checkout upgrade flow: the
// /api/billing/checkout route must accept the Growth and Scale tier
// base price IDs alongside the legacy add-on + self-service IDs, and
// reject anything else.
//
// PATCH NOTE (vs original plan): the price-ids module already shipped
// the live Growth/Scale base IDs under the names GROWTH_BASE_PRICE_ID
// + SCALE_BASE_PRICE_ID (Cut A pricing migration). Cut B re-exports
// them as GROWTH_MONTHLY_PRICE_ID + SCALE_MONTHLY_PRICE_ID so the
// upgrade-modal copy reads cleanly ("Upgrade to Growth $29/mo"),
// without disturbing the rest of the checkout machinery.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  GROWTH_MONTHLY_PRICE_ID,
  SCALE_MONTHLY_PRICE_ID,
  SELF_SERVICE_WORKSPACE_MONTHLY_PRICE_ID,
  WORKSPACE_ADDON_MONTHLY_PRICE_ID,
  isAgencyTierCheckoutPriceId,
  isAllowedCheckoutPriceId,
} from "@/lib/billing/price-ids";

describe("Growth + Scale price IDs", () => {
  test("exports both new constants", () => {
    assert.equal(typeof GROWTH_MONTHLY_PRICE_ID, "string");
    assert.equal(typeof SCALE_MONTHLY_PRICE_ID, "string");
    assert.ok(GROWTH_MONTHLY_PRICE_ID.length > 0);
    assert.ok(SCALE_MONTHLY_PRICE_ID.length > 0);
  });

  test("Growth and Scale are distinct from each other and from the existing add-on / self-service IDs", () => {
    const ids = new Set([
      GROWTH_MONTHLY_PRICE_ID,
      SCALE_MONTHLY_PRICE_ID,
      WORKSPACE_ADDON_MONTHLY_PRICE_ID,
      SELF_SERVICE_WORKSPACE_MONTHLY_PRICE_ID,
    ]);
    assert.equal(ids.size, 4, "all four price IDs must be unique");
  });
});

describe("isAllowedCheckoutPriceId", () => {
  test("accepts Growth", () => {
    assert.equal(isAllowedCheckoutPriceId(GROWTH_MONTHLY_PRICE_ID), true);
  });

  test("accepts Scale", () => {
    assert.equal(isAllowedCheckoutPriceId(SCALE_MONTHLY_PRICE_ID), true);
  });

  test("still accepts the legacy add-on + self-service IDs", () => {
    assert.equal(isAllowedCheckoutPriceId(WORKSPACE_ADDON_MONTHLY_PRICE_ID), true);
    assert.equal(isAllowedCheckoutPriceId(SELF_SERVICE_WORKSPACE_MONTHLY_PRICE_ID), true);
  });

  test("rejects unknown price IDs", () => {
    assert.equal(isAllowedCheckoutPriceId("price_unknown_123"), false);
  });
});

describe("isAgencyTierCheckoutPriceId", () => {
  test("returns 'growth' for the Growth monthly price ID", () => {
    assert.equal(isAgencyTierCheckoutPriceId(GROWTH_MONTHLY_PRICE_ID), "growth");
  });

  test("returns 'scale' for the Scale monthly price ID", () => {
    assert.equal(isAgencyTierCheckoutPriceId(SCALE_MONTHLY_PRICE_ID), "scale");
  });

  test("returns null for unknown / legacy / nullish IDs", () => {
    assert.equal(isAgencyTierCheckoutPriceId(WORKSPACE_ADDON_MONTHLY_PRICE_ID), null);
    assert.equal(isAgencyTierCheckoutPriceId(null), null);
    assert.equal(isAgencyTierCheckoutPriceId(undefined), null);
    assert.equal(isAgencyTierCheckoutPriceId("price_unknown"), null);
  });
});
