// set_usage_price — the builder usage-pricing resolver (spec 1ff09dcb, P0 Task 4).
//
// The MCP tool set_usage_price({ listingId, model, amountCents, outcomeType? })
// sets how a builder charges for their listing. It is ADDITIVE + DISPLAY/INTENT
// only — it writes the existing marketplace_listings pricing columns; it never
// charges. These tests pin the pure resolver that validates the input and maps
// the spec's model names (per_call | per_outcome) onto the persisted columns via
// the shared normalizePricingForPersist, so the route stays a thin DB write.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { resolveUsagePriceUpdate } from "../../../src/lib/build/usage-price";

describe("resolveUsagePriceUpdate", () => {
  test("per_call maps to the per_usage model + perCallPriceCents column", () => {
    const r = resolveUsagePriceUpdate({ model: "per_call", amountCents: 10 });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.persist.priceModel, "per_usage");
    assert.equal(r.persist.perCallPriceCents, 10);
    // Every other model amount is nulled, and the one-time price is zeroed, so
    // we never leave a stale cross-model amount on the row.
    assert.equal(r.persist.price, 0);
    assert.equal(r.persist.perOutcomePriceCents, null);
    assert.equal(r.persist.monthlyPriceCents, null);
    assert.equal(r.persist.outcomeType, null);
  });

  test("per_outcome requires an outcomeType and sets perOutcomePriceCents", () => {
    const r = resolveUsagePriceUpdate({
      model: "per_outcome",
      amountCents: 1000,
      outcomeType: "booking",
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.persist.priceModel, "per_outcome");
    assert.equal(r.persist.perOutcomePriceCents, 1000);
    assert.equal(r.persist.outcomeType, "booking");
    assert.equal(r.persist.perCallPriceCents, null);
  });

  test("per_outcome without a valid outcomeType is rejected", () => {
    const r = resolveUsagePriceUpdate({ model: "per_outcome", amountCents: 1000 });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.match(r.error, /outcome/i);
  });

  test("a non-positive amount is rejected (must be > 0 cents)", () => {
    for (const amt of [0, -5, Number.NaN]) {
      const r = resolveUsagePriceUpdate({ model: "per_call", amountCents: amt });
      assert.equal(r.ok, false, `amount ${amt} should be rejected`);
    }
  });

  test("an unsupported model is rejected (only per_call | per_outcome here)", () => {
    // monthly / onetime are set via the listing editor, not this builder tool.
    const r = resolveUsagePriceUpdate({
      model: "monthly" as unknown as "per_call",
      amountCents: 2900,
    });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.match(r.error, /model/i);
  });

  test("a non-integer amount is floored to whole cents", () => {
    const r = resolveUsagePriceUpdate({ model: "per_call", amountCents: 10.9 });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.persist.perCallPriceCents, 10);
  });

  test("the result carries a human price label for echo-back", () => {
    const r = resolveUsagePriceUpdate({ model: "per_call", amountCents: 10 });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.match(r.label, /per call/i);
    assert.match(r.label, /0\.10|\$0\.10|10/);
  });
});
