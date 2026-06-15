// v2 PWA — Today screen (operator mobile home).
//
// Glance cards: New leads · Today's appts · Unread texts · Missed calls
// Pipeline $ card (tappable → breakdown sheet)
// Quick Actions row: Add Contact · New Booking · Request Review
// Up next list (today's bookings)

import Link from "next/link";
import { and, asc, desc, eq, gte, lt, ne, not, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookings, contacts, organizations } from "@/db/schema";
import { getOperatorSessionForOrg } from "@/lib/operator-portal/auth";
import { countNewLeads, countUnreadInboundSms } from "@/lib/operator-portal/counts";
import { contactDisplayName } from "@/lib/operator-portal/mobile-format";
import { getPipelineRollup } from "@/lib/operator-portal/today";
import { getOutboundSmsEnabled } from "@/lib/operator-portal/outbound-sms-flag";
import { getEffectiveBrandingForWorkspace } from "@/lib/partner-agencies/branding";
import { TodayQuickActions, type RecentContact } from "./_components/today-quick-actions";
import { DEMO_CONTACT_TAG } from "@/lib/workspace/seed-demo-portal";

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

  const [
    newLeads,
    unreadTexts,
    todaysBookings,
    pipelineRollup,
    branding,
    recentContactsRaw,
    orgSoulRow,
  ] = await Promise.all([
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
    getPipelineRollup(orgId),
    getEffectiveBrandingForWorkspace(orgId),
    // Recent contacts for the Request Review picker (exclude demo)
    db
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.email,
        phone: contacts.phone,
      })
      .from(contacts)
      .where(
        and(
          eq(contacts.orgId, orgId),
          not(sql`${DEMO_CONTACT_TAG} = ANY(${contacts.tags})`),
        ),
      )
      .orderBy(desc(contacts.createdAt))
      .limit(50),
    // Soul for google_place_url (best-effort pre-fill for review link)
    db
      .select({ soul: organizations.soul })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1),
  ]);

  const accentColor =
    (branding?.is_white_label && branding.primary_color) || "#5b21b6";

  // Best-effort: extract google_place_url from soul.business.maps_url
  const soulRecord = (orgSoulRow[0]?.soul as Record<string, unknown> | null) ?? {};
  const soulBusiness = (soulRecord.business as Record<string, unknown> | undefined) ?? {};
  const defaultReviewLink =
    typeof soulBusiness.maps_url === "string" ? soulBusiness.maps_url : "";

  const recentContacts: RecentContact[] = recentContactsRaw.map((c) => ({
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email,
    phone: c.phone,
  }));

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

      {/* Glance cards */}
      <div className="grid grid-cols-2 gap-3">
        <GlanceCard
          label="New leads"
          sub="last 7 days"
          value={newLeads}
          href={`${base}/leads`}
          highlight={newLeads > 0}
          accentColor={accentColor}
        />
        <GlanceCard
          label="Today's appts"
          sub="scheduled"
          value={todaysBookings.length}
          href={`${base}/appointments`}
          accentColor={accentColor}
        />
        <GlanceCard
          label="Unread texts"
          sub="need a reply"
          value={unreadTexts}
          href={`${base}/messages`}
          highlight={unreadTexts > 0}
          accentColor={accentColor}
        />
        <GlanceCard
          label="Missed calls"
          sub="coming soon"
          value="—"
          href={`${base}`}
          muted
          accentColor={accentColor}
        />
      </div>

      {/* Pipeline $ card + Quick Actions (client-interactive) */}
      <TodayQuickActions
        orgSlug={orgSlug}
        accentColor={accentColor}
        rollup={pipelineRollup}
        defaultReviewLink={defaultReviewLink}
        recentContacts={recentContacts}
      />

      {/* Up next */}
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
  accentColor,
}: {
  label: string;
  sub: string;
  value: number | string;
  href: string;
  highlight?: boolean;
  muted?: boolean;
  accentColor: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-1 rounded-2xl bg-white p-4"
      style={{ border: "1px solid #E5E5E1" }}
    >
      <span
        className="text-[26px] font-semibold leading-none"
        style={{ color: muted ? "#BBB" : highlight ? accentColor : "#111" }}
      >
        {value}
      </span>
      <span className="text-[12px] font-medium" style={{ color: "#333" }}>{label}</span>
      <span className="text-[10px] uppercase tracking-wide" style={{ color: "#AAA" }}>{sub}</span>
    </Link>
  );
}
