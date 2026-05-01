import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { activities, bookings, contacts, paymentRecords, stripeConnections, users } from "@/db/schema";
import { emitSeldonEvent } from "@/lib/events/bus";
import { deleteGoogleCalendarBookingEvent, syncBookingWithGoogleCalendar } from "@/lib/bookings/google-calendar-sync";
import { createBookingCheckoutSession } from "@/lib/payments/actions";
import { dispatchWebhook } from "@/lib/utils/webhooks";
import { trackEvent } from "@/lib/analytics/track";

// Schedule a real booking against an existing appointment-type template.
// Phase 7.a surfaced this as the MCP gap that blocked Speed-to-Lead
// synthesis end-to-end — Claude correctly declined when asked to "book
// the patient" because no create_booking tool existed. This closes it.
//
// Booking lifecycle + table layout:
// - Appointment types are rows in `bookings` with status='template'.
//   They carry durationMinutes + price + availability in metadata.
// - Real scheduled appointments are rows in the same table with
//   status='scheduled' (then 'completed' / 'cancelled' / 'no_show').
// - booking.created is emitted against the scheduled row, not the
//   template. Matches existing emit sites in
//   lib/bookings/actions.ts::createBookingAction + the post-payment
//   flow in lib/payments/actions.ts.

type TemplateMetadata = {
  durationMinutes?: number;
  description?: string;
  price?: number;
};

function resolveEndsAt(startsAt: Date, metadata: TemplateMetadata) {
  const minutes = Number.isFinite(metadata.durationMinutes) ? Math.max(5, Number(metadata.durationMinutes)) : 30;
  return new Date(startsAt.getTime() + minutes * 60 * 1000);
}

export type CreateBookingInput = {
  orgId: string;
  contactId: string;
  appointmentTypeId: string;
  startsAt: Date;
  notes?: string | null;
};

export type CreateBookingResult = {
  booking: {
    id: string;
    title: string;
    bookingSlug: string;
    status: string;
    startsAt: string;
    endsAt: string;
    meetingUrl: string | null;
    fullName: string | null;
    email: string | null;
  };
  checkout: { url: string | null; sessionId: string } | null;
};

