import { test } from "node:test";
import assert from "node:assert/strict";

import { reconcileReplyWithVision } from "../../../src/lib/vision/reconcile-reply";

const ORIGINAL = "Done ✅ I updated the headline.";

test("pass:true, gaps:[] leaves the reply unchanged", () => {
  const result = reconcileReplyWithVision(ORIGINAL, { pass: true, gaps: [] });
  assert.equal(result.text, ORIGINAL);
  assert.equal(result.corrected, false);
});

test("pass:false with skipped:'timeout' is fail-soft — unchanged even with gaps", () => {
  const result = reconcileReplyWithVision(ORIGINAL, {
    pass: false,
    skipped: "timeout",
    gaps: ["x"],
  });
  assert.equal(result.text, ORIGINAL);
  assert.equal(result.corrected, false);
});

test("pass:false with skipped:'render_failed' is fail-soft — unchanged", () => {
  const result = reconcileReplyWithVision(ORIGINAL, {
    pass: false,
    skipped: "render_failed",
    gaps: [],
  });
  assert.equal(result.text, ORIGINAL);
  assert.equal(result.corrected, false);
});

test("genuine pass:false with gaps replaces the reply with the truth", () => {
  const result = reconcileReplyWithVision(ORIGINAL, {
    pass: false,
    gaps: ["A", "B"],
  });
  assert.equal(result.corrected, true);
  assert.ok(result.text.includes("A; B"), `expected gaps joined in text, got: ${result.text}`);
  assert.ok(!result.text.includes(ORIGINAL), "honest text must not contain the original reply");
});

test("no visionCheck (undefined) leaves the reply unchanged", () => {
  const result = reconcileReplyWithVision(ORIGINAL, undefined);
  assert.equal(result.text, ORIGINAL);
  assert.equal(result.corrected, false);
});

test("pass:false with empty gaps array is fail-soft — unchanged", () => {
  const result = reconcileReplyWithVision(ORIGINAL, { pass: false, gaps: [] });
  assert.equal(result.text, ORIGINAL);
  assert.equal(result.corrected, false);
});
