"use server";

import { and, asc, eq, gte, inArray, lt, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { activities, bookings, contacts, deals, organizations, users } from "@/db/schema";
import { getCurrentUser, getOrgId } from "@/lib/auth/helpers";
import { ensureDefaultPipelineForOrg } from "@/lib/deals/pipeline-defaults";
import { assertWritable } from "@/lib/demo/server";
import { emitSeldonEvent } from "@/lib/events/bus";
import { createBookingCheckoutSession } from "@/lib/payments/actions";
import { recordBookingOutcomeLearning } from "@/lib/soul/learning";
import {
  deleteGoogleCalendarBookingEvent,
  reconcileGoogleCalendarBookings,
  syncBookingWithGoogleCalendar,
} from "./google-calendar-sync";
import { buildMeetingUrl, resolveBookingProvider } from "./providers";
// 2026-05-18 — lazy-resolve intake fields from theme.aestheticArchetype
// for workspaces created before enhance-blocks ran the booking-intake
// field seeding (or whose creation flow skipped it entirely, like the
// lean URL flow create_workspace_v2 → complete_workspace_v2). Without
// this, /book renders the legacy name+email+notes flow for every
// pre-v1.40 workspace — operator-reported as "booking pages aren't
// SOUL-aware". The function is pure (in-memory lookup), so it's safe
// to call on every booking page render.
import {
  classifyArchetype,
  type AestheticArchetypeId,
} from "@/lib/workspace/aesthetic-archetypes";
import { getBookingIntakeFieldsForArchetype } from "@/lib/workspace/booking-intake-fields";

function deriveEndsAt(startsAt: Date, durationMinutes: number) {
  return new Date(startsAt.getTime() + durationMinutes * 60_000);
}

function toBookingSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

// v1.40.1 — vertical-aware booking intake fields. Each appointment
// type can define a custom set of additional questions the customer
// fills out at booking time (address for trades, skin concern for
// medspa, case type for legal, company size for B2B, etc.). Field
// schema is populated during create_full_workspace based on the
// classified aesthetic archetype; operators can edit per-appointment-
// type from the dashboard later.
export type BookingIntakeFieldType =
  | "text"
  | "textarea"
  | "tel"
  | "select"
  | "radio";

export type BookingIntakeField = {
  /** Stable id used as the form key + storage key (e.g. "address",
   *  "skin_concern", "issue_type"). Lowercase, snake_case. */
  id: string;
  /** Customer-facing label. */
  label: string;
  /** Input type. */
  type: BookingIntakeFieldType;
  /** Whether the customer must fill this out to submit. */
  required?: boolean;
  /** For select/radio: the choices. */
  options?: string[];
  /** Optional placeholder text for text/textarea/tel. */
  placeholder?: string;
  /** Optional help text under the input. */
  helpText?: string;
};

type AppointmentTypeMeta = {
  kind?: string;
  durationMinutes?: number;
  description?: string;
  confirmationMessage?: string;
  price?: number;
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
  maxBookingsPerDay?: number;
  availability?: Partial<Record<AvailabilityDayKey, AvailabilityDaySettings>>;
  /** v1.40.1 — vertical-aware booking form fields. When present, the
   *  PublicBookingForm renders these as additional inputs after name +
   *  email. When absent, defaults to the legacy fullName + email +
   *  notes flow. */
  intakeFields?: BookingIntakeField[];
};

type AvailabilityDayKey = "sunday" | "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday";

type AvailabilityDaySettings = {
  enabled: boolean;
  start: string;
  end: string;
};

type AvailabilitySchedule = Record<AvailabilityDayKey, AvailabilityDaySettings>;

type PublicBookingContext = {
  orgId: string;
  bookingSlug: string;
  appointmentName: string;
  appointmentDescription: string;
  durationMinutes: number;
  confirmationMessage: string;
  price: number;
  availability: AvailabilitySchedule;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  maxBookingsPerDay: number;
  /** v1.40.1 — vertical-aware booking form fields. Empty array if
   *  the appointment type doesn't define any (legacy templates). */
  intakeFields: BookingIntakeField[];
  /** v1.40.2 — workspace IANA timezone (e.g. "America/Chicago").
   *  Slots are generated AND displayed in this timezone so customer +
   *  server agree on which moment in time the slot represents.
   *  Pre-1.40.2 the slot generator used server-local time (UTC on
   *  Vercel) but workspace hours are in operator's local TZ — when
   *  the customer's browser parsed the resulting ambiguous strings
   *  in their own TZ, slots that LOOKED valid were rejected by the
   *  submit handler (which correctly validates in workspace TZ).
   *  Returning workspace TZ here makes the whole flow consistent. */
  workspaceTimezone: string;
};

const weekdayKeys: AvailabilityDayKey[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

// v1.40.2 — weekdayByIndex (server-local Date.getDay() lookup) removed
// because slot generation now resolves weekday via partsInTimezone(date,
// workspaceTz).weekday — TZ-correct under DST. The submit handler also
// uses partsInTimezone, so server-local-day lookups have no callers.

function defaultAvailabilitySchedule(): AvailabilitySchedule {
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

function normalizeTimeValue(value: unknown, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();

  if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(trimmed)) {
    return fallback;
  }

  return trimmed;
}

function toMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

// v1.36.4 — short-key fallback for legacy rows. Pre-1.36.4 the MCP
// `create_appointment_type` route stored availability with 3-letter
// day keys (mon/tue/.../sun). All other writers (dashboard form,
// blueprint persist, soul installer) used full names (monday/...).
// Readers only know full names. So legacy rows came back as "all
// undefined" → fell back to defaults silently, masking the bug at
// create time but breaking partial overrides later. v1.36.4 fixes
// the writer; this map lets us also rescue any rows already in the
// DB without a backfill migration.
const shortToFullDayKey: Record<string, AvailabilityDayKey> = {
  sun: "sunday",
  mon: "monday",
  tue: "tuesday",
  wed: "wednesday",
  thu: "thursday",
  fri: "friday",
  sat: "saturday",
};

function normalizeAvailability(raw: unknown): AvailabilitySchedule {
  const defaults = defaultAvailabilitySchedule();
  const source = typeof raw === "object" && raw ? (raw as Record<string, unknown>) : {};

  const normalized = weekdayKeys.reduce((acc, dayKey) => {
    const dayDefaults = defaults[dayKey];
    // v1.36.4 — read full-name key first, fall back to 3-letter key
    // for legacy rows. The 3-letter shape was a bug; we accept it
    // here so existing prod rows keep working without a migration.
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

  return normalized;
}

function resolveBufferMinutes(raw: unknown) {
  const value = Number(raw);

  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }

  return Math.min(120, Math.round(value));
}

function resolveMaxBookingsPerDay(raw: unknown) {
  const value = Number(raw);

  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.min(50, Math.round(value));
}

function parseCheckedValue(value: FormDataEntryValue | null) {
  if (value == null) {
    return null;
  }

  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "on";
  }

  return true;
}

function parseAvailabilityFromForm(formData: FormData) {
  const defaults = defaultAvailabilitySchedule();
  let hasAnyField = false;

  const parsed = weekdayKeys.reduce((acc, dayKey) => {
    const enabledField =
      formData.get(`availability.${dayKey}.enabled`) ??
      formData.get(`availability[${dayKey}][enabled]`) ??
      formData.get(`availability_${dayKey}_enabled`);
    const startField =
      formData.get(`availability.${dayKey}.start`) ??
      formData.get(`availability[${dayKey}][start]`) ??
      formData.get(`availability_${dayKey}_start`);
    const endField =
      formData.get(`availability.${dayKey}.end`) ??
      formData.get(`availability[${dayKey}][end]`) ??
      formData.get(`availability_${dayKey}_end`);

    if (enabledField != null || startField != null || endField != null) {
      hasAnyField = true;
    }

    const fallback = defaults[dayKey];
    const enabled = parseCheckedValue(enabledField);
    const start = normalizeTimeValue(startField, fallback.start);
    const end = normalizeTimeValue(endField, fallback.end);

    acc[dayKey] = {
      enabled: enabled == null ? fallback.enabled : enabled,
      start,
      end,
    };

    return acc;
  }, {} as AvailabilitySchedule);

  return hasAnyField ? normalizeAvailability(parsed) : defaults;
}

function resolveDuration(duration: number | undefined) {
  if (duration == null || !Number.isFinite(duration)) {
    return 30;
  }

  return duration >= 60 ? 60 : 30;
}

// v1.40.2 — toDateTimeLocalValue removed. Pre-1.40.2 it produced
// "YYYY-MM-DDTHH:MM" strings in server-local time (UTC on Vercel),
// which the customer's browser then re-parsed in browser-local time,
// creating a multi-hour drift between display and submit. Slots now
// transit as full UTC ISO strings (date.toISOString()) — unambiguous
// across both ends. The lone remaining mention in submitPublicBookingAction
// is a comment noting why the strict slot-string match was relaxed.

// v1.3.2 — extract date components in a specific IANA timezone using
// Intl.DateTimeFormat. JS Date methods (.getHours/.getDay) are
// SERVER-LOCAL — useless for cross-TZ booking validation. The booking
// flow needs to compare a UTC moment against the workspace's local
// hours (e.g. "is 4pm Vancouver between Mon-Sat 3pm-8pm Vancouver?")
// regardless of where the server runs (Vercel runs in UTC).
//
// Returns { year, month, day, weekday, hour, minute } in the target TZ.
// Weekday is "monday" / "tuesday" / ... matching the AvailabilitySchedule
// keys.
function partsInTimezone(
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
  // formatToParts gives us each component independently — robust
  // across TZs + DST transitions without manual offset math.
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
  const parts = Object.fromEntries(
    fmt.formatToParts(date).map((p) => [p.type, p.value]),
  );
  // hour can be "24" in some locales when actually 00; normalize.
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

function normalizeVoiceConfirmation(rawSoul: unknown) {
  const soul = (rawSoul as { voice?: { samplePhrases?: string[] } } | null) ?? null;
  return soul?.voice?.samplePhrases?.[0] || "Booking confirmed. We will contact you shortly.";
}

async function resolvePublicBookingContext(orgSlug: string, bookingSlug: string): Promise<PublicBookingContext | null> {
  const [org] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      soul: organizations.soul,
      // v1.40.2 — fetch workspace timezone so slot generation +
      // display happen in the operator's TZ, not server-local UTC.
      timezone: organizations.timezone,
      // 2026-05-18 — fetch the theme so we can lazy-resolve intake
      // fields from theme.aestheticArchetype for workspaces created
      // before enhance-blocks ran (or via the lean URL flow that
      // doesn't fan out into enhance-blocks at all). See lazy-resolve
      // block below.
      theme: organizations.theme,
    })
    .from(organizations)
    .where(eq(organizations.slug, orgSlug))
    .limit(1);

  if (!org) {
    return null;
  }

  const [template] = await db
    .select({
      title: bookings.title,
      metadata: bookings.metadata,
    })
    .from(bookings)
    .where(and(eq(bookings.orgId, org.id), eq(bookings.bookingSlug, bookingSlug), eq(bookings.status, "template")))
    .limit(1);

  if (!template && bookingSlug !== "default") {
    return null;
  }

  const metadata = (template?.metadata as AppointmentTypeMeta | null) ?? null;
  const confirmationMessage = metadata?.confirmationMessage || normalizeVoiceConfirmation(org.soul);
  const durationMinutes = resolveDuration(metadata?.durationMinutes);
  const availability = normalizeAvailability(metadata?.availability);
  const bufferBeforeMinutes = resolveBufferMinutes(metadata?.bufferBeforeMinutes);
  const bufferAfterMinutes = resolveBufferMinutes(metadata?.bufferAfterMinutes);
  const maxBookingsPerDay = resolveMaxBookingsPerDay(metadata?.maxBookingsPerDay);

  // 2026-05-18 — lazy-resolve intake fields from theme.aestheticArchetype
  // (or classify from soul.industry as a last resort) when the booking
  // template doesn't have them pre-seeded. Solves the "booking pages
  // aren't SOUL-aware" complaint for workspaces created before v1.40.1
  // OR via the lean URL flow (create_workspace_v2) which doesn't run
  // enhance-blocks. Pure in-memory lookup — no DB writes (the booking
  // metadata stays as-is so operator-edited custom fields aren't
  // clobbered the next time the page renders).
  //
  // 2026-05-18 (later) — operator reported "Roofs by Shiloh" still
  // shows name+email only. Root cause: soul.industry empty AND theme
  // archetype unset, so the original implementation returned []
  // early. The classifier itself has a sensible "editorial-warm"
  // catch-all — we now ALWAYS call it, passing the workspace name +
  // appointment title as extra hints so "Roofs by Shiloh" / "Roof
  // Inspection" land in editorial-warm even with no soul data.
  const seededFields = Array.isArray(metadata?.intakeFields) ? metadata!.intakeFields : [];
  const resolvedIntakeFields =
    seededFields.length > 0
      ? seededFields
      : resolveIntakeFieldsFromSoul(
          org.theme,
          org.soul,
          org.name,
          template?.title ?? null,
        );

  return {
    orgId: org.id,
    bookingSlug,
    appointmentName: template?.title || "Consultation",
    appointmentDescription: metadata?.description || "Choose a time that works for you and we will confirm with meeting details.",
    durationMinutes,
    confirmationMessage,
    price: Number.isFinite(metadata?.price) ? Number(metadata?.price) : 0,
    availability,
    bufferBeforeMinutes,
    bufferAfterMinutes,
    maxBookingsPerDay,
    // v1.40.1 — vertical-aware booking intake fields. Populated during
    // create_full_workspace based on the classified archetype. Empty
    // array for legacy templates (renders the default name+email+notes).
    // 2026-05-18 — now falls back to archetype-driven lazy resolve so
    // pre-v1.40 / lean-URL-flow workspaces also get the right fields.
    intakeFields: resolvedIntakeFields,
    // v1.40.2 — workspace IANA TZ. Falls back to UTC if unset.
    workspaceTimezone: org.timezone || "UTC",
  };
}

// 2026-05-18 — lazy-resolve helper. Tries (in order):
//   1. theme.aestheticArchetype (set during create_full_workspace +
//      detected during the lean URL flow's enhance step)
//   2. classify from soul.industry + soul.businessDescription PLUS
//      workspace name + appointment title as extra signal
//   3. fall back to "editorial-warm" via the classifier's catch-all
// ALWAYS returns a non-empty field set — even with zero soul data we
// get the editorial-warm baseline (address + phone + scope + timeline
// + budget) which is universally useful for a service business.
function resolveIntakeFieldsFromSoul(
  rawTheme: unknown,
  rawSoul: unknown,
  workspaceName: string | null,
  appointmentTitle: string | null,
): BookingIntakeField[] {
  // 1. Try the explicit archetype on the theme.
  const theme = (rawTheme && typeof rawTheme === "object" ? (rawTheme as Record<string, unknown>) : null);
  const explicitArchetype = typeof theme?.aestheticArchetype === "string" ? theme.aestheticArchetype as AestheticArchetypeId : null;

  if (explicitArchetype) {
    try {
      return getBookingIntakeFieldsForArchetype(explicitArchetype);
    } catch {
      // Unknown archetype id — fall through to classify-from-soul.
    }
  }

  // 2. Classify from soul + workspace-name + appointment-title hints.
  // Why blend three fields into one classification: the classifier
  // greps for keywords like "roof", "hvac", "dental", "medspa" — those
  // often live in the workspace name ("Roofs by Shiloh", "Dr. Smith
  // Dental") or in the appointment title ("Free Roof Inspection")
  // even when soul.industry was never set by the operator.
  const soul = (rawSoul && typeof rawSoul === "object" ? (rawSoul as Record<string, unknown>) : null) ?? null;
  const business = (soul?.business && typeof soul.business === "object" ? (soul.business as Record<string, unknown>) : null) ?? null;
  const soulVertical = typeof soul?.industry === "string"
    ? soul.industry
    : typeof business?.industry === "string"
      ? business.industry
      : typeof business?.vertical === "string"
        ? business.vertical
        : "";
  const soulDescription = typeof business?.description === "string"
    ? business.description
    : typeof soul?.summary === "string"
      ? soul.summary
      : "";

  // Blend everything into ONE string the classifier can pattern-match
  // against. We pass it as both `vertical` (for the .test(v + " " +
  // desc) checks) and `businessDescription` (for the desc-only checks)
  // so a hit on either branch fires.
  const blendedHints = [
    soulVertical,
    workspaceName ?? "",
    appointmentTitle ?? "",
    soulDescription,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  try {
    const archetypeId = classifyArchetype({
      vertical: blendedHints,
      businessDescription: soulDescription || blendedHints,
    });
    return getBookingIntakeFieldsForArchetype(archetypeId);
  } catch {
    // Last-resort fallback — pick editorial-warm directly. The
    // classifier itself uses this as its catch-all, so we get the
    // same shape but bypass any unforeseen throw inside it.
    return getBookingIntakeFieldsForArchetype("editorial-warm");
  }
}

export async function getPublicBookingContext(orgSlug: string, bookingSlug: string) {
  const context = await resolvePublicBookingContext(orgSlug, bookingSlug);

  if (!context) {
    return null;
  }

  return {
    orgId: context.orgId,
    bookingSlug: context.bookingSlug,
    appointmentName: context.appointmentName,
    appointmentDescription: context.appointmentDescription,
    durationMinutes: context.durationMinutes,
    confirmationMessage: context.confirmationMessage,
    price: context.price,
    // v1.40.1 — surface intake fields to the booking page.
    intakeFields: context.intakeFields,
    // v1.40.2 — workspace timezone for slot display + submit alignment.
    workspaceTimezone: context.workspaceTimezone,
  };
}

export async function listPublicBookingSlotsAction({
  orgSlug,
  bookingSlug,
  date,
}: {
  orgSlug: string;
  bookingSlug: string;
  date: string;
}) {
  const context = await resolvePublicBookingContext(orgSlug, bookingSlug);

  if (!context) {
    return { slots: [] as string[], durationMinutes: 30 };
  }

  // v1.40.2 — slot generation now happens entirely in workspace TZ.
  // Pre-1.40.2 the generator used server-local time (Vercel UTC),
  // which produced "10:00" strings that meant 10:00 UTC. Customers in
  // any other TZ saw those parsed as their local time, which created
  // a 4-12 hour drift between what the picker showed and what the
  // submit handler validated. Vesper test exposed it: customer in
  // Toronto picked "2:00 PM" → submit received 14:00 UTC = 9 AM CDT,
  // outside Vesper's 10 AM – 8 PM CDT hours, REJECTED.
  //
  // New design:
  //   1. Parse the requested date AS workspace-local "YYYY-MM-DD"
  //   2. For each minute offset in the workday, build a UTC moment
  //      whose workspace-TZ formatted hour/minute matches the offset
  //   3. Return slots as full UTC ISO strings (with Z suffix) — the
  //      client decodes them with toLocaleString({timeZone}) and the
  //      server interprets them unambiguously
  const tz = context.workspaceTimezone;
  const [yearStr, monthStr, dayStr] = date.split("-");
  const year = parseInt(yearStr ?? "0", 10);
  const month = parseInt(monthStr ?? "0", 10);
  const day = parseInt(dayStr ?? "0", 10);
  if (!year || !month || !day) {
    return { slots: [] as string[], durationMinutes: context.durationMinutes };
  }

  const today = new Date();
  // Window guards work fine in any TZ — a 14-day window has slop on
  // both ends so DST shifts can't make a valid request fall outside.
  const requestedNoon = utcMomentForLocalTime(year, month, day, 12, 0, tz);
  const fourteenDaysFromNow = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
  if (requestedNoon < today || requestedNoon > fourteenDaysFromNow) {
    return { slots: [] as string[], durationMinutes: context.durationMinutes };
  }

  // Determine weekday IN WORKSPACE TZ — not server local.
  const requestedParts = partsInTimezone(requestedNoon, tz);
  const weekdayKey: AvailabilityDayKey = requestedParts.weekday;
  const dayAvailability = context.availability[weekdayKey];

  if (!dayAvailability?.enabled) {
    return { slots: [] as string[], durationMinutes: context.durationMinutes };
  }

  const workdayStartMinutes = toMinutes(dayAvailability.start);
  const workdayEndMinutes = toMinutes(dayAvailability.end);

  if (workdayStartMinutes >= workdayEndMinutes) {
    return { slots: [] as string[], durationMinutes: context.durationMinutes };
  }

  // Day window for conflict lookup: workspace-local day boundaries
  // converted to UTC moments.
  const dayStartUtc = utcMomentForLocalTime(year, month, day, 0, 0, tz);
  const dayEndUtc = utcMomentForLocalTime(year, month, day + 1, 0, 0, tz);

  const bookedRows = await db
    .select({ startsAt: bookings.startsAt, endsAt: bookings.endsAt })
    .from(bookings)
    .where(
      and(
        eq(bookings.orgId, context.orgId),
        eq(bookings.bookingSlug, context.bookingSlug),
        ne(bookings.status, "template"),
        inArray(bookings.status, ["scheduled", "completed", "no_show"]),
        gte(bookings.startsAt, dayStartUtc),
        lt(bookings.startsAt, dayEndUtc),
      ),
    );

  if (context.maxBookingsPerDay > 0 && bookedRows.length >= context.maxBookingsPerDay) {
    return { slots: [] as string[], durationMinutes: context.durationMinutes };
  }

  const slots: string[] = [];
  const slotStepMinutes = context.durationMinutes >= 60 ? 60 : 30;

  for (let minuteOffset = workdayStartMinutes; minuteOffset < workdayEndMinutes; minuteOffset += slotStepMinutes) {
    const hour = Math.floor(minuteOffset / 60);
    const minute = minuteOffset % 60;

    // Build the UTC moment for "Y-M-D HH:MM" in workspace TZ.
    const slotStart = utcMomentForLocalTime(year, month, day, hour, minute, tz);
    const slotEnd = new Date(slotStart.getTime() + context.durationMinutes * 60_000);

    // Slot must fully fit inside the workday.
    const slotEndMinutes = minuteOffset + context.durationMinutes;
    if (slotEndMinutes > workdayEndMinutes) {
      continue;
    }

    // Skip slots in the past.
    if (slotStart.getTime() <= today.getTime()) {
      continue;
    }

    const overlaps = bookedRows.some((row) => {
      const bookedStart = new Date(row.startsAt);
      const bookedEnd = new Date(row.endsAt);
      const blockedStart = new Date(bookedStart.getTime() - context.bufferBeforeMinutes * 60_000);
      const blockedEnd = new Date(bookedEnd.getTime() + context.bufferAfterMinutes * 60_000);
      return slotStart < blockedEnd && slotEnd > blockedStart;
    });

    if (!overlaps) {
      // v1.40.2 — emit UTC ISO strings (with Z). Client formats in
      // workspace TZ for display; submit interprets as UTC.
      slots.push(slotStart.toISOString());
    }
  }

  return {
    slots,
    durationMinutes: context.durationMinutes,
    // v1.40.2 — surface workspace TZ so the form can format slots
    // and label the time zone clearly.
    workspaceTimezone: tz,
  };
}

// v1.40.2 — build a UTC Date that, when formatted in `timeZone`,
// shows the intended local Y-M-D H:M. Robust across DST transitions.
//
// Approach: start with a naive UTC moment, ask the formatter what
// that moment LOOKS like in target TZ, compute the offset, apply.
function utcMomentForLocalTime(
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

export async function createAppointmentTypeAction(formData: FormData) {
  assertWritable();

  const orgId = await getOrgId();
  const user = await getCurrentUser();

  if (!orgId || !user?.id) {
    throw new Error("Unauthorized");
  }

  const name = String(formData.get("name") ?? "Consultation").trim() || "Consultation";
  const duration = resolveDuration(Number(formData.get("durationMinutes") ?? 30));
  const description = String(formData.get("description") ?? "").trim();
  const price = Math.max(0, Number(formData.get("price") ?? 0));
  const slugInput = String(formData.get("slug") ?? name);
  const bookingSlug = toBookingSlug(slugInput || "consultation") || "consultation";
  const availability = parseAvailabilityFromForm(formData);
  const bufferBeforeMinutes = resolveBufferMinutes(formData.get("bufferBeforeMinutes"));
  const bufferAfterMinutes = resolveBufferMinutes(formData.get("bufferAfterMinutes"));
  const maxBookingsPerDay = resolveMaxBookingsPerDay(formData.get("maxBookingsPerDay"));

  const now = new Date();

  await db.insert(bookings).values({
    orgId,
    userId: user.id,
    title: name,
    bookingSlug,
    fullName: null,
    email: null,
    notes: null,
    provider: "manual",
    status: "template",
    startsAt: now,
    endsAt: deriveEndsAt(now, duration),
    metadata: {
      kind: "appointment_type",
      durationMinutes: duration,
      description,
      price,
      availability: normalizeAvailability(availability),
      bufferBeforeMinutes: bufferBeforeMinutes,
      bufferAfterMinutes: bufferAfterMinutes,
      maxBookingsPerDay: maxBookingsPerDay,
    },
  });
  // 2026-05-17 — revalidate the listing page so the new appointment
  // type appears without an operator-initiated refresh.
  revalidatePath("/bookings");
}

// 2026-05-18 — FormData-shaped wrapper for the existing typed
// updateBookingTypeAction. /bookings list page calls this from a slide-out
// sheet so operators can edit appointment-type name / slug / duration /
// description / price the same way they edit intake forms. Authoritative
// validation still lives in the typed action below — this just unpacks
// the form fields and threads them through.
export async function editAppointmentTypeAction(formData: FormData) {
  assertWritable();

  const orgId = await getOrgId();
  if (!orgId) {
    throw new Error("Unauthorized");
  }

  const bookingId = String(formData.get("bookingId") ?? "").trim();
  if (!bookingId) {
    throw new Error("Booking ID is required");
  }

  const name = String(formData.get("name") ?? "").trim() || "Consultation";
  const slug = String(formData.get("slug") ?? name);
  const durationMinutes = Number(formData.get("durationMinutes") ?? 30);
  const description = String(formData.get("description") ?? "").trim();
  const price = Math.max(0, Number(formData.get("price") ?? 0));

  await updateBookingTypeAction({
    bookingId,
    name,
    slug,
    durationMinutes,
    description,
    price,
  });
}

export async function createBookingTypeForSeldonAction(input: {
  name: string;
  slug: string;
  durationMinutes?: number;
  description?: string;
  price?: number;
}) {
  assertWritable();

  const orgId = await getOrgId();
  const user = await getCurrentUser();

  if (!orgId || !user?.id) {
    throw new Error("Unauthorized");
  }

  const name = String(input.name ?? "Consultation").trim() || "Consultation";
  const slugInput = String(input.slug ?? name ?? "consultation");
  const bookingSlug = toBookingSlug(slugInput) || "consultation";
  const duration = resolveDuration(input.durationMinutes ?? 30);
  const description = String(input.description ?? "").trim();
  const price = Math.max(0, Number(input.price ?? 0));
  const now = new Date();

  const [created] = await db
    .insert(bookings)
    .values({
      orgId,
      userId: user.id,
      title: name,
      bookingSlug,
      fullName: null,
      email: null,
      notes: null,
      provider: "manual",
      status: "template",
      startsAt: now,
      endsAt: deriveEndsAt(now, duration),
      metadata: {
        kind: "appointment_type",
        durationMinutes: duration,
        description,
        price,
        availability: defaultAvailabilitySchedule(),
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
        maxBookingsPerDay: 0,
      },
    })
    .returning({ id: bookings.id, bookingSlug: bookings.bookingSlug, title: bookings.title });

  return {
    id: created?.id ?? null,
    bookingSlug: created?.bookingSlug ?? bookingSlug,
    name: created?.title ?? name,
  };
}

export async function updateBookingTypeAction(input: {
  bookingId: string;
  name: string;
  slug: string;
  durationMinutes?: number;
  description?: string;
  price?: number;
  availability?: AvailabilitySchedule;
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
  maxBookingsPerDay?: number;
}) {
  assertWritable();

  const orgId = await getOrgId();

  if (!orgId) {
    throw new Error("Unauthorized");
  }

  const bookingId = String(input.bookingId ?? "").trim();
  const name = String(input.name ?? "").trim();
  const slugInput = String(input.slug ?? name ?? "consultation");
  const slug = toBookingSlug(slugInput) || "consultation";

  if (!bookingId || !name) {
    throw new Error("Booking ID and name are required");
  }

  const [existing] = await db
    .select({ id: bookings.id, metadata: bookings.metadata })
    .from(bookings)
    .where(and(eq(bookings.orgId, orgId), eq(bookings.id, bookingId), eq(bookings.status, "template")))
    .limit(1);

  if (!existing) {
    throw new Error("Booking type not found");
  }

  const metadata = (existing.metadata as AppointmentTypeMeta | null) ?? {};
  const nextDuration = resolveDuration(input.durationMinutes ?? metadata.durationMinutes);
  const nextAvailability = normalizeAvailability(input.availability ?? metadata.availability);
  const nextBufferBefore = resolveBufferMinutes(input.bufferBeforeMinutes ?? metadata.bufferBeforeMinutes);
  const nextBufferAfter = resolveBufferMinutes(input.bufferAfterMinutes ?? metadata.bufferAfterMinutes);
  const nextMaxPerDay = resolveMaxBookingsPerDay(input.maxBookingsPerDay ?? metadata.maxBookingsPerDay);

  await db
    .update(bookings)
    .set({
      title: name,
      bookingSlug: slug,
      metadata: {
        ...metadata,
        kind: "appointment_type",
        durationMinutes: nextDuration,
        description: String(input.description ?? metadata.description ?? "").trim(),
        price: Math.max(0, Number(input.price ?? metadata.price ?? 0)),
        availability: nextAvailability,
        bufferBeforeMinutes: nextBufferBefore,
        bufferAfterMinutes: nextBufferAfter,
        maxBookingsPerDay: nextMaxPerDay,
      },
      updatedAt: new Date(),
    })
    .where(and(eq(bookings.orgId, orgId), eq(bookings.id, bookingId), eq(bookings.status, "template")));

  // 2026-05-17 — revalidate so edits show up in the bookings list
  // immediately on navigate-back.
  revalidatePath("/bookings");

  return {
    id: bookingId,
    name,
    bookingSlug: slug,
  };
}

export async function listAppointmentTypes(orgIdOverride?: string) {
  // v1.24.0 — accept orgId override for operator-portal mirror.
  const orgId = orgIdOverride ?? (await getOrgId());

  if (!orgId) {
    return [];
  }

  return db
    .select({
      id: bookings.id,
      title: bookings.title,
      bookingSlug: bookings.bookingSlug,
      metadata: bookings.metadata,
      createdAt: bookings.createdAt,
    })
    .from(bookings)
    .where(and(eq(bookings.orgId, orgId), eq(bookings.status, "template")))
    .orderBy(asc(bookings.createdAt));
}

export async function listBookings(orgIdOverride?: string) {
  // v1.24.0 — accept orgId override for operator-portal mirror.
  const orgId = orgIdOverride ?? (await getOrgId());

  if (!orgId) {
    return [];
  }

  const rows = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.orgId, orgId), ne(bookings.status, "template")))
    .orderBy(asc(bookings.startsAt));

  await reconcileGoogleCalendarBookings(
    rows.map((row) => ({
      bookingId: row.id,
      status: row.status,
      userId: row.userId,
      externalEventId: row.externalEventId,
    }))
  );

  return rows;
}

