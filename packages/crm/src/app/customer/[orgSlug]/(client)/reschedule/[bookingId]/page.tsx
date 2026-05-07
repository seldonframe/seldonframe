// v1.23.0 — TRUE self-service reschedule, month-calendar UX matching /book
//
// v1.22 shipped a date-tabs + slot-grid layout that worked but didn't
// match the /book/<slug> calendar visual. v1.23 swaps in the new
// CustomerRescheduleCalendar React component which mirrors the /book
// visual structure: 3-step indicator, month-grid, time slots, confirm.
//
// Same atomic backend (rescheduleBookingAction, single source of
// truth via listPublicBookingSlotsAction). Just better UX surface.

import { and, eq } from "drizzle-orm";
import { notFound as nextNotFound } from "next/navigation";
import { db } from "@/db";
import { bookings } from "@/db/schema";
import { requirePortalSessionForOrg } from "@/lib/portal/auth";
import { CustomerRescheduleCalendar } from "@/components/customer-portal/customer-reschedule-calendar";

export default async function CustomerReschedulePage({
  params,
}: {
  params: Promise<{ orgSlug: string; bookingId: string }>;
}) {
  const { orgSlug, bookingId } = await params;
  const session = await requirePortalSessionForOrg(orgSlug);

  const [booking] = await db
    .select({
      id: bookings.id,
      title: bookings.title,
      bookingSlug: bookings.bookingSlug,
      startsAt: bookings.startsAt,
      status: bookings.status,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.id, bookingId),
        eq(bookings.orgId, session.orgId),
        eq(bookings.contactId, session.contact.id),
      ),
    )
    .limit(1);
  if (!booking) {
    nextNotFound();
  }

  return (
    <CustomerRescheduleCalendar
      orgSlug={orgSlug}
      bookingId={booking.id}
      bookingTitle={booking.title}
      bookingSlug={booking.bookingSlug}
      originalStartsAtIso={
        booking.startsAt instanceof Date
          ? booking.startsAt.toISOString()
          : String(booking.startsAt)
      }
    />
  );
}
