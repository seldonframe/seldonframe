// Per-client booking rules — the pure policy engine.
//
// A deployed agent that books appointments obeys a `BookingPolicy`: appointment
// length, buffer, daily cap, lead time, PER-DAY business-hours windows, timezone,
// and the fields it must collect before booking. The template (the product)
// declares sensible DEFAULTS; the deployment (the client's instance) overrides
// them. This module owns:
//   - the `BookingPolicy` type (+ `DayWindow`) + `SYSTEM_DEFAULTS`
//   - `resolveBookingPolicy(deployment?, template?, workspaceTimezone?)` — the
//     single source of truth: field-by-field precedence + input clamping. It
//     accepts EITHER the per-day `hours` map OR the legacy uniform
//     `weekdays`+`startTime`+`endTime` shape on each input (backward-compat) and
//     normalizes to `hours`.
//   - `generateCandidateSlots(policy, dateISO, now)` — the tz-correct, injected-
//     clock slot generator the booking tools intersect with real free/busy
//
// HOURS MODEL (the evolution): instead of one window applied to every open day,
// a policy carries `hours: Partial<Record<number, DayWindow>>` keyed by weekday
// (0=Sun..6=Sat). A weekday present in the map is OPEN with that window; a weekday
// ABSENT is CLOSED. This expresses "Mon–Fri 9–5, Sat 10–2, Sun closed" directly.
//
// Pure: no I/O, no DB, and no clock except the injected `now`. Nothing here may
// throw on bad input — a live call must always end up with a usable policy and a
// sane slot list, so invalid stored values are clamped to safe defaults rather
// than rejected.

import { parseHoursText } from "@/lib/onboarding/parse-hours";

/** One open day's business-hours window, "HH:MM" 24h, end strictly after start. */
export type DayWindow = { start: string; end: string };

export type BookingPolicy = {
  durationMinutes: number; // appointment length
  bufferMinutes: number; // gap enforced between bookings
  maxPerDay: number | null; // cap on bookings/day; null = no cap
  leadTimeHours: number; // minimum notice before a slot
  timezone: string; // IANA, e.g. "America/Chicago"
  /** Per-weekday business-hours windows. Key = weekday (0=Sun..6=Sat). A weekday
   *  PRESENT is open with that window; a weekday ABSENT is closed that day. */
  hours: Partial<Record<number, DayWindow>>;
  requiredFields: string[]; // collected before booking
};

/** The legacy uniform-window input shape `resolveBookingPolicy` still accepts on
 *  each input (deployment / template), alongside the new `hours` map. A stored
 *  policy written before per-day windows uses these three fields. */
export type LegacyBookingPolicyHours = {
  weekdays?: number[]; // 0=Sun..6=Sat
  startTime?: string; // "HH:MM" 24h
  endTime?: string; // "HH:MM" 24h
};

/** What `resolveBookingPolicy` accepts on EACH input: a sparse resolved-shape
 *  Partial (carrying `hours`) OR the legacy uniform-window fields — or both. */
export type BookingPolicyInput = Partial<BookingPolicy> & LegacyBookingPolicyHours;

/** Out-of-the-box rules: Mon–Fri 9–5, 30-min slots, no buffer/cap, name+phone.
 *  Sat/Sun are absent from `hours` → closed. Timezone is intentionally omitted
 *  here — it resolves from the deployment / template / workspace tz (falling back
 *  to "UTC") in `resolveBookingPolicy`. */
