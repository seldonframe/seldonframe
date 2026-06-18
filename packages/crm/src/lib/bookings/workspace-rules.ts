// Workspace-level booking availability + rules.
//
// Booking availability + booking rules are a SINGLE workspace-wide set,
// stored on organizations.settings.booking (JSONB — no schema migration).
// The public slot generator reads these rules; appointment types keep
// their own durationMinutes, and the per-slot buffer falls back to the
// workspace defaultBufferMinutes when a type defines none.
//
// This module is intentionally NOT "use server": it holds the typed
// rules, the pure normalizers/defaults, the timezone math, and the pure
// slot computation so they can be imported anywhere (the public slot
// route, the dashboard, server actions, and unit tests). The only
// DB-touching function here, getWorkspaceBookingRules, is a thin
// read-then-normalize wrapper with an injectable loader for testing.
//
// The org-scoped read-modify-write action lives in actions.ts (which IS
// "use server") to follow the existing auth pattern.

// ── Day/schedule types (canonical home; actions.ts imports these) ────────

export type AvailabilityDayKey =
  | "sunday"
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday";

export type AvailabilityDaySettings = {
  enabled: boolean;
  start: string;
  end: string;
};

export type AvailabilitySchedule = Record<AvailabilityDayKey, AvailabilityDaySettings>;

export const weekdayKeys: AvailabilityDayKey[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

// ── Workspace booking rules ──────────────────────────────────────────────

export type WorkspaceBookingRules = {
  /** Per-day availability window for the whole workspace. */
  availability: AvailabilitySchedule;
  /** Minimum lead time (minutes) before a slot can be booked. Default 0. */
  minNoticeMinutes: number;
  /** Buffer (minutes) applied around bookings when the appointment type
   *  doesn't define its own. Clamped 0-120. Default 0. */
  defaultBufferMinutes: number;
  /** Default appointment duration (minutes) when a type doesn't set one.
   *  Clamped 30-180. Default 30. */
  defaultDurationMinutes: number;
  /** Hard cap on bookings per calendar day, or null for no cap. Default null. */
  maxBookingsPerDay: number | null;
};

// ── Pure helpers (shared with actions.ts) ────────────────────────────────

const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function defaultAvailabilitySchedule(): AvailabilitySchedule {
  return {
    sunday: { enabled: false, start: "09:00", end: "17:00" },
    monday: { enabled: true, start: "09:00", end: "17:00" },
    tuesday: { enabled: true, start: "09:00", end: "17:00" },
    wednesday: { enabled: true, start: "09:00", end: "17:00" },
    thursday: { enabled: true, start: "09:00", end: "17:00" },
    friday: { enabled: true, start: "09:00", end: "17:00" },
    saturday: { enabled: false, start: "09:00", end: "17:00" },
  };
}

export function defaultWorkspaceBookingRules(): WorkspaceBookingRules {
  return {
    availability: defaultAvailabilitySchedule(),
    minNoticeMinutes: 0,
    defaultBufferMinutes: 0,
    defaultDurationMinutes: 30,
    maxBookingsPerDay: null,
  };
}

function normalizeTimeValue(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return HHMM_RE.test(trimmed) ? trimmed : fallback;
}

export function toMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

// v1.36.4 short-key fallback — pre-1.36.4 some rows stored availability with
// 3-letter day keys (mon/tue/...). Readers use full names, so accept both
// here without a backfill migration.
const shortToFullDayKey: Record<string, AvailabilityDayKey> = {
  sun: "sunday",
  mon: "monday",
  tue: "tuesday",
  wed: "wednesday",
  thu: "thursday",
  fri: "friday",
  sat: "saturday",
};

export function normalizeAvailability(raw: unknown): AvailabilitySchedule {
  const defaults = defaultAvailabilitySchedule();
  const source = typeof raw === "object" && raw ? (raw as Record<string, unknown>) : {};

  return weekdayKeys.reduce((acc, dayKey) => {
    const dayDefaults = defaults[dayKey];
    const fullSource = source[dayKey] as Record<string, unknown> | undefined;
    const shortKey = Object.entries(shortToFullDayKey).find(([, full]) => full === dayKey)?.[0];
    const shortSource = shortKey ? (source[shortKey] as Record<string, unknown> | undefined) : undefined;
    const daySource = fullSource ?? shortSource;
    const start = normalizeTimeValue(daySource?.start, dayDefaults.start);
    const end = normalizeTimeValue(daySource?.end, dayDefaults.end);
    const enabled = typeof daySource?.enabled === "boolean" ? daySource.enabled : dayDefaults.enabled;

    acc[dayKey] = toMinutes(start) < toMinutes(end) ? { enabled, start, end } : dayDefaults;
    return acc;
  }, {} as AvailabilitySchedule);
}

/** Clamp a buffer-minutes value to 0-120 (rounded). Non-finite/negative => 0. */
export function clampBufferMinutes(raw: unknown): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(120, Math.round(value));
}

