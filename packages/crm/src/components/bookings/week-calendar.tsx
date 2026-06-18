"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, Search, Settings, SlidersHorizontal } from "lucide-react";
import {
  computeVisibleHourRange,
  pickHourHeightPx,
  snapMinutesFromY,
  clockFromGridMinutes,
  topPxForClock,
  type EventHourBounds,
} from "@/lib/bookings/calendar-math";
import type {
  WorkspaceBookingRules,
  AvailabilityDayKey,
} from "@/lib/bookings/workspace-rules";
import { toMinutes, weekdayKeys } from "@/lib/bookings/workspace-rules";
import { BookingCard } from "@/components/bookings/booking-card";
import { BookingDatePicker } from "@/components/bookings/booking-date-picker";
import { CreatePopover } from "@/components/bookings/create-popover";
import { RescheduleConfirm } from "@/components/bookings/reschedule-confirm";
import { BookingActions } from "@/components/bookings/booking-actions";
import { cancelBookingAction, updateBookingNotesAction } from "@/lib/bookings/actions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BookingRow = {
  id: string;
  title: string;
  startsAt: Date | string;
  endsAt: Date | string;
  status: string;
  contactId: string | null;
  /** Job details / notes — surfaced + editable in the booking-actions modal. */
  notes: string | null;
};

type ContactRow = {
  id: string;
  firstName: string;
  lastName: string | null;
  /** Surfaced in the booking-actions modal when this contact is linked. */
  phone: string | null;
  email: string | null;
};

type BookingTypeRow = {
  id: string;
  title: string;
  bookingSlug: string;
  metadata: unknown;
};

type WeekCalendarProps = {
  bookings: BookingRow[];
  contacts: ContactRow[];
  workspaceTimezone: string;
  /** Workspace availability + rules (same blob the availability panel uses).
   *  Drives the bounded hour range (Fix 1) and the open/closed cell shading
   *  (Fix 3). Mon-Fri 09:00-17:00 defaults when unset. */
  workspaceBookingRules: WorkspaceBookingRules;
  labels: {
    contact: { singular: string; plural: string };
    activity: { singular: string; plural: string };
  };
  bookingTypes: BookingTypeRow[];
  createBookingAction: (formData: FormData) => Promise<unknown>;
  createBlockedTimeAction: (input: {
    label: string;
    startsAtISO: string;
    durationMinutes: number;
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
  /** Task 8 — drag-to-reschedule. Prospect drops confirm + email; blocked
   *  drops move silently. Returns a discriminated union so the caller can
   *  revert the optimistic position on conflict. */
  rescheduleBookingAction: (input: {
    bookingId: string;
    newStartsAtISO: string;
    notify: boolean;
  }) => Promise<{ ok: true } | { ok: false; error: "not_found" | "conflict" }>;
};

// ---------------------------------------------------------------------------
// Grid geometry is now DYNAMIC — computed per-render from the workspace
// availability (so the visible window hugs business hours and the whole week
// fits with no scroll). See the `geometry` useMemo inside the component.
// ---------------------------------------------------------------------------

// Width of the left time-gutter (hour labels). The 7 day columns share the
// rest of the row equally via the CSS grid, so there's no horizontal scroll.
const TIME_GUTTER_PX = 52;

// ---------------------------------------------------------------------------
// Colour palette for left-border accent on booking cards.
// Index maps to the booking type title (same order as bookingTypes array
// received by the parent — WeekCalendar receives the resolved borderClass
// per booking via the palette computed upstream).
// ---------------------------------------------------------------------------

export const bookingBorderPalette = [
  "border-l-primary",
  "border-l-[hsl(270_60%_55%)]",
  "border-l-[hsl(220_70%_55%)]",
  "border-l-caution",
  "border-l-positive",
];

// ---------------------------------------------------------------------------
// Pure helpers — only used by the week calendar, so they live here.
// ---------------------------------------------------------------------------

/** Extract {hours, minutes} from a Date in a specific IANA timezone.
 *  Browser-local getHours() drifts when viewer TZ ≠ workspace TZ;
 *  Intl round-trip is the only reliable way. */
function timeInZone(date: Date, tz: string): { hours: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    hour: "numeric",
    minute: "numeric",
  }).formatToParts(date);
  const hourPart = parts.find((p) => p.type === "hour")?.value ?? "0";
  const minutePart = parts.find((p) => p.type === "minute")?.value ?? "0";
  // Intl hour12:false uses "24" for midnight on some engines — normalize.
  const hours = parseInt(hourPart, 10) % 24;
  const minutes = parseInt(minutePart, 10);
  return { hours, minutes };
}

// Resolved grid geometry for a render (computed from availability + events).
type CalendarGeometry = {
  startHour: number;
  endHour: number;
  hourHeightPx: number;
  totalHours: number;
  bodyHeightPx: number;
};

/** Position a booking card vertically within the week-view day column.
 *  Returns the top offset in px relative to the visible grid start
 *  (geometry.startHour). Clamps so off-hours bookings still render just inside
 *  the top/bottom edge with their real time visible inside the card. */
function bookingTopPx(startsAt: Date, tz: string, geometry: CalendarGeometry): number {
  const { hours, minutes } = timeInZone(startsAt, tz);
  return topPxForClock({
    hours,
    minutes,
    startHour: geometry.startHour,
    endHour: geometry.endHour,
    hourHeightPx: geometry.hourHeightPx,
  });
}

/** Fractional wall-clock hour (e.g. 14.5 for 14:30) of a moment in `tz`.
 *  Used to compute the event-hour bounds the visible range must contain. */
function fractionalHourInZone(date: Date, tz: string): number {
  const { hours, minutes } = timeInZone(date, tz);
  return hours + minutes / 60;
}

/** YYYY-MM-DD in the given timezone (en-CA emits ISO-style). */
function keyYmd(date: Date, tz: string) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: tz,
  }).format(date);
}

function labelRangeStart(date: Date, tz: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    timeZone: tz,
  }).format(date);
}

