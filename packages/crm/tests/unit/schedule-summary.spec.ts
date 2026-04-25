// Tests for the schedule-summary display helper.
// SLICE 5 PR 2 C4 per audit §4.5 + G-5-6.
//
// Pure formatting logic extracted from the admin SchedulesSection
// component. Covers:
//   - formatNextFireRelative(nextFireAt, now) — "in 2 hours" / "in 3 days"
//   - summarizeCron(expr) — common patterns → human-readable ("daily at 9am",
//     "every 5 minutes"). Falls back to the raw expression for non-matches.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  formatNextFireRelative,
  summarizeCron,
} from "../../src/lib/agents/schedule-summary";

// ---------------------------------------------------------------------
// formatNextFireRelative
// ---------------------------------------------------------------------

describe("formatNextFireRelative", () => {
  const now = new Date("2026-04-24T08:00:00Z");

  test("less than a minute → 'in less than a minute'", () => {
    const next = new Date(now.getTime() + 30 * 1000);
    assert.equal(formatNextFireRelative(next, now), "in less than a minute");
  });

  test("minutes away", () => {
    const next = new Date(now.getTime() + 5 * 60 * 1000);
    assert.equal(formatNextFireRelative(next, now), "in 5 minutes");
  });

  test("exactly 1 minute away (singular)", () => {
    const next = new Date(now.getTime() + 60 * 1000);
    assert.equal(formatNextFireRelative(next, now), "in 1 minute");
  });

  test("hours away", () => {
    const next = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    assert.equal(formatNextFireRelative(next, now), "in 3 hours");
  });

  test("exactly 1 hour away (singular)", () => {
    const next = new Date(now.getTime() + 60 * 60 * 1000);
    assert.equal(formatNextFireRelative(next, now), "in 1 hour");
  });

  test("days away", () => {
    const next = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
    assert.equal(formatNextFireRelative(next, now), "in 5 days");
  });

  test("exactly 1 day away (singular)", () => {
    const next = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    assert.equal(formatNextFireRelative(next, now), "in 1 day");
  });

  test("more than 30 days → absolute date fallback", () => {
    const next = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
    const out = formatNextFireRelative(next, now);
    // Should NOT say "in 60 days"; should fall back to a date-ish string.
    assert.ok(!out.includes("60 days"), `expected date fallback, got "${out}"`);
    assert.match(out, /on \w+ \d+/); // e.g., "on Jun 23"
  });

  test("past time → 'overdue'", () => {
    const past = new Date(now.getTime() - 60 * 1000);
    assert.equal(formatNextFireRelative(past, now), "overdue");
  });
});

// ---------------------------------------------------------------------
// summarizeCron
// ---------------------------------------------------------------------

describe("summarizeCron — common patterns", () => {
  test("* * * * * → 'every minute'", () => {
    assert.equal(summarizeCron("* * * * *"), "every minute");
  });

  test("*/5 * * * * → 'every 5 minutes'", () => {
    assert.equal(summarizeCron("*/5 * * * *"), "every 5 minutes");
  });

  test("*/15 * * * * → 'every 15 minutes'", () => {
    assert.equal(summarizeCron("*/15 * * * *"), "every 15 minutes");
  });

  test("0 * * * * → 'hourly'", () => {
    assert.equal(summarizeCron("0 * * * *"), "hourly");
  });

  test("0 */2 * * * → 'every 2 hours'", () => {
    assert.equal(summarizeCron("0 */2 * * *"), "every 2 hours");
  });

  test("0 9 * * * → 'daily at 9:00'", () => {
    assert.equal(summarizeCron("0 9 * * *"), "daily at 9:00");
  });

  test("30 8 * * * → 'daily at 8:30'", () => {
    assert.equal(summarizeCron("30 8 * * *"), "daily at 8:30");
  });

  test("0 9 * * 1 → 'Mondays at 9:00'", () => {
    assert.equal(summarizeCron("0 9 * * 1"), "Mondays at 9:00");
  });

  test("0 9 * * 0 → 'Sundays at 9:00'", () => {
    assert.equal(summarizeCron("0 9 * * 0"), "Sundays at 9:00");
  });

  test("0 9 1 * * → 'monthly on the 1st at 9:00'", () => {
    assert.equal(summarizeCron("0 9 1 * *"), "monthly on the 1st at 9:00");
  });

  test("unrecognized pattern → falls back to raw expression", () => {
    const expr = "0 9 * * 1-5";
    assert.equal(summarizeCron(expr), expr);
  });

  test("invalid expression returns the raw input (don't throw)", () => {
    assert.equal(summarizeCron("not a cron"), "not a cron");
  });
});
