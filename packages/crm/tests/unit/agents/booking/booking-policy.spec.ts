import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  generateCandidateSlots,
  resolveBookingPolicy,
  SYSTEM_DEFAULTS,
} from "../../../../src/lib/agents/booking/booking-policy";

describe("resolveBookingPolicy", () => {
  test("empty inputs → system defaults (workspace tz applied)", () => {
    const p = resolveBookingPolicy(null, null, "America/Chicago");
    assert.equal(p.durationMinutes, 30);
    assert.equal(p.bufferMinutes, 0);
    assert.equal(p.maxPerDay, null);
    assert.equal(p.leadTimeHours, 0);
    assert.deepEqual(p.weekdays, [1, 2, 3, 4, 5]);
    assert.equal(p.startTime, "09:00");
    assert.equal(p.endTime, "17:00");
    assert.deepEqual(p.requiredFields, ["name", "phone"]);
    assert.equal(p.timezone, "America/Chicago");
  });

  test("no args at all → defaults with tz 'UTC'", () => {
    const p = resolveBookingPolicy();
    assert.equal(p.durationMinutes, SYSTEM_DEFAULTS.durationMinutes);
    assert.equal(p.timezone, "UTC");
    // returned arrays must be fresh copies, not the shared SYSTEM_DEFAULTS arrays
    assert.notEqual(p.weekdays, SYSTEM_DEFAULTS.weekdays);
    assert.notEqual(p.requiredFields, SYSTEM_DEFAULTS.requiredFields);
  });

  test("deployment overrides template overrides defaults, field-by-field", () => {
    const p = resolveBookingPolicy(
      { durationMinutes: 60, maxPerDay: 6 }, // deployment
      {
        durationMinutes: 45,
        bufferMinutes: 15,
        requiredFields: ["name", "phone", "address"],
      }, // template
      "UTC",
    );
    assert.equal(p.durationMinutes, 60); // deployment wins
    assert.equal(p.bufferMinutes, 15); // template fills
    assert.equal(p.maxPerDay, 6); // deployment
    assert.deepEqual(p.requiredFields, ["name", "phone", "address"]); // template
    assert.equal(p.startTime, "09:00"); // system default
    assert.equal(p.endTime, "17:00"); // system default
  });

  test("timezone precedence: deployment > template > workspace > 'UTC'", () => {
    assert.equal(
      resolveBookingPolicy(
        { timezone: "America/New_York" },
        { timezone: "America/Chicago" },
        "Europe/London",
      ).timezone,
      "America/New_York",
    );
    assert.equal(
      resolveBookingPolicy(null, { timezone: "America/Chicago" }, "Europe/London").timezone,
      "America/Chicago",
    );
    assert.equal(resolveBookingPolicy(null, null, "Europe/London").timezone, "Europe/London");
    assert.equal(resolveBookingPolicy(null, null, undefined).timezone, "UTC");
  });

  test("clamps invalid values (end<=start, negative, bad tz, out-of-range weekdays)", () => {
    const p = resolveBookingPolicy(
      {
        durationMinutes: -5,
        bufferMinutes: -10,
        startTime: "18:00",
        endTime: "09:00",
        weekdays: [9, -1, 2],
        timezone: "   ",
      },
      null,
      "UTC",
    );
    assert.ok(p.durationMinutes >= 1); // never < 1
    assert.equal(p.durationMinutes, 1); // -5 rounded/clamped to the floor
    assert.ok(p.bufferMinutes >= 0);
    assert.equal(p.bufferMinutes, 0);
    assert.ok(p.endTime > p.startTime); // window repaired to a default
    assert.equal(p.startTime, "09:00");
    assert.equal(p.endTime, "17:00");
    assert.deepEqual(p.weekdays, [2]); // out-of-range days dropped, deduped, sorted
    assert.equal(p.timezone, "UTC"); // blank tz → workspace tz
  });

  test("rounds fractional duration/buffer; floors fractional positive maxPerDay", () => {
    const p = resolveBookingPolicy(
      { durationMinutes: 44.6, bufferMinutes: 5.4, maxPerDay: 3.9 },
      null,
      "UTC",
    );
    assert.equal(p.durationMinutes, 45); // rounded
    assert.equal(p.bufferMinutes, 5); // rounded
    assert.equal(p.maxPerDay, 4); // positive → rounded
  });

  test("maxPerDay: zero or negative → null (no cap)", () => {
    assert.equal(resolveBookingPolicy({ maxPerDay: 0 }, null, "UTC").maxPerDay, null);
    assert.equal(resolveBookingPolicy({ maxPerDay: -3 }, null, "UTC").maxPerDay, null);
  });

  test("weekdays empty after filtering → falls back to default weekdays", () => {
    const p = resolveBookingPolicy({ weekdays: [9, -2, 1.5] }, null, "UTC");
    assert.deepEqual(p.weekdays, [1, 2, 3, 4, 5]);
  });

  test("requiredFields are trimmed, lowercased, de-blanked; empty → default", () => {
    const p = resolveBookingPolicy(
      { requiredFields: ["  Name ", "PHONE", "", "   ", "Address"] },
      null,
      "UTC",
    );
    assert.deepEqual(p.requiredFields, ["name", "phone", "address"]);
    const empty = resolveBookingPolicy({ requiredFields: ["  ", ""] }, null, "UTC");
    assert.deepEqual(empty.requiredFields, ["name", "phone"]);
  });
});