export async function createBookingAction(formData: FormData) {
  assertWritable();

  const orgId = await getOrgId();
  const user = await getCurrentUser();

  if (!orgId || !user?.id) {
    throw new Error("Unauthorized");
  }

  const contactId = String(formData.get("contactId") ?? "").trim() || null;

  if (contactId) {
    const [contact] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.orgId, orgId), eq(contacts.id, contactId)))
      .limit(1);

    if (!contact) {
      throw new Error("Contact not found");
    }
  }

  const startsAt = new Date(String(formData.get("startsAt") ?? ""));

  if (Number.isNaN(startsAt.getTime())) {
    throw new Error("Invalid booking start time");
  }

  const durationMinutes = Number(formData.get("durationMinutes") ?? 30);
  const provider = await resolveBookingProvider(String(formData.get("provider") ?? "") || null);

  const [created] = await db
    .insert(bookings)
    .values({
      orgId,
      contactId,
      userId: user.id,
      title: String(formData.get("title") ?? "Consultation"),
      bookingSlug: String(formData.get("bookingSlug") ?? "default"),
      fullName: String(formData.get("fullName") ?? "") || null,
      email: String(formData.get("email") ?? "") || null,
      notes: String(formData.get("notes") ?? "") || null,
      provider,
      status: "scheduled",
      startsAt,
      endsAt: deriveEndsAt(startsAt, Number.isFinite(durationMinutes) ? durationMinutes : 30),
      metadata: {
        source: "dashboard",
        integrationConfigured: provider !== "manual",
      },
    })
    .returning({ id: bookings.id, contactId: bookings.contactId });

  if (!created) {
    throw new Error("Could not create booking");
  }

  const fallbackMeetingUrl = buildMeetingUrl(provider, created.id);
  let externalEventId: string | null = fallbackMeetingUrl ? created.id : null;
  let meetingUrl: string | null = fallbackMeetingUrl;

  if (provider === "google-calendar") {
    const googleSynced = await syncBookingWithGoogleCalendar({
      bookingId: created.id,
      userId: user.id,
      title: String(formData.get("title") ?? "Consultation"),
      notes: String(formData.get("notes") ?? "") || null,
      startsAt,
      endsAt: deriveEndsAt(startsAt, Number.isFinite(durationMinutes) ? durationMinutes : 30),
    });

    if (googleSynced.externalEventId || googleSynced.meetingUrl) {
      externalEventId = googleSynced.externalEventId;
      meetingUrl = googleSynced.meetingUrl;
    }
  }

  if (meetingUrl || externalEventId) {
    await db
      .update(bookings)
      .set({ meetingUrl, externalEventId, updatedAt: new Date() })
      .where(and(eq(bookings.orgId, orgId), eq(bookings.id, created.id)));
  }

  if (created.contactId) {
    await emitSeldonEvent("booking.created", {
      appointmentId: created.id,
      contactId: created.contactId,
    }, { orgId: orgId });
  }

  return { id: created.id };
}