export async function createBookingFromApi(input: CreateBookingInput): Promise<CreateBookingResult> {
  // Resolve the appointment-type template within this org. Enforce
  // status='template' so callers can't accidentally schedule on top
  // of another scheduled booking.
  const [template] = await db
    .select({
      id: bookings.id,
      orgId: bookings.orgId,
      title: bookings.title,
      bookingSlug: bookings.bookingSlug,
      metadata: bookings.metadata,
      status: bookings.status,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.orgId, input.orgId),
        eq(bookings.id, input.appointmentTypeId),
        eq(bookings.status, "template"),
      ),
    )
    .limit(1);

  if (!template) {
    throw new Error(`Appointment type ${input.appointmentTypeId} not found in this workspace`);
  }

  const metadata = (template.metadata ?? {}) as TemplateMetadata;
  const endsAt = resolveEndsAt(input.startsAt, metadata);

  // Pull the contact so we can stamp fullName + email onto the booking
  // row (existing rows carry these denormalized for public-display flows).
  const [contact] = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
    })
    .from(contacts)
    .where(and(eq(contacts.orgId, input.orgId), eq(contacts.id, input.contactId)))
    .limit(1);

  if (!contact) {
    throw new Error(`Contact ${input.contactId} not found in this workspace`);
  }

  const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || null;

  const [created] = await db
    .insert(bookings)
    .values({
      orgId: input.orgId,
      contactId: contact.id,
      userId: null,
      title: template.title,
      bookingSlug: template.bookingSlug,
      fullName,
      email: contact.email,
      notes: input.notes ?? null,
      provider: "manual",
      status: "scheduled",
      startsAt: input.startsAt,
      endsAt,
      metadata: {
        source: "api",
        appointmentTypeId: template.id,
        ...(typeof metadata.price === "number" ? { price: metadata.price } : {}),
      },
    })
    .returning({
      id: bookings.id,
      title: bookings.title,
      bookingSlug: bookings.bookingSlug,
      status: bookings.status,
      startsAt: bookings.startsAt,
      endsAt: bookings.endsAt,
      meetingUrl: bookings.meetingUrl,
      fullName: bookings.fullName,
      email: bookings.email,
    });

  if (!created) {
    throw new Error("Could not create booking row");
  }

  await emitSeldonEvent("booking.created", {
    appointmentId: created.id,
    contactId: contact.id,
  }, { orgId: input.orgId });

  // May 1, 2026 — Measurement Layer 2. Fire-and-forget. Captures
  // booking-creation context that the Brain layer can later
  // correlate with show/no-show outcomes (logged in the booking-
  // status-update path once that ships).
  trackEvent(
    "booking_created",
    {
      booking_id: created.id,
      appointment_type_id: template.id,
      duration_minutes:
        typeof metadata.durationMinutes === "number"
          ? metadata.durationMinutes
          : null,
      day_of_week: created.startsAt
        .toLocaleDateString("en-US", { weekday: "long" })
        .toLowerCase(),
      hour_of_day: created.startsAt.getHours(),
      has_email: Boolean(contact.email),
      source: "api",
    },
    { orgId: input.orgId, contactId: contact.id }
  );

  await dispatchWebhook({
    orgId: input.orgId,
    event: "booking.created",
    payload: {
      bookingId: created.id,
      contactId: contact.id,
      appointmentTypeId: template.id,
      startsAt: created.startsAt.toISOString(),
    },
  });

  // Activity timeline entry — match the pattern existing create paths
  // use. Picks the first org user as the owner so the event is attributed
  // to someone; if the workspace has no users, skip silently.
  const [owner] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.orgId, input.orgId))
    .limit(1);
  if (owner?.id) {
    await db.insert(activities).values({
      orgId: input.orgId,
      userId: owner.id,
      contactId: contact.id,
      type: "meeting",
      subject: `Booking scheduled: ${template.title}`,
      body: `Scheduled for ${created.startsAt.toISOString()}${input.notes ? ` — ${input.notes}` : ""}`,
      metadata: { bookingId: created.id, appointmentTypeId: template.id, source: "api" },
      scheduledAt: created.startsAt,
    });
  }

  // If the appointment type carries a price, generate a Stripe Checkout
  // session routed to the SMB's connected account (per Phase 5.b fix).
  // Returned as `checkout.url` so callers can pass the link along via
  // SMS/email; payment is not forced.
  let checkout: CreateBookingResult["checkout"] = null;
  const price = typeof metadata.price === "number" ? metadata.price : 0;
  if (price > 0 && contact.email) {
    const [connection] = await db
      .select({ id: stripeConnections.id })
      .from(stripeConnections)
      .where(and(eq(stripeConnections.orgId, input.orgId), eq(stripeConnections.isActive, true)))
      .limit(1);
    if (connection) {
      try {
        const session = await createBookingCheckoutSession({
          orgId: input.orgId,
          bookingId: created.id,
          contactId: contact.id,
          customerEmail: contact.email,
          amount: price,
        });
        checkout = { url: session.checkoutUrl, sessionId: session.sessionId };
      } catch {
        // Checkout generation is best-effort — the booking exists either
        // way. Surface the issue to callers as `checkout: null`.
      }
    }
  }

  return {
    booking: {
      id: created.id,
      title: created.title,
      bookingSlug: created.bookingSlug,
      status: created.status,
      startsAt: created.startsAt.toISOString(),
      endsAt: created.endsAt.toISOString(),
      meetingUrl: created.meetingUrl,
      fullName: created.fullName,
      email: created.email,
    },
    checkout,
  };
}

// Fetch a single scheduled booking scoped to the caller's org. Excludes
// appointment-type templates (status='template') so this surface stays
// focused on real appointments; templates have their own get endpoint
// via /api/v1/booking/appointment-types/[slug].
//
// Wrong-org ids and unknown ids are both reported as "not found" — the
// API route surfaces that as 404 without leaking whether the id exists
// in another workspace. Part of the 2a audit's cross-org safety rule.

export type GetBookingInput = {
  orgId: string;
  bookingId: string;
};

export type BookingDetail = {
  id: string;
  contactId: string | null;
  title: string;
  bookingSlug: string;
  status: string;
  startsAt: string;
  endsAt: string;
  fullName: string | null;
  email: string | null;
  notes: string | null;
  provider: string;
  meetingUrl: string | null;
  cancelledAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
};

