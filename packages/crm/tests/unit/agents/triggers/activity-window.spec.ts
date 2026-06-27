// Event-agent activity — the trailing-window filter (1d / 7d / 30d).
//
// Pinned contract:
//   • withinWindow(iso, nowMs, windowDays) keeps a row iff
//     nowMs - windowDays·1d ≤ when ≤ nowMs (inclusive both ends);
//   • a FUTURE row (when > nowMs) is dropped; an unparseable iso is dropped;
//   • parseActivityWindowDays coerces a raw value to {1,7,30}, else default 7;
//   • summarizeEventAgentActivity({...}, {windowDays, nowMs}) drops out-of-window
//     rows BEFORE the limit, and omitting the window keeps the legacy behavior.
//
// Run:
//   node --import tsx --test tests/unit/agents/triggers/activity-window.spec.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  withinWindow,
  parseActivityWindowDays,
  summarizeEventAgentActivity,
  DEFAULT_ACTIVITY_WINDOW_DAYS,
  type EventAgentSendRow,
} from "../../../../src/lib/agents/triggers/activity";

const NOW = Date.parse("2026-06-27T12:00:00.000Z");
const DAY = 86_400_000;

/** ISO `n` days before NOW. */
function daysAgo(n: number): string {
  return new Date(NOW - n * DAY).toISOString();
}

describe("withinWindow", () => {
  test("1-day window keeps today, drops 2 days ago", () => {
    assert.equal(withinWindow(daysAgo(0), NOW, 1), true);
    assert.equal(withinWindow(daysAgo(0.5), NOW, 1), true);
    assert.equal(withinWindow(daysAgo(2), NOW, 1), false);
  });

  test("7-day window keeps 6 days ago, drops 8 days ago", () => {
    assert.equal(withinWindow(daysAgo(6), NOW, 7), true);
    assert.equal(withinWindow(daysAgo(8), NOW, 7), false);
  });

  test("30-day window keeps 29 days ago, drops 31 days ago", () => {
    assert.equal(withinWindow(daysAgo(29), NOW, 30), true);
    assert.equal(withinWindow(daysAgo(31), NOW, 30), false);
  });

  test("boundary is inclusive at exactly windowDays old", () => {
    // Exactly 7 days old → kept (>= lower bound).
    assert.equal(withinWindow(daysAgo(7), NOW, 7), true);
  });

  test("drops a future row (when > now), even within the same window", () => {
    const future = new Date(NOW + DAY).toISOString();
    assert.equal(withinWindow(future, NOW, 30), false);
  });

  test("now itself is kept (upper bound inclusive)", () => {
    assert.equal(withinWindow(new Date(NOW).toISOString(), NOW, 1), true);
  });

  test("unparseable iso → dropped (never throws)", () => {
    assert.equal(withinWindow("not-a-date", NOW, 30), false);
  });

  test("negative windowDays is clamped to 0 (only 'now' survives)", () => {
    assert.equal(withinWindow(daysAgo(0), NOW, -5), true);
    assert.equal(withinWindow(daysAgo(0.001), NOW, -5), false);
  });
});

describe("parseActivityWindowDays", () => {
  test("accepts the three valid windows (string + number)", () => {
    assert.equal(parseActivityWindowDays("1"), 1);
    assert.equal(parseActivityWindowDays("7"), 7);
    assert.equal(parseActivityWindowDays("30"), 30);
    assert.equal(parseActivityWindowDays(30), 30);
  });

  test("anything else → the default (7)", () => {
    assert.equal(DEFAULT_ACTIVITY_WINDOW_DAYS, 7);
    assert.equal(parseActivityWindowDays(undefined), 7);
    assert.equal(parseActivityWindowDays("90"), 7);
    assert.equal(parseActivityWindowDays("abc"), 7);
    assert.equal(parseActivityWindowDays(2), 7);
    assert.equal(parseActivityWindowDays(null), 7);
  });
});

describe("summarizeEventAgentActivity — window filter", () => {
  const sends: EventAgentSendRow[] = [
    { source: "agent:review-requester", channel: "sms", at: daysAgo(0) }, // today
    { source: "agent:review-requester", channel: "sms", at: daysAgo(3) }, // 3d
    { source: "agent:review-requester", channel: "sms", at: daysAgo(10) }, // 10d
    { source: "agent:review-requester", channel: "sms", at: daysAgo(40) }, // 40d
  ];

  test("1-day window keeps only today's send", () => {
    const rows = summarizeEventAgentActivity(
      { sends },
      { windowDays: 1, nowMs: NOW },
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].when, daysAgo(0));
  });

  test("7-day window keeps today + 3d (drops 10d, 40d)", () => {
    const rows = summarizeEventAgentActivity(
      { sends },
      { windowDays: 7, nowMs: NOW },
    );
    assert.equal(rows.length, 2);
  });

  test("30-day window keeps today + 3d + 10d (drops 40d)", () => {
    const rows = summarizeEventAgentActivity(
      { sends },
      { windowDays: 30, nowMs: NOW },
    );
    assert.equal(rows.length, 3);
  });

  test("limit applies AFTER the window filter (counts in-window rows)", () => {
    const rows = summarizeEventAgentActivity(
      { sends },
      { windowDays: 30, nowMs: NOW, limit: 2 },
    );
    // 3 rows are in-window; limit caps to the 2 newest of those.
    assert.equal(rows.length, 2);
    assert.equal(rows[0].when, daysAgo(0));
    assert.equal(rows[1].when, daysAgo(3));
  });

  test("omitting the window keeps the legacy no-time-bound behavior", () => {
    const rows = summarizeEventAgentActivity({ sends });
    assert.equal(rows.length, 4);
  });

  test("a bare numeric second arg is still treated as the legacy limit", () => {
    const rows = summarizeEventAgentActivity({ sends }, 1);
    assert.equal(rows.length, 1); // newest only, no window applied
    assert.equal(rows[0].when, daysAgo(0));
  });
});
