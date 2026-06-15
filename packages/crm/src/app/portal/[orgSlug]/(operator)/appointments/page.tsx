// v1 PWA — Appointments screen.
//
// Upcoming bookings grouped by day (date/time, customer, service).
// Reuses listBookings(orgId) — excludes template rows — filtered to
// future/active and grouped via the TDD'd groupBookingsByDay.

import { getOperatorSessionForOrg } from "@/lib/operator-portal/auth";
import { listBookings } from "@/lib/bookings/actions";
import { contactDisplayName, groupBookingsByDay } from "@/lib/operator-portal/mobile-format";

export default async function OperatorAppointmentsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const session = await getOperatorSessionForOrg(orgSlug);
  if (!session) return null;

  const all = await listBookings(session.orgId);
  const now = Date.now();
  const upcoming = all
    .filter((b) => b.status !== "cancelled" && new Date(b.startsAt).getTime() >= now - 60 * 60 * 1000)
    .map((b) => ({
      id: b.id,
      startsAt: new Date(b.startsAt),
      title: b.title,
      fullName: b.fullName,
    }));

  const groups = groupBookingsByDay(upcoming);

  return (
    <section className="flex flex-col gap-4 px-4 py-4">
      <header>
        <h1 className="text-[18px] font-semibold tracking-tight" style={{ color: "#111" }}>
          Appointments
        </h1>
        <p className="text-[13px]" style={{ color: "#777" }}>
          {upcoming.length === 0
            ? "No upcoming appointments."
            : `${upcoming.length} upcoming.`}
        </p>
      </header>

      {groups.map((group) => (
        <div key={group.dayKey} className="flex flex-col gap-2">
          <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "#999" }}>
            {group.label}
          </p>
          <ul className="overflow-hidden rounded-2xl bg-white" style={{ border: "1px solid #E5E5E1" }}>
            {group.items.map((b, i) => {
              const time = b.startsAt.toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
              });
              return (
                <li
                  key={b.id}
                  className="flex items-center gap-3 px-4 py-3"
                  style={{ borderTop: i === 0 ? "none" : "1px solid #EFEFEC" }}
                >
                  <span className="w-16 shrink-0 text-[13px] font-semibold" style={{ color: "#111" }}>
                    {time}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium" style={{ color: "#111" }}>
                      {b.title}
                    </span>
                    <span className="block truncate text-[12px]" style={{ color: "#888" }}>
                      {contactDisplayName({ firstName: b.fullName, lastName: null })}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
