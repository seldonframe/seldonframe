import { eq } from "drizzle-orm";
import { createAppointmentTypeAction, listAppointmentTypes, listBookings } from "@/lib/bookings/actions";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/helpers";
import { listContacts } from "@/lib/contacts/actions";
import { getIntegrationSettings } from "@/lib/integrations/actions";
import { getLabels } from "@/lib/soul/labels";
import { getSoul } from "@/lib/soul/server";
import { BookingsPageContent } from "@/components/bookings/bookings-page-content";

/*
  Square UI class reference (source of truth):
  - templates-baseui/calendar/app/page.tsx
    - page shell: "h-svh overflow-hidden lg:p-2 w-full"
  - templates-baseui/calendar/components/calendar/calendar-header.tsx
    - section shell: "border-b border-border bg-background"
    - title: "text-sm md:text-base lg:text-lg font-semibold text-foreground truncate"
  - templates-baseui/calendar/components/calendar/calendar-controls.tsx
    - subtitle/body text: "text-xs text-muted-foreground"
*/

export default async function BookingsPage() {
  const [user, labels, bookingTypes, bookings, contacts, soul, integrationSettings] = await Promise.all([
    getCurrentUser(),
    getLabels(),
    listAppointmentTypes(),
    listBookings(),
    listContacts(),
    getSoul(),
    getIntegrationSettings(),
  ]);

  let orgSlug = "";

  if (user?.orgId) {
    const [org] = await db.select({ slug: organizations.slug }).from(organizations).where(eq(organizations.id, user.orgId)).limit(1);
    orgSlug = org?.slug ?? "";
  }

  return (
    <section className="animate-page-enter space-y-4 sm:space-y-6">
      <div className="border-b border-border bg-background px-3 sm:px-6 py-3 sm:py-4">
        <h1 className="text-sm md:text-base lg:text-lg font-semibold text-foreground truncate">{labels.activity.plural} · Booking</h1>
        <p className="mt-1 text-xs text-muted-foreground">Manage appointment types and upcoming {labels.activity.plural.toLowerCase()}.</p>
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
        // May 1, 2026 — Google Calendar integration removed for V1.
        // The Cal.diy booking page is the operator's calendar. Both
        // props passed empty so the UI gracefully hides the
        // never-rendered Connect Calendar button.
        calendarConnected={false}
        googleCalendarConnectUrl=""
        createAppointmentTypeAction={createAppointmentTypeAction}
      />
    </section>
  );
}
