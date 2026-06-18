// Tests for WORKSPACE-LEVEL booking availability + rules.
//
// Feature: availability + booking rules move from per-appointment-type
// (bookings.metadata.availability) to one workspace-wide set stored on
// organizations.settings.booking. The public slot generator reads the
// workspace rules; appointment types keep their own durationMinutes and
// buffer falls back to the workspace default.
//
// Pattern mirrors the rest of tests/unit: node:test + node:assert/strict,
// pure logic injected with rules + booked rows + a fixed clock (no DB
// mocking — the thin DB read/write wrappers are integration territory, as
// in partner-agency-branding.spec.ts).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  defaultWorkspaceBookingRules,
  resolveWorkspaceBookingRules,
  getWorkspaceBookingRules,
  computeSlotsForDay,
  type WorkspaceBookingRules,
} from "../../src/lib/bookings/workspace-rules";

// ---------------------------------------------------------------------
// (a) getWorkspaceBookingRules / resolveWorkspaceBookingRules — defaults
// ---------------------------------------------------------------------

describe("workspace booking rules — documented defaults when settings.booking is unset", () => {
  const expectDefaults = (rules: WorkspaceBookingRules) => {
    // Mon-Fri enabled 09:00-17:00, Sat/Sun disabled.
    assert.equal(rules.availability.monday.enabled, true);
    assert.equal(rules.availability.monday.start, "09:00");
    assert.equal(rules.availability.monday.end, "17:00");
    assert.equal(rules.availability.friday.enabled, true);
    assert.equal(rules.availability.saturday.enabled, false);
    assert.equal(rules.availability.sunday.enabled, false);
    // Scalars.
    assert.equal(rules.minNoticeMinutes, 0);
    assert.equal(rules.defaultBufferMinutes, 0);
    assert.equal(rules.defaultDurationMinutes, 30);
    assert.equal(rules.maxBookingsPerDay, null);
  };

  test("defaultWorkspaceBookingRules() returns the documented defaults", () => {
    expectDefaults(defaultWorkspaceBookingRules());
  });

  test("resolveWorkspaceBookingRules(undefined settings) returns defaults", () => {
    expectDefaults(resolveWorkspaceBookingRules(undefined));
  });

  test("resolveWorkspaceBookingRules(settings without booking key) returns defaults", () => {
    expectDefaults(resolveWorkspaceBookingRules({ crmPersonality: "warm" }));
  });

  test("getWorkspaceBookingRules(orgId) returns defaults when settings.booking is unset", async () => {
    // Inject a settings loader so we don't touch the DB. The wrapper's only
    // job is read-settings -> resolve, so this exercises the documented
    // default path end to end.
    const rules = await getWorkspaceBookingRules("org-1", {
      loadSettings: async () => ({}),
    });
    expectDefaults(rules);
  });

  test("getWorkspaceBookingRules(orgId) returns defaults when the org row is missing", async () => {
    const rules = await getWorkspaceBookingRules("nope", {
      loadSettings: async () => null,
    });
    expectDefaults(rules);
  });
});

describe("workspace booking rules — normalization of stored values", () => {
  test("reads a fully-specified stored booking object", () => {
    const rules = resolveWorkspaceBookingRules({
      booking: {
        availability: {
          monday: { enabled: false, start: "10:00", end: "14:00" },
          saturday: { enabled: true, start: "08:00", end: "12:00" },
        },
        minNoticeMinutes: 120,
        defaultBufferMinutes: 15,
        defaultDurationMinutes: 60,
        maxBookingsPerDay: 5,
      },
    });
    assert.equal(rules.availability.monday.enabled, false);
    assert.equal(rules.availability.monday.start, "10:00");
    assert.equal(rules.availability.monday.end, "14:00");
    assert.equal(rules.availability.saturday.enabled, true);
    assert.equal(rules.availability.saturday.start, "08:00");
    assert.equal(rules.minNoticeMinutes, 120);
    assert.equal(rules.defaultBufferMinutes, 15);
    assert.equal(rules.defaultDurationMinutes, 60);
    assert.equal(rules.maxBookingsPerDay, 5);
  });

  test("clamps buffer to 0-120 and duration to 30-180; negative minNotice -> 0", () => {
    const rules = resolveWorkspaceBookingRules({
      booking: {
        defaultBufferMinutes: 999,
        defaultDurationMinutes: 5,
        minNoticeMinutes: -50,
        maxBookingsPerDay: 0,
      },
    });
    assert.equal(rules.defaultBufferMinutes, 120);
    assert.equal(rules.defaultDurationMinutes, 30);
    assert.equal(rules.minNoticeMinutes, 0);
    // maxBookingsPerDay <= 0 is treated as "no cap" -> null.
    assert.equal(rules.maxBookingsPerDay, null);
  });

  test("duration above 180 clamps to 180", () => {
    const rules = resolveWorkspaceBookingRules({
      booking: { defaultDurationMinutes: 240 },
    });
    assert.equal(rules.defaultDurationMinutes, 180);
  });
});

