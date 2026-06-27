// P2.1-T1 — "is this cron due right now?" — the pure window predicate the
// schedule cron uses to decide whether an authored *scheduled* agent should fire.
//
// The schedule cron (/api/cron/schedule-agents) runs every 15 minutes and must
// answer, for each deployment's `blueprint.trigger.cron`: did a scheduled hit
// land in the window we're responsible for since the last tick? `isCronDueWithin`
// is that question. It is the dual of cron.ts::computeNextFireAt (which walks
// FORWARD to the next hit); here we walk BACKWARD a bounded number of minutes
// from `now` and ask "did the cron match on any whole minute in
// `[now - windowMinutes, now]` (in `tz`)?".
//
// WHY a backward minute-scan (not computeNextFireAt): the cron only needs a
// SMALL fixed window (the cron cadence, 15 min) and a yes/no answer keyed on the
// CURRENT tick, not the next future fire. A 15-minute backward scan is at most 16
// cheap Intl projections and is trivially correct for the shapes the generator
// emits (`0 9 * * 1` weekly-Monday-9am, `0 9 * * *` daily-9am, `*/15 * * * *`).
// It reuses cron.ts's field parser + tz validator verbatim, so the matching
// semantics are identical to the rest of the cron stack.
//
// Conservative + PURE + NEVER throws: an unparseable cron / invalid tz / junk
// input returns `false` (a malformed schedule simply never fires — the safe
// direction for a thing that triggers outbound agents). No I/O, no "use server",
// no clock — safe from a route handler, an action, the runtime, or a test.

import { parseCronField, isValidIanaTimezone } from "@/lib/agents/cron";

/** A parsed 5-field cron, mirroring cron.ts's internal shape. */
type ParsedCron = {
  minute: { matches: (v: number) => boolean };
  hour: { matches: (v: number) => boolean };
  dom: { matches: (v: number) => boolean };
  month: { matches: (v: number) => boolean };
  dow: { matches: (v: number) => boolean };
};

/** Parse a 5-field POSIX cron into matchers, or null when malformed. Same field
 *  bounds + the same `parseCronField` cron.ts uses, so a cron that's valid there
 *  is valid here (and vice-versa). Pure; never throws. */
function parseCron(expr: string): ParsedCron | null {
  if (typeof expr !== "string") return null;
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return null;
  const minute = parseCronField(fields[0], 0, 59);
  const hour = parseCronField(fields[1], 0, 23);
  const dom = parseCronField(fields[2], 1, 31);
  const month = parseCronField(fields[3], 1, 12);
  const dow = parseCronField(fields[4], 0, 6);
  if (!minute || !hour || !dom || !month || !dow) return null;
  return { minute, hour, dom, month, dow };
}

/** Map a `weekday: "short"` Intl token to the cron day-of-week index (Sun=0). */
function weekdayShortToIndex(short: string): number {
  switch (short) {
    case "Sun":
      return 0;
    case "Mon":
      return 1;
    case "Tue":
      return 2;
    case "Wed":
      return 3;
    case "Thu":
      return 4;
    case "Fri":
      return 5;
    case "Sat":
      return 6;
    default:
      return -1; // won't match any cron dow field
  }
}

/** Does the parsed cron match the wall-clock of `instant` in `tz`? Projects the
 *  UTC instant onto the tz wall clock via Intl (language-neutral) and tests all
 *  five fields — byte-identical to cron.ts::matchesAtUtc. Pure; never throws
 *  (a bad tz is pre-rejected by the caller). */
function matchesAtUtc(parsed: ParsedCron, tz: string, instant: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
    weekday: "short",
  }).formatToParts(instant);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const minute = Number(get("minute"));
  // hour12:false still emits "24" at midnight on some locales; normalize to 0-23.
  const hour = Number(get("hour")) % 24;
  const dom = Number(get("day"));
  const month = Number(get("month"));
  const dow = weekdayShortToIndex(get("weekday"));

  return (
    parsed.minute.matches(minute) &&
    parsed.hour.matches(hour) &&
    parsed.dom.matches(dom) &&
    parsed.month.matches(month) &&
    parsed.dow.matches(dow)
  );
}

/** Upper bound on the backward scan (minutes). The cron cadence is 15 min; we
 *  clamp the window to a day so a degenerate caller can't make this loop ~forever
 *  (a window past this is almost certainly a bug). */
const MAX_WINDOW_MINUTES = 24 * 60;

/**
 * Is `cron` "due" at `nowMs` — i.e. did a scheduled hit land within the last
 * `windowMinutes` (inclusive of both endpoints), evaluated in IANA `tz`?
 *
 * Walks backward from the whole minute at/just-before `nowMs`, one minute at a
 * time, up to `windowMinutes` steps, testing the cron against each minute's
 * `tz` wall-clock. Returns true on the FIRST match. The window is half-bounded by
 * MAX_WINDOW_MINUTES and floored at 0.
 *
 * Conservative + PURE — NEVER throws:
 *   • a non-finite `nowMs`           → false
 *   • an unparseable / non-5-field cron → false (a malformed schedule never fires)
 *   • an invalid / blank IANA tz      → false
 *   • a non-positive `windowMinutes`  → tests ONLY the current minute (window 0)
 *
 * @param cron           a 5-field POSIX cron (e.g. "0 9 * * 1", "0 9 * * *", "*\/15 * * * *")
 * @param nowMs          the current time in epoch ms (the cron tick's `Date.now()`)
 * @param windowMinutes  how far back to consider a hit "due" (match the cron cadence)
 * @param tz             the IANA timezone the cron's wall-clock is interpreted in
 */
export function isCronDueWithin(
  cron: string,
  nowMs: number,
  windowMinutes: number,
  tz: string,
): boolean {
  if (typeof nowMs !== "number" || !Number.isFinite(nowMs)) return false;
  if (!isValidIanaTimezone(tz)) return false;

  const parsed = parseCron(cron);
  if (!parsed) return false;

  // Clamp the window: a non-finite/negative window → 0 (just the current minute);
  // an absurd window → MAX_WINDOW_MINUTES (so the loop is always bounded).
  let window = typeof windowMinutes === "number" && Number.isFinite(windowMinutes)
    ? Math.floor(windowMinutes)
    : 0;
  if (window < 0) window = 0;
  if (window > MAX_WINDOW_MINUTES) window = MAX_WINDOW_MINUTES;

  // Snap to the whole minute at/just before now (zero the seconds/ms), then scan
  // back `window` whole minutes — `window + 1` instants total (inclusive both ends).
  const cursor = new Date(nowMs);
  cursor.setUTCSeconds(0, 0);

  for (let i = 0; i <= window; i += 1) {
    if (matchesAtUtc(parsed, tz, cursor)) return true;
    cursor.setUTCMinutes(cursor.getUTCMinutes() - 1);
  }
  return false;
}
