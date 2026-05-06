// v1.21.0 — customer-portal appointments (Upcoming / Past)
//
// Replaces both the /pipeline (operator-jargon, dropped) and the
// /bookings (renamed-to-appointments, redesigned) pages. Single
// surface with two sections: upcoming (above, prominent) and past
// (below, muted). Each upcoming row exposes Reschedule + Cancel
// inline actions powered by lib/customer-portal/appointment-actions.

import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { listPortalBookings } from "@/lib/portal/actions";
import { requirePortalSessionForOrg } from "@/lib/portal/auth";
import { pickCustomerCopyPack } from "@/lib/customer-portal/copy-packs";
import { CustomerAppointmentRow } from "@/components/customer-portal/customer-appointment-row";

export default async function CustomerAppointmentsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const session = await requirePortalSessionForOrg(orgSlug);

  const [bookingsResult, orgRow] = await Promise.all([
    listPortalBookings(orgSlug),
    db
      .select({ soul: organizations.soul })
      .from(organizations)
      .where(eq(organizations.id, session.orgId))
      .limit(1)
      .then((r) => r[0] ?? null),
  ]);

  const soul = (orgRow?.soul ?? {}) as { industry?: string };
  const copy = pickCustomerCopyPack(soul.industry ?? null);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1
            className="text-[22px] font-semibold tracking-tight"
            style={{ color: "#111" }}
          >
            {copy.appointmentPlural.charAt(0).toUpperCase() +
              copy.appointmentPlural.slice(1)}
          </h1>
          <p className="text-[13px]" style={{ color: "#666" }}>
            Manage your upcoming and past {copy.appointmentPlural}.
          </p>
        </div>
        <Link
          href={`/book/${orgSlug}`}
          className="inline-flex h-9 items-center px-4 text-[13px] font-semibold"
          style={{
            backgroundColor: "#111",
            color: "#FFFFFF",
            borderRadius: "8px",
            border: "1px solid #111",
          }}
        >
          {copy.bookAnotherAction}
        </Link>
      </header>

      <section
        className="px-5 py-4 sm:px-6 sm:py-5"
        style={{
          backgroundColor: "#FFFFFF",
          border: "1px solid #E5E5E1",
          borderRadius: "12px",
        }}
      >
        <h2
          className="text-[13px] font-semibold tracking-tight pb-3 mb-3"
          style={{ color: "#111", borderBottom: "1px solid #F0F0EC" }}
        >
          {copy.upcomingHeading}
        </h2>
        {bookingsResult.upcoming.length === 0 ? (
          <p className="text-[14px]" style={{ color: "#888" }}>
            {copy.noUpcomingMessage}
          </p>
        ) : (
          <ul className="space-y-2">
            {bookingsResult.upcoming.map((row) => (
              <li key={row.id}>
                <CustomerAppointmentRow
                  orgSlug={orgSlug}
                  bookingId={row.id}
                  title={row.title}
                  startsAt={
                    row.startsAt instanceof Date
                      ? row.startsAt.toISOString()
                      : String(row.startsAt)
                  }
                  status={row.status}
                  notes={row.notes ?? null}
                  meetingUrl={row.meetingUrl ?? null}
                  rescheduleLabel={copy.rescheduleAction}
                  cancelLabel={copy.cancelAction}
                  variant="upcoming"
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        className="px-5 py-4 sm:px-6 sm:py-5"
        style={{
          backgroundColor: "#FFFFFF",
          border: "1px solid #E5E5E1",
          borderRadius: "12px",
        }}
      >
        <h2
          className="text-[13px] font-semibold tracking-tight pb-3 mb-3"
          style={{ color: "#111", borderBottom: "1px solid #F0F0EC" }}
        >
          {copy.pastHeading}
        </h2>
        {bookingsResult.past.length === 0 ? (
          <p className="text-[14px]" style={{ color: "#888" }}>
            {copy.noPastMessage}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {bookingsResult.past.map((row) => (
              <li key={row.id}>
                <CustomerAppointmentRow
                  orgSlug={orgSlug}
                  bookingId={row.id}
                  title={row.title}
                  startsAt={
                    row.startsAt instanceof Date
                      ? row.startsAt.toISOString()
                      : String(row.startsAt)
                  }
                  status={row.status}
                  notes={null}
                  meetingUrl={null}
                  rescheduleLabel={copy.rescheduleAction}
                  cancelLabel={copy.cancelAction}
                  variant="past"
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
