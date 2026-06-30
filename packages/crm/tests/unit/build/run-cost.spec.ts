// run cost — the pure run-cost calculator (spec 1ff09dcb, P1 Task 3).
//
// `computeRunCost(price, resultCount?)` is the MONEY-SAFE heart of `run`: it
// CALCULATES what a successful run WOULD cost (Monid's billing.calculatedCost,
// in micro-dollars) but moves NO money — the prepaid wallet charge is P2. The
// endpoint records this cost as a usage event; it never charges. These tests pin
// the per_call (flat) / per_result (base + per-item) / per_outcome rules, the
// micro-dollar accounting, the 5% fee echo, and the error/zero path.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { computeRunCost, MICRO_PER_CENT } from "../../../src/lib/build/run-cost";

describe("computeRunCost — per_call (flat)", () => {
  test("a per_call price charges the flat amount once, regardless of resultCount", () => {
    const cost = computeRunCost({ type: "per_call", amountCents: 10 }, 7);
    assert.equal(cost.amountCents, 10);
    // micro-dollars: 10 cents × 10_000 = 100_000.
    assert.equal(cost.calculatedCost, 10 * MICRO_PER_CENT);
  });

  test("a free (0¢) per_call price computes to 0 — a free run", () => {
    const cost = computeRunCost({ type: "per_call", amountCents: 0 });
    assert.equal(cost.amountCents, 0);
    assert.equal(cost.calculatedCost, 0);
    assert.equal(cost.feeCents, 0);
  });
});

describe("computeRunCost — per_result (base + per-item)", () => {
  test("charges amountCents per returned item", () => {
    const cost = computeRunCost({ type: "per_result", amountCents: 5 }, 4);
    assert.equal(cost.amountCents, 20); // 5 × 4
    assert.equal(cost.calculatedCost, 20 * MICRO_PER_CENT);
  });

  test("adds a base fee when present", () => {
    const cost = computeRunCost({ type: "per_result", amountCents: 5, baseCents: 3 }, 4);
    assert.equal(cost.amountCents, 23); // base 3 + 5×4
  });

  test("zero results bills only the base (or 0 with no base)", () => {
    assert.equal(computeRunCost({ type: "per_result", amountCents: 5 }, 0).amountCents, 0);
    assert.equal(computeRunCost({ type: "per_result", amountCents: 5, baseCents: 3 }, 0).amountCents, 3);
  });

  test("a missing resultCount defaults to 1 item for per_result", () => {
    const cost = computeRunCost({ type: "per_result", amountCents: 5 });
    assert.equal(cost.amountCents, 5);
  });
});

describe("computeRunCost — per_outcome", () => {
  test("charges the flat outcome amount once on a successful run", () => {
    const cost = computeRunCost({ type: "per_outcome", amountCents: 1000, outcomeType: "booking" }, 1);
    assert.equal(cost.amountCents, 1000);
    assert.equal(cost.calculatedCost, 1000 * MICRO_PER_CENT);
  });
});

describe("computeRunCost — the 5% marketplace fee echo", () => {
  test("feeCents is 5% of the amount (rounded), matching the platform fee", () => {
    const cost = computeRunCost({ type: "per_call", amountCents: 100 });
    assert.equal(cost.amountCents, 100);
    assert.equal(cost.feeCents, 5); // 5% of 100
    // net to the builder is the remainder (you keep 95%).
    assert.equal(cost.netCents, 95);
  });
});

describe("computeRunCost — robustness (money-safe)", () => {
  test("a negative / NaN amount clamps to 0 (never a negative charge)", () => {
    assert.equal(computeRunCost({ type: "per_call", amountCents: -5 }).amountCents, 0);
    assert.equal(computeRunCost({ type: "per_call", amountCents: Number.NaN }).amountCents, 0);
  });

  test("a negative resultCount clamps to 0 items", () => {
    const cost = computeRunCost({ type: "per_result", amountCents: 5 }, -3);
    assert.equal(cost.amountCents, 0);
  });

  test("a fractional amount/result floors to whole cents", () => {
    const cost = computeRunCost({ type: "per_result", amountCents: 5.9 }, 2.9);
    // 5 (floored) × 2 (floored) = 10
    assert.equal(cost.amountCents, 10);
  });

  test("the result always carries a non-negative integer cents + micro pair", () => {
    const cost = computeRunCost({ type: "per_call", amountCents: 33 });
    assert.ok(Number.isInteger(cost.amountCents) && cost.amountCents >= 0);
    assert.ok(Number.isInteger(cost.calculatedCost) && cost.calculatedCost >= 0);
    assert.equal(cost.calculatedCost, cost.amountCents * MICRO_PER_CENT);
  });
});
