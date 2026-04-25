// Unit tests for formatLlmCost — admin UI display formatter for the
// per-workflow_run cost column (SLICE 9 PR 2 C5).
//
// Display rules (justified inline below):
//   - 0 → "—" (don't clutter the table with $0.00 for non-LLM runs)
//   - <$0.01 → preserve up to 4 decimals so micro-costs are visible
//   - >=$0.01 → standard 2-decimal currency

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { formatLlmCost, formatTokenCount } from "../../src/lib/utils/format-llm-cost";

describe("formatLlmCost", () => {
  test("renders 0 as em-dash so non-LLM runs stay visually quiet", () => {
    assert.equal(formatLlmCost(0), "—");
  });

  test("renders null/undefined as em-dash defensively", () => {
    assert.equal(formatLlmCost(null), "—");
    assert.equal(formatLlmCost(undefined), "—");
  });

  test("renders sub-cent values with up to 4 decimals", () => {
    assert.equal(formatLlmCost(0.0001), "$0.0001");
    assert.equal(formatLlmCost(0.0042), "$0.0042");
  });

  test("renders >=1¢ values at standard 2-decimal currency precision", () => {
    assert.equal(formatLlmCost(0.01), "$0.01");
    assert.equal(formatLlmCost(0.5), "$0.50");
    assert.equal(formatLlmCost(1.23), "$1.23");
    assert.equal(formatLlmCost(42.5), "$42.50");
  });

  test("accepts string-encoded decimals (drizzle decimal columns)", () => {
    // workflow_runs.totalCostUsdEstimate is decimal(10,4) — drizzle
    // hands it back as a string. The formatter coerces.
    assert.equal(formatLlmCost("0"), "—");
    assert.equal(formatLlmCost("1.2300"), "$1.23");
    assert.equal(formatLlmCost("0.0050"), "$0.0050");
  });

  test("garbage input → em-dash (never throws)", () => {
    assert.equal(formatLlmCost("not-a-number"), "—");
    assert.equal(formatLlmCost(Number.NaN), "—");
  });
});

describe("formatTokenCount", () => {
  test("renders 0 as em-dash", () => {
    assert.equal(formatTokenCount(0), "—");
  });

  test("renders <1k as plain digits", () => {
    assert.equal(formatTokenCount(42), "42");
    assert.equal(formatTokenCount(999), "999");
  });

  test("renders 1k+ with a 'k' suffix and one decimal", () => {
    assert.equal(formatTokenCount(1000), "1.0k");
    assert.equal(formatTokenCount(1234), "1.2k");
    assert.equal(formatTokenCount(15000), "15.0k");
  });

  test("renders 1M+ with an 'M' suffix and one decimal", () => {
    assert.equal(formatTokenCount(1_000_000), "1.0M");
    assert.equal(formatTokenCount(2_345_000), "2.3M");
  });

  test("garbage input → em-dash", () => {
    assert.equal(formatTokenCount(Number.NaN), "—");
    assert.equal(formatTokenCount(null), "—");
  });
});
