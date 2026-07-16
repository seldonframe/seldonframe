// Agent receipts slice (Task 3) — the pure LIVE-banner fold.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  summarizeDeploymentLiveStatus,
  describeDeploymentLiveStatus,
} from "../../../src/lib/agent-receipts/live-status";

const NOW = new Date("2026-07-16T00:04:30Z").getTime();

describe("summarizeDeploymentLiveStatus", () => {
  test("active deployment, no receipts -> active true, zeroed counts", () => {
    const s = summarizeDeploymentLiveStatus({
      deploymentStatus: "active",
      triggerKind: "push",
      receiptCreatedAtIso: [],
      nowMs: NOW,
    });
    assert.deepEqual(s, {
      active: true,
      triggerKind: "push",
      todayCount: 0,
      lastReceiptAt: null,
      connectedAccountLabel: null,
    });
  });

  test("counts only today's receipts (UTC calendar day)", () => {
    const s = summarizeDeploymentLiveStatus({
      deploymentStatus: "active",
      triggerKind: "push",
      receiptCreatedAtIso: [
        "2026-07-16T00:01:00Z",
        "2026-07-16T00:02:00Z",
        "2026-07-15T23:59:00Z", // yesterday
      ],
      nowMs: NOW,
    });
    assert.equal(s.todayCount, 2);
  });

  test("lastReceiptAt is the max timestamp regardless of array order", () => {
    const s = summarizeDeploymentLiveStatus({
      deploymentStatus: "active",
      triggerKind: "schedule",
      receiptCreatedAtIso: ["2026-07-15T10:00:00Z", "2026-07-16T00:04:00Z", "2026-07-14T01:00:00Z"],
      nowMs: NOW,
    });
    assert.equal(s.lastReceiptAt, "2026-07-16T00:04:00Z");
  });

  test("draft/paused deployment -> active false", () => {
    const s = summarizeDeploymentLiveStatus({
      deploymentStatus: "paused",
      triggerKind: "push",
      receiptCreatedAtIso: [],
      nowMs: NOW,
    });
    assert.equal(s.active, false);
  });

  test("unparseable timestamps are ignored, never throw", () => {
    const s = summarizeDeploymentLiveStatus({
      deploymentStatus: "active",
      triggerKind: null,
      receiptCreatedAtIso: ["not-a-date", "2026-07-16T00:00:00Z"],
      nowMs: NOW,
    });
    assert.equal(s.todayCount, 1);
    assert.equal(s.lastReceiptAt, "2026-07-16T00:00:00Z");
  });

  test("connectedAccountLabel passes through when provided", () => {
    const s = summarizeDeploymentLiveStatus({
      deploymentStatus: "active",
      triggerKind: "push",
      receiptCreatedAtIso: [],
      nowMs: NOW,
      connectedAccountLabel: "ops@acme.com",
    });
    assert.equal(s.connectedAccountLabel, "ops@acme.com");
  });
});

describe("describeDeploymentLiveStatus", () => {
  test("inactive deployment -> null (no banner)", () => {
    const text = describeDeploymentLiveStatus({
      active: false,
      triggerKind: "push",
      todayCount: 3,
      lastReceiptAt: "2026-07-16T00:04:00Z",
    });
    assert.equal(text, null);
  });

  test("active + runs today + trigger + last time renders the full sentence", () => {
    const text = describeDeploymentLiveStatus({
      active: true,
      triggerKind: "push",
      todayCount: 3,
      lastReceiptAt: "2026-07-16T00:04:00Z",
    });
    assert.equal(text, "LIVE — watching via push · 3 runs today · last 00:04");
  });

  test("singular 'run' for todayCount === 1", () => {
    const text = describeDeploymentLiveStatus({
      active: true,
      triggerKind: "schedule",
      todayCount: 1,
      lastReceiptAt: null,
    });
    assert.equal(text, "LIVE — watching via schedule · 1 run today");
  });

  test("no runs yet -> 'no runs yet', no last-time suffix", () => {
    const text = describeDeploymentLiveStatus({
      active: true,
      triggerKind: "push",
      todayCount: 0,
      lastReceiptAt: null,
    });
    assert.equal(text, "LIVE — watching via push · no runs yet");
  });

  test("connectedAccountLabel appends a 'reading <account>' suffix", () => {
    const text = describeDeploymentLiveStatus({
      active: true,
      triggerKind: "push",
      todayCount: 2,
      lastReceiptAt: "2026-07-16T00:04:00Z",
      connectedAccountLabel: "ops@acme.com",
    });
    assert.equal(
      text,
      "LIVE — watching via push · 2 runs today · last 00:04 · reading ops@acme.com",
    );
  });

  test("missing triggerKind omits the 'watching via' clause", () => {
    const text = describeDeploymentLiveStatus({
      active: true,
      triggerKind: null,
      todayCount: 0,
      lastReceiptAt: null,
    });
    assert.equal(text, "LIVE · no runs yet");
  });
});
