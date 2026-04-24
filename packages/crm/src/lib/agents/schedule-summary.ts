// Display helpers for scheduled triggers on the /agents/runs admin
// page.
//
// Shipped in SLICE 5 PR 2 C4 per audit §4.5 + G-5-6.
//
// Pure-logic formatters; no React, no DB — the SchedulesSection
// server component imports these to render each row.
//
// NOT comprehensive cron humanization — the common patterns ship,
// anything unusual falls back to the raw expression. Builders who
// author non-standard crons see the raw form, which is still
// debuggable.

// ---------------------------------------------------------------------
// formatNextFireRelative
// ---------------------------------------------------------------------

export function formatNextFireRelative(nextFireAt: Date, now: Date): string {
  const deltaMs = nextFireAt.getTime() - now.getTime();
  if (deltaMs < 0) return "overdue";

  const seconds = Math.floor(deltaMs / 1000);
  if (seconds < 60) return "in less than a minute";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `in ${minutes} ${minutes === 1 ? "minute" : "minutes"}`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `in ${hours} ${hours === 1 ? "hour" : "hours"}`;

  const days = Math.floor(hours / 24);
  if (days <= 30) return `in ${days} ${days === 1 ? "day" : "days"}`;

  // More than a month — render an absolute date.
  const month = nextFireAt.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const day = nextFireAt.getUTCDate();
  return `on ${month} ${day}`;
}

// ---------------------------------------------------------------------
// summarizeCron — common-pattern humanization
// ---------------------------------------------------------------------

/**
 * Best-effort humanization of POSIX 5-field cron. Falls back to the
 * raw expression when no common pattern matches.
 */
export function summarizeCron(expr: string): string {
  if (typeof expr !== "string") return String(expr);
  const raw = expr.trim();
  const fields = raw.split(/\s+/);
  if (fields.length !== 5) return raw;

  const [minute, hour, dom, month, dow] = fields;

  // every minute
  if (minute === "*" && hour === "*" && dom === "*" && month === "*" && dow === "*") {
    return "every minute";
  }

  // every N minutes (e.g., */5 * * * *)
  const everyN = minute.match(/^\*\/(\d+)$/);
  if (everyN && hour === "*" && dom === "*" && month === "*" && dow === "*") {
    return `every ${everyN[1]} minutes`;
  }

  // hourly on the hour
  if (minute === "0" && hour === "*" && dom === "*" && month === "*" && dow === "*") {
    return "hourly";
  }

  // every N hours (e.g., 0 */2 * * *)
  const everyNHours = hour.match(/^\*\/(\d+)$/);
  if (minute === "0" && everyNHours && dom === "*" && month === "*" && dow === "*") {
    return `every ${everyNHours[1]} hours`;
  }

  // daily at H:MM or H:0 (pad minute to two digits)
  const minuteInt = Number(minute);
  const hourInt = Number(hour);
  const isDaily =
    Number.isInteger(minuteInt) &&
    Number.isInteger(hourInt) &&
    dom === "*" &&
    month === "*" &&
    dow === "*";
  if (isDaily) {
    return `daily at ${hourInt}:${pad2(minuteInt)}`;
  }

  // Weekly: 0-6 on the day-of-week field, scalar dom/month
  const weeklyDow = Number(dow);
  const isWeekly =
    Number.isInteger(minuteInt) &&
    Number.isInteger(hourInt) &&
    dom === "*" &&
    month === "*" &&
    Number.isInteger(weeklyDow) &&
    weeklyDow >= 0 &&
    weeklyDow <= 6;
  if (isWeekly) {
    return `${dayOfWeekName(weeklyDow)} at ${hourInt}:${pad2(minuteInt)}`;
  }

  // Monthly on Nth day
  const domInt = Number(dom);
  const isMonthly =
    Number.isInteger(minuteInt) &&
    Number.isInteger(hourInt) &&
    Number.isInteger(domInt) &&
    month === "*" &&
    dow === "*";
  if (isMonthly) {
    return `monthly on the ${ordinal(domInt)} at ${hourInt}:${pad2(minuteInt)}`;
  }

  return raw;
}

// ---------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function dayOfWeekName(dow: number): string {
  switch (dow) {
    case 0: return "Sundays";
    case 1: return "Mondays";
    case 2: return "Tuesdays";
    case 3: return "Wednesdays";
    case 4: return "Thursdays";
    case 5: return "Fridays";
    case 6: return "Saturdays";
    default: return `day ${dow}`;
  }
}

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}
