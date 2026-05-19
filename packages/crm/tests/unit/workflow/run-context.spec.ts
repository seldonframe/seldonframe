// Tests for the pure helpers around RunContext.
//
// buildClock(now, tz) must format "today" and "tomorrow" in the
// workspace timezone, not UTC. Used by the conversation step's
// system prompt so the LLM can ground "tomorrow" against the
// operator's local date, not the server's UTC date.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { buildClock } from "../../../src/lib/workflow/build-run-context";

describe("buildClock", () => {
  test("formats today in America/Los_Angeles tz", () => {
    // 2026-05-19 10:00 UTC = 2026-05-19 03:00 LA (same day)
    const now = new Date("2026-05-19T10:00:00Z");
    const c = buildClock(now, "America/Los_Angeles");
    assert.equal(c.today, "2026-05-19");
    assert.equal(c.tomorrow, "2026-05-20");
  });

  test("rolls today across midnight in a positive-offset tz", () => {
    // 2026-05-19 22:00 UTC = 2026-05-20 08:00 in Asia/Tokyo
    const now = new Date("2026-05-19T22:00:00Z");
    const c = buildClock(now, "Asia/Tokyo");
    assert.equal(c.today, "2026-05-20");
    assert.equal(c.tomorrow, "2026-05-21");
  });

  test("returns weekday in workspace tz", () => {
    // 2026-05-19 is a Tuesday
    const now = new Date("2026-05-19T12:00:00Z");
    const c = buildClock(now, "America/New_York");
    assert.equal(c.todayWeekday, "Tuesday");
  });

  test("falls back to UTC if the tz string is invalid", () => {
    const now = new Date("2026-05-19T12:00:00Z");
    const c = buildClock(now, "Not/AReal/Timezone");
    // Falls back to UTC formatting; today is the UTC date string
    assert.equal(c.today, "2026-05-19");
    assert.equal(c.tomorrow, "2026-05-20");
  });

  test("nowIso reflects the input Date as ISO UTC", () => {
    const now = new Date("2026-05-19T15:30:00Z");
    const c = buildClock(now, "UTC");
    assert.equal(c.nowIso, "2026-05-19T15:30:00.000Z");
  });
});
