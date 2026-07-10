import { test } from "node:test";
import assert from "node:assert/strict";

import { TRENDS, isProjection, getTrend, DEFAULT_VISIBLE_KEYS } from "@/lib/seo/trend-chart-data";

test("every trend has at least 3 points", () => {
  for (const t of TRENDS) {
    assert.ok(t.points.length >= 3, `${t.key} has fewer than 3 points`);
  }
});

test("every point value is within 0-100", () => {
  for (const t of TRENDS) {
    for (const p of t.points) {
      assert.ok(p.value >= 0 && p.value <= 100, `${t.key} has a point value out of range: ${p.value}`);
    }
  }
});

test("future points (beyond 2026) are flagged as projections", () => {
  for (const t of TRENDS) {
    const future = t.points.filter((p) => p.year > 2026);
    for (const p of future) {
      assert.equal(isProjection(p), true, `${t.key} year ${p.year} should be a projection`);
    }
    const past = t.points.filter((p) => p.year <= 2026);
    for (const p of past) {
      assert.equal(isProjection(p), false, `${t.key} year ${p.year} should NOT be a projection`);
    }
  }
});

test("no trend is missing a take", () => {
  for (const t of TRENDS) {
    assert.ok(typeof t.take === "string" && t.take.trim().length > 0, `${t.key} is missing a take`);
  }
});

test("every trend has a valid status", () => {
  const allowed = new Set(["rising", "peaking", "declining", "reborn"]);
  for (const t of TRENDS) {
    assert.ok(allowed.has(t.status), `${t.key} has an invalid status: ${t.status}`);
  }
});

test("getTrend returns the matching trend and throws on an unknown key", () => {
  const t = getTrend(TRENDS[0].key);
  assert.equal(t.key, TRENDS[0].key);
  assert.throws(() => getTrend("does-not-exist"));
});

test("DEFAULT_VISIBLE_KEYS are all real trend keys", () => {
  const keys = new Set(TRENDS.map((t) => t.key));
  for (const k of DEFAULT_VISIBLE_KEYS) {
    assert.ok(keys.has(k), `default visible key ${k} is not a real trend`);
  }
});

test("trend keys are unique", () => {
  const keys = TRENDS.map((t) => t.key);
  assert.equal(new Set(keys).size, keys.length);
});
