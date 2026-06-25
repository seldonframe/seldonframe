// Per-client booking rules — the pure policy engine.
//
// A deployed agent that books appointments obeys a `BookingPolicy`: appointment
// length, buffer, daily cap, lead time, business-hours window (weekday set +
// start/end), timezone, and the fields it must collect before booking. The
// template (the product) declares sensible DEFAULTS; the deployment (the client's
// instance) overrides them. This module owns:
//   - the `BookingPolicy` type + `SYSTEM_DEFAULTS`
//   - `resolveBookingPolicy(deployment?, template?, workspaceTimezone?)` — the
//     single source of truth: field-by-field precedence + input clamping
//   - `generateCandidateSlots(policy, dateISO, now)` — the tz-correct, injected-
//     clock slot generator the booking tools intersect with real free/busy
//
// Pure: no I/O, no DB, and no clock except the injected `now`. Nothing here may
// throw on bad input — a live call must always end up with a usable policy and a
// sane slot list, so invalid stored values are clamped to safe defaults rather
// than rejected.

import { parseHoursText } from "@/lib/onboarding/parse-hours";

export type BookingPolicy = {
  durationMinutes: number; // appointment length
  bufferMinutes: number; // gap enforced between bookings
  maxPerDay: number | null; // cap on bookings/day; null = no cap
  leadTimeHours: number; // minimum notice before a slot
  timezone: string; // IANA, e.g. "America/Chicago"
  weekdays: number[]; // 0=Sun..6=Sat
  startTime: string; // "HH:MM" 24h
  endTime: string; // "HH:MM" 24h
  requiredFields: string[]; // collected before booking
};

/** Out-of-the-box rules: Mon–Fri 9–5, 30-min slots, no buffer/cap, name+phone.
 *  Timezone is intentionally omitted here — it resolves from the deployment /
 *  template / workspace tz (falling back to "UTC") in `resolveBookingPolicy`. */
export const SYSTEM_DEFAULTS: Omit<BookingPolicy, "timezone"> = {
  durationMinutes: 30,
  bufferMinutes: 0,
  maxPerDay: null,
  leadTimeHours: 0,
  weekdays: [1, 2, 3, 4, 5],
  startTime: "09:00",
  endTime: "17:00",
  requiredFields: ["name", "phone"],
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** First non-null/undefined value, or undefined. Used for field-by-field
 *  deployment → template → default precedence. */
function pick<T>(...vals: (T | null | undefined)[]): T | undefined {
  for (const v of vals) if (v !== null && v !== undefined) return v;
  return undefined;
}

/**
 * Resolve the effective policy from a deployment override, a template default,
 * and the workspace timezone. Precedence is field-by-field
 * (deployment ?? template ?? SYSTEM_DEFAULTS); timezone is
 * deployment ?? template ?? workspace ?? "UTC".
 *
 * Every field is CLAMPED so a malformed stored value can never break a call:
 *   - durationMinutes  → rounded, floored at 1
 *   - bufferMinutes    → rounded, floored at 0
 *   - maxPerDay        → positive rounded int, else null (no cap)
 *   - leadTimeHours    → floored at 0
 *   - weekdays         → unique ints in 0..6, sorted; empty → defaults
 *   - start/end        → valid "HH:MM" with end > start, else BOTH reset to 09:00/17:00
 *   - requiredFields   → trimmed, lowercased, non-empty; empty → defaults
 */
export function resolveBookingPolicy(
  deployment?: Partial<BookingPolicy> | null,
  template?: Partial<BookingPolicy> | null,
  workspaceTimezone?: string,
): BookingPolicy {
  const d = deployment ?? {};
  const t = template ?? {};

  const durationMinutes = Math.max(
    1,
    Math.round(pick(d.durationMinutes, t.durationMinutes, SYSTEM_DEFAULTS.durationMinutes)!),
  );
  const bufferMinutes = Math.max(
    0,
    Math.round(pick(d.bufferMinutes, t.bufferMinutes, SYSTEM_DEFAULTS.bufferMinutes)!),
  );

  const maxRaw = pick(d.maxPerDay, t.maxPerDay, SYSTEM_DEFAULTS.maxPerDay);
  const maxPerDay = typeof maxRaw === "number" && maxRaw > 0 ? Math.round(maxRaw) : null;

  const leadTimeHours = Math.max(
    0,
    pick(d.leadTimeHours, t.leadTimeHours, SYSTEM_DEFAULTS.leadTimeHours)!,
  );

  const weekdaysRaw = pick(d.weekdays, t.weekdays, SYSTEM_DEFAULTS.weekdays)!;
  const weekdays = [
    ...new Set(weekdaysRaw.filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)),
  ].sort((a, b) => a - b);

  let startTime = pick(d.startTime, t.startTime, SYSTEM_DEFAULTS.startTime)!;
  let endTime = pick(d.endTime, t.endTime, SYSTEM_DEFAULTS.endTime)!;
  if (!HHMM.test(startTime) || !HHMM.test(endTime) || endTime <= startTime) {
    startTime = SYSTEM_DEFAULTS.startTime;
    endTime = SYSTEM_DEFAULTS.endTime;
  }

  const reqRaw = pick(d.requiredFields, t.requiredFields, SYSTEM_DEFAULTS.requiredFields)!;
  const requiredFields = reqRaw.map((s) => String(s).trim().toLowerCase()).filter(Boolean);

  const tz = pick(d.timezone, t.timezone)?.trim() || workspaceTimezone?.trim() || "UTC";

  return {
    durationMinutes,
    bufferMinutes,
    maxPerDay,
    leadTimeHours,
    timezone: tz,
    weekdays: weekdays.length ? weekdays : [...SYSTEM_DEFAULTS.weekdays],
    startTime,
    endTime,
    requiredFields: requiredFields.length ? requiredFields : [...SYSTEM_DEFAULTS.requiredFields],
  };
}

