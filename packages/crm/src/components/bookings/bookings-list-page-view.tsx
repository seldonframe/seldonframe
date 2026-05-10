// v1.24.0 — shared bookings page view (admin + operator portal)
//
// One source of truth for the /bookings surface. Used by:
//   - /bookings/page.tsx                       (admin dashboard)
//   - /portal/<slug>/bookings/page.tsx         (operator portal mirror)

import { eq } from "drizzle-orm";
import {
  createAppointmentTypeAction,
  listAppointmentTypes,
  listBookings,
} from "@/lib/bookings/actions";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { listContacts } from "@/lib/contacts/actions";
import { getIntegrationSettings } from "@/lib/integrations/actions";
import { getLabels } from "@/lib/soul/labels";
import { getSoul } from "@/lib/soul/server";
import { BookingsPageContent } from "@/components/bookings/bookings-page-content";

export type BookingsListPageViewProps = {
  orgId: string;
  /** When true, hide write affordances (create-appointment-type form,
   *  status changes). v1.24.1 will refactor for dual-auth. */
  readonly?: boolean;
};

export async function BookingsListPageView({
  orgId,
  readonly = false,
}: BookingsListPageViewProps) {
  void readonly;
  const [labels, bookingTypes, bookings, contacts, soul, integrationSettings, orgRow] =
    await Promise.all([
      getLabels(orgId),
      listAppointmentTypes(orgId),
      listBookings(orgId),
      listContacts({ orgId }),
      getSoul(orgId),
      getIntegrationSettings().catch(() => null),
      // v1.40.9 — also fetch workspace timezone so bookings render in the
      // operator's local time (e.g. America/Los_Angeles), not in the
      // viewer's browser timezone. Pre-1.40.9 a 9 AM PDT booking rendered
      // as 12 PM EDT for a viewer in EDT.
      db
        .select({ slug: organizations.slug, timezone: organizations.timezone })
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1)
        .then((r) => r[0] ?? null),
    ]);

  void integrationSettings;
  const orgSlug = orgRow?.slug ?? "";
  const workspaceTimezone = orgRow?.timezone ?? "UTC";

  return (
    <section className="animate-page-enter space-y-4 sm:space-y-6">
      <div className="border-b border-border bg-background px-3 sm:px-6 py-3 sm:py-4">
        <h1 className="text-sm md:text-base lg:text-lg font-semibold text-foreground truncate">
          {labels.activity.plural} · Booking
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Manage appointment types and upcoming{" "}
          {labels.activity.plural.toLowerCase()}.
        </p>
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
        workspaceTimezone={workspaceTimezone}
        calendarConnected={false}
        googleCalendarConnectUrl=""
        createAppointmentTypeAction={createAppointmentTypeAction}
      />
    </section>
  );
}
