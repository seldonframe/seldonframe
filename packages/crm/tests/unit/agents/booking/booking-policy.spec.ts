import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  bookingPolicyFromIntake,
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
    // Mon–Fri 09:00–17:00, Sat/Sun closed (absent).
    assert.deepEqual(p.hours, {
      1: { start: "09:00", end: "17:00" },
      2: { start: "09:00", end: "17:00" },
      3: { start: "09:00", end: "17:00" },
      4: { start: "09:00", end: "17:00" },
      5: { start: "09:00", end: "17:00" },
    });
    assert.deepEqual(p.requiredFields, ["name", "phone"]);
    assert.equal(p.timezone, "America/Chicago");
  });

  test("no args at all → defaults with tz 'UTC'", () => {
    const p = resolveBookingPolicy();
    assert.equal(p.durationMinutes, SYSTEM_DEFAULTS.durationMinutes);
    assert.equal(p.timezone, "UTC");
    // returned containers must be fresh copies, not the shared SYSTEM_DEFAULTS ones
    assert.notEqual(p.hours, SYSTEM_DEFAULTS.hours);
    assert.notEqual(p.requiredFields, SYSTEM_DEFAULTS.requiredFields);
    // …and the nested window objects must be copies too (no shared references).
    assert.notEqual(p.hours[1], SYSTEM_DEFAULTS.hours[1]);
  });

  // ── backward-compat: legacy uniform-window input → per-day hours map ──
  test("legacy {weekdays,startTime,endTime} → hours keyed by each weekday", () => {
    const p = resolveBookingPolicy(
      { weekdays: [1, 2, 3], startTime: "08:00", endTime: "16:00" },
      null,
      "UTC",
    );
    assert.deepEqual(p.hours, {
      1: { start: "08:00", end: "16:00" },
      2: { start: "08:00", end: "16:00" },
      3: { start: "08:00", end: "16:00" },
    });
    // Days NOT in the legacy weekday set are closed (absent from the map).
    assert.deepEqual(Object.keys(p.hours).sort(), ["1", "2", "3"]);
  });

  // ── new shape: per-day hours map, Saturday-only ──
  test("new {hours:{6:{...}}} → Saturday open 10–2, weekdays closed", () => {
    const p = resolveBookingPolicy(
      { hours: { 6: { start: "10:00", end: "14:00" } } },
      null,
      "UTC",
    );
    assert.deepEqual(p.hours, { 6: { start: "10:00", end: "14:00" } });
    assert.deepEqual(Object.keys(p.hours), ["6"]); // only Saturday; weekdays closed
  });

  test("a per-day hours input preserves each day's distinct window", () => {
    const p = resolveBookingPolicy(
      {
        hours: {
          1: { start: "09:00", end: "17:00" },
          6: { start: "10:00", end: "14:00" },
        },
      },
      null,
      "UTC",
    );
    assert.deepEqual(p.hours, {
      1: { start: "09:00", end: "17:00" },
      6: { start: "10:00", end: "14:00" },
    });
  });

  test("deployment overrides template overrides defaults, field-by-field", () => {
    const p = resolveBookingPolicy(
      { durationMinutes: 60, maxPerDay: 6 }, // deployment (no hours → falls through)
      {
        durationMinutes: 45,
        bufferMinutes: 15,
        requiredFields: ["name", "phone", "address"],
      }, // template (no hours either)
      "UTC",
    );
    assert.equal(p.durationMinutes, 60); // deployment wins
    assert.equal(p.bufferMinutes, 15); // template fills
    assert.equal(p.maxPerDay, 6); // deployment
    assert.deepEqual(p.requiredFields, ["name", "phone", "address"]); // template
    // Neither input carried hours → system-default Mon–Fri window.
    assert.deepEqual(p.hours, {
      1: { start: "09:00", end: "17:00" },
      2: { start: "09:00", end: "17:00" },
      3: { start: "09:00", end: "17:00" },
      4: { start: "09:00", end: "17:00" },
      5: { start: "09:00", end: "17:00" },
    });
  });

  test("deployment hours win WHOLE over template hours (not per-day merged)", () => {
    const p = resolveBookingPolicy(
      { hours: { 6: { start: "10:00", end: "14:00" } } }, // deployment: Sat only
      {
        hours: {
          1: { start: "09:00", end: "17:00" },
          2: { start: "09:00", end: "17:00" },
        },
      }, // template: Mon+Tue
      "UTC",
    );
    // Deployment's hours replace the template's entirely — Mon/Tue are NOT merged in.
    assert.deepEqual(p.hours, { 6: { start: "10:00", end: "14:00" } });
  });

  test("template hours used when deployment carries none", () => {
    const p = resolveBookingPolicy(
      { durationMinutes: 60 }, // deployment: no hours
      { hours: { 3: { start: "09:00", end: "12:00" } } }, // template: Wed
      "UTC",
    );
    assert.deepEqual(p.hours, { 3: { start: "09:00", end: "12:00" } });
    assert.equal(p.durationMinutes, 60);
  });

  test("a deployment's new hours win over a template's LEGACY shape", () => {
    const p = resolveBookingPolicy(
      { hours: { 6: { start: "10:00", end: "14:00" } } }, // deployment: new shape
      { weekdays: [1, 2, 3, 4, 5], startTime: "09:00", endTime: "17:00" }, // template: legacy
      "UTC",
    );
    assert.deepEqual(p.hours, { 6: { start: "10:00", end: "14:00" } });
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

  test("clamps invalid values (bad window dropped, negative, bad tz, out-of-range day key)", () => {
    const p = resolveBookingPolicy(
      {
        durationMinutes: -5,
        bufferMinutes: -10,
        hours: {
          // valid Tuesday window
          2: { start: "09:00", end: "17:00" },
          // invalid (end<=start) → dropped
          3: { start: "18:00", end: "09:00" },
          // out-of-range weekday key → dropped
          9: { start: "09:00", end: "17:00" },
        } as Record<number, { start: string; end: string }>,
        timezone: "   ",
      },
      null,
      "UTC",
    );
    assert.ok(p.durationMinutes >= 1); // never < 1
    assert.equal(p.durationMinutes, 1); // -5 rounded/clamped to the floor
    assert.ok(p.bufferMinutes >= 0);
    assert.equal(p.bufferMinutes, 0);
    // Only the valid Tuesday window survives.
    assert.deepEqual(p.hours, { 2: { start: "09:00", end: "17:00" } });
    assert.equal(p.timezone, "UTC"); // blank tz → workspace tz
  });

  test("legacy window with end<=start is invalid → falls through to defaults", () => {
    const p = resolveBookingPolicy(
      { weekdays: [1, 2, 3], startTime: "18:00", endTime: "09:00" },
      null,
      "UTC",
    );
    // The bad legacy window yields no hours → fall back to system defaults.
    assert.deepEqual(p.hours, {
      1: { start: "09:00", end: "17:00" },
      2: { start: "09:00", end: "17:00" },
      3: { start: "09:00", end: "17:00" },
      4: { start: "09:00", end: "17:00" },
      5: { start: "09:00", end: "17:00" },
    });
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

  test("hours empty after filtering → falls back to default hours", () => {
    // Every supplied day key is out of range or has a bad window → defaults.
    const p = resolveBookingPolicy(
      {
        hours: {
          9: { start: "09:00", end: "17:00" },
          8: { start: "10:00", end: "14:00" },
        } as Record<number, { start: string; end: string }>,
      },
      null,
      "UTC",
    );
    assert.deepEqual(p.hours, {
      1: { start: "09:00", end: "17:00" },
      2: { start: "09:00", end: "17:00" },
      3: { start: "09:00", end: "17:00" },
      4: { start: "09:00", end: "17:00" },
      5: { start: "09:00", end: "17:00" },
    });
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
        hours: { 3: { start: "09:00", end: "12:00" } },
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
        hours: { 3: { start: "09:00", end: "11:00" } },
        timezone: "UTC",
      },
      null,
      "UTC",
    );
    const slots = generateCandidateSlots(policy, "2026-07-01", FAR_PAST);
    // step = 60: 09:00 (ends 09:30 ok), 10:00 (ends 10:30 ok), 11:00 would end 11:30 > 11:00 → excluded.
    assert.deepEqual(slots, ["2026-07-01T09:00:00.000Z", "2026-07-01T10:00:00.000Z"]);
  });

  test("closed weekday (absent from hours) → []", () => {
    // Monday-only policy; 2026-07-01 is a Wednesday → Wed is closed → [].
    const policy = resolveBookingPolicy(
      { hours: { 1: { start: "09:00", end: "17:00" } }, timezone: "UTC" },
      null,
      "UTC",
    );
    assert.deepEqual(generateCandidateSlots(policy, "2026-07-01", FAR_PAST), []);
  });

  // ── per-day: Saturday open, Sunday closed ──
  test("Saturday with only {6:{...}} → slots on Saturday", () => {
    // 2026-07-04 is a Saturday (weekday 6).
    const policy = resolveBookingPolicy(
      { hours: { 6: { start: "10:00", end: "14:00" } }, durationMinutes: 60, timezone: "UTC" },
      null,
      "UTC",
    );
    const slots = generateCandidateSlots(policy, "2026-07-04", FAR_PAST);
    assert.deepEqual(slots, [
      "2026-07-04T10:00:00.000Z",
      "2026-07-04T11:00:00.000Z",
      "2026-07-04T12:00:00.000Z",
      "2026-07-04T13:00:00.000Z",
    ]);
  });

  test("Sunday with only {6:{...}} (Saturday open) → [] (Sunday closed)", () => {
    // 2026-07-05 is a Sunday (weekday 0), absent from hours → closed.
    const policy = resolveBookingPolicy(
      { hours: { 6: { start: "10:00", end: "14:00" } }, durationMinutes: 60, timezone: "UTC" },
      null,
      "UTC",
    );
    assert.deepEqual(generateCandidateSlots(policy, "2026-07-05", FAR_PAST), []);
  });

  test("different per-day windows produce different slot lists", () => {
    // Saturday 10–12 (60-min → 10:00, 11:00); Wednesday 09–11 (60-min → 09:00, 10:00).
    const policy = resolveBookingPolicy(
      {
        durationMinutes: 60,
        hours: {
          3: { start: "09:00", end: "11:00" }, // Wed
          6: { start: "10:00", end: "12:00" }, // Sat
        },
        timezone: "UTC",
      },
      null,
      "UTC",
    );
    const wed = generateCandidateSlots(policy, "2026-07-01", FAR_PAST); // Wednesday
    const sat = generateCandidateSlots(policy, "2026-07-04", FAR_PAST); // Saturday
    assert.deepEqual(wed, ["2026-07-01T09:00:00.000Z", "2026-07-01T10:00:00.000Z"]);
    assert.deepEqual(sat, ["2026-07-04T10:00:00.000Z", "2026-07-04T11:00:00.000Z"]);
    assert.notDeepEqual(wed, sat); // the windows differ → the slots differ
  });

  test("fit rule: a slot whose END exceeds windowEnd is excluded", () => {
    const policy = resolveBookingPolicy(
      {
        durationMinutes: 90,
        bufferMinutes: 0,
        hours: { 3: { start: "09:00", end: "12:00" } },
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
        hours: { 3: { start: "09:00", end: "12:00" } },
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
        hours: { 3: { start: "09:00", end: "12:00" } },
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
        hours: { 3: { start: "09:00", end: "12:00" } },
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
        hours: { 3: { start: "09:00", end: "11:00" } },
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
    // 30-min duration in a 09:00–10:00 window → two CDT slots (14:00Z, 14:30Z).
    const sunPolicy = resolveBookingPolicy(
      { hours: { 0: { start: "09:00", end: "10:00" } }, timezone: "America/Chicago" },
      null,
      "America/Chicago",
    );
    assert.deepEqual(generateCandidateSlots(sunPolicy, "2026-07-05", FAR_PAST), [
      "2026-07-05T14:00:00.000Z", // 09:00 CDT
      "2026-07-05T14:30:00.000Z", // 09:30 CDT
    ]);
    // Same date with a Monday-only policy → []
    const monPolicy = resolveBookingPolicy(
      { hours: { 1: { start: "09:00", end: "10:00" } }, timezone: "America/Chicago" },
      null,
      "America/Chicago",
    );
    assert.deepEqual(generateCandidateSlots(monPolicy, "2026-07-05", FAR_PAST), []);
  });
});

describe("bookingPolicyFromIntake", () => {
  // The captured shape (clientContext.soul.business_hours): a structured
  // Record<weekday, {enabled, start, end}> as written by buildClientWorkspaceInput
  // / buildBusinessHoursSoulPatch / the onboarding hours parser. The mapper now
  // returns the per-day `hours` map directly (each enabled day → its own window).
  test("structured Mon-Fri 9-5 → hours for weekdays 1..5 at 09:00-17:00", () => {
    const hours = {
      sunday: { enabled: false, start: "09:00", end: "17:00" },
      monday: { enabled: true, start: "09:00", end: "17:00" },
      tuesday: { enabled: true, start: "09:00", end: "17:00" },
      wednesday: { enabled: true, start: "09:00", end: "17:00" },
      thursday: { enabled: true, start: "09:00", end: "17:00" },
      friday: { enabled: true, start: "09:00", end: "17:00" },
      saturday: { enabled: false, start: "09:00", end: "17:00" },
    };
    const out = bookingPolicyFromIntake({ soul: { business_hours: hours } });
    assert.deepEqual(out, {
      hours: {
        1: { start: "09:00", end: "17:00" },
        2: { start: "09:00", end: "17:00" },
        3: { start: "09:00", end: "17:00" },
        4: { start: "09:00", end: "17:00" },
        5: { start: "09:00", end: "17:00" },
      },
    });
  });

  test("structured with a Saturday + closed Sunday → per-day hours PRESERVING the Sat window", () => {
    const hours = {
      monday: { enabled: true, start: "08:00", end: "18:00" },
      tuesday: { enabled: true, start: "08:00", end: "18:00" },
      wednesday: { enabled: true, start: "08:00", end: "18:00" },
      thursday: { enabled: true, start: "08:00", end: "18:00" },
      friday: { enabled: true, start: "08:00", end: "18:00" },
      saturday: { enabled: true, start: "10:00", end: "14:00" },
      sunday: { enabled: false, start: "09:00", end: "17:00" },
    };
    const out = bookingPolicyFromIntake({ soul: { business_hours: hours } });
    // Each enabled day keeps its OWN window — the Saturday 10–2 is no longer
    // collapsed into the dominant Mon–Fri window.
    assert.deepEqual(out, {
      hours: {
        1: { start: "08:00", end: "18:00" },
        2: { start: "08:00", end: "18:00" },
        3: { start: "08:00", end: "18:00" },
        4: { start: "08:00", end: "18:00" },
        5: { start: "08:00", end: "18:00" },
        6: { start: "10:00", end: "14:00" },
      },
    });
  });

  test("free-text business_hours is parsed via the onboarding hours parser", () => {
    // "Mon-Fri 9-5" as a raw string → reuse parseHoursText → hours for 1..5.
    const out = bookingPolicyFromIntake({
      soul: { business_hours: "Mon-Fri 9-5" as unknown as Record<string, unknown> },
    });
    assert.deepEqual(out, {
      hours: {
        1: { start: "09:00", end: "17:00" },
        2: { start: "09:00", end: "17:00" },
        3: { start: "09:00", end: "17:00" },
        4: { start: "09:00", end: "17:00" },
        5: { start: "09:00", end: "17:00" },
      },
    });
  });

  test("empty / absent intake → {} (nothing confidently derived)", () => {
    assert.deepEqual(bookingPolicyFromIntake(null), {});
    assert.deepEqual(bookingPolicyFromIntake(undefined), {});
    assert.deepEqual(bookingPolicyFromIntake({}), {});
    assert.deepEqual(bookingPolicyFromIntake({ soul: {} }), {});
    assert.deepEqual(bookingPolicyFromIntake({ soul: { business_hours: {} } }), {});
  });

  test("no enabled day → {} (no window to derive)", () => {
    const hours = {
      monday: { enabled: false, start: "09:00", end: "17:00" },
      tuesday: { enabled: false, start: "09:00", end: "17:00" },
    };
    assert.deepEqual(bookingPolicyFromIntake({ soul: { business_hours: hours } }), {});
  });

  test("malformed structured entries are ignored; nothing usable → {}", () => {
    const hours = {
      monday: { enabled: true, start: "nope", end: "" },
      tuesday: "garbage",
      wednesday: { enabled: "yes", start: "09:00", end: "17:00" },
    };
    assert.deepEqual(
      bookingPolicyFromIntake({
        soul: { business_hours: hours as unknown as Record<string, unknown> },
      }),
      {},
    );
  });
});