/** Clamp a duration-minutes value to 30-180 (rounded). Non-finite/too-small => 30. */
export function clampDurationMinutes(raw: unknown): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return 30;
  return Math.min(180, Math.max(30, Math.round(value)));
}

/** Non-negative minutes (rounded). Non-finite/negative => 0. */
export function clampMinNoticeMinutes(raw: unknown): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value);
}

/** maxBookingsPerDay: positive int (capped 50) or null for no cap. */
export function normalizeMaxBookingsPerDay(raw: unknown): number | null {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.min(50, Math.round(value));
}

/**
 * Normalize a raw organizations.settings object into typed WorkspaceBookingRules.
 * Returns documented defaults when settings.booking is unset.
 */
export function resolveWorkspaceBookingRules(settings: unknown): WorkspaceBookingRules {
  const booking = readBookingSettings(settings);
  if (!booking) return defaultWorkspaceBookingRules();

  return {
    availability: normalizeAvailability(booking.availability),
    minNoticeMinutes: clampMinNoticeMinutes(booking.minNoticeMinutes),
    defaultBufferMinutes: clampBufferMinutes(booking.defaultBufferMinutes),
    defaultDurationMinutes: clampDurationMinutes(
      booking.defaultDurationMinutes === undefined ? 30 : booking.defaultDurationMinutes,
    ),
    maxBookingsPerDay: normalizeMaxBookingsPerDay(booking.maxBookingsPerDay),
  };
}

/** Returns the raw settings.booking object, or null when unset/non-object. */
function readBookingSettings(settings: unknown): Record<string, unknown> | null {
  if (!settings || typeof settings !== "object") return null;
  const booking = (settings as Record<string, unknown>).booking;
  if (!booking || typeof booking !== "object") return null;
  return booking as Record<string, unknown>;
}

/** Whether organizations.settings.booking exists (drives back-compat fallback). */
export function hasWorkspaceBookingRules(settings: unknown): boolean {
  return readBookingSettings(settings) !== null;
}

// ── Context resolution (workspace rules vs per-type fallback) ─────────────

export type ResolvedContextBookingRules = {
  /** Whether the effective rules came from the workspace or the appointment type. */
  source: "workspace" | "appointment-type";
  availability: AvailabilitySchedule;
  minNoticeMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  maxBookingsPerDay: number | null;
};

/**
 * Decide the effective availability + booking rules for a public booking
 * context. Workspace rules (organizations.settings.booking) take precedence;
 * when unset, fall back to the appointment type's own availability so
 * pre-existing workspaces keep working (back-compat).
 *
 * Buffer precedence: the appointment type's bufferBefore/After wins when set;
 * otherwise the workspace defaultBufferMinutes applies. minNoticeMinutes is a
 * workspace-only concept (0 when there are no workspace rules).
 */
