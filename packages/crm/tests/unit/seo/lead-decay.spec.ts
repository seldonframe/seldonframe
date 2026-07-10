import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DECAY_POINTS,
  INDUSTRY_MARKERS,
  SOURCES,
  UNSOURCED_GAPS,
  isGapSegment,
  indexAtMinutes,
  computeRevenueAtRisk,
} from "@/lib/seo/lead-decay-data";

// ─── Indexing to 100 ────────────────────────────────────────────────────

test("the 5-minute point is indexed to exactly 100", () => {
  const first = DECAY_POINTS[0];
  assert.equal(first.minutes, 5);
  assert.equal(first.index, 100);
});

test("indexAtMinutes at the first sourced point returns 100", () => {
  assert.equal(indexAtMinutes(5), 100);
});

// ─── Every data point carries a source ref ─────────────────────────────

test("every DECAY_POINTS entry has a sourceKey that resolves to a real SOURCES entry", () => {
  for (const p of DECAY_POINTS) {
    assert.ok(p.sourceKey in SOURCES, `missing source for point at ${p.minutes}min`);
    const src = SOURCES[p.sourceKey];
    assert.ok(src.url.startsWith("https://"), `source url for ${p.minutes}min is not a real URL`);
    assert.ok(src.label.length > 0);
  }
});

test("SOURCES entries all carry a hedging note (never-lies)", () => {
  for (const key of Object.keys(SOURCES) as (keyof typeof SOURCES)[]) {
    assert.ok(SOURCES[key].note.length > 10, `source ${key} has no honesty note`);
  }
});

// ─── Gap segments render dashed, not solid ─────────────────────────────

test("the 30min -> 24h segment is marked as an unsourced gap", () => {
  assert.ok(isGapSegment(30, 1440));
  assert.deepEqual(UNSOURCED_GAPS, [[30, 1440]]);
});

test("sourced adjacent segments are not marked as gaps", () => {
  assert.equal(isGapSegment(5, 10), false);
  assert.equal(isGapSegment(10, 30), false);
});

// ─── Ratios match the cited study's stated multipliers exactly ────────

test("index at 10min is exactly 1/4 of the index at 5min (the study's 'fourfold' claim)", () => {
  const at5 = DECAY_POINTS.find((p) => p.minutes === 5)!;
  const at10 = DECAY_POINTS.find((p) => p.minutes === 10)!;
  assert.equal(at10.index, Math.round((at5.index / 4) * 10) / 10);
});

test("index at 30min is exactly 1/21 of the index at 5min (the study's '21-fold' claim)", () => {
  const at5 = DECAY_POINTS.find((p) => p.minutes === 5)!;
  const at30 = DECAY_POINTS.find((p) => p.minutes === 30)!;
  assert.equal(at30.index, Math.round((at5.index / 21) * 10) / 10);
});

// ─── Industry list ──────────────────────────────────────────────────────

test("INDUSTRY_MARKERS is non-empty and every entry has a positive response time", () => {
  assert.ok(INDUSTRY_MARKERS.length > 0);
  for (const i of INDUSTRY_MARKERS) {
    assert.ok(i.typicalResponseMinutes > 0);
    assert.ok(i.name.length > 0);
    assert.ok(i.slug.length > 0);
  }
});

test("INDUSTRY_MARKERS slugs are unique", () => {
  const slugs = INDUSTRY_MARKERS.map((i) => i.slug);
  assert.equal(new Set(slugs).size, slugs.length);
});

// ─── indexAtMinutes: monotonic, clamped ────────────────────────────────

test("indexAtMinutes is monotonic non-increasing as minutes grow", () => {
  const samples = [5, 8, 10, 20, 30, 45, 60, 300, 700, 1440];
  for (let i = 1; i < samples.length; i++) {
    assert.ok(indexAtMinutes(samples[i]) <= indexAtMinutes(samples[i - 1]) + 1e-9);
  }
});

test("indexAtMinutes clamps below the first sourced point to the first point's index", () => {
  assert.equal(indexAtMinutes(0), indexAtMinutes(5));
  assert.equal(indexAtMinutes(-100), indexAtMinutes(5));
});

test("indexAtMinutes clamps above the last sourced point to the last point's index", () => {
  const last = DECAY_POINTS[DECAY_POINTS.length - 1];
  assert.equal(indexAtMinutes(999999), last.index);
});

// ─── Revenue-at-risk math ───────────────────────────────────────────────

test("computeRevenueAtRisk: responding at exactly 5 minutes yields zero revenue at risk", () => {
  const result = computeRevenueAtRisk({ leadsPerMonth: 100, avgJobValue: 500, baseCloseRate: 0.3, currentResponseMinutes: 5 });
  assert.equal(result.revenueAtRiskMonthly, 0);
  assert.equal(result.revenueAtCurrentSpeed, result.revenueIfFast);
});

test("computeRevenueAtRisk: slower response strictly increases revenue at risk", () => {
  const fast = computeRevenueAtRisk({ leadsPerMonth: 100, avgJobValue: 500, baseCloseRate: 0.3, currentResponseMinutes: 10 });
  const slow = computeRevenueAtRisk({ leadsPerMonth: 100, avgJobValue: 500, baseCloseRate: 0.3, currentResponseMinutes: 60 });
  assert.ok(slow.revenueAtRiskMonthly > fast.revenueAtRiskMonthly);
});

test("computeRevenueAtRisk: yearly figure is exactly 12x the monthly figure", () => {
  const result = computeRevenueAtRisk({ leadsPerMonth: 80, avgJobValue: 300, baseCloseRate: 0.25, currentResponseMinutes: 90 });
  assert.equal(result.revenueAtRiskYearly, result.revenueAtRiskMonthly * 12);
});

test("computeRevenueAtRisk: never produces NaN on zero/edge inputs", () => {
  const zero = computeRevenueAtRisk({ leadsPerMonth: 0, avgJobValue: 0, baseCloseRate: 0, currentResponseMinutes: 0 });
  assert.ok(Number.isFinite(zero.revenueAtRiskMonthly));
  assert.ok(Number.isFinite(zero.revenueAtRiskYearly));
  assert.equal(zero.revenueAtRiskMonthly, 0);

  const negative = computeRevenueAtRisk({ leadsPerMonth: -5, avgJobValue: -100, baseCloseRate: -0.5, currentResponseMinutes: -10 });
  assert.ok(Number.isFinite(negative.revenueAtRiskMonthly));
  assert.ok(!Number.isNaN(negative.revenueAtRiskMonthly));

  const huge = computeRevenueAtRisk({ leadsPerMonth: 1e9, avgJobValue: 1e9, baseCloseRate: 5, currentResponseMinutes: 1e9 });
  assert.ok(Number.isFinite(huge.revenueAtRiskMonthly));
});

test("computeRevenueAtRisk: revenueAtRiskMonthly is never negative", () => {
  const result = computeRevenueAtRisk({ leadsPerMonth: 50, avgJobValue: 400, baseCloseRate: 0.4, currentResponseMinutes: 2 });
  assert.ok(result.revenueAtRiskMonthly >= 0);
});
