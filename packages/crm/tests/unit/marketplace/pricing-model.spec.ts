// Agent marketplace — pricing MODEL pure logic (BUILD #2 T2).
//
// A seller picks ONE pricing model for their listing: onetime (the original
// one-time install price, in `price`), monthly, per_usage, or per_outcome. This
// module is the single source of truth for:
//   - validateListingPricing: the field required by the chosen model must be
//     > 0 (per_outcome additionally needs a valid outcomeType). `onetime` keeps
//     using `price`, and `free` (price 0, onetime) is explicitly allowed.
//   - priceModelLabel: the human label the card/preview/earnings render
//     ("Free", "$49 one-time", "$29/mo", "$2 per call", "$10 per booking").
//   - normalizePricingForPersist: zero out the non-selected models so we never
//     persist a stale cross-model amount.
//
// Pure — no DB, no React — so it unit-tests with no Postgres and is shared by
// the server action, the publish UI, and the earnings dashboard.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  PRICE_MODELS,
  OUTCOME_TYPES,
  isPriceModel,
  isOutcomeType,
  validateListingPricing,
  priceModelLabel,
  normalizePricingForPersist,
  type PricingInput,
} from "../../../src/lib/marketplace/pricing-model";

function input(over: Partial<PricingInput> = {}): PricingInput {
  return {
    priceModel: "onetime",
    priceCents: 0,
    ...over,
  };
}

describe("price-model constants + guards", () => {
  test("the four selectable models exist (no audience gate — all available)", () => {
    assert.deepEqual([...PRICE_MODELS], ["onetime", "monthly", "per_usage", "per_outcome"]);
  });
  test("the four billable outcome types exist", () => {
    assert.deepEqual([...OUTCOME_TYPES], ["booking", "review", "quote", "message"]);
  });
  test("isPriceModel / isOutcomeType narrow valid values and reject junk", () => {
    assert.equal(isPriceModel("monthly"), true);
    assert.equal(isPriceModel("per_outcome"), true);
    assert.equal(isPriceModel("subscription"), false);
    assert.equal(isPriceModel(""), false);
    assert.equal(isPriceModel(null), false);
    assert.equal(isOutcomeType("booking"), true);
    assert.equal(isOutcomeType("signup"), false);
    assert.equal(isOutcomeType(undefined), false);
  });
});

describe("validateListingPricing", () => {
  test("onetime free (price 0) is allowed — backward compatible", () => {
    assert.deepEqual(validateListingPricing(input({ priceModel: "onetime", priceCents: 0 })), {
      ok: true,
    });
  });

  test("onetime paid (price > 0) is allowed", () => {
    assert.equal(
      validateListingPricing(input({ priceModel: "onetime", priceCents: 4900 })).ok,
      true,
    );
  });

  test("monthly requires monthlyPriceCents > 0", () => {
    assert.equal(validateListingPricing(input({ priceModel: "monthly" })).ok, false);
    assert.equal(
      validateListingPricing(input({ priceModel: "monthly", monthlyPriceCents: 0 })).ok,
      false,
    );
    assert.equal(
      validateListingPricing(input({ priceModel: "monthly", monthlyPriceCents: -1 })).ok,
      false,
    );
    assert.deepEqual(
      validateListingPricing(input({ priceModel: "monthly", monthlyPriceCents: 2900 })),
      { ok: true },
    );
  });

  test("per_usage requires perCallPriceCents > 0", () => {
    assert.equal(validateListingPricing(input({ priceModel: "per_usage" })).ok, false);
    assert.deepEqual(
      validateListingPricing(input({ priceModel: "per_usage", perCallPriceCents: 200 })),
      { ok: true },
    );
  });

  test("per_outcome requires perOutcomePriceCents > 0 AND a valid outcomeType", () => {
    // missing both
    assert.equal(validateListingPricing(input({ priceModel: "per_outcome" })).ok, false);
    // price present, outcomeType missing
    assert.equal(
      validateListingPricing(input({ priceModel: "per_outcome", perOutcomePriceCents: 1000 })).ok,
      false,
    );
    // outcomeType present, price missing
    assert.equal(
      validateListingPricing(input({ priceModel: "per_outcome", outcomeType: "booking" })).ok,
      false,
    );
    // outcomeType invalid
    assert.equal(
      validateListingPricing(
        input({ priceModel: "per_outcome", perOutcomePriceCents: 1000, outcomeType: "signup" as never }),
      ).ok,
      false,
    );
    // both present + valid
    assert.deepEqual(
      validateListingPricing(
        input({ priceModel: "per_outcome", perOutcomePriceCents: 1000, outcomeType: "booking" }),
      ),
      { ok: true },
    );
  });

  test("unknown / junk price model is invalid", () => {
    assert.equal(
      validateListingPricing(input({ priceModel: "subscription" as never })).ok,
      false,
    );
  });

  test("non-finite amounts are treated as not-greater-than-zero (invalid)", () => {
    assert.equal(
      validateListingPricing(input({ priceModel: "monthly", monthlyPriceCents: Number.NaN })).ok,
      false,
    );
  });
});