export function resolveContextBookingRules(input: {
  workspaceSettings: unknown;
  typeAvailability: unknown;
  typeBufferBeforeMinutes: number;
  typeBufferAfterMinutes: number;
  typeMaxBookingsPerDay: number;
}): ResolvedContextBookingRules {
  const typeBufferBefore = clampBufferMinutes(input.typeBufferBeforeMinutes);
  const typeBufferAfter = clampBufferMinutes(input.typeBufferAfterMinutes);
  const typeMax = normalizeMaxBookingsPerDay(input.typeMaxBookingsPerDay);

  if (hasWorkspaceBookingRules(input.workspaceSettings)) {
    const rules = resolveWorkspaceBookingRules(input.workspaceSettings);
    return {
      source: "workspace",
      availability: rules.availability,
      minNoticeMinutes: rules.minNoticeMinutes,
      // Type buffer wins when the type defines one; else workspace default.
      bufferBeforeMinutes: typeBufferBefore > 0 ? typeBufferBefore : rules.defaultBufferMinutes,
      bufferAfterMinutes: typeBufferAfter > 0 ? typeBufferAfter : rules.defaultBufferMinutes,
      maxBookingsPerDay: rules.maxBookingsPerDay,
    };
  }

  // Back-compat: no workspace rules => per-type availability + buffers.
  return {
    source: "appointment-type",
    availability: normalizeAvailability(input.typeAvailability),
    minNoticeMinutes: 0,
    bufferBeforeMinutes: typeBufferBefore,
    bufferAfterMinutes: typeBufferAfter,
    maxBookingsPerDay: typeMax,
  };
}

// ── Timezone math (shared with actions.ts) ───────────────────────────────

// Extract date components in a specific IANA timezone via Intl.DateTimeFormat.
// JS Date methods are server-local — useless for cross-TZ booking validation.
export function partsInTimezone(
  date: Date,
  timeZone: string,
): {
  year: number;
  month: number;
  day: number;
  weekday: AvailabilityDayKey;
  hour: number;
  minute: number;
} {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "long",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  const rawHour = parseInt(parts.hour ?? "0", 10);
  return {
    year: parseInt(parts.year ?? "0", 10),
    month: parseInt(parts.month ?? "0", 10),
    day: parseInt(parts.day ?? "0", 10),
    weekday: ((parts.weekday ?? "monday").toLowerCase()) as AvailabilityDayKey,
    hour: rawHour === 24 ? 0 : rawHour,
    minute: parseInt(parts.minute ?? "0", 10),
  };
}

// Build a UTC Date that, when formatted in `timeZone`, shows the intended
// local Y-M-D H:M. Robust across DST transitions.
export function utcMomentForLocalTime(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const naive = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (timeZone === "UTC") return naive;
  const parts = partsInTimezone(naive, timeZone);
  const intendedMs = Date.UTC(year, month - 1, day, hour, minute);
  const actualMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  const offsetMs = intendedMs - actualMs;
  return new Date(naive.getTime() + offsetMs);
}

// ── Pure slot computation ────────────────────────────────────────────────

export type BookedInterval = { startsAt: Date; endsAt: Date };

/**
 * Compute the available booking slots for a single calendar day, in the
 * workspace timezone, given the effective rules + existing bookings + a
 * fixed "now". Pure: no I/O. Mirrors listPublicBookingSlotsAction's logic
 * (workday window, conflict+buffer exclusion, daily cap, past-slot skip)
 * and additionally enforces minNoticeMinutes.
 *
 * Returns UTC ISO strings (with Z); the client formats them in the
 * workspace timezone for display.
 */
