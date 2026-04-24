// Tests for lib/agents/cron.ts — minimal POSIX 5-field cron utility.
// SLICE 5 PR 1 C2 per audit §3.3.
//
// Scope (intentionally minimal):
//   - isValidCronExpression: 5-field POSIX syntax validation
//   - isValidIanaTimezone: accept IANA zone names via Intl runtime
//   - computeNextFireAt: advance-minute-by-minute matching against
//     the expression, respecting IANA timezone offsets
//
// Why inline instead of a croner dependency: this worktree's pnpm
// virtual store can't accept new deps without a full reinstall
// (prior slice experience — SLICE 2 AST work hit the same
// constraint). ~150 LOC of pure logic covers the v1 schedule-
// trigger surface cleanly.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  isValidCronExpression,
  isValidIanaTimezone,
  computeNextFireAt,
  type CronField,
  parseCronField,
} from "../../src/lib/agents/cron";

// ---------------------------------------------------------------------
// isValidCronExpression
// ---------------------------------------------------------------------

describe("isValidCronExpression — 5-field POSIX syntax", () => {
  test("accepts common valid expressions", () => {
    const valid = [
      "* * * * *",              // every minute
      "0 * * * *",              // hourly on the hour
      "0 9 * * *",              // daily 9am
      "0 9 * * 1",              // Mondays 9am
      "*/5 * * * *",            // every 5 minutes
      "0 */2 * * *",            // every 2 hours
      "0 0 1 * *",              // first of month
      "0 0 * * 0",              // Sundays midnight
      "0 0 1 1 *",              // Jan 1 00:00
      "15,45 * * * *",          // :15 and :45
      "0 9-17 * * 1-5",         // weekday business hours
      "30 8 * * 1,3,5",         // MWF 8:30
      "0 0 1-7 * *",            // first week of month
    ];
    for (const expr of valid) {
      assert.ok(isValidCronExpression(expr), `expected ${JSON.stringify(expr)} to be valid`);
    }
  });

  test("rejects malformed expressions", () => {
    const invalid = [
      "",                       // empty
      "*",                      // too few fields
      "* * * *",                // 4 fields
      "* * * * * *",            // 6 fields
      "60 * * * *",             // minute out of range (0-59)
      "* 24 * * *",             // hour out of range (0-23)
      "* * 32 * *",             // day out of range (1-31)
      "* * * 13 *",             // month out of range (1-12)
      "* * * * 8",              // day-of-week out of range (0-6 or 7)
      "* * * * sunday",         // no named-day support v1
      "*/0 * * * *",            // zero step
      "5-2 * * * *",            // inverted range
      "@daily",                 // no shorthand support v1
      "abc",                    // junk
    ];
    for (const expr of invalid) {
      assert.ok(!isValidCronExpression(expr), `expected ${JSON.stringify(expr)} to be invalid`);
    }
  });
});

// ---------------------------------------------------------------------
// parseCronField — per-field parser utility
// ---------------------------------------------------------------------

describe("parseCronField", () => {
  test("asterisk matches all values", () => {
    const field = parseCronField("*", 0, 59);
    assert.ok(field);
    // Matches 0, 30, 59
    assert.ok(field!.matches(0));
    assert.ok(field!.matches(30));
    assert.ok(field!.matches(59));
  });

  test("integer matches single value", () => {
    const field = parseCronField("9", 0, 23);
    assert.ok(field!.matches(9));
    assert.ok(!field!.matches(8));
    assert.ok(!field!.matches(10));
  });

  test("range matches inclusive", () => {
    const field = parseCronField("9-17", 0, 23);
    assert.ok(field!.matches(9));
    assert.ok(field!.matches(13));
    assert.ok(field!.matches(17));
    assert.ok(!field!.matches(8));
    assert.ok(!field!.matches(18));
  });

  test("list matches any element", () => {
    const field = parseCronField("0,15,30,45", 0, 59);
    assert.ok(field!.matches(15));
    assert.ok(field!.matches(45));
    assert.ok(!field!.matches(10));
  });

  test("step from * matches every N from min", () => {
    const field = parseCronField("*/5", 0, 59);
    assert.ok(field!.matches(0));
    assert.ok(field!.matches(5));
    assert.ok(field!.matches(55));
    assert.ok(!field!.matches(7));
  });

  test("step from range matches every N in range", () => {
    const field = parseCronField("0-30/5", 0, 59);
    assert.ok(field!.matches(0));
    assert.ok(field!.matches(30));
    assert.ok(!field!.matches(35));
  });

  test("returns null on malformed input", () => {
    assert.equal(parseCronField("abc", 0, 59), null);
    assert.equal(parseCronField("5-2", 0, 59), null);
    assert.equal(parseCronField("60", 0, 59), null);
  });
});