export async function getBookingFromApi(input: GetBookingInput): Promise<BookingDetail | null> {
  const [row] = await db
    .select({
      id: bookings.id,
      contactId: bookings.contactId,
      title: bookings.title,
      bookingSlug: bookings.bookingSlug,
      status: bookings.status,
      startsAt: bookings.startsAt,
      endsAt: bookings.endsAt,
      fullName: bookings.fullName,
      email: bookings.email,
      notes: bookings.notes,
      provider: bookings.provider,
      meetingUrl: bookings.meetingUrl,
      cancelledAt: bookings.cancelledAt,
      completedAt: bookings.completedAt,
      createdAt: bookings.createdAt,
      updatedAt: bookings.updatedAt,
      metadata: bookings.metadata,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.orgId, input.orgId),
        eq(bookings.id, input.bookingId),
        ne(bookings.status, "template"),
      ),
    )
    .limit(1);

  if (!row) return null;

  return {
    id: row.id,
    contactId: row.contactId,
    title: row.title,
    bookingSlug: row.bookingSlug,
    status: row.status,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    fullName: row.fullName,
    email: row.email,
    notes: row.notes,
    provider: row.provider,
    meetingUrl: row.meetingUrl,
    cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    metadata: row.metadata ?? {},
  };
}

// Cancel a scheduled booking. Idempotent by design per the 2a audit:
// already-cancelled bookings return a 200 no-op with alreadyCancelled=true,
// the Google Calendar delete does NOT re-run, booking.cancelled does NOT
// re-emit, and no webhook fires. This matters because agents retry and we
// don't want doubled event-bus traffic or "already gone" Calendar errors.
//
// Payment records linked to this booking via payment_records.bookingId are
// NOT touched (refund is a separate, composable action). linkedPaymentIds
// is returned so agents can decide to call refund_payment next if the
// business rule is "cancel AND refund the deposit".
//
// Past-time bookings ARE cancellable (legitimate retroactive-cleanup use
// case). markBookingNoShow is the different semantic for missed
// appointments; both are kept.

export type CancelBookingInput = {
  orgId: string;
  bookingId: string;
};

export type CancelBookingResult = {
  booking: BookingDetail;
  alreadyCancelled: boolean;
  linkedPaymentIds: string[];
};

async function loadLinkedPaymentIds(orgId: string, bookingId: string): Promise<string[]> {
  const rows = await db
    .select({ id: paymentRecords.id })
    .from(paymentRecords)
    .where(and(eq(paymentRecords.orgId, orgId), eq(paymentRecords.bookingId, bookingId)));
  return rows.map((r) => r.id);
}

export async function cancelBookingFromApi(input: CancelBookingInput): Promise<CancelBookingResult | null> {
  // Load first so we can branch on already-cancelled before mutating.
  // Reuses the read path to guarantee identical scoping rules (org-scoped,
  // templates excluded, wrong-org surfaces as null → 404).
  const current = await getBookingFromApi({ orgId: input.orgId, bookingId: input.bookingId });
  if (!current) return null;

  const linkedPaymentIds = await loadLinkedPaymentIds(input.orgId, current.id);

  if (current.status === "cancelled") {
    return { booking: current, alreadyCancelled: true, linkedPaymentIds };
  }

  const now = new Date();
  const [updated] = await db
    .update(bookings)
    .set({ status: "cancelled", cancelledAt: now, updatedAt: now })
    .where(and(eq(bookings.orgId, input.orgId), eq(bookings.id, current.id)))
    .returning({
      userId: bookings.userId,
      externalEventId: bookings.externalEventId,
    });

  if (updated) {
    await deleteGoogleCalendarBookingEvent({
      userId: updated.userId,
      externalEventId: updated.externalEventId,
    });
  }

  if (current.contactId) {
    await emitSeldonEvent("booking.cancelled", {
      appointmentId: current.id,
      contactId: current.contactId,
    }, { orgId: input.orgId });
  }

  await dispatchWebhook({
    orgId: input.orgId,
    event: "booking.cancelled",
    payload: {
      bookingId: current.id,
      contactId: current.contactId,
      startsAt: current.startsAt,
      cancelledAt: now.toISOString(),
    },
  });

  const refreshed = await getBookingFromApi({ orgId: input.orgId, bookingId: current.id });
  return {
    booking: refreshed ?? { ...current, status: "cancelled", cancelledAt: now.toISOString(), updatedAt: now.toISOString() },
    alreadyCancelled: false,
    linkedPaymentIds,
  };
}