export function computeSlotsForDay(input: {
  rules: Pick<WorkspaceBookingRules, "availability" | "minNoticeMinutes" | "maxBookingsPerDay">;
  date: string; // "YYYY-MM-DD" interpreted in `timezone`
  timezone: string;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  bookedRows: BookedInterval[];
  now: Date;
}): { slots: string[]; durationMinutes: number } {
  const {
    rules,
    timezone: tz,
    durationMinutes,
    bufferBeforeMinutes,
    bufferAfterMinutes,
    bookedRows,
    now,
  } = input;

  const [yearStr, monthStr, dayStr] = input.date.split("-");
  const year = parseInt(yearStr ?? "0", 10);
  const month = parseInt(monthStr ?? "0", 10);
  const day = parseInt(dayStr ?? "0", 10);
  if (!year || !month || !day) {
    return { slots: [], durationMinutes };
  }

  // Determine weekday IN WORKSPACE TZ — not server-local.
  const requestedNoon = utcMomentForLocalTime(year, month, day, 12, 0, tz);
  const weekdayKey = partsInTimezone(requestedNoon, tz).weekday;
  const dayAvailability = rules.availability[weekdayKey];

  if (!dayAvailability?.enabled) {
    return { slots: [], durationMinutes };
  }

  const workdayStartMinutes = toMinutes(dayAvailability.start);
  const workdayEndMinutes = toMinutes(dayAvailability.end);
  if (workdayStartMinutes >= workdayEndMinutes) {
    return { slots: [], durationMinutes };
  }

  // Daily cap: once reached, offer nothing.
  if (rules.maxBookingsPerDay != null && bookedRows.length >= rules.maxBookingsPerDay) {
    return { slots: [], durationMinutes };
  }

  // minNoticeMinutes — earliest bookable instant.
  const earliestStartMs = now.getTime() + Math.max(0, rules.minNoticeMinutes) * 60_000;

  const slots: string[] = [];
  const slotStepMinutes = durationMinutes >= 60 ? 60 : 30;

  for (
    let minuteOffset = workdayStartMinutes;
    minuteOffset < workdayEndMinutes;
    minuteOffset += slotStepMinutes
  ) {
    const hour = Math.floor(minuteOffset / 60);
    const minute = minuteOffset % 60;
    const slotStart = utcMomentForLocalTime(year, month, day, hour, minute, tz);
    const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60_000);

    // Slot must fully fit inside the workday.
    if (minuteOffset + durationMinutes > workdayEndMinutes) continue;

    // Skip slots in the past (<= now, matching the legacy generator) AND
    // slots inside the min-notice window (start before now + minNotice).
    if (slotStart.getTime() <= now.getTime() || slotStart.getTime() < earliestStartMs) continue;

    const overlaps = bookedRows.some((row) => {
      const bookedStart = new Date(row.startsAt);
      const bookedEnd = new Date(row.endsAt);
      const blockedStart = new Date(bookedStart.getTime() - bufferBeforeMinutes * 60_000);
      const blockedEnd = new Date(bookedEnd.getTime() + bufferAfterMinutes * 60_000);
      return slotStart < blockedEnd && slotEnd > blockedStart;
    });

    if (!overlaps) {
      slots.push(slotStart.toISOString());
    }
  }

  return { slots, durationMinutes };
}

// ── DB-backed read wrapper (thin; injectable loader for tests) ────────────

export type WorkspaceSettingsLoader = (
  orgId: string,
) => Promise<Record<string, unknown> | null>;

/**
 * Read organizations.settings.booking for the given org and return typed
 * WorkspaceBookingRules, falling back to documented defaults when unset or
 * when the org row is missing.
 *
 * The `deps.loadSettings` loader is injectable so unit tests can exercise
 * the resolution without a DB. In production it defaults to a single
 * Drizzle SELECT of organizations.settings.
 */
export async function getWorkspaceBookingRules(
  orgId: string,
  deps?: { loadSettings?: WorkspaceSettingsLoader },
): Promise<WorkspaceBookingRules> {
  const loadSettings = deps?.loadSettings ?? defaultLoadSettings;
  const settings = await loadSettings(orgId);
  return resolveWorkspaceBookingRules(settings);
}

const defaultLoadSettings: WorkspaceSettingsLoader = async (orgId) => {
  // Lazy imports so this non-"use server" module stays importable from
  // anywhere (e.g. client-adjacent code paths) without eagerly pulling in
  // the DB client. Only the production path touches Drizzle.
  const { db } = await import("@/db");
  const { organizations } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const [row] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  return row?.settings ?? null;
};