describe("priceModelLabel", () => {
  test("free → 'Free' (onetime, price 0)", () => {
    assert.equal(priceModelLabel(input({ priceModel: "onetime", priceCents: 0 })), "Free");
  });
  test("onetime paid → '$49 one-time'", () => {
    assert.equal(
      priceModelLabel(input({ priceModel: "onetime", priceCents: 4900 })),
      "$49 one-time",
    );
  });
  test("monthly → '$29/mo'", () => {
    assert.equal(
      priceModelLabel(input({ priceModel: "monthly", monthlyPriceCents: 2900 })),
      "$29/mo",
    );
  });
  test("per_usage → '$2 per call'", () => {
    assert.equal(
      priceModelLabel(input({ priceModel: "per_usage", perCallPriceCents: 200 })),
      "$2 per call",
    );
  });
  test("per_outcome → '$10 per booking' (label keyed by outcomeType)", () => {
    assert.equal(
      priceModelLabel(
        input({ priceModel: "per_outcome", perOutcomePriceCents: 1000, outcomeType: "booking" }),
      ),
      "$10 per booking",
    );
    assert.equal(
      priceModelLabel(
        input({ priceModel: "per_outcome", perOutcomePriceCents: 500, outcomeType: "review" }),
      ),
      "$5 per review",
    );
  });
  test("per_outcome with no/invalid outcomeType falls back to a generic 'per outcome'", () => {
    assert.equal(
      priceModelLabel(input({ priceModel: "per_outcome", perOutcomePriceCents: 1000 })),
      "$10 per outcome",
    );
  });
  test("a model selected but its amount missing → 'Free' (nothing to charge yet)", () => {
    // Defensive: an in-progress draft where the seller picked 'monthly' but
    // hasn't typed a price yet should read 'Free', not '$0/mo'.
    assert.equal(priceModelLabel(input({ priceModel: "monthly" })), "Free");
  });
});

describe("normalizePricingForPersist", () => {
  test("onetime: keeps price, nulls the other model amounts + outcomeType", () => {
    assert.deepEqual(
      normalizePricingForPersist(
        input({
          priceModel: "onetime",
          priceCents: 4900,
          monthlyPriceCents: 2900, // stale — must be dropped
          outcomeType: "booking", // stale — must be dropped
        }),
      ),
      {
        priceModel: "onetime",
        price: 4900,
        monthlyPriceCents: null,
        perCallPriceCents: null,
        perOutcomePriceCents: null,
        outcomeType: null,
      },
    );
  });

  test("monthly: sets monthlyPriceCents, zeroes price, nulls others", () => {
    assert.deepEqual(
      normalizePricingForPersist(input({ priceModel: "monthly", monthlyPriceCents: 2900 })),
      {
        priceModel: "monthly",
        price: 0,
        monthlyPriceCents: 2900,
        perCallPriceCents: null,
        perOutcomePriceCents: null,
        outcomeType: null,
      },
    );
  });

  test("per_outcome: sets perOutcomePriceCents + outcomeType only", () => {
    assert.deepEqual(
      normalizePricingForPersist(
        input({ priceModel: "per_outcome", perOutcomePriceCents: 1000, outcomeType: "booking" }),
      ),
      {
        priceModel: "per_outcome",
        price: 0,
        monthlyPriceCents: null,
        perCallPriceCents: null,
        perOutcomePriceCents: 1000,
        outcomeType: "booking",
      },
    );
  });

  test("invalid/junk amounts are clamped: negatives → 0 price / null cents", () => {
    assert.deepEqual(
      normalizePricingForPersist(input({ priceModel: "onetime", priceCents: -10 })),
      {
        priceModel: "onetime",
        price: 0,
        monthlyPriceCents: null,
        perCallPriceCents: null,
        perOutcomePriceCents: null,
        outcomeType: null,
      },
    );
    // a model amount that isn't > 0 persists as null (not 0) so it reads as "unset"
    assert.equal(
      normalizePricingForPersist(input({ priceModel: "per_usage", perCallPriceCents: 0 }))
        .perCallPriceCents,
      null,
    );
  });

  test("unknown model is coerced to onetime (safe default) on persist", () => {
    const out = normalizePricingForPersist(input({ priceModel: "subscription" as never, priceCents: 100 }));
    assert.equal(out.priceModel, "onetime");
    assert.equal(out.price, 100);
  });
});
