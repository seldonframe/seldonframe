// Pure grid math for the /bookings week calendar. No DOM, no I/O — unit-tested.
// Grid constants mirror bookings-page-content.tsx so the controller and the
// renderer agree on the same coordinate system.
export const WEEK_VIEW_START_HOUR = 8;
export const WEEK_VIEW_END_HOUR = 20; // exclusive
// Hour-row height in px. Bumped 80 → 96 so short (15-min) jobs have enough
// vertical room to show a title + time line legibly (mirrors Google
// Calendar / Cal.com breathing room). All callers import this constant so
// the grid lines, card positions, and snap math stay aligned.
export const HOUR_HEIGHT_PX = 96;
export const SNAP_MINUTES = 15;

/** y-offset (px from the top of the grid) → minutes-from-grid-start, snapped to
 *  SNAP_MINUTES, clamped so a dropped block always lands inside the visible grid. */
export function yToSnappedMinutes(yPx: number): number {
  const rawMinutes = (yPx / HOUR_HEIGHT_PX) * 60;
  const snapped = Math.round(rawMinutes / SNAP_MINUTES) * SNAP_MINUTES;
  const maxMinutes = (WEEK_VIEW_END_HOUR - WEEK_VIEW_START_HOUR) * 60 - SNAP_MINUTES;
  return Math.max(0, Math.min(snapped, maxMinutes));
}

/** minutes-from-grid-start → wall-clock {hours, minutes} (grid starts at 8:00). */
export function minutesToClock(minutesFromGridStart: number): { hours: number; minutes: number } {
  const total = WEEK_VIEW_START_HOUR * 60 + minutesFromGridStart;
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}

// ───────────────────────────────────────────────────────────────────────────
// Dynamic visible-range math (week calendar). The constants above stay fixed
// (the snap/clock unit tests + actions.ts pin them); these PARAMETERIZED pure
// helpers let the renderer bound the visible window to the workspace's business
// hours and size the rows so a normal week fits with no vertical scroll. Every
// function is pure (no DOM) so it can be unit-tested and shared.
// ───────────────────────────────────────────────────────────────────────────

/** Fallback visible window when availability is unset / has no enabled day. */
export const DEFAULT_VISIBLE_START_HOUR = 7;
export const DEFAULT_VISIBLE_END_HOUR = 19; // exclusive
/** Always show at least this many hours, even when business hours are short,
 *  so the grid never collapses to a sliver. */
export const MIN_VISIBLE_HOURS = 9;
/** Pad this many hours on each side of the business-hours window so the first
 *  and last appointments aren't flush against the grid edge. */
const VISIBLE_RANGE_PAD_HOURS = 1;

type DayWindow = { enabled: boolean; start: string; end: string };

/** "HH:MM" → minutes from midnight. Local to keep calendar-math dependency-free
 *  (mirrors workspace-rules.toMinutes; that module stays the canonical home for
 *  the booking-rules variant). Returns NaN for malformed input. */
function hhmmToMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
  return h * 60 + m;
}

/** Optional clamp the visible range must still contain — the earliest/latest
 *  fractional hour of any rendered event, so off-hours bookings stay visible. */
export type EventHourBounds = { earliestHour: number; latestHour: number } | null;

/**
 * Bound the visible hour range [startHour, endHour) for the week grid.
 *
 * Derived from the workspace availability: the earliest `start` and latest
 * `end` across ENABLED days, padded ~1h each side. Falls back to 7am–7pm when
 * no day is enabled. Always widened to MIN_VISIBLE_HOURS and to cover any
 * event bounds passed in, then clamped to [0, 24]. Result hours are integers.
 */