function labelRangeEnd(date: Date, tz: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    timeZone: tz,
  }).format(date);
}

/** Human label for an empty cell's slot, for the add-button aria-label
 *  (e.g. "Mon, Jun 22, 9:00 AM"). The cell renders the day's date in `tz`,
 *  so build that day at `hour:00` in the same zone for a faithful label. */
function cellSlotLabel(day: Date, hour: number, tz: string): string {
  const [year, month, dayNum] = ymdInZone(day, tz);
  const at = buildStartUtc(year, month, dayNum, hour, 0, tz);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(at);
}

function dayHeaderLabel(date: Date, tz: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    weekday: "short",
    timeZone: tz,
  })
    .format(date)
    .toUpperCase();
}

/** Build a UTC Date that represents "year-month-day H:M" in the given IANA
 *  timezone, using the same iterative-offset approach as the server-side
 *  `utcMomentForLocalTime` in actions.ts. Handles DST transitions correctly. */
function buildStartUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  tz: string,
): Date {
  // Step 1: naive UTC moment (pretend it's UTC, ignoring TZ offset).
  const naive = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (tz === "UTC") return naive;

  // Step 2: ask Intl what this moment LOOKS like in the target TZ.
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(naive).map((p) => [p.type, p.value]));
  const rawHour = parseInt(parts.hour ?? "0", 10);
  const actualH = rawHour === 24 ? 0 : rawHour;
  const actualY = parseInt(parts.year ?? "0", 10);
  const actualMo = parseInt(parts.month ?? "0", 10);
  const actualD = parseInt(parts.day ?? "0", 10);
  const actualMin = parseInt(parts.minute ?? "0", 10);

  // Step 3: compute the offset and shift.
  const intendedMs = Date.UTC(year, month - 1, day, hour, minute);
  const actualMs = Date.UTC(actualY, actualMo - 1, actualD, actualH, actualMin);
  return new Date(naive.getTime() + (intendedMs - actualMs));
}

/** Derive [year, month, day] for a column's day in the workspace timezone.
 *  Shared by the empty-slot click handler and the drag-drop handler so both
 *  compute the dropped date identically. */
function ymdInZone(day: Date, tz: string): [number, number, number] {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(day)
    .split("-")
    .map(Number) as [number, number, number];
}

/** Build the UTC start for a dropped block: snap the y-offset within a column
 *  to a clock time, then resolve it to a UTC moment on the column's day in the
 *  workspace timezone. Pure — all snap math comes from calendar-math.ts, but
 *  parameterized by the dynamic grid geometry so the snapped time matches the
 *  visible (business-hours-bounded) window. */
function dropToStartUtc(
  day: Date,
  offsetY: number,
  tz: string,
  geometry: CalendarGeometry,
): Date {
  const snappedMinutes = snapMinutesFromY(offsetY, geometry.hourHeightPx, geometry.totalHours);
  const { hours, minutes } = clockFromGridMinutes(snappedMinutes, geometry.startHour);
  const [year, month, dayNum] = ymdInZone(day, tz);
  return buildStartUtc(year, month, dayNum, hours, minutes, tz);
}

function addDaysLocal(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** Return a UTC Date whose year/month/day in the given IANA timezone
 *  matches today's date in that timezone, at 00:00 UTC.
 *  Using `new Date()` + setHours(0,0,0,0) anchors "today" in the
 *  browser's local timezone — when the workspace TZ differs, that
 *  browser-midnight can fall on a different calendar day in the
 *  workspace TZ, causing the week to start on Sunday instead of Monday.
 *  This helper derives the correct date by formatting with Intl. */
function todayInZone(tz: string): Date {
  const now = new Date();
  const ymdStr = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: tz,
  }).format(now);
  // en-CA emits "YYYY-MM-DD"; parse as UTC midnight so the Date object's
  // getDay() call in startOfWeekMonday runs in UTC, which matches the
  // year/month/day we just derived from the workspace TZ.
  return new Date(`${ymdStr}T00:00:00Z`);
}

/** Whole-day delta between two UTC-midnight Dates (b − a), rounded to the
 *  nearest day so DST shifts inside the span can't produce a fractional count.
 *  Used to translate a date picked in the month grid into the `offsetDays`
 *  that drives the week view. */
function dayDeltaUtc(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** UTC-midnight Date for the calendar day a UTC-midnight Date represents,
 *  re-expressed in the BROWSER's local timezone (i.e. a `new Date(y, m, d)`).
 *  react-day-picker renders/selects in local time, so the toolbar picker is fed
 *  local-midnight Dates while the week view stays on its UTC-midnight anchors;
 *  this bridges the two without drifting the calendar day. */
function utcMidnightToLocalDay(date: Date): Date {
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** Inverse of utcMidnightToLocalDay: a local-midnight Date (from the picker)
 *  back to the UTC-midnight anchor for the same calendar day, so it shares the
 *  coordinate system todayInZone() / startOfWeekMonday() operate in. */
function localDayToUtcMidnight(date: Date): Date {
  return new Date(
    `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}-${`${date.getDate()}`.padStart(2, "0")}T00:00:00Z`,
  );
}

/** Monday-anchored week start. Operates on a UTC-midnight Date produced
 *  by todayInZone() so getDay() reflects the correct workspace-TZ weekday
 *  rather than the browser's local-timezone weekday. */
function startOfWeekMonday(date: Date) {
  const next = new Date(date);
  // getUTCDay() instead of getDay() — date is already at UTC midnight,
  // so UTC weekday == the workspace-TZ weekday we derived in todayInZone.
  const weekday = next.getUTCDay();
  const diff = weekday === 0 ? -6 : 1 - weekday;
  next.setUTCDate(next.getUTCDate() + diff);
  return next;
}

/** Weekday key (sunday..saturday) for a column Date in the workspace tz.
 *  Intl 'long' weekday → lowercased → matches AvailabilityDayKey. */
function weekdayKeyForDate(day: Date, tz: string): AvailabilityDayKey {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "long",
  })
    .format(day)
    .toLowerCase();
  // weekdayKeys are exactly the lowercased long names; fall back to monday.
  return (weekdayKeys.includes(name as AvailabilityDayKey)
    ? (name as AvailabilityDayKey)
    : "monday");
}