export const SYSTEM_DEFAULTS: Omit<BookingPolicy, "timezone"> = {
  durationMinutes: 30,
  bufferMinutes: 0,
  maxPerDay: null,
  leadTimeHours: 0,
  hours: {
    1: { start: "09:00", end: "17:00" },
    2: { start: "09:00", end: "17:00" },
    3: { start: "09:00", end: "17:00" },
    4: { start: "09:00", end: "17:00" },
    5: { start: "09:00", end: "17:00" },
  },
  requiredFields: ["name", "phone"],
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A fresh deep copy of SYSTEM_DEFAULTS.hours (never share the literal's nested
 *  objects, so a caller can't mutate the module default). */
function defaultHours(): Partial<Record<number, DayWindow>> {
  const out: Partial<Record<number, DayWindow>> = {};
  for (const [k, v] of Object.entries(SYSTEM_DEFAULTS.hours)) {
    out[Number(k)] = { start: v!.start, end: v!.end };
  }
  return out;
}

/** Clamp an arbitrary hours map to valid entries: weekday key in 0..6, window a
 *  valid "HH:MM" with end > start. Bad days are dropped. Returns a fresh object
 *  (nested windows copied). */
function clampHours(raw: Partial<Record<number, DayWindow>>): Partial<Record<number, DayWindow>> {
  const out: Partial<Record<number, DayWindow>> = {};
  for (const [k, v] of Object.entries(raw)) {
    const day = Number(k);
    if (!Number.isInteger(day) || day < 0 || day > 6) continue;
    if (!v || typeof v !== "object") continue;
    const start = typeof v.start === "string" ? v.start : "";
    const end = typeof v.end === "string" ? v.end : "";
    if (!HHMM.test(start) || !HHMM.test(end) || end <= start) continue;
    out[day] = { start, end };
  }
  return out;
}

/** Build an hours map from the legacy uniform-window fields: each valid weekday
 *  gets the SAME {startTime,endTime} window. Returns {} if the window is invalid
 *  or no weekday survives (so the caller can fall through to the next input). */
function hoursFromLegacy(legacy: LegacyBookingPolicyHours): Partial<Record<number, DayWindow>> {
  const { weekdays, startTime, endTime } = legacy;
  if (!Array.isArray(weekdays)) return {};
  if (typeof startTime !== "string" || typeof endTime !== "string") return {};
  if (!HHMM.test(startTime) || !HHMM.test(endTime) || endTime <= startTime) return {};
  const out: Partial<Record<number, DayWindow>> = {};
  for (const n of weekdays) {
    if (!Number.isInteger(n) || n < 0 || n > 6) continue;
    out[n] = { start: startTime, end: endTime };
  }
  return out;
}

/** Normalize ONE input (deployment / template) to a clamped hours map, accepting
 *  either shape: an explicit `hours` map wins (clamped); else the legacy
 *  `weekdays`+`startTime`+`endTime` fields are expanded. Returns {} when the input
 *  carries no usable window (so precedence can fall through to the next source). */
function normalizeInputHours(input: BookingPolicyInput): Partial<Record<number, DayWindow>> {
  if (input.hours && typeof input.hours === "object") {
    return clampHours(input.hours);
  }
  return hoursFromLegacy(input);
}

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
 * Each input may carry EITHER the per-day `hours` map OR the legacy uniform
 * `weekdays`+`startTime`+`endTime` fields (backward-compat for stored policies);
 * both are normalized to a clamped `hours` map. The first input whose normalized
 * hours are non-empty wins WHOLE (deployment hours are NOT per-day-merged with
 * the template — kept simple); if neither yields any open day, the resolved hours
 * fall back to SYSTEM_DEFAULTS.hours.
 *
 * Every field is CLAMPED so a malformed stored value can never break a call:
 *   - durationMinutes  → rounded, floored at 1
 *   - bufferMinutes    → rounded, floored at 0
 *   - maxPerDay        → positive rounded int, else null (no cap)
 *   - leadTimeHours    → floored at 0
 *   - hours            → keys 0..6 only; each window valid "HH:MM" with end>start,
 *                        bad days dropped; empty after all inputs → SYSTEM_DEFAULTS
 *   - requiredFields   → trimmed, lowercased, non-empty; empty → defaults
 */
export function resolveBookingPolicy(
  deployment?: BookingPolicyInput | null,
  template?: BookingPolicyInput | null,
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

  // Hours: normalize each input (accepting either shape) to a clamped map, then
  // take the first non-empty one WHOLE (deployment beats template beats default).
  const dHours = normalizeInputHours(d);
  const tHours = normalizeInputHours(t);
  const hours = Object.keys(dHours).length
    ? dHours
    : Object.keys(tHours).length
      ? tHours
      : defaultHours();

  const reqRaw = pick(d.requiredFields, t.requiredFields, SYSTEM_DEFAULTS.requiredFields)!;
  const requiredFields = reqRaw.map((s) => String(s).trim().toLowerCase()).filter(Boolean);

  const tz = pick(d.timezone, t.timezone)?.trim() || workspaceTimezone?.trim() || "UTC";

  return {
    durationMinutes,
    bufferMinutes,
    maxPerDay,
    leadTimeHours,
    timezone: tz,
    hours,
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
 *   - The date's weekday IN `policy.timezone` is looked up in `policy.hours`. If
 *     that weekday is ABSENT (closed) → []. Otherwise that day's `{start,end}`
 *     window is used (each day may have a DIFFERENT window).
 *   - Slots start at the day's `start` and step by `durationMinutes + bufferMinutes`.
 *   - A slot is kept only if it FITS: `start + durationMinutes <= end`
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
  const window = policy.hours[weekday];
  if (!window) return []; // weekday closed (absent from the hours map)

  const startMin = hhmmToMinutes(window.start);
  const endMin = hhmmToMinutes(window.end);
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
// `bookingPolicyFromIntake` maps that into the ONE BookingPolicy field it can
// confidently derive from hours — the per-day `hours` map — and nothing else.
// Each enabled day becomes an `hours[weekday] = {start,end}` entry (its own
// window, preserved exactly — a Sat 10–2 stays 10–2 even when weekdays are 9–5).
// It returns a sparse Partial (`{}` when nothing parses), so the deploy seam can
// merge it under resolveBookingPolicy without overriding fields it didn't derive.
// Pure — no I/O.
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
 * Derive the BookingPolicy `hours` map a client's captured intake confidently
 * implies. Reads `intake.soul.business_hours`:
 *   - a structured per-day Record → used directly;
 *   - a free-text string → parsed via the onboarding `parseHoursText`.
 * Each enabled day becomes an `hours[weekday] = {start,end}` entry, PRESERVING
 * that day's own window (so e.g. Sat 10:00–14:00 stays 10–2 next to Mon–Fri 9–5).
 *
 * Returns `{ hours }`, and ONLY when at least one valid enabled day exists;
 * otherwise `{}`. Never throws. Pure.
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

  // Each enabled day → its own window, keyed by weekday (last one wins on a dup,
  // which the structured Record can't produce anyway since keys are unique).
  const hours: Partial<Record<number, DayWindow>> = {};
  for (const d of enabled) {
    hours[d.weekday] = { start: d.start, end: d.end };
  }

  return { hours };
}
