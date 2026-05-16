// v1.56.0 — Tests for the business-hours soul-enrichment helper.
//
// createFullWorkspace persists business_hours into organizations.soul
// so the chatbot can answer "what are your hours?" from a single source.
// The DB-write is a thin wrapper around a pure shape-building helper —
// buildBusinessHoursSoulPatch — which is what these tests exercise.
//
// We test the helper rather than the full DB write because:
//   - The interesting branch logic (provided vs default-assumed) is here.
//   - The soft-fail wrapper in create-full.ts is identical to other
//     try/catch soul writes in that file (e.g. the google_place_url
//     stamp at line ~504) — same pattern, same failure mode.
//   - Mocking drizzle's SQL template tag for the JSONB merge is fragile
//     and would test the mock more than the production path.
//
// Run: node --import tsx --test packages/crm/tests/unit/business-hours-soul-persist.spec.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  buildBusinessHoursSoulPatch,
  DEFAULT_WEEKLY_HOURS,
} from "../../src/lib/workspace/business-hours-soul";

describe("buildBusinessHoursSoulPatch", () => {
  test("writes provided weekly_hours into soul.business_hours with assumed: false", () => {
    const provided = {
      monday: { enabled: true, start: "08:00", end: "18:00" },
      tuesday: { enabled: true, start: "08:00", end: "18:00" },
      wednesday: { enabled: true, start: "08:00", end: "18:00" },
      thursday: { enabled: true, start: "08:00", end: "18:00" },
      friday: { enabled: true, start: "08:00", end: "18:00" },
      saturday: { enabled: false, start: "00:00", end: "00:00" },
      sunday: { enabled: false, start: "00:00", end: "00:00" },
    };
    const patch = buildBusinessHoursSoulPatch(provided);
    assert.deepEqual(patch.business_hours, provided);
    assert.equal(patch.business_hours_assumed, false);
  });

  test("writes default Mon-Fri 9-5 into soul.business_hours with assumed: true when no hours provided", () => {
    // null input
    const fromNull = buildBusinessHoursSoulPatch(null);
    assert.equal(fromNull.business_hours_assumed, true);
    assert.deepEqual(fromNull.business_hours, DEFAULT_WEEKLY_HOURS);

    // undefined input
    const fromUndef = buildBusinessHoursSoulPatch(undefined);
    assert.equal(fromUndef.business_hours_assumed, true);
    assert.deepEqual(fromUndef.business_hours, DEFAULT_WEEKLY_HOURS);

    // empty object input
    const fromEmpty = buildBusinessHoursSoulPatch({});
    assert.equal(fromEmpty.business_hours_assumed, true);
    assert.deepEqual(fromEmpty.business_hours, DEFAULT_WEEKLY_HOURS);
  });

  test("soft-fails behavior is exercised by create-full.ts try/catch — helper itself never throws", () => {
    // The helper is pure: no I/O, no DB. We exercise the "never throws"
    // contract directly. The wrapping try/catch in create-full.ts
    // (mirrored from the google_place_url stamp at ~line 504) provides
    // the soft-fail guarantee for the DB write itself.
    assert.doesNotThrow(() => buildBusinessHoursSoulPatch(null));
    assert.doesNotThrow(() => buildBusinessHoursSoulPatch(undefined));
    assert.doesNotThrow(() => buildBusinessHoursSoulPatch({}));
    assert.doesNotThrow(() =>
      buildBusinessHoursSoulPatch({
        monday: { enabled: true, start: "09:00", end: "17:00" },
      }),
    );
    // Even with garbage-shaped input (cast through unknown) the helper
    // returns SOMETHING — the chatbot prompt's render layer is the place
    // that decides whether to render an unparseable shape.
    const garbage = { wednesday: 42 as unknown as { enabled: boolean; start: string; end: string } };
    assert.doesNotThrow(() => buildBusinessHoursSoulPatch(garbage));
  });

  test("default schedule matches defaultAvailabilitySchedule() (Mon-Fri enabled, weekends disabled)", () => {
    // Mirror of defaultAvailabilitySchedule() from
    // packages/crm/src/lib/bookings/actions.ts:125-135. Both default
    // shapes MUST stay in lockstep — booking-page slot generator and
    // chatbot-prompt hours summary should default to the same hours.
    assert.equal(DEFAULT_WEEKLY_HOURS.monday.enabled, true);
    assert.equal(DEFAULT_WEEKLY_HOURS.tuesday.enabled, true);
    assert.equal(DEFAULT_WEEKLY_HOURS.wednesday.enabled, true);
    assert.equal(DEFAULT_WEEKLY_HOURS.thursday.enabled, true);
    assert.equal(DEFAULT_WEEKLY_HOURS.friday.enabled, true);
    assert.equal(DEFAULT_WEEKLY_HOURS.saturday.enabled, false);
    assert.equal(DEFAULT_WEEKLY_HOURS.sunday.enabled, false);

    // All weekday hours are 09:00-17:00.
    for (const day of ["monday", "tuesday", "wednesday", "thursday", "friday"] as const) {
      assert.equal(DEFAULT_WEEKLY_HOURS[day].start, "09:00");
      assert.equal(DEFAULT_WEEKLY_HOURS[day].end, "17:00");
    }
  });
});
