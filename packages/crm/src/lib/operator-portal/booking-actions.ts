"use server";

import { requireOperatorSessionForOrg } from "./auth";
import { db } from "@/db";
import { bookings } from "@/db/schema";
import { and, eq, inArray, ne } from "drizzle-orm";
import { computeRescheduledEnd, intervalsOverlap } from "@/lib/bookings/calendar-math";
import { emitSeldonEvent } from "@/lib/events/bus";
import { revalidatePath } from "next/cache";

export async function operatorCancelBookingAction(params: {
  orgSlug: string;
  bookingId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireOperatorSessionForOrg(params.orgSlug);
  const orgId = session.orgId;

  const [row] = await db
    .update(bookings)
    .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
    .where(and(eq(bookings.orgId, orgId), eq(bookings.id, params.bookingId)))
    .returning({ id: bookings.id, contactId: bookings.contactId });

  if (!row) return { ok: false, error: "not_found" };

  if (row.contactId) {
    await emitSeldonEvent("booking.cancelled", { appointmentId: row.id, contactId: row.contactId }, { orgId });
  }

  revalidatePath(`/portal/${params.orgSlug}/appointments`);
  return { ok: true };
}

export async function operatorRescheduleBookingAction(params: {
  orgSlug: string;
  bookingId: string;
  newStartsAtISO: string;
}): Promise<{ ok: true } | { ok: false; error: "not_found" | "conflict" }> {
  const session = await requireOperatorSessionForOrg(params.orgSlug);
  const orgId = session.orgId;

  const [current] = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.orgId, orgId), eq(bookings.id, params.bookingId), ne(bookings.status, "template")))
    .limit(1);

  if (!current) return { ok: false, error: "not_found" };

  const newStart = new Date(params.newStartsAtISO);
  const oldStart = current.startsAt instanceof Date ? current.startsAt : new Date(current.startsAt);
  const oldEnd = current.endsAt instanceof Date ? current.endsAt : new Date(current.endsAt);
  const newEnd = computeRescheduledEnd(oldStart, oldEnd, newStart);

  const others = await db
    .select({ id: bookings.id, startsAt: bookings.startsAt, endsAt: bookings.endsAt })
    .from(bookings)
    .where(and(eq(bookings.orgId, orgId), ne(bookings.id, current.id), inArray(bookings.status, ["scheduled", "completed", "pending_payment", "blocked"])));

  const conflict = others.some((r) => {
    const rStart = r.startsAt instanceof Date ? r.startsAt : new Date(r.startsAt);
    const rEnd = r.endsAt instanceof Date ? r.endsAt : new Date(r.endsAt);
    return intervalsOverlap(newStart, newEnd, rStart, rEnd);
  });

  if (conflict) return { ok: false, error: "conflict" };

  await db.update(bookings).set({ startsAt: newStart, endsAt: newEnd, updatedAt: new Date() }).where(and(eq(bookings.orgId, orgId), eq(bookings.id, current.id)));

  revalidatePath(`/portal/${params.orgSlug}/appointments`);
  return { ok: true };
}