// ---------------------------------------------------------------------
// computeSlotsForDay — pure slot math (rules + booked rows + clock)
// ---------------------------------------------------------------------

// A Monday in UTC. 2026-06-22 is a Monday.
const MONDAY = "2026-06-22";
// A Sunday in UTC. 2026-06-21 is a Sunday.
const SUNDAY = "2026-06-21";

function rulesWith(overrides: Partial<WorkspaceBookingRules> = {}): WorkspaceBookingRules {
  return { ...defaultWorkspaceBookingRules(), ...overrides };
}

describe("computeSlotsForDay — workspace availability drives day on/off + hours", () => {
  test("a disabled day yields no slots", () => {
    const result = computeSlotsForDay({
      rules: rulesWith(),
      date: SUNDAY, // Sunday is disabled by default
      timezone: "UTC",
      durationMinutes: 30,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      bookedRows: [],
      now: new Date("2026-06-20T00:00:00Z"),
    });
    assert.equal(result.slots.length, 0);
  });

  test("an enabled day uses its start/end hours", () => {
    // Custom Monday window 09:00-11:00 in UTC, 30-min slots => 09:00, 09:30,
    // 10:00, 10:30 (10:30 slot ends 11:00, fits). That's 4 slots.
    const rules = rulesWith({
      availability: {
        ...defaultWorkspaceBookingRules().availability,
        monday: { enabled: true, start: "09:00", end: "11:00" },
      },
    });
    const result = computeSlotsForDay({
      rules,
      date: MONDAY,
      timezone: "UTC",
      durationMinutes: 30,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      bookedRows: [],
      now: new Date("2026-06-20T00:00:00Z"), // well before the day
    });
    assert.equal(result.slots.length, 4);
    // First slot is 09:00 UTC on the Monday.
    assert.equal(result.slots[0], "2026-06-22T09:00:00.000Z");
    // Last slot is 10:30 UTC.
    assert.equal(result.slots[result.slots.length - 1], "2026-06-22T10:30:00.000Z");
  });

  test("hours shift the window: a later start produces fewer/later slots", () => {
    const rules = rulesWith({
      availability: {
        ...defaultWorkspaceBookingRules().availability,
        monday: { enabled: true, start: "15:00", end: "17:00" },
      },
    });
    const result = computeSlotsForDay({
      rules,
      date: MONDAY,
      timezone: "UTC",
      durationMinutes: 60,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      bookedRows: [],
      now: new Date("2026-06-20T00:00:00Z"),
    });
    // 60-min slots in 15:00-17:00 => 15:00, 16:00 => 2 slots.
    assert.equal(result.slots.length, 2);
    assert.equal(result.slots[0], "2026-06-22T15:00:00.000Z");
    assert.equal(result.slots[1], "2026-06-22T16:00:00.000Z");
  });
});

