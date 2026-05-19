// buildRunContext + helpers — stamps a RunContext at startRun and
// rebuilds it lazily on access if the persisted column is null
// (existing pre-Phase-1 runs).
import type { RunContextClock } from "./run-context";

/**
 * Format a wall-clock instant as { nowIso, today, tomorrow,
 * todayWeekday } in the given IANA timezone. Falls back to UTC if
 * the tz string is invalid.
 */
export function buildClock(now: Date, timezone: string): RunContextClock {
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const nowIso = now.toISOString();

  // Try Intl with the workspace tz; fall back to UTC if Intl throws.
  let today = now.toISOString().slice(0, 10);
  let tomorrowStr = tomorrow.toISOString().slice(0, 10);
  let todayWeekday = new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(now);
  try {
    const dateFmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    today = dateFmt.format(now);
    tomorrowStr = dateFmt.format(tomorrow);
    const weekdayFmt = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "long" });
    todayWeekday = weekdayFmt.format(now);
  } catch {
    // tz string was invalid — UTC fallback already in place
  }

  return { nowIso, today, tomorrow: tomorrowStr, todayWeekday };
}
