// v2 PWA — Today screen (operator mobile home) — SeldonFrame Mobile DS edition.
//
// Glance cards: New leads · Today's appts · Unread texts · Missed calls (stub)
// Pipeline $ card (tappable → breakdown sheet)
// Quick Actions row: Add Contact · New Booking · Request Review · Scan Card (stub)
// Up next list (today's bookings)
//
// DATA/BEHAVIOR: unchanged. Only the presentation layer uses DS components.

import { and, asc, desc, eq, gte, lt, ne, not, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookings, contacts, organizations } from "@/db/schema";
import { getOperatorSessionForOrg } from "@/lib/operator-portal/auth";
import { countNewLeads, countUnreadInboundSms } from "@/lib/operator-portal/counts";
import { contactDisplayName } from "@/lib/operator-portal/mobile-format";
import { getPipelineRollup } from "@/lib/operator-portal/today";
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
    // Recent contacts for Request Review picker (exclude demo)
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
    (branding?.is_white_label && branding.primary_color) || "#7c3aed";

  const soulRecord = (orgSoulRow[0]?.soul as Record<string, unknown> | null) ?? {};
  const soulBusiness = (soulRecord.business as Record<string, unknown> | undefined) ?? {};
  const defaultReviewLink =
    typeof soulRecord.google_place_url === "string"
      ? soulRecord.google_place_url
      : typeof soulBusiness.maps_url === "string"
        ? soulBusiness.maps_url
        : "";

  const recentContacts: RecentContact[] = recentContactsRaw.map((c) => ({
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email,
    phone: c.phone,
  }));

  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 18,
        padding: "14px 16px 20px",
      }}
    >
      {/* KPI glance row — 4-up 2×2 grid */}
      <TodayQuickActions
        orgSlug={orgSlug}
        accentColor={accentColor}
        rollup={pipelineRollup}
        defaultReviewLink={defaultReviewLink}
        recentContacts={recentContacts}
        newLeads={newLeads}
        unreadTexts={unreadTexts}
        todaysApptsCount={todaysBookings.length}
        todaysBookings={todaysBookings.map((b) => ({
          id: b.id,
          title: b.title,
          startsAt: b.startsAt,
          fullName: b.fullName,
        }))}
      />
    </section>
  );
}
