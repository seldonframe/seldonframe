// v1 PWA — Today screen (operator mobile home).
//
// Glance cards: New leads (status='lead' last 7d) · Today's
// appointments · Unread texts (unread inbound SMS) · Missed calls
// (coming soon — no call data surfaced yet) + a short "up next" list.
// All data scoped to the operator's workspace via the session orgId.

import Link from "next/link";
import { and, asc, eq, gte, lt, ne } from "drizzle-orm";
import { db } from "@/db";
import { bookings } from "@/db/schema";
import { getOperatorSessionForOrg } from "@/lib/operator-portal/auth";
import { countNewLeads, countUnreadInboundSms } from "@/lib/operator-portal/counts";
import { contactDisplayName } from "@/lib/operator-portal/mobile-format";

export default async function OperatorTodayPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const session = await getOperatorSessionForOrg(orgSlug);
  // Layout already guards; this is a type-narrowing guard for orgId.
  if (!session) return null;
  const orgId = session.orgId;

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  const [newLeads, unreadTexts, todaysBookings] = await Promise.all([
    countNewLeads(orgId),
    countUnreadInboundSms(orgId),
    db
      .select({
        id: bookings.id,
        title: bookings.title,
        startsAt: bookings.startsAt,
        fullName: bookings.fullName,
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.orgId, orgId),
          ne(bookings.status, "template"),
          ne(bookings.status, "cancelled"),
          gte(bookings.startsAt, startOfToday),
          lt(bookings.startsAt, endOfToday),
        ),
      )
      .orderBy(asc(bookings.startsAt))
      .limit(5),
  ]);

  const base = `/portal/${orgSlug}`;

  return (
    <section className="flex flex-col gap-4 px-4 py-4">
      <header>
        <h1 className="text-[18px] font-semibold tracking-tight" style={{ color: "#111" }}>
          Today
        </h1>
        <p className="text-[13px]" style={{ color: "#777" }}>
          {todaysBookings.length === 0
            ? "Nothing on the schedule yet today."
            : `${todaysBookings.length} appointment${todaysBookings.length === 1 ? "" : "s"} today.`}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <GlanceCard label="New leads" sub="last 7 days" value={newLeads} href={`${base}/leads`} highlight={newLeads > 0} />
        <GlanceCard label="Today's appts" sub="scheduled" value={todaysBookings.length} href={`${base}/appointments`} />
        <GlanceCard label="Unread texts" sub="need a reply" value={unreadTexts} href={`${base}/messages`} highlight={unreadTexts > 0} />
        <GlanceCard label="Missed calls" sub="coming soon" value="—" href={`${base}`} muted />
      </div>

      {todaysBookings.length > 0 ? (
        <div className="rounded-2xl bg-white p-4" style={{ border: "1px solid #E5E5E1" }}>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide" style={{ color: "#999" }}>
            Up next
          </p>
          <ul className="flex flex-col gap-1.5">
            {todaysBookings.map((b) => {
              const time = new Date(b.startsAt).toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
              });
              return (
                <li key={b.id} className="flex items-center gap-2 text-[13px]">
                  <span className="font-semibold" style={{ color: "#111" }}>{time}</span>
                  <span className="truncate" style={{ color: "#666" }}>
                    {contactDisplayName({ firstName: b.fullName, lastName: null })} — {b.title}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function GlanceCard({
  label,
  sub,
  value,
  href,
  highlight,
  muted,
}: {
  label: string;
  sub: string;
  value: number | string;
  href: string;
  highlight?: boolean;
  muted?: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-1 rounded-2xl bg-white p-4"
      style={{ border: "1px solid #E5E5E1" }}
    >
      <span
        className="text-[26px] font-semibold leading-none"
        style={{ color: muted ? "#BBB" : highlight ? "#5b21b6" : "#111" }}
      >
        {value}
      </span>
      <span className="text-[12px] font-medium" style={{ color: "#333" }}>{label}</span>
      <span className="text-[10px] uppercase tracking-wide" style={{ color: "#AAA" }}>{sub}</span>
    </Link>
  );
}