// ---------------------------------------------------------------------------
// Timezone math
//
// `generateCandidateSlots` works in WALL time ("09:00 in America/Chicago") but
// must emit UTC instants, and the offset is DST-dependent (Chicago is UTC-5 in
// summer, UTC-6 in winter). `formatSlotLabel` in composio-calendar-backend.ts
// uses `Intl.DateTimeFormat` with a `timeZone` to render a UTC instant in a
// zone; here we need the INVERSE. We do it with an Intl-parts offset:
//
//   tzOffsetMs(utcGuess, tz) formats the guess in `tz`, reads the wall-clock
//   parts back, and measures how far that wall clock sits from the same instant
//   read as UTC — i.e. the zone's offset (ms east-of-UTC) at that instant.
//
//   wallTimeToUtc treats the intended wall clock as if it were UTC, applies the
//   offset to get a first UTC guess, then RE-derives the offset at that guess
//   (a second pass) so DST transitions resolve correctly.
// ---------------------------------------------------------------------------

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Offset (ms, east-of-UTC positive) of `timeZone` at the given UTC instant. */
function tzOffsetMs(utcMs: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(new Date(utcMs))) parts[p.type] = p.value;
  // Intl can emit "24" for midnight in some engines; normalize to "00".
  const hour = parts.hour === "24" ? "00" : parts.hour;
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - utcMs;
}

/** Convert a wall-clock Y-M-D H:M in `timeZone` to the UTC instant (ms). */
function wallTimeToUtcMs(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  timeZone: string,
): number {
  const wallAsUtc = Date.UTC(y, mo - 1, d, h, mi, 0);
  // First-pass offset using the wall clock as the guess, then correct once more
  // at the resulting instant so DST edges (spring-forward/fall-back) resolve.
  const firstGuess = wallAsUtc - tzOffsetMs(wallAsUtc, timeZone);
  const offset = tzOffsetMs(firstGuess, timeZone);
  return wallAsUtc - offset;
}

/** Weekday (0=Sun..6=Sat) of a "YYYY-MM-DD" calendar date AS OBSERVED in
 *  `timeZone`. Anchored at local noon so an offset can't push it onto an
 *  adjacent day. */
