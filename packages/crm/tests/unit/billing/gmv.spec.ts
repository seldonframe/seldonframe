// packages/crm/tests/unit/billing/gmv.spec.ts
// The platform GMV fee taken on payments processed THROUGH SeldonFrame's
// Stripe Connect (the SMB's own sales). Pure helper — unit-testable.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  GMV_FEE_PERCENT,
  MARKETPLACE_FEE_PERCENT,
  computeInvoiceApplicationFeeCents,
  computeMarketplaceFeeCents,
  gmvFeePercentForTier,
} from "@/lib/billing/gmv";

describe("GMV fee helper", () => {
  test("GMV_FEE_PERCENT is 2", () => {
    assert.equal(GMV_FEE_PERCENT, 2);
  });

  test("0 total -> 0 fee (Stripe rejects application_fee_amount: 0)", () => {
    assert.equal(computeInvoiceApplicationFeeCents(0), 0);
  });

  test("2% of $100.00 (10_000 cents) -> 200 cents", () => {
    assert.equal(computeInvoiceApplicationFeeCents(10_000), 200);
  });

  test("2% of $123.45 (12_345 cents) -> 247 cents (rounded)", () => {
    // 12_345 * 2 / 100 = 246.9 -> rounds to 247
    assert.equal(computeInvoiceApplicationFeeCents(12_345), 247);
  });

  test("negative input -> 0 (defensive)", () => {
    assert.equal(computeInvoiceApplicationFeeCents(-5_000), 0);
  });

  test("NaN input -> 0 (defensive)", () => {
    assert.equal(computeInvoiceApplicationFeeCents(Number.NaN), 0);
  });

  test("Infinity input -> 0 (defensive, non-finite)", () => {
    assert.equal(computeInvoiceApplicationFeeCents(Number.POSITIVE_INFINITY), 0);
  });
});

describe("gmvFeePercentForTier — 2026-07-10 tier-scoped GMV decision", () => {
  test("agency_starter -> 0", () => {
    assert.equal(gmvFeePercentForTier("agency_starter"), 0);
  });

  test("agency_growth -> 0", () => {
    assert.equal(gmvFeePercentForTier("agency_growth"), 0);
  });

  test("agency_scale -> 0", () => {
    assert.equal(gmvFeePercentForTier("agency_scale"), 0);
  });

  test("legacy grandfathered agency -> 0", () => {
    assert.equal(gmvFeePercentForTier("agency"), 0);
  });

  test("builder -> 2 (GMV_FEE_PERCENT)", () => {
    assert.equal(gmvFeePercentForTier("builder"), GMV_FEE_PERCENT);
  });

  test("managed -> 2 (GMV_FEE_PERCENT)", () => {
    assert.equal(gmvFeePercentForTier("managed"), GMV_FEE_PERCENT);
  });

  test("legacy grandfathered workspace -> 2 (GMV_FEE_PERCENT)", () => {
    assert.equal(gmvFeePercentForTier("workspace"), GMV_FEE_PERCENT);
  });

  test("inactive -> 2 (GMV_FEE_PERCENT, pre-solo but SF is still the channel)", () => {
    assert.equal(gmvFeePercentForTier("inactive"), GMV_FEE_PERCENT);
  });

  test("null -> 2 (GMV_FEE_PERCENT, pre-solo default)", () => {
    assert.equal(gmvFeePercentForTier(null), GMV_FEE_PERCENT);
  });

  test("undefined -> 2 (GMV_FEE_PERCENT, pre-solo default)", () => {
    assert.equal(gmvFeePercentForTier(undefined), GMV_FEE_PERCENT);
  });
});

describe("Marketplace fee helper", () => {
  // SeldonFrame takes 5% when a builder sells/rents an agent/soul/block on the
  // marketplace (it's OUR marketplace product) — distinct from the 2% GMV fee on
  // an SMB's OWN service sales ("we don't tax your work"). Mirrors the GMV helper
  // exactly except the percentage: round(cents * 5/100), 0 for non-positive /
  // non-finite input.
  test("MARKETPLACE_FEE_PERCENT is 5", () => {
    assert.equal(MARKETPLACE_FEE_PERCENT, 5);
  });

  test("0 total -> 0 fee (Stripe rejects application_fee_amount: 0)", () => {
    assert.equal(computeMarketplaceFeeCents(0), 0);
  });

  test("5% of $100.00 (10_000 cents) -> 500 cents", () => {
    assert.equal(computeMarketplaceFeeCents(10_000), 500);
  });

  test("5% of $123.45 (12_345 cents) -> 617 cents (rounded)", () => {
    // 12_345 * 5 / 100 = 617.25 -> rounds to 617
    assert.equal(computeMarketplaceFeeCents(12_345), 617);
  });

  test("negative input -> 0 (defensive)", () => {
    assert.equal(computeMarketplaceFeeCents(-5_000), 0);
  });

  test("NaN input -> 0 (defensive)", () => {
    assert.equal(computeMarketplaceFeeCents(Number.NaN), 0);
  });

  test("Infinity input -> 0 (defensive, non-finite)", () => {
    assert.equal(computeMarketplaceFeeCents(Number.POSITIVE_INFINITY), 0);
  });
});
