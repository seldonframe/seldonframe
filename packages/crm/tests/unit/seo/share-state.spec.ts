import { test } from "node:test";
import assert from "node:assert/strict";

import {
  encodeMissedCallState,
  decodeMissedCallState,
  MISSED_CALL_BOUNDS,
  encodeCostCalcState,
  decodeCostCalcState,
  COST_CALC_BOUNDS,
} from "@/components/seo/result-card";

// ─── missed-call calculator: encode/decode round-trip ──────────────────

test("encodeMissedCallState produces short, stable query keys", () => {
  const qs = encodeMissedCallState({ missedPerWeek: 12, jobValue: 400, closeRate: 30 });
  const params = new URLSearchParams(qs);
  assert.equal(params.get("mc"), "12");
  assert.equal(params.get("jv"), "400");
  assert.equal(params.get("cr"), "30");
});

test("decodeMissedCallState round-trips values encoded by encodeMissedCallState", () => {
  const state = { missedPerWeek: 25, jobValue: 750, closeRate: 45 };
  const qs = encodeMissedCallState(state);
  const decoded = decodeMissedCallState(qs);
  assert.deepEqual(decoded, state);
});

test("decodeMissedCallState clamps out-of-range values to slider bounds", () => {
  const decoded = decodeMissedCallState("mc=9999&jv=-50&cr=1000");
  assert.equal(decoded.missedPerWeek, MISSED_CALL_BOUNDS.missedPerWeek.max);
  assert.equal(decoded.jobValue, MISSED_CALL_BOUNDS.jobValue.min);
  assert.equal(decoded.closeRate, MISSED_CALL_BOUNDS.closeRate.max);
});

test("decodeMissedCallState clamps below-minimum values up to the floor", () => {
  const decoded = decodeMissedCallState("mc=0&jv=0&cr=0");
  assert.equal(decoded.missedPerWeek, MISSED_CALL_BOUNDS.missedPerWeek.min);
  assert.equal(decoded.jobValue, MISSED_CALL_BOUNDS.jobValue.min);
  assert.equal(decoded.closeRate, MISSED_CALL_BOUNDS.closeRate.min);
});

test("decodeMissedCallState ignores garbage/non-numeric input without throwing", () => {
  const decoded = decodeMissedCallState("mc=banana&jv=&cr=NaN");
  assert.deepEqual(decoded, {});
});

test("decodeMissedCallState omits keys that are absent from the query string", () => {
  const decoded = decodeMissedCallState("mc=15");
  assert.deepEqual(decoded, { missedPerWeek: 15 });
});

test("decodeMissedCallState handles a leading '?' the same as a bare query string", () => {
  const withQuestionMark = decodeMissedCallState("?mc=15&jv=200&cr=20");
  const bare = decodeMissedCallState("mc=15&jv=200&cr=20");
  assert.deepEqual(withQuestionMark, bare);
});

// ─── AI receptionist cost calculator: encode/decode round-trip ─────────

test("encodeCostCalcState produces the five short stable keys", () => {
  const qs = encodeCostCalcState({ callsPerMonth: 300, avgMinutes: 4, wage: 18, answeringRate: 1.75, aiRate: 0.3 });
  const params = new URLSearchParams(qs);
  assert.equal(params.get("cm"), "300");
  assert.equal(params.get("am"), "4");
  assert.equal(params.get("wg"), "18");
  assert.equal(params.get("ar"), "1.75");
  assert.equal(params.get("ai"), "0.3");
});

test("decodeCostCalcState round-trips values encoded by encodeCostCalcState", () => {
  const state = { callsPerMonth: 600, avgMinutes: 5.5, wage: 22, answeringRate: 2.25, aiRate: 0.45 };
  const qs = encodeCostCalcState(state);
  const decoded = decodeCostCalcState(qs);
  assert.deepEqual(decoded, state);
});

test("decodeCostCalcState clamps every field to its slider bounds", () => {
  const decoded = decodeCostCalcState("cm=999999&am=-5&wg=1000&ar=-1&ai=99");
  assert.equal(decoded.callsPerMonth, COST_CALC_BOUNDS.callsPerMonth.max);
  assert.equal(decoded.avgMinutes, COST_CALC_BOUNDS.avgMinutes.min);
  assert.equal(decoded.wage, COST_CALC_BOUNDS.wage.max);
  assert.equal(decoded.answeringRate, COST_CALC_BOUNDS.answeringRate.min);
  assert.equal(decoded.aiRate, COST_CALC_BOUNDS.aiRate.max);
});

test("decodeCostCalcState ignores garbage input for individual fields without throwing", () => {
  const decoded = decodeCostCalcState("cm=abc&am=4&wg=&ar=2&ai=xyz");
  assert.deepEqual(decoded, { avgMinutes: 4, answeringRate: 2 });
});

test("decodeCostCalcState returns an empty object for an empty query string", () => {
  assert.deepEqual(decodeCostCalcState(""), {});
});
