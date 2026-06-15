// v2 PWA — Appointments screen.
//
// Month/week calendar grid (TZ-correct via buildMonthGrid/buildWeekStrip)
// + booking detail sheet with reschedule and cancel actions.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { getOperatorSessionForOrg } from "@/lib/operator-portal/auth";
import { listBookings } from "@/lib/bookings/actions";
import { buildWeekStrip, buildMonthGrid } from "@/lib/operator-portal/calendar";
import { getEffectiveBrandingForWorkspace } from "@/lib/partner-agencies/branding";
import { AppointmentsClient } from "./_components/appointments-client";

export default async function OperatorAppointmentsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const session = await getOperatorSessionForOrg(orgSlug);
  if (!session) return null;
  const orgId = session.orgId;

  const [allBookingsRaw, orgRow, branding] = await Promise.all([
    listBookings(orgId),
    db
      .select({ timezone: organizations.timezone })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1),
    getEffectiveBrandingForWorkspace(orgId),
  ]);

  const tz = orgRow[0]?.timezone || "UTC";

  const bookingsForCalendar = allBookingsRaw
    .filter((b) => b.status !== "cancelled")
    .map((b) => ({
      id: b.id,
      startsAt: b.startsAt instanceof Date ? b.startsAt : new Date(b.startsAt),
      endsAt: b.endsAt instanceof Date ? b.endsAt : new Date(b.endsAt),
      title: b.title,
      fullName: b.fullName ?? null,
      contactId: b.contactId ?? null,
      status: b.status,
      email: b.email ?? null,
      notes: b.notes ?? null,
      metadata: (b.metadata ?? {}) as Record<string, unknown>,
    }));

  const now = new Date();
  const weekStrip = buildWeekStrip(bookingsForCalendar, now, tz);
  const monthGrid = buildMonthGrid(bookingsForCalendar, now, tz);

  // For the client, pass serializable booking items (ISO strings)
  const allBookingItems = bookingsForCalendar.map((b) => ({
    id: b.id,
    startsAt: b.startsAt.toISOString(),
    endsAt: b.endsAt.toISOString(),
    title: b.title,
    fullName: b.fullName,
    contactId: b.contactId,
    status: b.status,
    email: b.email,
    notes: b.notes,
    metadata: b.metadata,
  }));

  const accentColor =
    (branding?.is_white_label && branding.primary_color) || "#5b21b6";

  return (
    <AppointmentsClient
      monthGrid={monthGrid}
      weekStrip={weekStrip}
      allBookings={allBookingItems}
      tz={tz}
      orgSlug={orgSlug}
      accentColor={accentColor}
    />
  );
}
