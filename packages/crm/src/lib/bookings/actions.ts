"use server";

import { and, asc, eq, gte, inArray, lt, ne } from "drizzle-orm";
import { db } from "@/db";
import { activities, bookings, contacts, organizations, users } from "@/db/schema";
import { getCurrentUser, getOrgId } from "@/lib/auth/helpers";
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
};

const weekdayKeys: AvailabilityDayKey[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

const weekdayByIndex: Record<number, AvailabilityDayKey> = {
  0: "sunday",
  1: "monday",
  2: "tuesday",
  3: "wednesday",
  4: "thursday",
  5: "friday",
  6: "saturday",
};

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

function normalizeAvailability(raw: unknown): AvailabilitySchedule {
  const defaults = defaultAvailabilitySchedule();
  const source = typeof raw === "object" && raw ? (raw as Record<string, unknown>) : {};

  const normalized = weekdayKeys.reduce((acc, dayKey) => {
    const dayDefaults = defaults[dayKey];
    const daySource = source[dayKey] as Record<string, unknown> | undefined;
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

function toDateTimeLocalValue(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function normalizeVoiceConfirmation(rawSoul: unknown) {
  const soul = (rawSoul as { voice?: { samplePhrases?: string[] } } | null) ?? null;
  return soul?.voice?.samplePhrases?.[0] || "Booking confirmed. We will contact you shortly.";
}

async function resolvePublicBookingContext(orgSlug: string, bookingSlug: string): Promise<PublicBookingContext | null> {
  const [org] = await db
    .select({ id: organizations.id, soul: organizations.soul })
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
  };
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

  const requestedDay = new Date(`${date}T00:00:00`);

  if (Number.isNaN(requestedDay.getTime())) {
    return { slots: [] as string[], durationMinutes: context.durationMinutes };
  }

  const today = new Date();
  const startWindow = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const endWindow = new Date(startWindow);
  endWindow.setDate(endWindow.getDate() + 14);

  if (requestedDay < startWindow || requestedDay > endWindow) {
    return { slots: [] as string[], durationMinutes: context.durationMinutes };
  }

  const dayStart = new Date(requestedDay);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const weekdayKey = weekdayByIndex[requestedDay.getDay()];
  const dayAvailability = context.availability[weekdayKey];

  if (!dayAvailability?.enabled) {
    return { slots: [] as string[], durationMinutes: context.durationMinutes };
  }

  const workdayStartMinutes = toMinutes(dayAvailability.start);
  const workdayEndMinutes = toMinutes(dayAvailability.end);

  if (workdayStartMinutes >= workdayEndMinutes) {
    return { slots: [] as string[], durationMinutes: context.durationMinutes };
  }

  const bookedRows = await db
    .select({ startsAt: bookings.startsAt, endsAt: bookings.endsAt })
    .from(bookings)
    .where(
      and(
        eq(bookings.orgId, context.orgId),
        eq(bookings.bookingSlug, context.bookingSlug),
        ne(bookings.status, "template"),
        inArray(bookings.status, ["scheduled", "completed", "no_show"]),
        gte(bookings.startsAt, dayStart),
        lt(bookings.startsAt, dayEnd)
      )
    );

  if (context.maxBookingsPerDay > 0 && bookedRows.length >= context.maxBookingsPerDay) {
    return { slots: [] as string[], durationMinutes: context.durationMinutes };
  }

  const slots: string[] = [];
  const slotStepMinutes = context.durationMinutes >= 60 ? 60 : 30;

  for (let minuteOffset = workdayStartMinutes; minuteOffset < workdayEndMinutes; minuteOffset += slotStepMinutes) {
    const hour = Math.floor(minuteOffset / 60);
    const minute = minuteOffset % 60;
      const slotStart = new Date(requestedDay);
      slotStart.setHours(hour, minute, 0, 0);

      const slotEnd = deriveEndsAt(slotStart, context.durationMinutes);

      const slotEndMinutes = slotEnd.getHours() * 60 + slotEnd.getMinutes();

      if (slotEndMinutes > workdayEndMinutes) {
        continue;
      }

      if (slotStart < today) {
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
        slots.push(toDateTimeLocalValue(slotStart));
      }
  }

  return {
    slots,
    durationMinutes: context.durationMinutes,
  };
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

  return {
    id: bookingId,
    name,
    bookingSlug: slug,
  };
}

export async function listAppointmentTypes() {
  const orgId = await getOrgId();

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

export async function listBookings() {
  const orgId = await getOrgId();

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
    });
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
    });
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
    });
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
    });
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
}: {
  orgSlug: string;
  bookingSlug: string;
  fullName: string;
  email: string;
  notes?: string;
  startsAt: string;
}) {
  assertWritable();

  const bookingContext = await resolvePublicBookingContext(orgSlug, bookingSlug);

  if (!bookingContext) {
    throw new Error("Booking page not found");
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
      await emitSeldonEvent("contact.created", { contactId });
    }
  }

  const bookingStart = new Date(startsAt);

  if (Number.isNaN(bookingStart.getTime())) {
    throw new Error("Invalid start time");
  }

  const bookingDate = toDateTimeLocalValue(bookingStart).slice(0, 10);
  const availableSlots = await listPublicBookingSlotsAction({
    orgSlug,
    bookingSlug,
    date: bookingDate,
  });

  if (!availableSlots.slots.includes(toDateTimeLocalValue(bookingStart))) {
    throw new Error("Selected slot is no longer available");
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
      });

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
    }
  }

  return { success: true, confirmationMessage: bookingContext.confirmationMessage, checkoutUrl: null as string | null };
}
