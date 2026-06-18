// Back-compat tests for the workspace-level booking rules rollout.
//
// Requirement: when organizations.settings.booking is UNSET, the public
// slot generator must fall back to the appointment type's
// metadata.availability (the pre-workspace-rules behavior) so existing
// workspaces don't break. When it IS set, the workspace availability +
// min-notice win, and the per-type duration is preserved with the buffer
// falling back to the workspace default.
//
// We test the pure resolver that makes this decision
// (resolveContextBookingRules) rather than the DB-loading wrapper.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  resolveContextBookingRules,
  defaultWorkspaceBookingRules,
} from "../../src/lib/bookings/workspace-rules";

const PER_TYPE_AVAILABILITY = {
  sunday: { enabled: true, start: "08:00", end: "10:00" },
  monday: { enabled: false, start: "09:00", end: "17:00" },
  tuesday: { enabled: false, start: "09:00", end: "17:00" },
  wednesday: { enabled: false, start: "09:00", end: "17:00" },
  thursday: { enabled: false, start: "09:00", end: "17:00" },
  friday: { enabled: false, start: "09:00", end: "17:00" },
  saturday: { enabled: false, start: "09:00", end: "17:00" },
} as const;

describe("resolveContextBookingRules — back-compat fallback to per-type availability", () => {
  test("when settings.booking is unset, per-type availability drives the schedule", () => {
    const resolved = resolveContextBookingRules({
      workspaceSettings: {}, // no booking key
      typeAvailability: PER_TYPE_AVAILABILITY,
      typeBufferBeforeMinutes: 10,
      typeBufferAfterMinutes: 20,
      typeMaxBookingsPerDay: 3,
    });
    // Sunday is enabled per the TYPE config (workspace default would disable it).
    assert.equal(resolved.availability.sunday.enabled, true);
    assert.equal(resolved.availability.sunday.start, "08:00");
    assert.equal(resolved.availability.sunday.end, "10:00");
    // Monday is disabled per the type config (workspace default would enable it).
    assert.equal(resolved.availability.monday.enabled, false);
    // Source flag exposed for callers/logging.
    assert.equal(resolved.source, "appointment-type");
    // No workspace rules => min-notice is 0 (no workspace min-notice to apply).
    assert.equal(resolved.minNoticeMinutes, 0);
    // Buffers + cap come from the type when workspace rules are absent.
    assert.equal(resolved.bufferBeforeMinutes, 10);
    assert.equal(resolved.bufferAfterMinutes, 20);
    assert.equal(resolved.maxBookingsPerDay, 3);
  });

  test("when settings.booking is set, workspace availability + min-notice win", () => {
    const resolved = resolveContextBookingRules({
      workspaceSettings: {
        booking: {
          availability: {
            sunday: { enabled: false, start: "09:00", end: "17:00" },
            monday: { enabled: true, start: "11:00", end: "19:00" },
          },
          minNoticeMinutes: 90,
          defaultBufferMinutes: 25,
          defaultDurationMinutes: 45,
          maxBookingsPerDay: 8,
        },
      },
      typeAvailability: PER_TYPE_AVAILABILITY,
      // Type has no buffers => falls back to workspace defaultBufferMinutes.
      typeBufferBeforeMinutes: 0,
      typeBufferAfterMinutes: 0,
      typeMaxBookingsPerDay: 0,
    });
    // Workspace wins: Sunday off, Monday 11:00-19:00.
    assert.equal(resolved.availability.sunday.enabled, false);
    assert.equal(resolved.availability.monday.enabled, true);
    assert.equal(resolved.availability.monday.start, "11:00");
    assert.equal(resolved.availability.monday.end, "19:00");
    assert.equal(resolved.source, "workspace");
    assert.equal(resolved.minNoticeMinutes, 90);
    // Type has no buffer -> workspace default (25) applies.
    assert.equal(resolved.bufferBeforeMinutes, 25);
    assert.equal(resolved.bufferAfterMinutes, 25);
    // Workspace cap applies.
    assert.equal(resolved.maxBookingsPerDay, 8);
  });

  test("workspace rules set, but type DEFINES its own buffer -> type buffer wins", () => {
    const resolved = resolveContextBookingRules({
      workspaceSettings: {
        booking: { defaultBufferMinutes: 25, minNoticeMinutes: 30 },
      },
      typeAvailability: PER_TYPE_AVAILABILITY,
      typeBufferBeforeMinutes: 5,
      typeBufferAfterMinutes: 45,
      typeMaxBookingsPerDay: 0,
    });
    // Type's explicit buffers override the workspace default.
    assert.equal(resolved.bufferBeforeMinutes, 5);
    assert.equal(resolved.bufferAfterMinutes, 45);
  });

  test("defaults sanity: empty workspace settings yields workspace-default schedule fields", () => {
    // Confirms the helper reuses the same defaults as the standalone rules.
    const def = defaultWorkspaceBookingRules();
    const resolved = resolveContextBookingRules({
      workspaceSettings: { booking: {} }, // booking present but empty
      typeAvailability: PER_TYPE_AVAILABILITY,
      typeBufferBeforeMinutes: 0,
      typeBufferAfterMinutes: 0,
      typeMaxBookingsPerDay: 0,
    });
    // booking key present (even if empty) => workspace source + default schedule.
    assert.equal(resolved.source, "workspace");
    assert.equal(resolved.availability.monday.enabled, def.availability.monday.enabled);
    assert.equal(resolved.availability.sunday.enabled, def.availability.sunday.enabled);
  });
});
