import { test } from "node:test";
import assert from "node:assert/strict";
import { buildVisionCheckLog } from "@/lib/vision/verify-page";

// ─────────────────────────── buildVisionCheckLog ───────────────────────────

test("buildVisionCheckLog: fired + pass — gaps_count 0, verdict fields passed through", () => {
  const record = buildVisionCheckLog({
    orgId: "org_123",
    fired: true,
    verdict: { pass: true, gaps: [] },
    durationMs: 842,
    triggerTool: "update_media",
    triggerSlot: "hero_background",
  });

  assert.equal(record.event, "vision_check");
  assert.equal(record.severity, "info");
  assert.equal(record.org_id, "org_123");
  assert.equal(record.fired, true);
  assert.equal(record.pass, true);
  assert.equal(record.gaps_count, 0);
  assert.deepEqual(record.gaps, []);
  assert.equal(record.skipped, null);
  assert.equal(record.duration_ms, 842);
  assert.equal(record.trigger_tool, "update_media");
  assert.equal(record.trigger_slot, "hero_background");
  assert.equal(typeof record.at, "string");
  assert.ok(!Number.isNaN(Date.parse(record.at as string)));
});

test("buildVisionCheckLog: fired + gaps — gaps_count N, gaps passed through", () => {
  const record = buildVisionCheckLog({
    orgId: "org_456",
    fired: true,
    verdict: { pass: false, gaps: ["hero image is broken", "low contrast CTA"] },
    durationMs: 1200,
  });

  assert.equal(record.event, "vision_check");
  assert.equal(record.org_id, "org_456");
  assert.equal(record.fired, true);
  assert.equal(record.pass, false);
  assert.equal(record.gaps_count, 2);
  assert.deepEqual(record.gaps, ["hero image is broken", "low contrast CTA"]);
  assert.equal(record.skipped, null);
  assert.equal(record.duration_ms, 1200);
  assert.equal(record.trigger_tool, null);
  assert.equal(record.trigger_slot, null);
});

test("buildVisionCheckLog: fired + skipped (render_failed) — pass/gaps still passed through from the fail-soft verdict", () => {
  const record = buildVisionCheckLog({
    orgId: "org_789",
    fired: true,
    verdict: { pass: true, gaps: [], skipped: "render_failed" },
    durationMs: 300,
  });

  assert.equal(record.fired, true);
  assert.equal(record.pass, true);
  assert.equal(record.gaps_count, 0);
  assert.equal(record.skipped, "render_failed");
  assert.equal(record.duration_ms, 300);
});

test("buildVisionCheckLog: not fired — fired:false, verdict fields default to null/empty", () => {
  const record = buildVisionCheckLog({
    orgId: "org_000",
    fired: false,
    durationMs: 0,
  });

  assert.equal(record.event, "vision_check");
  assert.equal(record.org_id, "org_000");
  assert.equal(record.fired, false);
  assert.equal(record.pass, null);
  assert.equal(record.gaps_count, 0);
  assert.deepEqual(record.gaps, []);
  assert.equal(record.skipped, null);
  assert.equal(record.duration_ms, 0);
  assert.equal(record.trigger_tool, null);
  assert.equal(record.trigger_slot, null);
});
