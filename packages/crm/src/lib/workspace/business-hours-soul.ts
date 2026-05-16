// v1.56.0 — Business-hours soul-enrichment helper.
//
// When createFullWorkspace receives weekly_hours (typically from the
// URL-extraction flow), we persist the schedule into TWO places:
//   1. bookings.metadata.availability — already wired (drives the booking
//      page's slot generator).
//   2. organizations.soul.business_hours — NEW. The chatbot reads this
//      to answer "what are your hours?" without making them up.
//
// When weekly_hours is missing entirely, we still write a default
// Mon-Fri 9-5 schedule with `business_hours_assumed: true`. The
// chatbot uses that flag to disclaim the answer ("assumed standard
// hours — confirm with caller before quoting") instead of presenting
// them as ground truth.
//
// This module is pure (no DB) so it can be unit-tested without mocks.
// The DB write itself happens in create-full.ts:441-… inside a try/catch
// so a failure here never blocks workspace creation.
//
// Default schedule mirrors defaultAvailabilitySchedule() from
// lib/bookings/actions.ts:125-135 (which is the canonical source for
// booking-page defaults). Kept in sync by inspection — if that shape
// changes, this should too.

import type { WeeklyHours } from "./format-hours";

/**
 * The canonical "Mon-Fri 9-5" default schedule. Identical shape to
 * defaultAvailabilitySchedule() in lib/bookings/actions.ts — Monday
 * through Friday enabled at 09:00-17:00, weekends disabled with
 * placeholder hours.
 */
export const DEFAULT_WEEKLY_HOURS: Required<
  Record<
    "sunday" | "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday",
    { enabled: boolean; start: string; end: string }
  >
> = {
  sunday: { enabled: false, start: "09:00", end: "17:00" },
  monday: { enabled: true, start: "09:00", end: "17:00" },
  tuesday: { enabled: true, start: "09:00", end: "17:00" },
  wednesday: { enabled: true, start: "09:00", end: "17:00" },
  thursday: { enabled: true, start: "09:00", end: "17:00" },
  friday: { enabled: true, start: "09:00", end: "17:00" },
  saturday: { enabled: false, start: "09:00", end: "17:00" },
};

export type BusinessHoursSoulPatch = {
  business_hours: WeeklyHours;
  business_hours_assumed: boolean;
};

/**
 * Build the snake-case soul patch we merge into organizations.soul.
 *
 * - Operator provided hours (non-empty) → patch with those hours and
 *   `business_hours_assumed: false`.
 * - Nothing provided (null/undefined/empty) → patch with the canonical
 *   Mon-Fri 9-5 default and `business_hours_assumed: true` so the chatbot
 *   knows to disclaim them.
 *
 * Pure — no DB, no logging. Test this directly.
 */
export function buildBusinessHoursSoulPatch(
  weeklyHours: WeeklyHours | null | undefined,
): BusinessHoursSoulPatch {
  const hasProvidedHours =
    !!weeklyHours && Object.keys(weeklyHours).length > 0;
  if (hasProvidedHours) {
    return {
      business_hours: weeklyHours,
      business_hours_assumed: false,
    };
  }
  return {
    business_hours: DEFAULT_WEEKLY_HOURS,
    business_hours_assumed: true,
  };
}