export function computeVisibleHourRange(input: {
  availability: Record<string, DayWindow> | null | undefined;
  eventBounds?: EventHourBounds;
}): { startHour: number; endHour: number } {
  const { availability, eventBounds = null } = input;

  let earliestStart = Infinity;
  let latestEnd = -Infinity;
  if (availability) {
    for (const day of Object.values(availability)) {
      if (!day?.enabled) continue;
      const startMin = hhmmToMinutes(day.start);
      const endMin = hhmmToMinutes(day.end);
      if (!Number.isFinite(startMin) || !Number.isFinite(endMin)) continue;
      if (endMin <= startMin) continue;
      earliestStart = Math.min(earliestStart, startMin / 60);
      latestEnd = Math.max(latestEnd, endMin / 60);
    }
  }

  let startHour: number;
  let endHour: number;
  if (earliestStart === Infinity || latestEnd === -Infinity) {
    // No enabled day → sensible default window.
    startHour = DEFAULT_VISIBLE_START_HOUR;
    endHour = DEFAULT_VISIBLE_END_HOUR;
  } else {
    startHour = Math.floor(earliestStart) - VISIBLE_RANGE_PAD_HOURS;
    endHour = Math.ceil(latestEnd) + VISIBLE_RANGE_PAD_HOURS;
  }

  // Never crop a rendered event: widen to include its start/end hours.
  if (eventBounds) {
    startHour = Math.min(startHour, Math.floor(eventBounds.earliestHour));
    endHour = Math.max(endHour, Math.ceil(eventBounds.latestHour));
  }

  // Enforce the minimum window height, growing downward first then upward so a
  // short morning-only schedule still shows a usable grid.
  if (endHour - startHour < MIN_VISIBLE_HOURS) {
    endHour = startHour + MIN_VISIBLE_HOURS;
    if (endHour > 24) {
      endHour = 24;
      startHour = Math.max(0, endHour - MIN_VISIBLE_HOURS);
    }
  }

  startHour = Math.max(0, startHour);
  endHour = Math.min(24, endHour);
  // Final guard: keep start strictly below end.
  if (startHour >= endHour) {
    startHour = DEFAULT_VISIBLE_START_HOUR;
    endHour = DEFAULT_VISIBLE_END_HOUR;
  }
  return { startHour, endHour };
}

/** px per hour-row, sized so the grid body lands ~560–640px tall for a typical
 *  10–12h range and never scrolls there. Clamped 44–64px so very short ranges
 *  don't balloon and long ranges stay scannable (and may scroll as a graceful
 *  fallback). Pure — the renderer multiplies it by the row count. */
export function pickHourHeightPx(hourCount: number): number {
  const TARGET_BODY_PX = 600;
  const MIN_HOUR_PX = 44;
  const MAX_HOUR_PX = 64;
  if (hourCount <= 0) return MAX_HOUR_PX;
  const ideal = Math.round(TARGET_BODY_PX / hourCount);
  return Math.max(MIN_HOUR_PX, Math.min(MAX_HOUR_PX, ideal));
}

/** y-offset (px from grid top) → minutes-from-grid-start, snapped to
 *  SNAP_MINUTES and clamped to [0, (totalHours*60 - SNAP)]. Parameterized
 *  twin of yToSnappedMinutes for the dynamic-height grid. */
export function snapMinutesFromY(
  yPx: number,
  hourHeightPx: number,
  totalHours: number,
): number {
  const rawMinutes = (yPx / hourHeightPx) * 60;
  const snapped = Math.round(rawMinutes / SNAP_MINUTES) * SNAP_MINUTES;
  const maxMinutes = totalHours * 60 - SNAP_MINUTES;
  return Math.max(0, Math.min(snapped, maxMinutes));
}

/** minutes-from-grid-start → wall-clock {hours, minutes}, offset from an
 *  arbitrary startHour. Parameterized twin of minutesToClock. */
export function clockFromGridMinutes(
  minutesFromGridStart: number,
  startHour: number,
): { hours: number; minutes: number } {
  const total = startHour * 60 + minutesFromGridStart;
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}

/** Vertical px offset for a wall-clock time within a grid that starts at
 *  startHour with hourHeightPx rows spanning [startHour, endHour). Clamps so an
 *  off-hours booking still lands just inside the top/bottom edge (with its real
 *  time shown inside the card). Parameterized twin of the old bookingTopPx. */
export function topPxForClock(input: {
  hours: number;
  minutes: number;
  startHour: number;
  endHour: number;
  hourHeightPx: number;
}): number {
  const { hours, minutes, startHour, endHour, hourHeightPx } = input;
  const offsetHours = hours + minutes / 60 - startHour;
  const maxOffset = endHour - startHour;
  const clamped = Math.max(0, Math.min(offsetHours, maxOffset - 0.5));
  return clamped * hourHeightPx;
}

/** new end preserves the original duration. */
export function computeRescheduledEnd(oldStart: Date, oldEnd: Date, newStart: Date): Date {
  return new Date(newStart.getTime() + (oldEnd.getTime() - oldStart.getTime()));
}

/** half-open [start,end) overlap — adjacency (touching edges) is NOT overlap. */
export function intervalsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

/** Pure gate: should we send a reschedule email for this booking?
 *  True only when the operator opted in (notify), the booking has a linked
 *  contact (contactId), and the booking is not a blocked-time slot. */
export function shouldSendRescheduleEmail(input: {
  notify: boolean;
  contactId: string | null;
  status: string;
}): boolean {
  return input.notify && Boolean(input.contactId) && input.status !== "blocked";
}