export async function completeBookingAction(bookingId: string) {
  assertWritable();

  const orgId = await getOrgId();

  if (!orgId) {
    throw new Error("Unauthorized");
  }

  const [row] = await db
    .update(bookings)
    .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(bookings.orgId, orgId), eq(bookings.id, bookingId)))
    .returning({
      id: bookings.id,
      contactId: bookings.contactId,
      startsAt: bookings.startsAt,
      title: bookings.title,
      notes: bookings.notes,
      endsAt: bookings.endsAt,
      userId: bookings.userId,
      externalEventId: bookings.externalEventId,
    });

  if (row) {
    await syncBookingWithGoogleCalendar({
      bookingId: row.id,
      userId: row.userId,
      title: row.title,
      notes: row.notes,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      externalEventId: row.externalEventId,
    });
  }

  if (row?.contactId) {
    await emitSeldonEvent("booking.completed", {
      appointmentId: row.id,
      contactId: row.contactId,
    }, { orgId: orgId });
  }

  if (row) {
    await recordBookingOutcomeLearning({
      orgId,
      startsAt: row.startsAt,
      status: "completed",
    });
  }
}

export async function cancelBookingAction(bookingId: string) {
  assertWritable();

  const orgId = await getOrgId();

  if (!orgId) {
    throw new Error("Unauthorized");
  }

  const [row] = await db
    .update(bookings)
    .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
    .where(and(eq(bookings.orgId, orgId), eq(bookings.id, bookingId)))
    .returning({ id: bookings.id, contactId: bookings.contactId, userId: bookings.userId, externalEventId: bookings.externalEventId });

  if (row) {
    await deleteGoogleCalendarBookingEvent({
      userId: row.userId,
      externalEventId: row.externalEventId,
    });
  }

  if (row?.contactId) {
    await emitSeldonEvent("booking.cancelled", {
      appointmentId: row.id,
      contactId: row.contactId,
    }, { orgId: orgId });
  }
}

