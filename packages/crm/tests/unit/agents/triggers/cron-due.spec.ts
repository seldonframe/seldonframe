// P2.1-T1 — tests for the pure `isCronDueWithin` window predicate (lib/agents/
// triggers/cron-due.ts). No I/O — these pin the cron-matching + window + tz logic
// directly with fixed epoch-ms instants.
//
// Pinned contract (the shapes the agent generator emits):
//   • weekly "0 9 * * 1" is DUE at Mon 09:02 with a 15-min window, NOT due Tue;
//   • daily  "0 9 * * *" is DUE at 09:05 with a 15-min window;
//   • the tz is respected (09:00 America/New_York ≠ 09:00 UTC);
//   • "*/15 * * * *" is due at any quarter-hour;
//   • a hit JUST outside the window is not due (window edge is exact);
//   • junk cron / invalid tz / NaN now → false (never throws).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { isCronDueWithin } from "../../../../src/lib/agents/triggers/cron-due";

/** Epoch ms for a UTC wall-clock — handy for tz-free cases. */
function utc(iso: string): number {
  return new Date(iso).getTime();
}

describe("isCronDueWithin — weekly cron (0 9 * * 1, Monday 09:00)", () => {
  // 2026-06-29 is a Monday. 2026-06-30 is a Tuesday.
  test("DUE at Mon 09:02 UTC with a 15-min window (09:00 hit is 2 min ago)", () => {
    assert.equal(
      isCronDueWithin("0 9 * * 1", utc("2026-06-29T09:02:00Z"), 15, "UTC"),
      true,
    );
  });

  test("DUE exactly at Mon 09:00 UTC (the hit minute itself, window 15)", () => {
    assert.equal(
      isCronDueWithin("0 9 * * 1", utc("2026-06-29T09:00:00Z"), 15, "UTC"),
      true,
    );
  });

  test("NOT due on Tuesday 09:02 UTC (wrong day-of-week)", () => {
    assert.equal(
      isCronDueWithin("0 9 * * 1", utc("2026-06-30T09:02:00Z"), 15, "UTC"),
      false,
    );
  });

  test("NOT due at Mon 09:16 UTC — the 09:00 hit is 16 min ago, past a 15-min window", () => {
    assert.equal(
      isCronDueWithin("0 9 * * 1", utc("2026-06-29T09:16:00Z"), 15, "UTC"),
      false,
    );
  });
});

describe("isCronDueWithin — daily cron (0 9 * * *, every day 09:00)", () => {
  test("DUE at 09:05 with a 15-min window (Tuesday, any day matches)", () => {
    assert.equal(
      isCronDueWithin("0 9 * * *", utc("2026-06-30T09:05:00Z"), 15, "UTC"),
      true,
    );
  });

  test("NOT due at 09:20 with a 15-min window (09:00 hit is 20 min ago)", () => {
    assert.equal(
      isCronDueWithin("0 9 * * *", utc("2026-06-30T09:20:00Z"), 15, "UTC"),
      false,
    );
  });

  test("NOT due at 08:55 (the hit is in the FUTURE, scan only goes backward)", () => {
    assert.equal(
      isCronDueWithin("0 9 * * *", utc("2026-06-30T08:55:00Z"), 15, "UTC"),
      false,
    );
  });
});

describe("isCronDueWithin — timezone is respected", () => {
  // "0 9 * * *" means 09:00 LOCAL. At 13:02 UTC it's 09:02 in America/New_York
  // (EDT = UTC-4 in June), so the cron IS due there but NOT in UTC.
  test("DUE at 13:02 UTC interpreted as America/New_York 09:02 (EDT, 15-min window)", () => {
    assert.equal(
      isCronDueWithin("0 9 * * *", utc("2026-06-30T13:02:00Z"), 15, "America/New_York"),
      true,
    );
  });

  test("the SAME instant is NOT due in UTC (13:02 UTC is not 09:00)", () => {
    assert.equal(
      isCronDueWithin("0 9 * * *", utc("2026-06-30T13:02:00Z"), 15, "UTC"),
      false,
    );
  });
});

describe("isCronDueWithin — step cron (*/15 * * * *)", () => {
  test("DUE at any quarter-hour (10:30:00) within window", () => {
    assert.equal(
      isCronDueWithin("*/15 * * * *", utc("2026-06-30T10:30:00Z"), 15, "UTC"),
      true,
    );
  });

  test("DUE at 10:33 with a 15-min window (the 10:30 hit is 3 min ago)", () => {
    assert.equal(
      isCronDueWithin("*/15 * * * *", utc("2026-06-30T10:33:00Z"), 15, "UTC"),
      true,
    );
  });
});

describe("isCronDueWithin — window-0 and edge behavior", () => {
  test("window 0 tests ONLY the current minute — DUE when now is exactly the hit", () => {
    assert.equal(
      isCronDueWithin("0 9 * * *", utc("2026-06-30T09:00:00Z"), 0, "UTC"),
      true,
    );
  });

  test("window 0 is NOT due one minute after the hit (09:01)", () => {
    assert.equal(
      isCronDueWithin("0 9 * * *", utc("2026-06-30T09:01:00Z"), 0, "UTC"),
      false,
    );
  });

  test("seconds are ignored — 09:14:59 with a 15-min window still sees the 09:00 hit", () => {
    assert.equal(
      isCronDueWithin("0 9 * * *", utc("2026-06-30T09:14:59Z"), 15, "UTC"),
      true,
    );
  });
});

describe("isCronDueWithin — malformed input → false (never throws)", () => {
  test("junk cron → false", () => {
    assert.equal(isCronDueWithin("not a cron", utc("2026-06-30T09:00:00Z"), 15, "UTC"), false);
  });

  test("wrong field count → false", () => {
    assert.equal(isCronDueWithin("0 9 * *", utc("2026-06-30T09:00:00Z"), 15, "UTC"), false);
  });

  test("empty cron → false", () => {
    assert.equal(isCronDueWithin("", utc("2026-06-30T09:00:00Z"), 15, "UTC"), false);
  });

  test("out-of-range field (minute 99) → false", () => {
    assert.equal(isCronDueWithin("99 9 * * *", utc("2026-06-30T09:00:00Z"), 15, "UTC"), false);
  });

  test("invalid IANA tz → false", () => {
    assert.equal(
      isCronDueWithin("0 9 * * *", utc("2026-06-30T09:00:00Z"), 15, "Not/AZone"),
      false,
    );
  });

  test("NaN now → false", () => {
    assert.equal(isCronDueWithin("0 9 * * *", Number.NaN, 15, "UTC"), false);
  });

  test("does not throw on any of the malformed inputs", () => {
    assert.doesNotThrow(() => {
      isCronDueWithin("junk", Number.NaN, -5, "Bad/Zone");
      isCronDueWithin(undefined as unknown as string, 0, 0, "UTC");
    });
  });
});
