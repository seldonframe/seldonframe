// Client Portal — Bookings page (May 1, 2026).
//
// Two sections: upcoming (highlighted) + past (muted). Reuses the
// listPortalBookings server action which scopes the query to the
// authenticated contact. "Book a new session" link points to the
// workspace's public /book page (operator's booking surface).

import Link from "next/link";
import { listPortalBookings } from "@/lib/portal/actions";

function formatBookingTime(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusBadgeClass(status: string): string {
  // Confirmed/scheduled → green-ish; pending → amber-ish; everything
  // else → muted gray. Uses CRM color tokens which inherit the
  // workspace theme.
  switch (status) {
    case "scheduled":
    case "confirmed":
      return "bg-success/15 text-success";
    case "completed":
      return "bg-primary/15 text-primary";
    case "cancelled":
    case "no_show":
      return "bg-muted text-[hsl(var(--color-text-muted))]";
    default:
      return "bg-muted text-[hsl(var(--color-text-muted))]";
  }
}

function prettyStatus(status: string): string {
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function PortalBookingsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { upcoming, past } = await listPortalBookings(orgSlug);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-label text-[hsl(var(--color-text-muted))]">Bookings</p>
          <h2 className="text-section-title">Your appointments</h2>
        </div>
        <Link
          href={`/book/${orgSlug}/default`}
          className="crm-button-primary h-9 px-4"
        >
          Book a new session
        </Link>
      </div>

      <div>
        <h3 className="text-card-title mb-3">Upcoming</h3>
        {upcoming.length === 0 ? (
          <article className="crm-card text-center py-8">
            <p className="text-sm text-[hsl(var(--color-text-secondary))]">
              No upcoming bookings.
            </p>
            <p className="mt-1 text-xs text-[hsl(var(--color-text-muted))]">
              Use the &ldquo;Book a new session&rdquo; button to schedule one.
            </p>
          </article>
        ) : (
          <ul className="space-y-2">
            {upcoming.map((booking) => (
              <li key={booking.id} className="crm-card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground">{booking.title}</p>
                    <p className="mt-1 text-sm text-[hsl(var(--color-text-secondary))]">
                      {formatBookingTime(booking.startsAt)}
                    </p>
                    {booking.notes ? (
                      <p className="mt-2 text-sm text-[hsl(var(--color-text-muted))]">
                        {booking.notes}
                      </p>
                    ) : null}
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusBadgeClass(
                      booking.status
                    )}`}
                  >
                    {prettyStatus(booking.status)}
                  </span>
                </div>
                {booking.meetingUrl ? (
                  <div className="mt-3">
                    <a
                      href={booking.meetingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="crm-button-secondary inline-flex h-9 items-center px-3 text-xs"
                    >
                      Join meeting
                    </a>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="text-card-title mb-3">Past</h3>
        {past.length === 0 ? (
          <article className="crm-card text-center py-6">
            <p className="text-sm text-[hsl(var(--color-text-muted))]">
              No past bookings yet.
            </p>
          </article>
        ) : (
          <ul className="space-y-2">
            {past.map((booking) => (
              <li
                key={booking.id}
                className="crm-card flex flex-wrap items-center justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">{booking.title}</p>
                  <p className="mt-0.5 text-xs text-[hsl(var(--color-text-muted))]">
                    {formatBookingTime(booking.startsAt)}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusBadgeClass(
                    booking.status
                  )}`}
                >
                  {prettyStatus(booking.status)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
