// src/lib/operator-portal/calendar.ts
// Pure — no I/O. TZ-correct via Intl.DateTimeFormat (same approach as
// bookings/actions.ts partsInTimezone). Never use Date.get*() methods —
// those are server-local (UTC on Vercel).

export type CalendarBooking = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  title: string;
  fullName: string | null;
  contactId: string | null;
  status: string;
};

export type CalendarDay = {
  year: number;
  month: number; // 1-indexed
  day: number;
  isCurrentMonth: boolean;
  bookings: CalendarBooking[];
};

export type CalendarWeek = {
  days: CalendarDay[]; // always 7
};

export type MonthGrid = {
  year: number;
  month: number; // 1-indexed
  weeks: CalendarWeek[];
};

export type WeekStrip = {
  days: CalendarDay[]; // always 7
};

/**
 * Extract date components from a UTC Date in a given IANA timezone.
 * Returns { year, month (1-indexed), day, weekdayIndex (0=Sun..6=Sat) }.
 */
function partsInTz(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return {
    year: parseInt(parts.year ?? "0", 10),
    month: parseInt(parts.month ?? "0", 10),
    day: parseInt(parts.day ?? "0", 10),
    weekdayIndex: weekdayMap[parts.weekday ?? "Sun"] ?? 0,
  };
}

/**
 * Build a UTC Date representing midnight at the start of a given
 * local Y-M-D in the target timezone. Uses the offset-correction
 * trick from bookings/actions.ts utcMomentForLocalTime.
 */
function localMidnightUtc(year: number, month: number, day: number, timeZone: string): Date {
  const naive = new Date(Date.UTC(year, month - 1, day, 0, 0));
  if (timeZone === "UTC") return naive;
  const parts = partsInTz(naive, timeZone);
  const intendedMs = Date.UTC(year, month - 1, day, 0, 0);
  const actualMs = Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0);
  return new Date(naive.getTime() + (intendedMs - actualMs));
}

/** Add `days` calendar days to a UTC midnight Date in the given TZ. */
function addDays(utcMidnight: Date, days: number, timeZone: string): Date {
  const p = partsInTz(utcMidnight, timeZone);
  return localMidnightUtc(p.year, p.month, p.day + days, timeZone);
}

function buildDayCell(
  year: number,
  month: number,
  day: number,
  currentMonth: number,
  bookings: CalendarBooking[]
): CalendarDay {
  return { year, month, day, isCurrentMonth: month === currentMonth, bookings };
}

/**
 * Build a month grid for the month containing `anchor`.
 * Grid starts on Monday (ISO week). Bookings are bucketed by their
 * local date in `tz`.
 */
export function buildMonthGrid(
  bookings: CalendarBooking[],
  anchor: Date,
  tz: string
): MonthGrid {
  const anchorParts = partsInTz(anchor, tz);
  const { year, month } = anchorParts;

  // First day of this month in TZ
  const firstOfMonth = localMidnightUtc(year, month, 1, tz);
  const firstParts = partsInTz(firstOfMonth, tz);
  // ISO week starts Monday; offset = (weekdayIndex - 1 + 7) % 7
  const firstWeekdayOffset = (firstParts.weekdayIndex - 1 + 7) % 7;

  // Last day of this month
  const lastOfMonth = localMidnightUtc(year, month + 1, 0, tz);
  const lastParts = partsInTz(lastOfMonth, tz);
  const totalDays = lastParts.day;

  // Build a map: "YYYY-MM-DD" → booking[]
  const bookingMap = new Map<string, CalendarBooking[]>();
  for (const b of bookings) {
    const p = partsInTz(b.startsAt, tz);
    const key = `${p.year}-${p.month}-${p.day}`;
    const arr = bookingMap.get(key) ?? [];
    arr.push(b);
    bookingMap.set(key, arr);
  }

  // Grid cell start = first day of month - offset (may be prev month)
  const gridStart = addDays(firstOfMonth, -firstWeekdayOffset, tz);

  const weeks: CalendarWeek[] = [];
  let cursor = gridStart;

  // Generate weeks until we've covered the whole month
  let cellIdx = 0;
  while (true) {
    const days: CalendarDay[] = [];
    for (let d = 0; d < 7; d++) {
      const cp = partsInTz(cursor, tz);
      const key = `${cp.year}-${cp.month}-${cp.day}`;
      days.push(buildDayCell(cp.year, cp.month, cp.day, month, bookingMap.get(key) ?? []));
      cursor = addDays(cursor, 1, tz);
      cellIdx++;
    }
    weeks.push({ days });
    // Stop when we've passed the last day of the month
    const lastCellParts = partsInTz(addDays(cursor, -1, tz), tz);
    if (
      (lastCellParts.year > year || lastCellParts.month > month) &&
      cellIdx >= firstWeekdayOffset + totalDays
    ) {
      break;
    }
    if (weeks.length >= 6) break; // safety — never more than 6 rows
  }

  return { year, month, weeks };
}

/**
 * Build a 7-day week strip (Mon–Sun) for the week containing `anchor`.
 */
export function buildWeekStrip(
  bookings: CalendarBooking[],
  anchor: Date,
  tz: string
): WeekStrip {
  const anchorParts = partsInTz(anchor, tz);
  const anchorMidnight = localMidnightUtc(anchorParts.year, anchorParts.month, anchorParts.day, tz);
  const weekdayOffset = (anchorParts.weekdayIndex - 1 + 7) % 7; // ISO: Mon=0
  const weekStart = addDays(anchorMidnight, -weekdayOffset, tz);

  // Build booking map
  const bookingMap = new Map<string, CalendarBooking[]>();
  for (const b of bookings) {
    const p = partsInTz(b.startsAt, tz);
    const key = `${p.year}-${p.month}-${p.day}`;
    const arr = bookingMap.get(key) ?? [];
    arr.push(b);
    bookingMap.set(key, arr);
  }

  const days: CalendarDay[] = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStart, i, tz);
    const dp = partsInTz(d, tz);
    const key = `${dp.year}-${dp.month}-${dp.day}`;
    days.push({
      year: dp.year,
      month: dp.month,
      day: dp.day,
      isCurrentMonth: true,
      bookings: bookingMap.get(key) ?? [],
    });
  }

  return { days };
}
