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
import { getBookingDefaults } from "@/lib/crm/template-suggestions";
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
        .select({
          slug: organizations.slug,
          timezone: organizations.timezone,
          // 2026-05-17 — pull the personality vertical from settings.crmPersonality
          // so the Create Type drawer can offer plumbing/HVAC/dental/etc-
          // shaped placeholders + duration options + quick-start templates
          // instead of the coaching default.
          settings: organizations.settings,
        })
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1)
        .then((r) => r[0] ?? null),
    ]);

  void integrationSettings;
  const orgSlug = orgRow?.slug ?? "";
  const workspaceTimezone = orgRow?.timezone ?? "UTC";
  const personalityVertical =
    (orgRow?.settings as { crmPersonality?: { vertical?: string } } | null | undefined)
      ?.crmPersonality?.vertical ?? null;
  const bookingDefaults = getBookingDefaults(personalityVertical);

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
        publicBaseUrl={`https://${process.env.WORKSPACE_BASE_DOMAIN?.trim() || "app.seldonframe.com"}`}
        workspaceTimezone={workspaceTimezone}
        calendarConnected={false}
        googleCalendarConnectUrl=""
        createAppointmentTypeAction={createAppointmentTypeAction}
        bookingDefaults={bookingDefaults}
      />
    </section>
  );
}
