// packages/crm/tests/unit/billing/gmv.spec.ts
// The platform GMV fee taken on payments processed THROUGH SeldonFrame's
// Stripe Connect (the SMB's own sales). Pure helper — unit-testable.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  GMV_FEE_PERCENT,
  computeInvoiceApplicationFeeCents,
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