export async function markBookingNoShowAction(bookingId: string) {
  assertWritable();

  const orgId = await getOrgId();

  if (!orgId) {
    throw new Error("Unauthorized");
  }

  const [row] = await db
    .update(bookings)
    .set({ status: "no_show", updatedAt: new Date() })
    .where(and(eq(bookings.orgId, orgId), eq(bookings.id, bookingId)))
    .returning({
      id: bookings.id,
      contactId: bookings.contactId,
      startsAt: bookings.startsAt,
      title: bookings.title,
      notes: bookings.notes,
      endsAt: bookings.endsAt,
      userId: bookings.userId,
      externalEventId: bookings.externalEventId,
    });

  if (row) {
    await syncBookingWithGoogleCalendar({
      bookingId: row.id,
      userId: row.userId,
      title: row.title,
      notes: row.notes,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      externalEventId: row.externalEventId,
    });
  }

  if (row?.contactId) {
    await emitSeldonEvent("booking.no_show", {
      appointmentId: row.id,
      contactId: row.contactId,
    }, { orgId: orgId });
  }

  if (row) {
    await recordBookingOutcomeLearning({
      orgId,
      startsAt: row.startsAt,
      status: "no_show",
    });
  }
}

export async function submitPublicBookingAction({
  orgSlug,
  bookingSlug,
  fullName,
  email,
  notes,
  startsAt,
  intakeResponses,
}: {
  orgSlug: string;
  bookingSlug: string;
  fullName: string;
  email: string;
  notes?: string;
  startsAt: string;
  /** v1.40.1 — vertical-aware intake field responses keyed by field id.
   *  e.g. { address: "1234 Main St", urgency: "Today", issue_type: "..." }
   *  Stored on the booking row's metadata so the operator sees actionable
   *  context the moment the lead lands in their CRM. */
  intakeResponses?: Record<string, string>;
}) {
  assertWritable();

  // v1.3.3 — structured logging at every throw. The route handler
  // catches and returns 500; without these logs we couldn't tell
  // which validation step rejected the booking.
  const baseLogContext = {
    org_slug: orgSlug,
    booking_slug: bookingSlug,
    starts_at: startsAt,
  };
  const rejectAndThrow = (
    reason: string,
    details: Record<string, unknown>,
  ): never => {
    console.error(
      JSON.stringify({
        event: "submit_public_booking_rejected",
        reason,
        ...baseLogContext,
        ...details,
      }),
    );
    throw new Error(`${reason}: ${JSON.stringify(details).slice(0, 200)}`);
  };

  const bookingContext = await resolvePublicBookingContext(orgSlug, bookingSlug);

  if (!bookingContext) {
    return rejectAndThrow("booking_context_not_found", {
      hint: "no organizations row for orgSlug, or no bookings row with status='template' for that bookingSlug",
    });
  }

  const [existing] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.orgId, bookingContext.orgId), eq(contacts.email, email)))
    .limit(1);

  let contactId = existing?.id ?? null;

  if (!contactId) {
    const [createdContact] = await db
      .insert(contacts)
      .values({
        orgId: bookingContext.orgId,
        firstName: fullName,
        email,
        status: "lead",
        source: "booking",
      })
      .returning({ id: contacts.id });

    contactId = createdContact?.id ?? null;

    if (contactId) {
      await emitSeldonEvent("contact.created", { contactId }, { orgId: bookingContext.orgId });
    }
  }

  const bookingStart = new Date(startsAt);

  if (Number.isNaN(bookingStart.getTime())) {
    return rejectAndThrow("invalid_start_time", {
      received: startsAt,
      hint: "starts_at must be a parseable ISO 8601 datetime",
    });
  }

  // v1.3.2 — TIMEZONE-AWARE slot validation.
  //
  // The previous strict check `availableSlots.slots.includes(toDateTimeLocalValue(bookingStart))`
  // compared format strings produced from server-local time
  // (Vercel = UTC). The client picked a slot in the WORKSPACE'S
  // timezone (e.g. "Wed 4pm Vancouver"), which `toISOString()` ships
  // as a UTC moment ("Wed 23:00 UTC"). On the server, getHours()
  // returns 23, slot generation produces ["09:00", "09:30", ...,
  // "16:30"] in UTC — no match → "Selected slot is no longer
  // available" rejected every valid booking attempt.
  //
  // New design: derive workspace-local components from the UTC
  // moment via Intl, then validate against the personality/template
  // availability in the SAME workspace TZ frame. This is the
  // correct semantic model — bookings happen in the BUSINESS'S
  // local time, not the server's, and not the visitor's.
  const [orgRow] = await db
    .select({ timezone: organizations.timezone })
    .from(organizations)
    .where(eq(organizations.id, bookingContext.orgId))
    .limit(1);
  const workspaceTz = orgRow?.timezone || "UTC";

  const localParts = partsInTimezone(bookingStart, workspaceTz);
  const dayAvailability = bookingContext.availability[localParts.weekday];
  if (!dayAvailability?.enabled) {
    return rejectAndThrow("day_not_available", {
      weekday_in_workspace_tz: localParts.weekday,
      workspace_timezone: workspaceTz,
      day_availability: dayAvailability ?? null,
      all_availability_keys: Object.keys(bookingContext.availability),
    });
  }
  const slotMinuteOfDay = localParts.hour * 60 + localParts.minute;
  const dayStartMinutes = toMinutes(dayAvailability.start);
  const dayEndMinutes = toMinutes(dayAvailability.end);
  if (slotMinuteOfDay < dayStartMinutes || slotMinuteOfDay >= dayEndMinutes) {
    return rejectAndThrow("slot_outside_business_hours", {
      slot_local_hhmm: `${localParts.hour}:${String(localParts.minute).padStart(2, "0")}`,
      slot_minute_of_day: slotMinuteOfDay,
      workspace_timezone: workspaceTz,
      weekday: localParts.weekday,
      day_start: dayAvailability.start,
      day_end: dayAvailability.end,
      day_start_minutes: dayStartMinutes,
      day_end_minutes: dayEndMinutes,
    });
  }
  // Snap-to-grid check: slot must align to a 15-minute boundary so
  // we don't accept arbitrarily-offset bookings. 15 (not 30) so a
  // 60-min duration can still anchor at :15 / :45 if the personality
  // wants finer granularity later.
  if (slotMinuteOfDay % 15 !== 0) {
    return rejectAndThrow("slot_off_grid", {
      slot_local_hhmm: `${localParts.hour}:${String(localParts.minute).padStart(2, "0")}`,
      slot_minute_of_day: slotMinuteOfDay,
      modulo_15: slotMinuteOfDay % 15,
      hint: "client must pick slots aligned to :00, :15, :30, :45 boundaries in the workspace TZ",
    });
  }
  // Check for overlap with existing real bookings on the same day.
  const dayStartUtc = new Date(bookingStart);
  dayStartUtc.setUTCHours(0, 0, 0, 0);
  const dayEndUtc = new Date(dayStartUtc);
  dayEndUtc.setUTCDate(dayEndUtc.getUTCDate() + 1);
  // 2026-05-18 — conflict check now scoped to the whole workspace
  // (no eq(bookingSlug)). Previously we'd scope to a single
  // appointment-type slug, which meant a workspace with multiple
  // types ("default", "free-roof-inspection", "site-visit") could
  // accidentally double-book the operator's time at 12pm across
  // different types. The operator only has one calendar — guard
  // against ALL appointment types overlapping at the same instant.
  // Also include pending_payment in the conflict set so a half-paid
  // booking blocks a parallel reservation until checkout completes
  // (or expires). status='template' rows are always excluded.
  const conflicts = await db
    .select({ startsAt: bookings.startsAt, endsAt: bookings.endsAt })
    .from(bookings)
    .where(
      and(
        eq(bookings.orgId, bookingContext.orgId),
        ne(bookings.status, "template"),
        inArray(bookings.status, ["scheduled", "completed", "pending_payment"]),
        gte(bookings.startsAt, dayStartUtc),
        lt(bookings.startsAt, dayEndUtc),
      ),
    );
  const slotEnd = deriveEndsAt(bookingStart, bookingContext.durationMinutes);
  const overlap = conflicts.some((row) => {
    const s = new Date(row.startsAt).getTime();
    const e = new Date(row.endsAt).getTime();
    return bookingStart.getTime() < e && slotEnd.getTime() > s;
  });
  if (overlap) {
    return rejectAndThrow("slot_already_booked", {
      conflict_count: conflicts.length,
      requested_start: bookingStart.toISOString(),
      requested_end: slotEnd.toISOString(),
    });
  }

  const provider = await resolveBookingProvider(null);

  const [createdBooking] = await db
    .insert(bookings)
    .values({
      orgId: bookingContext.orgId,
      contactId,
      title: "Booked consultation",
      bookingSlug,
      fullName,
      email,
      notes: notes ?? null,
      provider,
      status: bookingContext.price > 0 ? "pending_payment" : "scheduled",
      startsAt: bookingStart,
      endsAt: deriveEndsAt(bookingStart, bookingContext.durationMinutes),
      metadata: {
        source: "public",
        appointmentType: bookingContext.appointmentName,
        durationMinutes: bookingContext.durationMinutes,
        price: bookingContext.price,
        // v1.40.1 — vertical-aware intake responses (address, issue,
        // urgency, etc.) stored on the booking so operators see
        // actionable lead context in their CRM the moment the lead
        // lands. Empty object when no intake fields were defined.
        intakeResponses: intakeResponses ?? {},
      },
    })
    .returning({ id: bookings.id });

  if (createdBooking?.id) {
    if (bookingContext.price > 0) {
      const checkout = await createBookingCheckoutSession({
        orgId: bookingContext.orgId,
        bookingId: createdBooking.id,
        contactId,
        customerEmail: email,
        amount: bookingContext.price,
        successPath: `/book/${orgSlug}/${bookingSlug}?success=1`,
        cancelPath: `/book/${orgSlug}/${bookingSlug}?canceled=1`,
      });

      return {
        success: true,
        confirmationMessage: bookingContext.confirmationMessage,
        checkoutUrl: checkout.checkoutUrl,
      };
    }

    const [bookingRow] = await db
      .select({
        id: bookings.id,
        title: bookings.title,
        notes: bookings.notes,
        startsAt: bookings.startsAt,
        endsAt: bookings.endsAt,
        userId: bookings.userId,
        provider: bookings.provider,
      })
      .from(bookings)
      .where(and(eq(bookings.orgId, bookingContext.orgId), eq(bookings.id, createdBooking.id)))
      .limit(1);

    const fallbackMeetingUrl = buildMeetingUrl(provider, createdBooking.id);
    let externalEventId: string | null = fallbackMeetingUrl ? createdBooking.id : null;
    let meetingUrl: string | null = fallbackMeetingUrl;

    if (bookingRow?.provider === "google-calendar") {
      const googleSynced = await syncBookingWithGoogleCalendar({
        bookingId: bookingRow.id,
        userId: bookingRow.userId,
        title: bookingRow.title,
        notes: bookingRow.notes,
        startsAt: bookingRow.startsAt,
        endsAt: bookingRow.endsAt,
      });

      if (googleSynced.externalEventId || googleSynced.meetingUrl) {
        externalEventId = googleSynced.externalEventId;
        meetingUrl = googleSynced.meetingUrl;
      }
    }

    if (meetingUrl || externalEventId) {
      await db
        .update(bookings)
        .set({ meetingUrl, externalEventId, updatedAt: new Date() })
        .where(and(eq(bookings.orgId, bookingContext.orgId), eq(bookings.id, createdBooking.id)));
    }

    if (contactId) {
      await emitSeldonEvent("booking.created", {
        appointmentId: createdBooking.id,
        contactId,
      }, { orgId: bookingContext.orgId });

      // v1.28.4 — fire-and-forget the post-booking 24h reminder workflow.
      // bookingReminderWorkflow durably sleeps until startsAt-24h, then
      // sends an SMS (if Twilio configured) or email (if Resend); writes
      // an activity row in either case. Skips internally if the booking
      // is already <24h away or gets cancelled before fire time.
      try {
        const { start } = await import("workflow/api");
        const { bookingReminderWorkflow } = await import(
          "@/lib/workflows/booking-reminder"
        );
        await start(bookingReminderWorkflow, [createdBooking.id]);
      } catch (err) {
        // Don't fail the booking on workflow trigger errors. Log and
        // continue — the booking row exists; the reminder is best-effort.
        console.error(
          `[submitPublicBookingAction] booking_reminder_workflow_start_failed bookingId=${createdBooking.id} err=${err instanceof Error ? err.message : String(err)}`,
        );
      }

      const [owner] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.orgId, bookingContext.orgId))
        .limit(1);

      if (owner?.id) {
        await db.insert(activities).values({
          orgId: bookingContext.orgId,
          userId: owner.id,
          contactId,
          type: "meeting",
          subject: `Booked ${bookingContext.appointmentName}`,
          body: notes ?? null,
          metadata: {
            bookingId: createdBooking.id,
            source: "public-booking",
          },
          scheduledAt: bookingStart,
        });
      }

      // v1.3.4 — surface the booking in the CRM pipeline kanban.
      //
      // Root-cause fix for "bookings don't appear in /deals after a
      // visitor books on the public page": until now,
      // `submitPublicBookingAction` only inserted into `bookings` +
      // `activities` + `contacts`. The kanban reads `deals`, so the
      // visitor's expressed intent never showed up where operators
      // actually triage their pipeline.
      //
      // Design choices:
      //   - Use the org's default pipeline. `ensureDefaultPipelineForOrg`
      //     lazy-seeds one if missing, so legacy workspaces created
      //     before pipeline-seeding was wired into createAnonymousWorkspace
      //     still get a kanban entry.
      //   - Land the deal at the FIRST stage (Lead / "New Lead" /
      //     equivalent) — operators move it through their funnel as
      //     the booking becomes a paying customer.
      //   - Use the booking price as the deal value. For free
      //     consultations this lands at $0; operators can edit later.
      //   - Stamp `customFields.bookingId` so future booking events
      //     (no-show, completed, canceled) can reconcile back to this
      //     deal instead of creating duplicates.
      //   - Wrap in try/catch + structured log: a deal-insert failure
      //     must NOT roll back the booking itself. The visitor's
      //     booking is the contract; the kanban entry is operator UX.
      try {
        const pipeline = await ensureDefaultPipelineForOrg(bookingContext.orgId);
        // v1.5.1 — smart stage selection. A booking that just landed in
        // the system represents a confirmed appointment, NOT a cold
        // inquiry. Pre-1.5.1 we landed every deal at index 0 ("Lead" /
        // "Inquiry"), which made the kanban inaccurate the moment a
        // visitor booked — operators had to manually move every deal up
        // a stage. Now we look for a stage whose name suggests
        // "appointment confirmed" (booked / scheduled / trial /
        // appointment / consultation) and use it; fall back to first
        // stage when no such stage exists. Personalities that DO declare
        // a "Trial Lesson Booked" / "Estimate Scheduled" / "Consult
        // Booked" stage automatically get the right behavior; everything
        // else lands at first stage as before.
        const stages = pipeline.stages ?? [];
        const bookedStageRe =
          /\b(booked|scheduled|trial|appointment|consult(ation)?|reservation|reserved)\b/i;
        const matchedStage = stages.find((s) => bookedStageRe.test(s.name));
        const targetStage = matchedStage ?? stages[0];
        const stageName = targetStage?.name ?? "Lead";
        const stageProbability = targetStage?.probability ?? 0;

        const [createdDeal] = await db
          .insert(deals)
          .values({
            orgId: bookingContext.orgId,
            contactId,
            pipelineId: pipeline.id,
            title: `${bookingContext.appointmentName} — ${fullName}`,
            stage: stageName,
            probability: stageProbability,
            value: String(bookingContext.price ?? 0),
            customFields: {
              source: "public-booking",
              bookingId: createdBooking.id,
              bookingSlug,
              appointmentName: bookingContext.appointmentName,
              durationMinutes: bookingContext.durationMinutes,
              startsAt: bookingStart.toISOString(),
            },
          })
          .returning({ id: deals.id });

        console.log(
          JSON.stringify({
            event: "public_booking_deal_created",
            ...baseLogContext,
            booking_id: createdBooking.id,
            deal_id: createdDeal?.id ?? null,
            pipeline_id: pipeline.id,
            stage: stageName,
            stage_match: matchedStage ? "smart" : "first_stage_fallback",
            available_stages: stages.map((s) => s.name),
          }),
        );
      } catch (err) {
        // Deal insertion failed — log but don't roll back. The
        // booking is already saved; an operator can manually create
        // a deal from the booking row in the admin UI if needed.
        console.error(
          JSON.stringify({
            event: "public_booking_deal_failed",
            ...baseLogContext,
            booking_id: createdBooking.id,
            error: err instanceof Error ? err.message : String(err),
          }),
        );
      }

      // v1.6.0 — brain trigger: append a dated observation to the
      // workspace's pipeline/booked-appointments.md note. Over time this
      // becomes a record of "what kinds of customers actually book us"
      // that the IDE agent reads when generating future blocks (e.g.
      // hero copy that highlights the demographic that's actually
      // converting). Best-effort — failures don't roll back the booking.
      try {
        const { appendToBrainNote } = await import("@/lib/brain/store");
        const localTime = (() => {
          try {
            const parts = partsInTimezone(bookingStart, workspaceTz);
            return `${parts.weekday} ${parts.hour}:${String(parts.minute).padStart(2, "0")}`;
          } catch {
            return bookingStart.toISOString();
          }
        })();
        await appendToBrainNote({
          orgId: bookingContext.orgId,
          scope: "workspace",
          path: "pipeline/booked-appointments.md",
          paragraph: `**${bookingContext.appointmentName}** booked for ${localTime} (${workspaceTz}). Lead source: public-booking. Email domain: ${email.split("@")[1] ?? "unknown"}.`,
          metadata: {
            type: "fact",
            tags: ["booking", "conversion"],
            source: `trigger:booking.created:${createdBooking.id}`,
            related_block_types: ["hero", "cta", "booking"],
          },
        });
      } catch (err) {
        console.warn(
          JSON.stringify({
            event: "brain_trigger_booking_failed",
            ...baseLogContext,
            booking_id: createdBooking.id,
            error: err instanceof Error ? err.message : String(err),
          }),
        );
      }
    }
  }

  return { success: true, confirmationMessage: bookingContext.confirmationMessage, checkoutUrl: null as string | null };
}
