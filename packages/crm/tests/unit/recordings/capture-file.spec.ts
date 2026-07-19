// packages/crm/tests/unit/recordings/capture-file.spec.ts
//
// sampleTimestamps is the only pure, unit-testable surface of capture-file.ts
// (extractFromVideoFile is browser-only — no meaningful fake in node:test,
// same rationale as capture.ts's own header comment).

import { test } from "node:test";
import assert from "node:assert/strict";
import { sampleTimestamps } from "../../../src/app/(public)/record/capture-file";

test("sampleTimestamps: short clip (~30s) samples ~1/sec capped by maxFrames", () => {
  const result = sampleTimestamps(30_000, 240);
  // 30s at ~1/sec => ~29-30 samples (well under the 240 cap), not the cap.
  assert.ok(result.length > 20 && result.length < 31, `expected ~29-30, got ${result.length}`);
});

test("sampleTimestamps: long clip (20 min) spreads maxFrames across the whole duration", () => {
  const durationMs = 20 * 60 * 1000;
  const result = sampleTimestamps(durationMs, 240);
  assert.equal(result.length, 240);
  // Spread across the whole duration, not just the first chunk.
  const last = result[result.length - 1]!;
  assert.ok(last > durationMs * 0.9, `expected last sample near the end, got ${last}`);
});

test("sampleTimestamps: zero duration returns no samples", () => {
  assert.deepEqual(sampleTimestamps(0, 240), []);
});

test("sampleTimestamps: negative duration returns no samples", () => {
  assert.deepEqual(sampleTimestamps(-500, 240), []);
});

test("sampleTimestamps: cap is respected even for very long durations", () => {
  const result = sampleTimestamps(60 * 60 * 1000, 240);
  assert.equal(result.length, 240);
});

test("sampleTimestamps: cap is respected even for maxFrames <= 0", () => {
  assert.deepEqual(sampleTimestamps(30_000, 0), []);
  assert.deepEqual(sampleTimestamps(30_000, -5), []);
});

test("sampleTimestamps: strictly ascending order, no duplicates", () => {
  const result = sampleTimestamps(45_000, 240);
  for (let i = 1; i < result.length; i++) {
    assert.ok(result[i]! > result[i - 1]!, `not strictly ascending at index ${i}`);
  }
});

test("sampleTimestamps: first sample is at least 500ms in (skip the black first frame)", () => {
  const result = sampleTimestamps(30_000, 240);
  assert.ok(result[0]! >= 500, `expected first sample >= 500ms, got ${result[0]}`);
});

test("sampleTimestamps: every sample is strictly less than the duration", () => {
  const durationMs = 10_000;
  const result = sampleTimestamps(durationMs, 240);
  for (const t of result) {
    assert.ok(t < durationMs, `sample ${t} not < duration ${durationMs}`);
  }
});

test("sampleTimestamps: very short duration (under minIntervalMs) still returns at least one sample", () => {
  const result = sampleTimestamps(600, 240);
  assert.ok(result.length >= 1);
  assert.ok(result[0]! >= 500);
  assert.ok(result[0]! < 600);
});

test("sampleTimestamps: duration shorter than the 500ms floor returns no samples", () => {
  assert.deepEqual(sampleTimestamps(400, 240), []);
});

test("sampleTimestamps: custom minIntervalMs is honored (fewer samples than 1/sec)", () => {
  const result = sampleTimestamps(30_000, 240, 5000);
  // 30s at 1/5s => ~6 samples, well under the default ~30.
  assert.ok(result.length <= 7, `expected <= 7 with 5s interval, got ${result.length}`);
});