describe("generateCandidateSlots", () => {
  // 2026-07-01 is a Wednesday (weekday 3).
  const FAR_PAST = new Date("2026-06-01T00:00:00Z");

  test("weekday window stepped by duration+buffer (UTC, exact ISO array)", () => {
    const policy = resolveBookingPolicy(
      {
        durationMinutes: 60,
        bufferMinutes: 0,
        startTime: "09:00",
        endTime: "12:00",
        weekdays: [3],
        timezone: "UTC",
      },
      null,
      "UTC",
    );
    const slots = generateCandidateSlots(policy, "2026-07-01", FAR_PAST);
    // 12:00 start excluded: a 60-min slot from 12:00 ends 13:00 > 12:00 windowEnd.
    assert.deepEqual(slots, [
      "2026-07-01T09:00:00.000Z",
      "2026-07-01T10:00:00.000Z",
      "2026-07-01T11:00:00.000Z",
    ]);
  });

  test("buffer widens the step (duration 30 + buffer 30 = 60-min cadence)", () => {
    const policy = resolveBookingPolicy(
      {
        durationMinutes: 30,
        bufferMinutes: 30,
        startTime: "09:00",
        endTime: "11:00",
        weekdays: [3],
        timezone: "UTC",
      },
      null,
      "UTC",
    );
    const slots = generateCandidateSlots(policy, "2026-07-01", FAR_PAST);
    // step = 60: 09:00 (ends 09:30 ok), 10:00 (ends 10:30 ok), 11:00 would end 11:30 > 11:00 → excluded.
    assert.deepEqual(slots, ["2026-07-01T09:00:00.000Z", "2026-07-01T10:00:00.000Z"]);
  });

  test("wrong weekday → []", () => {
    const policy = resolveBookingPolicy({ weekdays: [1], timezone: "UTC" }, null, "UTC"); // Monday only
    assert.deepEqual(generateCandidateSlots(policy, "2026-07-01", FAR_PAST), []); // Wed
  });

  test("fit rule: a slot whose END exceeds windowEnd is excluded", () => {
    const policy = resolveBookingPolicy(
      {
        durationMinutes: 90,
        bufferMinutes: 0,
        startTime: "09:00",
        endTime: "12:00",
        weekdays: [3],
        timezone: "UTC",
      },
      null,
      "UTC",
    );
    const slots = generateCandidateSlots(policy, "2026-07-01", FAR_PAST);
    // 09:00 ends 10:30 ok; 10:30 ends 12:00 == windowEnd ok (fits); 12:00 ends 13:30 excluded.
    assert.deepEqual(slots, ["2026-07-01T09:00:00.000Z", "2026-07-01T10:30:00.000Z"]);
  });

  test("lead-time cutoff: include iff start >= now + leadTimeHours (exact boundary)", () => {
    const policy = resolveBookingPolicy(
      {
        durationMinutes: 60,
        startTime: "09:00",
        endTime: "12:00",
        weekdays: [3],
        leadTimeHours: 2,
        timezone: "UTC",
      },
      null,
      "UTC",
    );
    // now = 08:30Z, +2h cutoff = 10:30Z. 09:00 & 10:00 are < cutoff → dropped; 11:00 >= cutoff → kept.
    const slots = generateCandidateSlots(
      policy,
      "2026-07-01",
      new Date("2026-07-01T08:30:00Z"),
    );
    assert.deepEqual(slots, ["2026-07-01T11:00:00.000Z"]);
  });

  test("lead-time boundary is inclusive: start exactly == now+lead is kept", () => {
    const policy = resolveBookingPolicy(
      {
        durationMinutes: 60,
        startTime: "09:00",
        endTime: "12:00",
        weekdays: [3],
        leadTimeHours: 1,
        timezone: "UTC",
      },
      null,
      "UTC",
    );
    // now = 09:00Z, +1h cutoff = 10:00Z exactly → 10:00 kept, 09:00 dropped, 11:00 kept.
    const slots = generateCandidateSlots(
      policy,
      "2026-07-01",
      new Date("2026-07-01T09:00:00Z"),
    );
    assert.deepEqual(slots, ["2026-07-01T10:00:00.000Z", "2026-07-01T11:00:00.000Z"]);
  });

  test("non-UTC timezone: wall-clock window converts to correct UTC instants (Chicago summer = UTC-5)", () => {
    const policy = resolveBookingPolicy(
      {
        durationMinutes: 60,
        bufferMinutes: 0,
        startTime: "09:00",
        endTime: "12:00",
        weekdays: [3],
        timezone: "America/Chicago",
      },
      null,
      "America/Chicago",
    );
    // 2026-07-01 is CDT (UTC-5): 09:00 Chicago = 14:00Z, 10:00 = 15:00Z, 11:00 = 16:00Z.
    const slots = generateCandidateSlots(policy, "2026-07-01", FAR_PAST);
    assert.deepEqual(slots, [
      "2026-07-01T14:00:00.000Z",
      "2026-07-01T15:00:00.000Z",
      "2026-07-01T16:00:00.000Z",
    ]);
  });

  test("non-UTC timezone in winter respects DST shift (Chicago Jan = UTC-6)", () => {
    const policy = resolveBookingPolicy(
      {
        durationMinutes: 60,
        bufferMinutes: 0,
        startTime: "09:00",
        endTime: "11:00",
        weekdays: [3],
        timezone: "America/Chicago",
      },
      null,
      "America/Chicago",
    );
    // 2026-01-07 is a Wednesday in CST (UTC-6): 09:00 Chicago = 15:00Z, 10:00 = 16:00Z.
    // `now` must precede the target date (a Jan date is unbookable if "now" is later).
    const slots = generateCandidateSlots(
      policy,
      "2026-01-07",
      new Date("2026-01-01T00:00:00Z"),
    );
    assert.deepEqual(slots, ["2026-01-07T15:00:00.000Z", "2026-01-07T16:00:00.000Z"]);
  });

  test("weekday is evaluated in the policy timezone, not UTC", () => {
    // 2026-07-05 is a Sunday (weekday 0) in both UTC and Chicago.
    // Default 30-min duration in a 09:00–10:00 window → two CDT slots (14:00Z, 14:30Z).
    const sunPolicy = resolveBookingPolicy(
      { weekdays: [0], startTime: "09:00", endTime: "10:00", timezone: "America/Chicago" },
      null,
      "America/Chicago",
    );
    assert.deepEqual(generateCandidateSlots(sunPolicy, "2026-07-05", FAR_PAST), [
      "2026-07-05T14:00:00.000Z", // 09:00 CDT
      "2026-07-05T14:30:00.000Z", // 09:30 CDT
    ]);
    // Same date with a Monday-only policy → []
    const monPolicy = resolveBookingPolicy(
      { weekdays: [1], startTime: "09:00", endTime: "10:00", timezone: "America/Chicago" },
      null,
      "America/Chicago",
    );
    assert.deepEqual(generateCandidateSlots(monPolicy, "2026-07-05", FAR_PAST), []);
  });
});
