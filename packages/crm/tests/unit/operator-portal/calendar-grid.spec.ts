import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildMonthGrid, buildWeekStrip, type CalendarBooking } from "../../../src/lib/operator-portal/calendar";

const TZ = "America/New_York"; // UTC-5 in winter, UTC-4 in summer

function makeBooking(isoStart: string, id = isoStart): CalendarBooking {
  return {
    id,
    startsAt: new Date(isoStart),
    endsAt: new Date(new Date(isoStart).getTime() + 60 * 60_000),
    title: "Test",
    fullName: "Jane Doe",
    contactId: "c1",
    status: "scheduled",
  };
}

describe("buildMonthGrid", () => {
  test("generates 5 or 6 week rows for June 2026 in America/New_York", () => {
    const anchor = new Date("2026-06-15T12:00:00Z");
    const grid = buildMonthGrid([], anchor, TZ);
    // June 2026: starts on Monday (2026-06-01), 30 days → 5 rows
    assert.ok(grid.weeks.length >= 4 && grid.weeks.length <= 6, `Expected 4-6 weeks, got ${grid.weeks.length}`);
    assert.equal(grid.year, 2026);
    assert.equal(grid.month, 6); // 1-indexed
  });

  test("each week has 7 days", () => {
    const anchor = new Date("2026-06-15T12:00:00Z");
    const grid = buildMonthGrid([], anchor, TZ);
    for (const week of grid.weeks) {
      assert.equal(week.days.length, 7);
    }
  });

  test("booking on 2026-06-15 appears on correct day cell", () => {
    const booking = makeBooking("2026-06-15T14:00:00Z"); // 10am ET (UTC-4)
    const anchor = new Date("2026-06-15T12:00:00Z");
    const grid = buildMonthGrid([booking], anchor, TZ);

    // Find the day cell for June 15
    let found = false;
    for (const week of grid.weeks) {
      for (const day of week.days) {
        if (day.year === 2026 && day.month === 6 && day.day === 15) {
          assert.equal(day.bookings.length, 1);
          found = true;
        }
      }
    }
    assert.equal(found, true, "Day cell for June 15 not found in grid");
  });

  test("booking at 2026-01-01T01:00:00Z appears on Dec 31 in UTC-5 (not Jan 1)", () => {
    // 01:00 UTC = 20:00 ET (previous day) because UTC-5 in winter
    const booking = makeBooking("2026-01-01T01:00:00Z", "dec31-booking");
    const anchor = new Date("2025-12-15T12:00:00Z");
    const grid = buildMonthGrid([booking], anchor, TZ);

    // Booking falls on Dec 31 in ET
    let dec31Cell = null;
    for (const week of grid.weeks) {
      for (const day of week.days) {
        if (day.year === 2025 && day.month === 12 && day.day === 31) {
          dec31Cell = day;
        }
      }
    }
    assert.ok(dec31Cell !== null, "Dec 31 cell not found");
    assert.equal(dec31Cell!.bookings.length, 1);
  });

  test("month boundary — booking on last day of month appears in correct cell", () => {
    const booking = makeBooking("2026-06-30T20:00:00Z"); // 4pm ET
    const anchor = new Date("2026-06-15T12:00:00Z");
    const grid = buildMonthGrid([booking], anchor, TZ);
    let june30Cell = null;
    for (const week of grid.weeks) {
      for (const day of week.days) {
        if (day.year === 2026 && day.month === 6 && day.day === 30) {
          june30Cell = day;
        }
      }
    }
    assert.ok(june30Cell !== null, "June 30 cell not found");
    assert.equal(june30Cell!.bookings.length, 1);
  });
});

describe("buildWeekStrip", () => {
  test("always returns exactly 7 days", () => {
    const anchor = new Date("2026-06-15T12:00:00Z");
    const strip = buildWeekStrip([], anchor, TZ);
    assert.equal(strip.days.length, 7);
  });

  test("days span Mon–Sun of the week containing the anchor", () => {
    // June 15, 2026 is a Monday
    const anchor = new Date("2026-06-15T12:00:00Z");
    const strip = buildWeekStrip([], anchor, TZ);
    assert.equal(strip.days[0]?.day, 15); // Monday June 15
    assert.equal(strip.days[6]?.day, 21); // Sunday June 21
  });

  test("booking in the week appears on correct day", () => {
    const booking = makeBooking("2026-06-17T13:00:00Z"); // Wed June 17, 9am ET
    const anchor = new Date("2026-06-15T12:00:00Z");
    const strip = buildWeekStrip([booking], anchor, TZ);
    const wed = strip.days.find((d) => d.day === 17 && d.month === 6);
    assert.ok(wed !== undefined);
    assert.equal(wed!.bookings.length, 1);
  });

  test("booking outside the week does not appear", () => {
    const booking = makeBooking("2026-06-22T13:00:00Z"); // Next Monday
    const anchor = new Date("2026-06-15T12:00:00Z");
    const strip = buildWeekStrip([booking], anchor, TZ);
    const total = strip.days.reduce((s, d) => s + d.bookings.length, 0);
    assert.equal(total, 0);
  });
});