function weekdayInTz(y: number, mo: number, d: number, timeZone: string): number {
  const utcMs = wallTimeToUtcMs(y, mo, d, 12, 0, timeZone);
  const name = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(
    new Date(utcMs),
  );
  return WEEKDAY_INDEX[name] ?? -1;
}

/** Minutes-since-midnight for a validated "HH:MM" string. */
function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Generate the candidate booking-slot start instants (UTC ISO strings) for the
 * calendar date `dateISO` ("YYYY-MM-DD"), under `policy`, relative to `now`:
 *
 *   - If `dateISO`'s weekday IN `policy.timezone` ∉ `policy.weekdays` → [].
 *   - Slots start at `startTime` and step by `durationMinutes + bufferMinutes`.
 *   - A slot is kept only if it FITS: `start + durationMinutes <= endTime`
 *     (a slot whose end would exceed the window end is excluded).
 *   - A slot is kept only if `start >= now + leadTimeHours` (inclusive boundary).
 *   - Returned ascending, as `.toISOString()` UTC strings.
 *
 * This is a PURE candidate generator — the booking tool intersects the result
 * with the calendar backend's real free/busy and applies `maxPerDay`.
 */
export function generateCandidateSlots(
  policy: BookingPolicy,
  dateISO: string,
  now: Date,
): string[] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateISO);
  if (!m) return [];
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);

  const weekday = weekdayInTz(year, month, day, policy.timezone);
  if (!policy.weekdays.includes(weekday)) return [];

  const startMin = hhmmToMinutes(policy.startTime);
  const endMin = hhmmToMinutes(policy.endTime);
  const step = policy.durationMinutes + policy.bufferMinutes;
  if (step <= 0) return []; // defensive; resolver guarantees duration >= 1

  const leadCutoffMs = now.getTime() + policy.leadTimeHours * 3_600_000;

  const out: string[] = [];
  for (let mins = startMin; mins + policy.durationMinutes <= endMin; mins += step) {
    const h = Math.floor(mins / 60);
    const mi = mins % 60;
    const utcMs = wallTimeToUtcMs(year, month, day, h, mi, policy.timezone);
    if (utcMs < leadCutoffMs) continue;
    out.push(new Date(utcMs).toISOString());
  }
  return out;
}

/**
 * Does the appointment interval `[iso, iso + durationMin)` lie ENTIRELY inside
 * at least one of the calendar's free windows? Pure — the booking tool uses this
 * to intersect policy-shaped candidate slots with a calendar backend's real
 * free/busy: a candidate is only offered if it both fits the policy window AND
 * fully fits a free window (so the agent never offers a time that overlaps an
 * existing event).
 *
 * Each window is `{ start, end }` as an ISO string. A window with an unparseable
 * bound is skipped. An empty `windows` array → false (nothing is free). Never
 * throws: an unparseable `iso` → false.
 */
