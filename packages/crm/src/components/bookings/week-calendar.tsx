"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useRouter } from "next/navigation";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Search, Settings, SlidersHorizontal } from "lucide-react";
import {
  WEEK_VIEW_START_HOUR,
  WEEK_VIEW_END_HOUR,
  HOUR_HEIGHT_PX,
  yToSnappedMinutes,
  minutesToClock,
} from "@/lib/bookings/calendar-math";
import { BookingCard } from "@/components/bookings/booking-card";
import { CreatePopover } from "@/components/bookings/create-popover";
import { RescheduleConfirm } from "@/components/bookings/reschedule-confirm";

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
};

type ContactRow = {
  id: string;
  firstName: string;
  lastName: string | null;
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
// Grid constants (derived from calendar-math.ts)
// ---------------------------------------------------------------------------

const WEEK_VIEW_TOTAL_HEIGHT_PX =
  (WEEK_VIEW_END_HOUR - WEEK_VIEW_START_HOUR) * HOUR_HEIGHT_PX;

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

/** Position a booking card vertically within the week-view day column.
 *  Returns the top offset in px relative to the start of the visible grid
 *  (WEEK_VIEW_START_HOUR). Clamps so off-hours bookings still render at
 *  the top/bottom edge with their real time visible inside the card. */
function bookingTopPx(startsAt: Date, tz: string): number {
  const { hours, minutes } = timeInZone(startsAt, tz);
  const offsetHours = hours + minutes / 60 - WEEK_VIEW_START_HOUR;
  const maxOffset = WEEK_VIEW_END_HOUR - WEEK_VIEW_START_HOUR;
  const clamped = Math.max(0, Math.min(offsetHours, maxOffset - 0.5));
  return clamped * HOUR_HEIGHT_PX;
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
 *  workspace timezone. Pure — all snap math comes from calendar-math.ts. */
function dropToStartUtc(day: Date, offsetY: number, tz: string): Date {
  const snappedMinutes = yToSnappedMinutes(offsetY);
  const { hours, minutes } = minutesToClock(snappedMinutes);
  const [year, month, dayNum] = ymdInZone(day, tz);
  return buildStartUtc(year, month, dayNum, hours, minutes, tz);
}

function addDaysLocal(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeekMonday(date: Date) {
  const next = new Date(date);
  const weekday = next.getDay();
  const diff = weekday === 0 ? -6 : 1 - weekday;
  next.setDate(next.getDate() + diff);
  next.setHours(0, 0, 0, 0);
  return next;
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
  labels,
  bookingTypes,
  createBookingAction,
  createBlockedTimeAction,
  rescheduleBookingAction,
}: WeekCalendarProps) {
  const router = useRouter();
  const [weekOffset, setWeekOffset] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showFilterNotice, setShowFilterNotice] = useState(false);
  const [popover, setPopover] = useState<PopoverState | null>(null);

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

  const weekStart = useMemo(() => {
    const base = addDaysLocal(new Date(), weekOffset * 7);
    return startOfWeekMonday(base);
  }, [weekOffset]);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysLocal(weekStart, i)),
    [weekStart]
  );

  const weekEventsByDay = useMemo(() => {
    const byDay = new Map<string, BookingRow[]>();
    for (const day of weekDays) {
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
  }, [bookings, weekDays, searchQuery, workspaceTimezone]);

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
      for (const day of weekDays) {
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
    [weekDays, workspaceTimezone],
  );

  const handleCardPointerDown = useCallback(
    (
      e: ReactPointerEvent<HTMLElement>,
      row: BookingRow,
      contactName: string,
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
      const snappedMinutes = yToSnappedMinutes(hit.offsetY);
      const topPx = (snappedMinutes / 60) * HOUR_HEIGHT_PX;
      const previewStart = dropToStartUtc(hit.day, hit.offsetY, workspaceTimezone);
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
    [resolveDropTarget, workspaceTimezone],
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

      // Sub-threshold → treat as a click: navigate to the contact if any.
      if (!current.isDragging) {
        setDrag(null);
        if (current.contactId) {
          router.push(`/contacts/${current.contactId}`);
        }
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
      const newStart = dropToStartUtc(hit.day, hit.offsetY, workspaceTimezone);
      const snappedMinutes = yToSnappedMinutes(hit.offsetY);
      const topPx = (snappedMinutes / 60) * HOUR_HEIGHT_PX;
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
    [resolveDropTarget, workspaceTimezone, router, commitReschedule],
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
    <section className="space-y-4 order-2">
      {/* Control row */}
      <div className="px-3 md:px-6 py-4 border-b border-border">
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
            onClick={() => setWeekOffset(0)}
          >
            Today
          </button>

          <button
            type="button"
            className="crm-pressable inline-flex h-8 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm shadow-xs transition-[background-color,color,transform] duration-150 ease-out hover:bg-accent hover:text-accent-foreground"
          >
            <CalendarIcon className="size-4 text-muted-foreground" />
            <span className="text-xs text-foreground">
              {labelRangeStart(weekDays[0], workspaceTimezone)} -{" "}
              {labelRangeEnd(weekDays[6], workspaceTimezone)}
            </span>
          </button>

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

      {/* Week grid */}
      <div className="flex flex-col h-full overflow-x-auto w-full rounded-xl border bg-card">
        {/* Day-header row */}
        <div className="flex border-b border-border sticky top-0 z-30 bg-background w-max min-w-full">
          <div className="w-[80px] md:w-[104px] flex items-center gap-1 md:gap-2 p-1.5 md:p-2 border-r border-border shrink-0">
            <button
              type="button"
              className="crm-pressable inline-flex size-7 md:size-8 items-center justify-center rounded transition-[background-color,transform] duration-150 ease-out hover:bg-accent"
              onClick={() => setWeekOffset((cur) => cur - 1)}
            >
              <ChevronLeft className="size-4 md:size-5" />
            </button>
            <button
              type="button"
              className="crm-pressable inline-flex size-7 md:size-8 items-center justify-center rounded transition-[background-color,transform] duration-150 ease-out hover:bg-accent"
              onClick={() => setWeekOffset((cur) => cur + 1)}
            >
              <ChevronRight className="size-4 md:size-5" />
            </button>
          </div>
          {weekDays.map((day) => (
            <div
              key={day.toISOString()}
              className="flex-1 border-r border-border last:border-r-0 p-1.5 md:p-2 min-w-44 flex items-center"
            >
              <div className="text-xs md:text-sm font-medium text-foreground">
                {dayHeaderLabel(day, workspaceTimezone)}
              </div>
            </div>
          ))}
        </div>

        {/* Time column + day columns */}
        <div className="flex min-w-full w-max">
          {/* v1.40.13 — time column. Each hour is exactly HOUR_HEIGHT_PX tall. */}
          <div
            className="w-[80px] md:w-[104px] border-r border-border shrink-0 bg-background"
            style={{ height: `${WEEK_VIEW_TOTAL_HEIGHT_PX}px` }}
          >
            {Array.from(
              { length: WEEK_VIEW_END_HOUR - WEEK_VIEW_START_HOUR },
              (_, i) => `${i + WEEK_VIEW_START_HOUR}:00`
            ).map((hour) => (
              <div
                key={hour}
                className="border-b border-border/60 text-[10px] text-muted-foreground px-2 pt-1"
                style={{ height: `${HOUR_HEIGHT_PX}px` }}
              >
                {hour}
              </div>
            ))}
          </div>

          {weekDays.map((day) => {
            const key = keyYmd(day, workspaceTimezone);
            const events = weekEventsByDay.get(key) ?? [];
            const ghostHere =
              drag?.isDragging && drag.ghost?.dayKey === key ? drag.ghost : null;
            return (
              <div
                key={key}
                ref={(el) => {
                  if (el) columnRefs.current.set(key, el);
                  else columnRefs.current.delete(key);
                }}
                className="flex-1 min-w-44 border-r border-border last:border-r-0 relative cursor-pointer"
                style={{ height: `${WEEK_VIEW_TOTAL_HEIGHT_PX}px` }}
                onClick={(e) => {
                  // Suppress the create-popover for the synthetic click that
                  // immediately follows a drag-drop's pointerup. Also bail if a
                  // gesture is somehow still live.
                  if (justDraggedRef.current) {
                    justDraggedRef.current = false;
                    return;
                  }
                  if (dragRef.current) return;
                  // offsetY relative to this column element → snapped UTC start.
                  const rect = e.currentTarget.getBoundingClientRect();
                  const startUtc = dropToStartUtc(day, e.clientY - rect.top, workspaceTimezone);
                  setPopover({
                    startsAt: startUtc,
                    anchorX: e.clientX,
                    anchorY: e.clientY,
                  });
                }}
              >
                {/* Hour grid lines — match the time column's row borders */}
                {Array.from(
                  { length: WEEK_VIEW_END_HOUR - WEEK_VIEW_START_HOUR },
                  (_, i) => (
                    <div
                      key={i}
                      className="border-b border-border/60"
                      style={{ height: `${HOUR_HEIGHT_PX}px` }}
                    />
                  )
                )}

                {/* Drag ghost — follows the pointer to the snapped slot while
                    dragging, showing the booking title + live target time. */}
                {ghostHere ? (
                  <div
                    className="pointer-events-none absolute left-2 right-2 z-30 rounded-lg border-2 border-dashed border-primary/70 bg-primary/10 p-2"
                    style={{ top: `${ghostHere.topPx}px`, height: `${HOUR_HEIGHT_PX - 4}px` }}
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
                  const top = bookingTopPx(startsAt, workspaceTimezone);

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
                        onPointerDown={(e) => handleCardPointerDown(e, row, contactName)}
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
                        onPointerDown={(e) => handleCardPointerDown(e, row, contactName)}
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
          onClose={() => setPopover(null)}
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
