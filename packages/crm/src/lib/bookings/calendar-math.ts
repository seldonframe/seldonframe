// Pure grid math for the /bookings week calendar. No DOM, no I/O — unit-tested.
// Grid constants mirror bookings-page-content.tsx so the controller and the
// renderer agree on the same coordinate system.
export const WEEK_VIEW_START_HOUR = 8;
export const WEEK_VIEW_END_HOUR = 20; // exclusive
export const HOUR_HEIGHT_PX = 80;
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