export function slotFitsFreeWindows(
  iso: string,
  durationMin: number,
  windows: Array<{ start: string; end: string }>,
): boolean {
  const startMs = Date.parse(iso);
  if (Number.isNaN(startMs)) return false;
  const endMs = startMs + Math.max(1, durationMin) * 60_000;
  for (const w of windows) {
    const wStart = Date.parse(w.start);
    const wEnd = Date.parse(w.end);
    if (Number.isNaN(wStart) || Number.isNaN(wEnd)) continue;
    if (startMs >= wStart && endMs <= wEnd) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Seed a BookingPolicy from a client's captured intake
//
// At deploy time we already captured the client's weekly hours into
// `clientContext.soul.business_hours` (see deployments/client-context.ts +
// client-workspace-seed.ts). That capture is the SAME structured shape the
// onboarding hours parser and buildBusinessHoursSoulPatch write:
//   { monday: { enabled: true, start: "09:00", end: "17:00" }, ... }
// (full lowercase weekday names; per-day enabled + "HH:MM" window).
//
// `bookingPolicyFromIntake` maps that into the THREE BookingPolicy fields it can
// confidently derive from hours — `weekdays`, `startTime`, `endTime` — and
// nothing else. A BookingPolicy carries a SINGLE window (not per-day), so we
// take every enabled day for `weekdays` and the MOST COMMON enabled-day window
// for start/end. It returns a sparse Partial (`{}` when nothing parses), so the
// deploy seam can merge it under resolveBookingPolicy without overriding fields
// it didn't derive. Pure — no I/O.
// ---------------------------------------------------------------------------

/** The captured-intake shape this reads — the persisted client context's narrow
 *  soul. We only touch `soul.business_hours`; everything else is ignored. The
 *  hours value is either the structured per-day Record (the canonical capture)
 *  or a raw free-text string (which we route through the onboarding parser). */
type BookingPolicyIntake = {
  soul?: {
    business_hours?: Record<string, unknown> | string | null;
  } | null;
} | null | undefined;

const INTAKE_WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

/** One enabled day's window, validated to "HH:MM" with end > start. */
type EnabledDay = { weekday: number; start: string; end: string };

/** Extract the enabled days (weekday + valid window) from a STRUCTURED per-day
 *  hours Record. Reads defensively: a non-object day, a non-boolean `enabled`,
 *  a malformed "HH:MM", or end<=start is skipped. Returns [] when none survive. */
function enabledDaysFromStructured(hours: Record<string, unknown>): EnabledDay[] {
  const out: EnabledDay[] = [];
  for (const [key, raw] of Object.entries(hours)) {
    const weekday = INTAKE_WEEKDAY_INDEX[key.toLowerCase()];
    if (weekday === undefined) continue;
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as { enabled?: unknown; start?: unknown; end?: unknown };
    if (entry.enabled !== true) continue;
    const start = typeof entry.start === "string" ? entry.start.trim() : "";
    const end = typeof entry.end === "string" ? entry.end.trim() : "";
    if (!HHMM.test(start) || !HHMM.test(end) || end <= start) continue;
    out.push({ weekday, start, end });
  }
  return out;
}

/**
 * Derive the BookingPolicy hours fields a client's captured intake confidently
 * implies. Reads `intake.soul.business_hours`:
 *   - a structured per-day Record → used directly;
 *   - a free-text string → parsed via the onboarding `parseHoursText`.
 * Then collapses the enabled days into `{ weekdays, startTime, endTime }`:
 *   - `weekdays` = every enabled day (0=Sun..6=Sat), deduped + sorted;
 *   - `startTime`/`endTime` = the most common enabled-day window (ties resolve
 *     to the earliest start, then earliest end — deterministic).
 *
 * Returns ONLY those three fields, and ONLY when at least one valid enabled day
 * exists; otherwise `{}`. Never throws. Pure.
 */
export function bookingPolicyFromIntake(
  intake: BookingPolicyIntake,
): Partial<BookingPolicy> {
  const raw = intake?.soul?.business_hours;
  if (raw === null || raw === undefined) return {};

  // Normalize either input form to the structured per-day shape, then read the
  // enabled days off it. A string routes through the existing onboarding parser
  // (its WeeklyAvailability output is exactly the structured shape we read).
  const structured: Record<string, unknown> =
    typeof raw === "string"
      ? (parseHoursText(raw) as unknown as Record<string, unknown>)
      : typeof raw === "object"
        ? raw
        : {};

  const enabled = enabledDaysFromStructured(structured);
  if (enabled.length === 0) return {};

  const weekdays = [...new Set(enabled.map((d) => d.weekday))].sort((a, b) => a - b);

  // Pick the dominant window: tally `start-end` keys, then choose the most
  // frequent (ties → earliest start, then earliest end) so the result is stable.
  const counts = new Map<string, { count: number; start: string; end: string }>();
  for (const d of enabled) {
    const key = `${d.start}-${d.end}`;
    const cur = counts.get(key);
    if (cur) cur.count += 1;
    else counts.set(key, { count: 1, start: d.start, end: d.end });
  }
  const dominant = [...counts.values()].sort(
    (a, b) =>
      b.count - a.count ||
      (a.start < b.start ? -1 : a.start > b.start ? 1 : 0) ||
      (a.end < b.end ? -1 : a.end > b.end ? 1 : 0),
  )[0];

  return { weekdays, startTime: dominant.start, endTime: dominant.end };
}