// Reschedule a scheduled booking to a new starts_at. Preserves the original
// duration (reads endsAt - startsAt from the current row rather than re-
// resolving against the appointment-type template), so the new endsAt
// tracks the move cleanly even if the template's duration was edited.
//
// Validation per the 2a audit:
// - new starts_at must be in the future → 400 "starts_at must be in the future"
// - the current booking must NOT be cancelled → 422 "cannot reschedule a
//   cancelled booking" (reviving a cancellation should be a new create_booking)
// - nonexistent / wrong-org id → 404 via null return (same rule as 2a.1/2a.2)
//
// Google Calendar: we use syncBookingWithGoogleCalendar which PATCHes the
// existing event in place when externalEventId is already set. This is a
// true-move: the event id is preserved, attendees' invites don't blink
// off-and-on. The 2a audit flagged delete-recreate as V1.1 polish noting
// "~1 day of scope for true-move"; on closer inspection the PATCH path is
// already built into the sync helper, so true-move is the cleaner choice
// here at no additional cost.
//
// Payments stay untouched: same composability principle as cancel. If the
// business charges a reschedule fee, that's a composed create_invoice call.
//
// Changing appointment type on reschedule is explicitly out of scope —
// use cancel_booking + create_booking to switch types.

export class RescheduleValidationError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export type RescheduleBookingInput = {
  orgId: string;
  bookingId: string;
  startsAt: Date;
};

export type RescheduleBookingResult = {
  booking: BookingDetail;
  previousStartsAt: string;
  newStartsAt: string;
};

export async function rescheduleBookingFromApi(input: RescheduleBookingInput): Promise<RescheduleBookingResult | null> {
  if (Number.isNaN(input.startsAt.getTime())) {
    throw new RescheduleValidationError("starts_at is not a valid ISO 8601 timestamp", 400);
  }
  if (input.startsAt.getTime() <= Date.now()) {
    throw new RescheduleValidationError("starts_at must be in the future", 400);
  }

  const current = await getBookingFromApi({ orgId: input.orgId, bookingId: input.bookingId });
  if (!current) return null;

  if (current.status === "cancelled") {
    throw new RescheduleValidationError("cannot reschedule a cancelled booking", 422);
  }

  const previousStartsAt = current.startsAt;
  const previousStartsAtDate = new Date(previousStartsAt);
  const previousEndsAtDate = new Date(current.endsAt);
  const durationMs = previousEndsAtDate.getTime() - previousStartsAtDate.getTime();
  const newEndsAt = new Date(input.startsAt.getTime() + durationMs);

  const now = new Date();
  const [updated] = await db
    .update(bookings)
    .set({ startsAt: input.startsAt, endsAt: newEndsAt, updatedAt: now })
    .where(and(eq(bookings.orgId, input.orgId), eq(bookings.id, current.id)))
    .returning({
      userId: bookings.userId,
      externalEventId: bookings.externalEventId,
      title: bookings.title,
      notes: bookings.notes,
    });

  if (updated) {
    const synced = await syncBookingWithGoogleCalendar({
      bookingId: current.id,
      userId: updated.userId,
      title: updated.title,
      notes: updated.notes,
      startsAt: input.startsAt,
      endsAt: newEndsAt,
      externalEventId: updated.externalEventId,
    });
    if (synced?.externalEventId && synced.externalEventId !== updated.externalEventId) {
      await db
        .update(bookings)
        .set({ externalEventId: synced.externalEventId, meetingUrl: synced.meetingUrl ?? null })
        .where(and(eq(bookings.orgId, input.orgId), eq(bookings.id, current.id)));
    }
  }

  await emitSeldonEvent("booking.rescheduled", {
    appointmentId: current.id,
    contactId: current.contactId,
    previousStartsAt,
    newStartsAt: input.startsAt.toISOString(),
  }, { orgId: input.orgId });

  await dispatchWebhook({
    orgId: input.orgId,
    event: "booking.rescheduled",
    payload: {
      bookingId: current.id,
      contactId: current.contactId,
      previousStartsAt,
      newStartsAt: input.startsAt.toISOString(),
    },
  });

  const refreshed = await getBookingFromApi({ orgId: input.orgId, bookingId: current.id });
  return {
    booking:
      refreshed ??
      { ...current, startsAt: input.startsAt.toISOString(), endsAt: newEndsAt.toISOString(), updatedAt: now.toISOString() },
    previousStartsAt,
    newStartsAt: input.startsAt.toISOString(),
  };
}
