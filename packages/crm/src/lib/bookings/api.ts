import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { activities, bookings, contacts, stripeConnections, users } from "@/db/schema";
import { emitSeldonEvent } from "@/lib/events/bus";
import { createBookingCheckoutSession } from "@/lib/payments/actions";
import { dispatchWebhook } from "@/lib/utils/webhooks";

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
  });

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
