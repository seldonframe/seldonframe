// Unit tests for LLM pricing calculator.
// SLICE 9 PR 2 C4 per Max's PR 2 spec ("Tests: Unit tests for pricing
// calculator. Edge case: token count missing from response defaults to 0").

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  PRICING,
  getPricingForModel,
  computeCallCost,
} from "../../src/lib/ai/pricing";

describe("PRICING table", () => {
  test("includes Claude Opus 4.x at $15 / $75 per MTok", () => {
    assert.deepEqual(PRICING["claude-opus-4-7"], { inputPerMTok: 15, outputPerMTok: 75 });
    assert.deepEqual(PRICING["claude-opus-4-6"], { inputPerMTok: 15, outputPerMTok: 75 });
  });

  test("includes Claude Sonnet 4.6 at $3 / $15 per MTok", () => {
    assert.deepEqual(PRICING["claude-sonnet-4-6"], { inputPerMTok: 3, outputPerMTok: 15 });
  });

  test("includes Claude Haiku 4.5 (both id forms) at $1 / $5 per MTok", () => {
    assert.deepEqual(PRICING["claude-haiku-4-5"], { inputPerMTok: 1, outputPerMTok: 5 });
    assert.deepEqual(PRICING["claude-haiku-4-5-20251001"], { inputPerMTok: 1, outputPerMTok: 5 });
  });
});

describe("getPricingForModel", () => {
  test("returns the exact entry for a known model id", () => {
    assert.deepEqual(getPricingForModel("claude-sonnet-4-6"), {
      inputPerMTok: 3,
      outputPerMTok: 15,
    });
  });

  test("falls back to Opus rates (most-conservative) for unknown models", () => {
    // Conservative fallback: prefer over-estimating cost over silently
    // dropping the data point. Documented in pricing.ts.
    assert.deepEqual(getPricingForModel("gpt-5-experimental"), {
      inputPerMTok: 15,
      outputPerMTok: 75,
    });
  });

  test("falls back for empty string model id", () => {
    assert.deepEqual(getPricingForModel(""), { inputPerMTok: 15, outputPerMTok: 75 });
  });
});

describe("computeCallCost", () => {
  test("returns 0 when both token counts are 0", () => {
    assert.equal(computeCallCost("claude-opus-4-7", 0, 0), 0);
  });

  test("returns 0 when both token counts are negative", () => {
    assert.equal(computeCallCost("claude-opus-4-7", -10, -5), 0);
  });

  test("returns 0 when input tokens are NaN (missing usage data)", () => {
    // Edge case from spec: "token count missing from response (older
    // responses, errors) defaults to 0 without breaking workflow".
    assert.equal(computeCallCost("claude-opus-4-7", Number.NaN, 100), 0);
  });

  test("returns 0 when output tokens are Infinity (corrupted usage data)", () => {
    assert.equal(computeCallCost("claude-opus-4-7", 100, Number.POSITIVE_INFINITY), 0);
  });

  test("computes Opus 4.7 cost for 1M input + 1M output → $90 exactly", () => {
    assert.equal(computeCallCost("claude-opus-4-7", 1_000_000, 1_000_000), 90);
  });

  test("computes Sonnet 4.6 cost for 100k input + 50k output → $0.0050 + $0.0750 = $0.075 (rounded to 4 decimals)", () => {
    // 100_000 / 1_000_000 * 3 = 0.30 input
    // 50_000 / 1_000_000 * 15 = 0.75 output
    // total 1.05
    assert.equal(computeCallCost("claude-sonnet-4-6", 100_000, 50_000), 1.05);
  });

  test("computes Haiku 4.5 cost for typical small call (5k in / 1k out) → fractional pennies", () => {
    // 5000 / 1_000_000 * 1 = 0.005
    // 1000 / 1_000_000 * 5 = 0.005
    // total 0.01
    assert.equal(computeCallCost("claude-haiku-4-5", 5000, 1000), 0.01);
  });

  test("rounds to 4 decimals to match decimal(10,4) column precision", () => {
    // 1 token in, 1 token out at Opus: 1/1M*15 + 1/1M*75 = 0.000015 + 0.000075 = 0.00009
    // Rounded to 4 decimals → 0.0001
    const cost = computeCallCost("claude-opus-4-7", 1, 1);
    assert.equal(cost, 0.0001);
  });

  test("rounding does not exceed 4 fractional digits", () => {
    const cost = computeCallCost("claude-sonnet-4-6", 12345, 6789);
    const fractional = cost.toString().split(".")[1] ?? "";
    assert.ok(fractional.length <= 4, `expected <=4 decimal places, got "${cost}"`);
  });

  test("unknown model falls back to Opus pricing", () => {
    // Same math as the Opus 1M+1M test → $90.
    assert.equal(computeCallCost("some-future-model", 1_000_000, 1_000_000), 90);
  });

  test("input-only call (output 0) still computes cost", () => {
    // 1M input tokens at Sonnet ($3/MTok), 0 output → $3
    assert.equal(computeCallCost("claude-sonnet-4-6", 1_000_000, 0), 3);
  });

  test("output-only call (input 0) still computes cost", () => {
    // 0 input, 1M output at Sonnet ($15/MTok) → $15
    assert.equal(computeCallCost("claude-sonnet-4-6", 0, 1_000_000), 15);
  });
});