/** Per-column open/closed window resolved from availability.
 *  `closed` → whole day is unavailable (disabled day). When open, startMin/
 *  endMin are minutes-from-midnight bounding the bookable window. */
type DayAvailability =
  | { closed: true }
  | { closed: false; startMin: number; endMin: number };

function resolveDayAvailability(
  day: Date,
  tz: string,
  rules: WorkspaceBookingRules,
): DayAvailability {
  const window = rules.availability[weekdayKeyForDate(day, tz)];
  if (!window?.enabled) return { closed: true };
  const startMin = toMinutes(window.start);
  const endMin = toMinutes(window.end);
  if (!(endMin > startMin)) return { closed: true };
  return { closed: false, startMin, endMin };
}

/** Is the hour-row beginning at `hour` (the cell [hour, hour+1)) fully or
 *  partially inside the day's open window? A cell counts as open when it
 *  overlaps [startMin, endMin). Used to shade off-hours cells (Fix 3). */
function isHourCellOpen(hour: number, avail: DayAvailability): boolean {
  if (avail.closed) return false;
  const cellStart = hour * 60;
  const cellEnd = cellStart + 60;
  return cellStart < avail.endMin && cellEnd > avail.startMin;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Popover state type
// ---------------------------------------------------------------------------

type PopoverState = {
  startsAt: Date;
  anchorX: number;
  anchorY: number;
};

// A click (not a drag) on an existing booking card opens this centered
// actions modal: cancel the booking, open the contact, or read the
// drag-to-reschedule tip.
type BookingActionsState = {
  bookingId: string;
  title: string;
  contactId: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  notes: string | null;
  startsAt: Date;
};

// Snapshot captured on pointer-down for a booking card. Persists for the
// whole gesture so pointer-up can decide click-vs-drag and compute the move.
type DragState = {
  bookingId: string;
  originStart: Date;
  originEnd: Date;
  status: string;
  contactId: string | null;
  title: string;
  contactName: string;
  // Carried so a click (not a drag) can populate the booking-actions modal
  // without re-deriving from the bookings array.
  contactPhone: string | null;
  contactEmail: string | null;
  notes: string | null;
  pointerStartX: number;
  pointerStartY: number;
  /** Becomes true once the pointer crosses DRAG_THRESHOLD_PX — only then do
   *  we render the ghost and treat pointer-up as a drop (not a click). */
  isDragging: boolean;
  /** Live ghost target while dragging: which day column + snapped top px. */
  ghost: { dayKey: string; topPx: number; timeLabel: string } | null;
};

// Pending reschedule confirmation for a PROSPECT drop. Held until the
// operator confirms (fire action) or cancels (discard).
type PendingConfirm = {
  bookingId: string;
  title: string;
  contactName: string;
  newStart: Date;
  newTimeLabel: string;
  status: string;
  anchorX: number;
  anchorY: number;
  /** Optimistic position to keep the card pinned at while confirming. */
  optimistic: { dayKey: string; topPx: number };
};

// Optimistic override applied to a booking whose reschedule is in flight (or
// awaiting confirm). Render the card here until the action resolves; on
// conflict we clear it so the card snaps back to its server position.
type OptimisticOverride = { dayKey: string; topPx: number };

const DRAG_THRESHOLD_PX = 5;

/** Format a dropped UTC moment as a short "Tue, Jun 16, 2:30 PM" label in the
 *  workspace timezone for the ghost + confirm card. */
function formatDropLabel(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function WeekCalendar({
  bookings,
  contacts,
  workspaceTimezone,
  workspaceBookingRules,
  labels,
  bookingTypes,
  createBookingAction,
  createBlockedTimeAction,
  rescheduleBookingAction,
}: WeekCalendarProps) {
  const router = useRouter();
  // Day-granular offset from today. Week mode steps it by 7, Day mode by 1.
  // "Today" resets it to 0. Replaces the old week-count offset so a single
  // piece of state drives both views.
  const [offsetDays, setOffsetDays] = useState(0);
  // Segmented Day / Week toggle. Week (default) = 7-column layout; Day = a
  // single full-width column. Best-practice calendar UX.
  const [viewMode, setViewMode] = useState<"day" | "week">("week");
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showFilterNotice, setShowFilterNotice] = useState(false);
  const [popover, setPopover] = useState<PopoverState | null>(null);
  // Booking-actions modal opened by a plain click on an existing card.
  const [bookingActions, setBookingActions] = useState<BookingActionsState | null>(null);

  // ── Task 8 — drag-to-reschedule state ──────────────────────────────────
  // Refs to the 7 day-column elements, keyed by their YYYY-MM-DD day key, so
  // pointer-move/up can hit-test clientX against each getBoundingClientRect().
  const columnRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  // The live gesture. `drag` drives rendering (ghost, drag-lift); a ref mirror
  // (below) lets the move/up handlers + the Escape listener read the latest
  // value without being re-created on every gesture tick.
  const [drag, setDrag] = useState<DragState | null>(null);
  // Mirror `drag` into a ref so the move/up handlers + the global Escape
  // listener always read the latest gesture. Synced via an effect (assigning
  // during render trips the react-hooks/refs rule).
  const dragRef = useRef<DragState | null>(null);
  useEffect(() => {
    dragRef.current = drag;
  }, [drag]);
  // Set true the instant a drag drops, so the synthetic `click` the browser
  // fires right after `pointerup` (on whatever column is under the pointer)
  // is swallowed instead of opening the create-popover. Cleared by that same
  // click handler. A ref (not state) because it must survive within the same
  // event-loop turn without a re-render.
  const justDraggedRef = useRef(false);
  // Pending prospect confirmation (held open until confirm/cancel).
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  // Optimistic position overrides keyed by bookingId, applied while a
  // reschedule is in flight / awaiting confirm.
  const [optimistic, setOptimistic] = useState<Map<string, OptimisticOverride>>(
    new Map()
  );
  // Transient toast (e.g. conflict revert).
  const [toast, setToast] = useState<string | null>(null);

  const contactsById = useMemo(
    () => new Map(contacts.map((c) => [c.id, c])),
    [contacts]
  );

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2400);
  }, []);

  // Toolbar date-picker → jump the week view to the week containing the picked
  // day. The picker hands back a browser-local Date; convert it to the same
  // UTC-midnight anchor todayInZone() uses, then set offsetDays to the whole-day
  // delta. In Week mode startOfWeekMonday() snaps any in-week offset to that
  // week; in Day mode the picked day becomes the single visible column.
  const handleJumpToDate = useCallback(
    (picked: Date) => {
      const todayBase = todayInZone(workspaceTimezone);
      const pickedUtcMidnight = localDayToUtcMidnight(picked);
      setOffsetDays(dayDeltaUtc(todayBase, pickedUtcMidnight));
    },
    [workspaceTimezone],
  );

  // Visible day columns: 7 (Monday-anchored week) in Week mode, 1 (the
  // offset day at midnight) in Day mode. Both the header row and the grid
  // map over this so a single render path serves both views.
  const visibleDays = useMemo(() => {
    // Base "today" in the workspace timezone so the week anchors on the
    // correct calendar day regardless of the viewer's browser locale.
    // Pre-fix, new Date() + setHours(0,0,0,0) could mismatch when the
    // workspace TZ is behind the browser TZ — e.g. showing Sun Jun 14
    // as the week start when today is actually Mon Jun 15 (workspace TZ).
    const todayBase = todayInZone(workspaceTimezone);
    if (viewMode === "day") {
      const base = addDaysLocal(todayBase, offsetDays);
      return [base];
    }
    const weekStart = startOfWeekMonday(addDaysLocal(todayBase, offsetDays));
    return Array.from({ length: 7 }, (_, i) => addDaysLocal(weekStart, i));
  }, [viewMode, offsetDays, workspaceTimezone]);

  const eventsByDay = useMemo(() => {
    const byDay = new Map<string, BookingRow[]>();
    for (const day of visibleDays) {
      byDay.set(keyYmd(day, workspaceTimezone), []);
    }

    for (const row of bookings) {
      const startsAt = new Date(row.startsAt);
      const key = keyYmd(startsAt, workspaceTimezone);
      if (!byDay.has(key)) continue;

      if (
        searchQuery.trim().length > 0 &&
        !row.title.toLowerCase().includes(searchQuery.trim().toLowerCase())
      ) {
        continue;
      }

      byDay.get(key)?.push(row);
    }

    for (const [key, rows] of byDay.entries()) {
      byDay.set(
        key,
        rows.sort(
          (a, b) =>
            new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
        )
      );
    }

    return byDay;
  }, [bookings, visibleDays, searchQuery, workspaceTimezone]);

  // ── Dynamic grid geometry (Fix 1) ──────────────────────────────────────
  // Bound the visible hour range to the workspace's BUSINESS HOURS (earliest
  // start / latest end across enabled days, padded ~1h, min 9h window) instead
  // of a fixed 6am–10pm, then size the hour rows so the bounded range fits a
  // typical viewport with no vertical scroll. The range is also widened to
  // cover any booked event that falls outside business hours so those cards
  // still render at their true time (clamped just inside the edge otherwise).
  const geometry = useMemo<CalendarGeometry>(() => {
    // Event bounds across the bookings visible in this week (post-filter), so
    // off-hours bookings never get cropped out of the grid.
    let earliestHour = Infinity;
    let latestHour = -Infinity;
    for (const rows of eventsByDay.values()) {
      for (const row of rows) {
        const start = fractionalHourInZone(new Date(row.startsAt), workspaceTimezone);
        const end = fractionalHourInZone(new Date(row.endsAt), workspaceTimezone);
        earliestHour = Math.min(earliestHour, start);
        // An end exactly on the hour (e.g. 17:00) shouldn't force an extra
        // empty row; nudge it down a hair so ceil() doesn't over-grow.
        latestHour = Math.max(latestHour, end > Math.floor(end) ? end : end - 0.01);
      }
    }
    const eventBounds: EventHourBounds =
      earliestHour === Infinity ? null : { earliestHour, latestHour };

    const { startHour, endHour } = computeVisibleHourRange({
      availability: workspaceBookingRules.availability,
      eventBounds,
    });
    const totalHours = endHour - startHour;
    const hourHeightPx = pickHourHeightPx(totalHours);
    return {
      startHour,
      endHour,
      totalHours,
      hourHeightPx,
      bodyHeightPx: totalHours * hourHeightPx,
    };
  }, [eventsByDay, workspaceBookingRules.availability, workspaceTimezone]);

  // Hour labels for the visible range, one per row.
  const hourLabels = useMemo(
    () =>
      Array.from({ length: geometry.totalHours }, (_, i) => geometry.startHour + i),
    [geometry.startHour, geometry.totalHours],
  );

  // Build a colour map from booking title → border class.
  // WeekCalendar doesn't receive bookingTypes directly, so we derive
  // distinct titles from the bookings array in encounter order.
  const borderByTitle = useMemo(() => {
    const map = new Map<string, string>();
    let index = 0;
    for (const row of bookings) {
      const key = row.title.trim().toLowerCase();
      if (!map.has(key)) {
        map.set(key, bookingBorderPalette[index % bookingBorderPalette.length]);
        index++;
      }
    }
    return map;
  }, [bookings]);

  // ── Task 8 — pointer handlers (native pointer events, no library) ───────
  // Hit-test a viewport X against the 7 day-column rects; return the matching
  // day + the snapped top px for the given viewport Y. Falls back to the
  // drag-origin column when the pointer is left/right of the grid so a drop
  // always lands somewhere sensible.
  const resolveDropTarget = useCallback(
    (
      clientX: number,
      clientY: number,
      fallbackDayKey: string,
    ): { day: Date; dayKey: string; offsetY: number } | null => {
      let target: { day: Date; dayKey: string; rect: DOMRect } | null = null;
      let fallback: { day: Date; dayKey: string; rect: DOMRect } | null = null;
      for (const day of visibleDays) {
        const dayKey = keyYmd(day, workspaceTimezone);
        const el = columnRefs.current.get(dayKey);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (dayKey === fallbackDayKey) fallback = { day, dayKey, rect };
        if (clientX >= rect.left && clientX < rect.right) {
          target = { day, dayKey, rect };
        }
      }
      const hit = target ?? fallback;
      if (!hit) return null;
      return { day: hit.day, dayKey: hit.dayKey, offsetY: clientY - hit.rect.top };
    },
    [visibleDays, workspaceTimezone],
  );

  const handleCardPointerDown = useCallback(
    (
      e: ReactPointerEvent<HTMLElement>,
      row: BookingRow,
      contactName: string,
      contact: ContactRow | null,
    ) => {
      // Left button / touch / pen only. Capture so subsequent move+up route
      // here even when the pointer leaves the card. Do NOT navigate yet —
      // pointer-up decides click-vs-drag.
      if (e.button !== 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag({
        bookingId: row.id,
        originStart: new Date(row.startsAt),
        originEnd: new Date(row.endsAt),
        status: row.status,
        contactId: row.contactId,
        title: row.title,
        contactName,
        contactPhone: contact?.phone ?? null,
        contactEmail: contact?.email ?? null,
        notes: row.notes,
        pointerStartX: e.clientX,
        pointerStartY: e.clientY,
        isDragging: false,
        ghost: null,
      });
    },
    [],
  );

  const handleCardPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const current = dragRef.current;
      if (!current) return;
      const dx = e.clientX - current.pointerStartX;
      const dy = e.clientY - current.pointerStartY;
      const movedEnough =
        current.isDragging ||
        Math.abs(dx) > DRAG_THRESHOLD_PX ||
        Math.abs(dy) > DRAG_THRESHOLD_PX;
      if (!movedEnough) return;

      const hit = resolveDropTarget(
        e.clientX,
        e.clientY,
        keyYmd(current.originStart, workspaceTimezone),
      );
      if (!hit) return;
      const snappedMinutes = snapMinutesFromY(
        hit.offsetY,
        geometry.hourHeightPx,
        geometry.totalHours,
      );
      const topPx = (snappedMinutes / 60) * geometry.hourHeightPx;
      const previewStart = dropToStartUtc(hit.day, hit.offsetY, workspaceTimezone, geometry);
      setDrag({
        ...current,
        isDragging: true,
        ghost: {
          dayKey: hit.dayKey,
          topPx,
          timeLabel: formatDropLabel(previewStart, workspaceTimezone),
        },
      });
    },
    [resolveDropTarget, workspaceTimezone, geometry],
  );

  // Apply an optimistic override + fire the action, reverting on conflict.
  const commitReschedule = useCallback(
    async (
      bookingId: string,
      newStart: Date,
      optimisticPos: OptimisticOverride,
      notify: boolean,
    ) => {
      setOptimistic((prev) => {
        const next = new Map(prev);
        next.set(bookingId, optimisticPos);
        return next;
      });
      const result = await rescheduleBookingAction({
        bookingId,
        newStartsAtISO: newStart.toISOString(),
        notify,
      });
      const clearOverride = () =>
        setOptimistic((prev) => {
          if (!prev.has(bookingId)) return prev;
          const next = new Map(prev);
          next.delete(bookingId);
          return next;
        });

      if (!result.ok) {
        // Conflict / not_found → snap back by clearing the override.
        clearOverride();
        showToast(
          result.error === "conflict"
            ? "That slot's taken."
            : "Couldn't move that booking.",
        );
        return;
      }
      // ok → the server action's revalidatePath('/bookings') already
      // refreshed the RSC payload; router.refresh() refetches it into this
      // tree. That update is async + not awaitable for completion, so we
      // retire the override on a short grace delay. Crucially the override
      // position equals the post-refresh server position for a successful
      // move, so clearing it is visually seamless whenever the new data lands.
      router.refresh();
      window.setTimeout(clearOverride, 600);
    },
    [rescheduleBookingAction, router, showToast],
  );

  const handleCardPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const current = dragRef.current;
      if (!current) return;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // capture may already be released — harmless.
      }

      // Sub-threshold → treat as a click: open the booking-actions modal
      // (cancel / open contact / reschedule tip) instead of navigating
      // straight to the contact. Works for bookings with no contact too.
      if (!current.isDragging) {
        setDrag(null);
        setBookingActions({
          bookingId: current.bookingId,
          title: current.title,
          contactId: current.contactId,
          // contactName in DragState falls back to the generic label when
          // there's no linked contact; pass null so the modal shows
          // "No contact" in that case.
          contactName: current.contactId ? current.contactName : null,
          contactPhone: current.contactId ? current.contactPhone : null,
          contactEmail: current.contactId ? current.contactEmail : null,
          notes: current.notes,
          startsAt: current.originStart,
        });
        return;
      }

      // From here we're handling a real drop. Mark it so the synthetic click
      // that follows pointerup doesn't open the create-popover.
      justDraggedRef.current = true;

      // Drag drop → compute the new UTC start on the dropped column.
      const hit = resolveDropTarget(
        e.clientX,
        e.clientY,
        keyYmd(current.originStart, workspaceTimezone),
      );
      if (!hit) {
        setDrag(null);
        return;
      }
      const newStart = dropToStartUtc(hit.day, hit.offsetY, workspaceTimezone, geometry);
      const snappedMinutes = snapMinutesFromY(
        hit.offsetY,
        geometry.hourHeightPx,
        geometry.totalHours,
      );
      const topPx = (snappedMinutes / 60) * geometry.hourHeightPx;
      const optimisticPos: OptimisticOverride = { dayKey: hit.dayKey, topPx };

      const isProspect =
        Boolean(current.contactId) && current.status !== "blocked";

      if (isProspect) {
        // Prospect → confirm + email. Pin the card optimistically while the
        // confirm card is open so the operator sees where it'll land.
        setOptimistic((prev) => {
          const next = new Map(prev);
          next.set(current.bookingId, optimisticPos);
          return next;
        });
        setPendingConfirm({
          bookingId: current.bookingId,
          title: current.title,
          contactName: current.contactName,
          newStart,
          newTimeLabel: formatDropLabel(newStart, workspaceTimezone),
          status: current.status,
          anchorX: e.clientX,
          anchorY: e.clientY,
          optimistic: optimisticPos,
        });
        setDrag(null);
        return;
      }

      // Blocked → move silently (no email, no confirm).
      setDrag(null);
      void commitReschedule(current.bookingId, newStart, optimisticPos, false);
    },
    [resolveDropTarget, workspaceTimezone, router, commitReschedule, geometry],
  );

  // Escape cancels an in-progress drag (before drop). Pending confirm has its
  // own Escape handler inside RescheduleConfirm.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && dragRef.current) {
        setDrag(null);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <section className="space-y-3 order-1">
      {/* Control row */}
      <div className="px-3 md:px-6 py-2.5 border-b border-border">
        <div className="flex items-center gap-2 md:gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-[280px] shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              placeholder="Search in calendar..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="crm-input pl-9 pr-9 h-8 bg-background"
            />
            <button
              type="button"
              className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex size-6 items-center justify-center rounded hover:bg-accent"
            >
              <Settings className="size-3.5" />
            </button>
          </div>

          <button
            type="button"
            className="crm-pressable inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-sm shadow-xs transition-[background-color,color,transform] duration-150 ease-out hover:bg-accent hover:text-accent-foreground"
            onClick={() => setOffsetDays(0)}
          >
            Today
          </button>

          {/* Day / Week segmented toggle. Switching doesn't reset the offset,
              so "next week" then "Day" lands on a day in that week. */}
          <div className="inline-flex h-8 items-center rounded-md border border-input bg-background p-0.5 shadow-xs">
            {(["day", "week"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={viewMode === mode}
                onClick={() => setViewMode(mode)}
                className={`inline-flex h-7 items-center rounded px-3 text-xs font-medium capitalize transition-colors ${
                  viewMode === mode
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          {/* Month-navigable date picker. The trigger keeps the week-span
              label; the popover opens a month grid (prev/next month arrows,
              today highlighted) whose day clicks jump the week view via the
              same offsetDays mechanism the prev/next-week arrows use. */}
          <BookingDatePicker
            label={
              viewMode === "day"
                ? labelRangeEnd(visibleDays[0], workspaceTimezone)
                : `${labelRangeStart(visibleDays[0], workspaceTimezone)} - ${labelRangeEnd(visibleDays[visibleDays.length - 1], workspaceTimezone)}`
            }
            selectedDay={utcMidnightToLocalDay(visibleDays[0])}
            today={utcMidnightToLocalDay(todayInZone(workspaceTimezone))}
            onSelectDate={handleJumpToDate}
          />

          <div className="ml-auto" />

          <div className="relative">
            <button
              type="button"
              className="crm-pressable inline-flex h-8 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm shadow-xs transition-[background-color,color,transform] duration-150 ease-out hover:bg-accent hover:text-accent-foreground"
              onClick={() => setShowFilterMenu((cur) => !cur)}
            >
              <SlidersHorizontal className="size-4" />
              <span className="hidden sm:inline text-xs">Filter</span>
            </button>
            {showFilterMenu ? (
              <div className="absolute right-0 top-10 z-20 min-w-[170px] rounded-md border border-border bg-card shadow-sm">
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm text-foreground hover:bg-accent"
                  onClick={() => {
                    setShowFilterMenu(false);
                    setShowFilterNotice(true);
                    window.setTimeout(() => setShowFilterNotice(false), 2200);
                  }}
                >
                  Scheduled only
                </button>
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm text-foreground hover:bg-accent"
                  onClick={() => {
                    setShowFilterMenu(false);
                    setShowFilterNotice(true);
                    window.setTimeout(() => setShowFilterNotice(false), 2200);
                  }}
                >
                  Completed only
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Week grid. Fix 1: a CSS grid of [time-gutter, 7×1fr] makes the 7 day
          columns share the row width with NO horizontal scroll, and the hour
          rows are sized (geometry.hourHeightPx) so the bounded business-hours
          window fits with no vertical scroll. overflow-y-auto remains only as a
          graceful fallback for unusually long ranges. */}
      <div className="flex flex-col w-full overflow-y-auto rounded-xl border bg-card">
        {/* Day-header row */}
        <div
          className="grid border-b border-border bg-background"
          style={{
            gridTemplateColumns: `${TIME_GUTTER_PX}px repeat(${visibleDays.length}, minmax(0, 1fr))`,
          }}
        >
          <div className="flex items-center justify-center gap-1 p-1 border-r border-border">
            <button
              type="button"
              aria-label="Previous"
              className="crm-pressable inline-flex size-6 items-center justify-center rounded transition-[background-color,transform] duration-150 ease-out hover:bg-accent"
              onClick={() => setOffsetDays((cur) => cur - (viewMode === "day" ? 1 : 7))}
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Next"
              className="crm-pressable inline-flex size-6 items-center justify-center rounded transition-[background-color,transform] duration-150 ease-out hover:bg-accent"
              onClick={() => setOffsetDays((cur) => cur + (viewMode === "day" ? 1 : 7))}
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
          {visibleDays.map((day) => {
            const closed = resolveDayAvailability(day, workspaceTimezone, workspaceBookingRules).closed;
            return (
              <div
                key={day.toISOString()}
                className={`min-w-0 border-r border-border last:border-r-0 p-1.5 md:p-2 flex items-center ${closed ? "bg-muted/40" : ""}`}
              >
                <div
                  className={`truncate text-xs md:text-sm font-medium ${closed ? "text-muted-foreground" : "text-foreground"}`}
                >
                  {dayHeaderLabel(day, workspaceTimezone)}
                </div>
              </div>
            );
          })}
        </div>

        {/* Time gutter + day columns. Each hour row is geometry.hourHeightPx tall. */}
        <div
          className="grid"
          style={{
            gridTemplateColumns: `${TIME_GUTTER_PX}px repeat(${visibleDays.length}, minmax(0, 1fr))`,
          }}
        >
          {/* Time gutter — hour labels for the bounded visible range. */}
          <div
            className="border-r border-border bg-background"
            style={{ height: `${geometry.bodyHeightPx}px` }}
          >
            {hourLabels.map((hour) => (
              <div
                key={hour}
                className="border-b border-border/60 text-[10px] text-muted-foreground px-1.5 pt-1 text-right"
                style={{ height: `${geometry.hourHeightPx}px` }}
              >
                {hour}:00
              </div>
            ))}
          </div>

          {visibleDays.map((day) => {
            const key = keyYmd(day, workspaceTimezone);
            const events = eventsByDay.get(key) ?? [];
            const dayAvail = resolveDayAvailability(day, workspaceTimezone, workspaceBookingRules);
            const ghostHere =
              drag?.isDragging && drag.ghost?.dayKey === key ? drag.ghost : null;
            return (
              <div
                key={key}
                ref={(el) => {
                  if (el) columnRefs.current.set(key, el);
                  else columnRefs.current.delete(key);
                }}
                className={`min-w-0 border-r border-border last:border-r-0 relative ${dayAvail.closed ? "bg-muted/40 cursor-default" : "cursor-pointer"}`}
                style={{ height: `${geometry.bodyHeightPx}px` }}
                onClick={(e) => {
                  // Suppress the create-popover for the synthetic click that
                  // immediately follows a drag-drop's pointerup. Also bail if a
                  // gesture is somehow still live.
                  if (justDraggedRef.current) {
                    justDraggedRef.current = false;
                    return;
                  }
                  if (dragRef.current) return;
                  // Closed day → not bookable; ignore the click (Fix 3).
                  if (dayAvail.closed) return;
                  // offsetY relative to this column element → snapped UTC start.
                  const rect = e.currentTarget.getBoundingClientRect();
                  const startUtc = dropToStartUtc(day, e.clientY - rect.top, workspaceTimezone, geometry);
                  setPopover({
                    startsAt: startUtc,
                    anchorX: e.clientX,
                    anchorY: e.clientY,
                  });
                }}
              >
                {/* Hour cells — one per visible hour. Open/bookable cells get a
                    subtle hover affordance + "+" cue (Fix 2) and are real,
                    keyboard-focusable buttons (Enter/Space opens the create
                    popover at that hour). Off-hours cells inside an enabled day
                    are muted + non-interactive (Fix 3); a closed day is already
                    greyed by the column bg, so its cells stay plain divs. The
                    column's own onClick still handles fine-grained Y→time clicks
                    for the mouse; these buttons add the keyboard path + the
                    visible affordance. */}
                {hourLabels.map((hour) => {
                  const open = isHourCellOpen(hour, dayAvail);
                  if (!open) {
                    return (
                      <div
                        key={hour}
                        className={
                          dayAvail.closed
                            ? "border-b border-border/60"
                            : "border-b border-border/60 bg-muted/30"
                        }
                        style={{ height: `${geometry.hourHeightPx}px` }}
                      />
                    );
                  }
                  return (
                    <button
                      key={hour}
                      type="button"
                      aria-label={`Add booking — ${cellSlotLabel(day, hour, workspaceTimezone)}`}
                      className="group/cell relative block w-full border-b border-border/60 text-left transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-primary/5 focus-visible:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 motion-reduce:transition-none"
                      style={{ height: `${geometry.hourHeightPx}px` }}
                      onClick={(e) => {
                        // Open at this cell's hour. stopPropagation so the
                        // column's Y-based onClick doesn't also fire.
                        e.stopPropagation();
                        if (justDraggedRef.current) {
                          justDraggedRef.current = false;
                          return;
                        }
                        if (dragRef.current) return;
                        const [year, month, dayNum] = ymdInZone(day, workspaceTimezone);
                        const startUtc = buildStartUtc(year, month, dayNum, hour, 0, workspaceTimezone);
                        setPopover({ startsAt: startUtc, anchorX: e.clientX, anchorY: e.clientY });
                      }}
                    >
                      <span
                        aria-hidden
                        className="pointer-events-none absolute right-1.5 top-1 inline-flex size-4 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/cell:opacity-100 group-focus-visible/cell:opacity-100 motion-reduce:transition-none"
                      >
                        <Plus className="size-3.5" />
                      </span>
                    </button>
                  );
                })}

                {/* Drag ghost — follows the pointer to the snapped slot while
                    dragging, showing the booking title + live target time. */}
                {ghostHere ? (
                  <div
                    className="pointer-events-none absolute left-2 right-2 z-30 rounded-lg border-2 border-dashed border-primary/70 bg-primary/10 p-2"
                    style={{ top: `${ghostHere.topPx}px`, height: `${geometry.hourHeightPx - 4}px` }}
                  >
                    <p className="truncate text-xs font-medium text-foreground">
                      {drag?.title}
                    </p>
                    <p className="mt-1 truncate text-[10px] text-primary">
                      {ghostHere.timeLabel}
                    </p>
                  </div>
                ) : null}

                {/* v1.40.13 — booking cards absolutely positioned by start
                    time in workspace TZ. Pointer handlers (Task 8) own
                    click-vs-drag: a click navigates to the contact, a drag
                    reschedules. stopPropagation on click keeps the column's
                    create-popover from also firing. */}
                {events.map((row) => {
                  const startsAt = new Date(row.startsAt);
                  const linkedContact = row.contactId
                    ? contactsById.get(row.contactId)
                    : null;
                  const contactName = linkedContact
                    ? `${linkedContact.firstName} ${linkedContact.lastName ?? ""}`.trim()
                    : labels.contact.singular;
                  const borderClass =
                    borderByTitle.get(row.title.trim().toLowerCase()) ??
                    "border-l-primary";
                  const top = bookingTopPx(startsAt, workspaceTimezone, geometry);

                  // Optimistic override: while a reschedule for this booking is
                  // in flight (or awaiting confirm), render it at the new
                  // top. If the override targets ANOTHER column, hide it here
                  // (it renders in that column's events instead — see below).
                  const override = optimistic.get(row.id);
                  const overrideStyle = override
                    ? override.dayKey === key
                      ? { top: `${override.topPx}px` }
                      : { display: "none" }
                    : undefined;
                  const isActivelyDragging =
                    drag?.isDragging === true && drag.bookingId === row.id;

                  return (
                    <div key={row.id} onClick={(e) => e.stopPropagation()}>
                      <BookingCard
                        row={row}
                        contactName={contactName}
                        workspaceTimezone={workspaceTimezone}
                        top={top}
                        borderClass={borderClass}
                        styleOverride={overrideStyle}
                        isDragging={isActivelyDragging}
                        onPointerDown={(e) => handleCardPointerDown(e, row, contactName, linkedContact ?? null)}
                        onPointerMove={handleCardPointerMove}
                        onPointerUp={handleCardPointerUp}
                      />
                    </div>
                  );
                })}

                {/* Optimistic cross-column render: a booking whose optimistic
                    override moved it INTO this column (from a different day)
                    is drawn here so the move is visible immediately. */}
                {bookings.map((row) => {
                  const override = optimistic.get(row.id);
                  if (!override || override.dayKey !== key) return null;
                  // Skip if the booking natively belongs to this column — it's
                  // already rendered in the events loop above.
                  if (keyYmd(new Date(row.startsAt), workspaceTimezone) === key) {
                    return null;
                  }
                  const linkedContact = row.contactId
                    ? contactsById.get(row.contactId)
                    : null;
                  const contactName = linkedContact
                    ? `${linkedContact.firstName} ${linkedContact.lastName ?? ""}`.trim()
                    : labels.contact.singular;
                  const borderClass =
                    borderByTitle.get(row.title.trim().toLowerCase()) ??
                    "border-l-primary";
                  return (
                    <div key={`opt-${row.id}`} onClick={(e) => e.stopPropagation()}>
                      <BookingCard
                        row={row}
                        contactName={contactName}
                        workspaceTimezone={workspaceTimezone}
                        top={override.topPx}
                        borderClass={borderClass}
                        onPointerDown={(e) => handleCardPointerDown(e, row, contactName, linkedContact ?? null)}
                        onPointerMove={handleCardPointerMove}
                        onPointerUp={handleCardPointerUp}
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {showFilterNotice ? (
        <div className="fixed bottom-4 right-4 z-70 rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm">
          Coming soon
        </div>
      ) : null}

      {popover ? (
        <CreatePopover
          startsAt={popover.startsAt}
          workspaceTimezone={workspaceTimezone}
          contacts={contacts}
          bookingTypes={bookingTypes}
          anchorX={popover.anchorX}
          anchorY={popover.anchorY}
          createBookingAction={createBookingAction}
          createBlockedTimeAction={createBlockedTimeAction}
          onCreated={() => router.refresh()}
          onClose={() => setPopover(null)}
        />
      ) : null}

      {/* Booking-actions modal — opened by a plain click on a booking card.
          cancelBookingAction revalidates /bookings server-side; router.refresh()
          pulls the updated RSC payload into this tree so the cancelled card
          drops off the calendar. */}
      {bookingActions ? (
        <BookingActions
          bookingId={bookingActions.bookingId}
          title={bookingActions.title}
          contactName={bookingActions.contactName}
          contactId={bookingActions.contactId}
          contactPhone={bookingActions.contactPhone}
          contactEmail={bookingActions.contactEmail}
          notes={bookingActions.notes}
          startsAt={bookingActions.startsAt}
          workspaceTimezone={workspaceTimezone}
          cancelBookingAction={cancelBookingAction}
          updateBookingNotesAction={updateBookingNotesAction}
          onCancelled={() => router.refresh()}
          onClose={() => setBookingActions(null)}
        />
      ) : null}

      {/* Task 8 — prospect reschedule confirmation. Confirm fires the action
          (notify:true → email the contact); Cancel discards and snaps the
          card back by clearing its optimistic override. */}
      {pendingConfirm ? (
        <RescheduleConfirm
          title={pendingConfirm.title}
          newTimeLabel={pendingConfirm.newTimeLabel}
          contactName={pendingConfirm.contactName}
          anchorX={pendingConfirm.anchorX}
          anchorY={pendingConfirm.anchorY}
          onConfirm={() => {
            const confirmed = pendingConfirm;
            setPendingConfirm(null);
            void commitReschedule(
              confirmed.bookingId,
              confirmed.newStart,
              confirmed.optimistic,
              true,
            );
          }}
          onCancel={() => {
            const cancelled = pendingConfirm;
            setPendingConfirm(null);
            setOptimistic((prev) => {
              const next = new Map(prev);
              next.delete(cancelled.bookingId);
              return next;
            });
          }}
        />
      ) : null}

      {/* Task 8 — conflict / error toast (e.g. "That slot's taken."). */}
      {toast ? (
        <div className="fixed bottom-4 right-4 z-70 rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm">
          {toast}
        </div>
      ) : null}
    </section>
  );
}