describe("computeSlotsForDay — minNoticeMinutes", () => {
  test("a slot within minNoticeMinutes of now is excluded; one beyond it is included", () => {
    // now = Monday 09:10 UTC. minNotice = 60 min => cutoff 10:10.
    // Window 09:00-12:00, 30-min slots. 09:00/09:30 are in the past
    // (<= now). 10:00 is after now but before cutoff (excluded).
    // 10:30, 11:00, 11:30 are beyond cutoff (included).
    const rules = rulesWith({
      minNoticeMinutes: 60,
      availability: {
        ...defaultWorkspaceBookingRules().availability,
        monday: { enabled: true, start: "09:00", end: "12:00" },
      },
    });
    const result = computeSlotsForDay({
      rules,
      date: MONDAY,
      timezone: "UTC",
      durationMinutes: 30,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      bookedRows: [],
      now: new Date("2026-06-22T09:10:00Z"),
    });
    assert.ok(
      !result.slots.includes("2026-06-22T10:00:00.000Z"),
      "10:00 is within the 60-min notice window and must be excluded",
    );
    assert.ok(
      result.slots.includes("2026-06-22T10:30:00.000Z"),
      "10:30 is beyond the 60-min notice window and must be included",
    );
    assert.ok(
      result.slots.includes("2026-06-22T11:00:00.000Z"),
      "11:00 is beyond the notice window and must be included",
    );
    // The two past slots are gone.
    assert.ok(!result.slots.includes("2026-06-22T09:00:00.000Z"));
    assert.ok(!result.slots.includes("2026-06-22T09:30:00.000Z"));
  });

  test("minNoticeMinutes = 0 only excludes strictly-past slots", () => {
    // now = Monday 09:00 UTC exactly. With 0 notice, 09:00 (== now) is
    // excluded (past/now), 09:30 is included.
    const rules = rulesWith({
      minNoticeMinutes: 0,
      availability: {
        ...defaultWorkspaceBookingRules().availability,
        monday: { enabled: true, start: "09:00", end: "11:00" },
      },
    });
    const result = computeSlotsForDay({
      rules,
      date: MONDAY,
      timezone: "UTC",
      durationMinutes: 30,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      bookedRows: [],
      now: new Date("2026-06-22T09:00:00Z"),
    });
    assert.ok(!result.slots.includes("2026-06-22T09:00:00.000Z"));
    assert.ok(result.slots.includes("2026-06-22T09:30:00.000Z"));
  });
});

describe("computeSlotsForDay — conflict/buffer/daily-cap still enforced", () => {
  test("excludes slots overlapping an existing booking (with buffers)", () => {
    const rules = rulesWith({
      availability: {
        ...defaultWorkspaceBookingRules().availability,
        monday: { enabled: true, start: "09:00", end: "12:00" },
      },
    });
    const result = computeSlotsForDay({
      rules,
      date: MONDAY,
      timezone: "UTC",
      durationMinutes: 30,
      bufferBeforeMinutes: 15,
      bufferAfterMinutes: 15,
      // Existing booking 10:00-10:30. With 15-min buffers on both ends the
      // blocked window is 09:45-10:45, knocking out the 09:30 (ends 10:00 >
      // 09:45), 10:00, and 10:30 slots.
      bookedRows: [
        {
          startsAt: new Date("2026-06-22T10:00:00Z"),
          endsAt: new Date("2026-06-22T10:30:00Z"),
        },
      ],
      now: new Date("2026-06-20T00:00:00Z"),
    });
    assert.ok(!result.slots.includes("2026-06-22T09:30:00.000Z"));
    assert.ok(!result.slots.includes("2026-06-22T10:00:00.000Z"));
    assert.ok(!result.slots.includes("2026-06-22T10:30:00.000Z"));
    // 09:00 (ends 09:30, before 09:45) survives.
    assert.ok(result.slots.includes("2026-06-22T09:00:00.000Z"));
    // 11:00 survives.
    assert.ok(result.slots.includes("2026-06-22T11:00:00.000Z"));
  });

  test("maxBookingsPerDay cap: once reached, no slots are offered", () => {
    const rules = rulesWith({
      maxBookingsPerDay: 1,
      availability: {
        ...defaultWorkspaceBookingRules().availability,
        monday: { enabled: true, start: "09:00", end: "12:00" },
      },
    });
    const result = computeSlotsForDay({
      rules,
      date: MONDAY,
      timezone: "UTC",
      durationMinutes: 30,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      bookedRows: [
        {
          startsAt: new Date("2026-06-22T09:00:00Z"),
          endsAt: new Date("2026-06-22T09:30:00Z"),
        },
      ],
      now: new Date("2026-06-20T00:00:00Z"),
    });
    assert.equal(result.slots.length, 0);
  });
});
