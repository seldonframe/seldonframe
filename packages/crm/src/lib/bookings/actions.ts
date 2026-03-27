"use server";

import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings, contacts, organizations } from "@/db/schema";
import { getCurrentUser, getOrgId } from "@/lib/auth/helpers";
import { assertWritable } from "@/lib/demo/server";
import { emitSeldonEvent } from "@/lib/events/bus";
import { recordBookingOutcomeLearning } from "@/lib/soul/learning";
import { buildMeetingUrl, resolveBookingProvider } from "./providers";

function deriveEndsAt(startsAt: Date, durationMinutes: number) {
  return new Date(startsAt.getTime() + durationMinutes * 60_000);
}

export async function listBookings() {
  const orgId = await getOrgId();

  if (!orgId) {
    return [];
  }

  return db.select().from(bookings).where(eq(bookings.orgId, orgId)).orderBy(asc(bookings.startsAt));
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

  const meetingUrl = buildMeetingUrl(provider, created.id);

  if (meetingUrl) {
    await db
      .update(bookings)
      .set({ meetingUrl, externalEventId: created.id, updatedAt: new Date() })
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
    .returning({ id: bookings.id, contactId: bookings.contactId, startsAt: bookings.startsAt });

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
    .returning({ id: bookings.id, contactId: bookings.contactId });

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
    .returning({ id: bookings.id, contactId: bookings.contactId, startsAt: bookings.startsAt });

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

  const [org] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, orgSlug)).limit(1);

  if (!org) {
    throw new Error("Organization not found");
  }

  const [existing] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.orgId, org.id), eq(contacts.email, email)))
    .limit(1);

  let contactId = existing?.id ?? null;

  if (!contactId) {
    const [createdContact] = await db
      .insert(contacts)
      .values({
        orgId: org.id,
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

  const provider = await resolveBookingProvider(null);

  const [createdBooking] = await db
    .insert(bookings)
    .values({
      orgId: org.id,
      contactId,
      title: "Booked consultation",
      bookingSlug,
      fullName,
      email,
      notes: notes ?? null,
      provider,
      status: "scheduled",
      startsAt: bookingStart,
      endsAt: deriveEndsAt(bookingStart, 30),
      metadata: {
        source: "public",
      },
    })
    .returning({ id: bookings.id });

  if (createdBooking?.id) {
    const meetingUrl = buildMeetingUrl(provider, createdBooking.id);
    if (meetingUrl) {
      await db
        .update(bookings)
        .set({ meetingUrl, externalEventId: createdBooking.id, updatedAt: new Date() })
        .where(and(eq(bookings.orgId, org.id), eq(bookings.id, createdBooking.id)));
    }

    if (contactId) {
      await emitSeldonEvent("booking.created", {
        appointmentId: createdBooking.id,
        contactId,
      });
    }
  }

  return { success: true };
}
