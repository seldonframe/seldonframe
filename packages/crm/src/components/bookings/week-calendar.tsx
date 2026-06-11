"use client";

import { useMemo, useState } from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Search, Settings, SlidersHorizontal } from "lucide-react";
import {
  WEEK_VIEW_START_HOUR,
  WEEK_VIEW_END_HOUR,
  HOUR_HEIGHT_PX,
} from "@/lib/bookings/calendar-math";
import { BookingCard } from "@/components/bookings/booking-card";

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

type WeekCalendarProps = {
  bookings: BookingRow[];
  contacts: ContactRow[];
  workspaceTimezone: string;
  labels: {
    contact: { singular: string; plural: string };
    activity: { singular: string; plural: string };
  };
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

export function WeekCalendar({
  bookings,
  contacts,
  workspaceTimezone,
  labels,
}: WeekCalendarProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showFilterNotice, setShowFilterNotice] = useState(false);

  const contactsById = useMemo(
    () => new Map(contacts.map((c) => [c.id, c])),
    [contacts]
  );

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
            return (
              <div
                key={key}
                className="flex-1 min-w-44 border-r border-border last:border-r-0 relative"
                style={{ height: `${WEEK_VIEW_TOTAL_HEIGHT_PX}px` }}
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
                {/* v1.40.13 — booking cards absolutely positioned by start
                    time in workspace TZ. */}
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

                  return (
                    <BookingCard
                      key={row.id}
                      row={row}
                      contactName={contactName}
                      workspaceTimezone={workspaceTimezone}
                      top={top}
                      borderClass={borderClass}
                    />
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
    </section>
  );
}
