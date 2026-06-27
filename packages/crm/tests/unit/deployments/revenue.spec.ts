// ICP-3 — computeRevenueSummary: MRR (Σ active priceCents) + ARR (= MRR × 12).
//
// Pinned contract:
//   • only status:'active' deployments contribute to MRR;
//   • draft / paused / canceled are excluded;
//   • ARR is always MRR × 12;
//   • an empty / all-inactive list → { mrrCents: 0, arrCents: 0, activeCount: 0 };
//   • priceCents is coerced to a finite, non-negative integer defensively.
//
// Run:
//   node --import tsx --test tests/unit/deployments/revenue.spec.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  computeRevenueSummary,
  type RevenueDeploymentInput,
} from "../../../src/lib/deployments/revenue";

describe("computeRevenueSummary", () => {
  test("empty list → all zeros", () => {
    assert.deepEqual(computeRevenueSummary([]), {
      mrrCents: 0,
      arrCents: 0,
      activeCount: 0,
    });
  });

  test("sums only ACTIVE deployments' priceCents into MRR", () => {
    const deployments: RevenueDeploymentInput[] = [
      { priceCents: 10000, status: "active" }, // $100
      { priceCents: 5000, status: "active" }, //  $50
      { priceCents: 9999, status: "draft" }, // excluded
      { priceCents: 7000, status: "paused" }, // excluded
      { priceCents: 4000, status: "canceled" }, // excluded
    ];
    const { mrrCents, arrCents, activeCount } =
      computeRevenueSummary(deployments);
    assert.equal(mrrCents, 15000);
    assert.equal(activeCount, 2);
    // ARR = MRR × 12.
    assert.equal(arrCents, 15000 * 12);
  });

  test("ARR is exactly MRR × 12", () => {
    const { mrrCents, arrCents } = computeRevenueSummary([
      { priceCents: 12345, status: "active" },
    ]);
    assert.equal(mrrCents, 12345);
    assert.equal(arrCents, 12345 * 12);
  });

  test("all-inactive list → zero MRR/ARR and zero activeCount", () => {
    const { mrrCents, arrCents, activeCount } = computeRevenueSummary([
      { priceCents: 10000, status: "draft" },
      { priceCents: 20000, status: "paused" },
      { priceCents: 30000, status: "canceled" },
    ]);
    assert.equal(mrrCents, 0);
    assert.equal(arrCents, 0);
    assert.equal(activeCount, 0);
  });

  test("a $0 active deployment counts toward activeCount but adds nothing to MRR", () => {
    const { mrrCents, activeCount } = computeRevenueSummary([
      { priceCents: 0, status: "active" },
      { priceCents: 8000, status: "active" },
    ]);
    assert.equal(mrrCents, 8000);
    assert.equal(activeCount, 2);
  });

  test("coerces garbage priceCents (NaN / negative / fractional) defensively", () => {
    const { mrrCents } = computeRevenueSummary([
      { priceCents: Number.NaN, status: "active" }, // → 0
      { priceCents: -500, status: "active" }, // → 0 (clamped)
      { priceCents: 99.6, status: "active" }, // → 100 (rounded)
    ]);
    assert.equal(mrrCents, 100);
  });

  test("an unknown status is NOT treated as active (only 'active' is live)", () => {
    const { mrrCents, activeCount } = computeRevenueSummary([
      { priceCents: 10000, status: "trialing" },
      { priceCents: 10000, status: "" },
    ]);
    assert.equal(mrrCents, 0);
    assert.equal(activeCount, 0);
  });
});
