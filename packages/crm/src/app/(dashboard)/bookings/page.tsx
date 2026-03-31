import { eq } from "drizzle-orm";
import { createAppointmentTypeAction, listAppointmentTypes, listBookings } from "@/lib/bookings/actions";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/helpers";
import { listContacts } from "@/lib/contacts/actions";
import { getLabels } from "@/lib/soul/labels";
import { getSoul } from "@/lib/soul/server";
import { BookingsPageContent } from "@/components/bookings/bookings-page-content";

export default async function BookingsPage() {
  const [user, labels, bookingTypes, bookings, contacts, soul] = await Promise.all([
    getCurrentUser(),
    getLabels(),
    listAppointmentTypes(),
    listBookings(),
    listContacts(),
    getSoul(),
  ]);

  let orgSlug = "";

  if (user?.orgId) {
    const [org] = await db.select({ slug: organizations.slug }).from(organizations).where(eq(organizations.id, user.orgId)).limit(1);
    orgSlug = org?.slug ?? "";
  }

  return (
    <section className="animate-page-enter space-y-4">
      <div>
        <h1 className="text-page-title">{labels.activity.plural} · Booking</h1>
        <p className="text-label text-[hsl(var(--color-text-secondary))]">Manage appointment types and upcoming {labels.activity.plural.toLowerCase()}.</p>
      </div>

      <BookingsPageContent
        labels={{ contact: labels.contact, activity: labels.activity }}
        bookingTypes={bookingTypes.map((row) => ({
          id: row.id,
          title: row.title,
          bookingSlug: row.bookingSlug,
          metadata: row.metadata,
        }))}
        bookings={bookings.map((row) => ({
          id: row.id,
          title: row.title,
          startsAt: row.startsAt,
          status: row.status,
          contactId: row.contactId,
        }))}
        contacts={contacts.map((row) => ({
          id: row.id,
          firstName: row.firstName,
          lastName: row.lastName,
        }))}
        suggestedServices={soul?.services ?? []}
        orgSlug={orgSlug}
        createAppointmentTypeAction={createAppointmentTypeAction}
      />
    </section>
  );
}