// ---------------------------------------------------------------------
// isValidIanaTimezone
// ---------------------------------------------------------------------

describe("isValidIanaTimezone", () => {
  test("accepts common IANA zones", () => {
    const valid = ["UTC", "America/New_York", "Europe/London", "Asia/Tokyo", "Australia/Sydney"];
    for (const tz of valid) {
      assert.ok(isValidIanaTimezone(tz), `expected ${tz} to be valid`);
    }
  });

  test("rejects nonsense strings", () => {
    // Note: Node's Intl accepts some non-IANA tokens (GMT+0 aliases to UTC,
    // UTC+5 in some builds). Stick to clearly-invalid inputs.
    const invalid = ["", "NotAZone", "Mars/Olympus", "not/a/zone/at/all"];
    for (const tz of invalid) {
      assert.ok(!isValidIanaTimezone(tz), `expected ${tz} to be invalid`);
    }
  });
});

// ---------------------------------------------------------------------
// computeNextFireAt
// ---------------------------------------------------------------------

describe("computeNextFireAt", () => {
  test("daily 9am UTC fires at today 09:00 UTC when ref is earlier", () => {
    const after = new Date("2026-04-24T08:00:00Z");
    const next = computeNextFireAt("0 9 * * *", "UTC", after);
    assert.equal(next.toISOString(), "2026-04-24T09:00:00.000Z");
  });

  test("daily 9am UTC fires at tomorrow 09:00 UTC when ref is later", () => {
    const after = new Date("2026-04-24T10:00:00Z");
    const next = computeNextFireAt("0 9 * * *", "UTC", after);
    assert.equal(next.toISOString(), "2026-04-25T09:00:00.000Z");
  });

  test("every 5 minutes fires at next 5-min boundary", () => {
    const after = new Date("2026-04-24T08:07:30Z");
    const next = computeNextFireAt("*/5 * * * *", "UTC", after);
    assert.equal(next.toISOString(), "2026-04-24T08:10:00.000Z");
  });

  test("daily 9am America/New_York = 13:00 or 14:00 UTC depending on DST", () => {
    // July 1 (EDT, UTC-4): 9am EDT = 13:00 UTC
    const afterSummer = new Date("2026-07-01T00:00:00Z");
    const summerFire = computeNextFireAt("0 9 * * *", "America/New_York", afterSummer);
    assert.equal(summerFire.toISOString(), "2026-07-01T13:00:00.000Z");

    // January 1 (EST, UTC-5): 9am EST = 14:00 UTC
    const afterWinter = new Date("2026-01-01T00:00:00Z");
    const winterFire = computeNextFireAt("0 9 * * *", "America/New_York", afterWinter);
    assert.equal(winterFire.toISOString(), "2026-01-01T14:00:00.000Z");
  });

  test("weekday 9am (Mon-Fri) skips Saturday + Sunday", () => {
    // 2026-04-25 is a Saturday. Next weekday fire should be Monday 04-27.
    const after = new Date("2026-04-25T10:00:00Z");
    const next = computeNextFireAt("0 9 * * 1-5", "UTC", after);
    assert.equal(next.toISOString(), "2026-04-27T09:00:00.000Z");
  });

  test("first-of-month fires on the 1st at 00:00", () => {
    const after = new Date("2026-04-15T12:00:00Z");
    const next = computeNextFireAt("0 0 1 * *", "UTC", after);
    assert.equal(next.toISOString(), "2026-05-01T00:00:00.000Z");
  });

  test("invalid expression throws", () => {
    assert.throws(
      () => computeNextFireAt("not a cron", "UTC", new Date()),
      /invalid cron/i,
    );
  });

  test("invalid timezone throws", () => {
    assert.throws(
      () => computeNextFireAt("* * * * *", "Mars/Olympus", new Date()),
      /invalid.*timezone|timezone.*invalid/i,
    );
  });
});

// ---------------------------------------------------------------------
// CronField exported type is structurally useful
// ---------------------------------------------------------------------

describe("CronField type export", () => {
  test("parsed field exposes matches() API", () => {
    const f: CronField | null = parseCronField("0", 0, 59);
    assert.ok(f);
    assert.equal(typeof f!.matches, "function");
  });
});
