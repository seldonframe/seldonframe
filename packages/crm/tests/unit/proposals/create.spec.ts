// packages/crm/tests/unit/proposals/create.spec.ts
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  resolvePricing,
  PROPOSAL_TIER_PRICES,
} from "@/lib/proposals/create";

describe("resolvePricing", () => {
  test("returns Starter cents for tier=starter", () => {
    assert.deepEqual(resolvePricing({ tier: "starter" }), {
      tier: "starter",
      monthlyPriceCents: 29700,
    });
  });

  test("returns Growth cents for tier=growth", () => {
    assert.deepEqual(resolvePricing({ tier: "growth" }), {
      tier: "growth",
      monthlyPriceCents: 49700,
    });
  });

  test("returns Pro cents for tier=pro", () => {
    assert.deepEqual(resolvePricing({ tier: "pro" }), {
      tier: "pro",
      monthlyPriceCents: 99700,
    });
  });

  test("returns custom cents when provided", () => {
    assert.deepEqual(resolvePricing({ tier: "custom", customCents: 75000 }), {
      tier: "custom",
      monthlyPriceCents: 75000,
    });
  });

  test("throws on tier=custom without customCents", () => {
    assert.throws(
      () => resolvePricing({ tier: "custom" }),
      /custom_pricing_requires_amount/,
    );
  });
});

describe("PROPOSAL_TIER_PRICES", () => {
  test("exposes the three preset prices", () => {
    assert.deepEqual(PROPOSAL_TIER_PRICES, {
      starter: 29700,
      growth: 49700,
      pro: 99700,
    });
  });
});
