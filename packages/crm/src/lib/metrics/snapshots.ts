import { and, count, countDistinct, eq, gte, ilike, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookings, contacts, deals, emails, metricsSnapshots, organizations, portalMessages } from "@/db/schema";

function toUtcDateString(value: Date) {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
}

function getUtcDayBounds(date: Date) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

function getDefaultSnapshotDate() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
}

export async function captureDailyMetricsSnapshots(snapshotDate = getDefaultSnapshotDate()) {
  const { start, end } = getUtcDayBounds(snapshotDate);
  const snapshotDateKey = toUtcDateString(start);

  const orgRows = await db.select({ id: organizations.id }).from(organizations);
  let processed = 0;

  for (const org of orgRows) {
    const orgId = org.id;

    const [contactsTotalRow] = await db
      .select({ value: count() })
      .from(contacts)
      .where(and(eq(contacts.orgId, orgId), lt(contacts.createdAt, end)));

    const [contactsNewRow] = await db
      .select({ value: count() })
      .from(contacts)
      .where(and(eq(contacts.orgId, orgId), gte(contacts.createdAt, start), lt(contacts.createdAt, end)));

    const [pipelineValueRow] = await db
      .select({ value: sql<string>`coalesce(sum(${deals.value}), '0')` })
      .from(deals)
      .where(and(eq(deals.orgId, orgId), isNull(deals.closedAt)));

    const [dealsWonRow] = await db
      .select({ value: count() })
      .from(deals)
      .where(
        and(
          eq(deals.orgId, orgId),
          gte(deals.closedAt, start),
          lt(deals.closedAt, end),
          or(eq(deals.probability, 100), ilike(deals.stage, "%won%"))
        )
      );

    const [dealsLostRow] = await db
      .select({ value: count() })
      .from(deals)
      .where(
        and(
          eq(deals.orgId, orgId),
          gte(deals.closedAt, start),
          lt(deals.closedAt, end),
          or(eq(deals.probability, 0), ilike(deals.stage, "%lost%"))
        )
      );

    const [avgCycleRow] = await db
      .select({
        value: sql<string>`coalesce(avg(extract(epoch from (${deals.closedAt} - ${deals.createdAt})) / 86400.0)::numeric(10,2), 0)`,
      })
      .from(deals)
      .where(and(eq(deals.orgId, orgId), gte(deals.closedAt, start), lt(deals.closedAt, end)));

    const [bookingsTotalRow] = await db
      .select({ value: count() })
      .from(bookings)
      .where(and(eq(bookings.orgId, orgId), gte(bookings.startsAt, start), lt(bookings.startsAt, end)));

    const [bookingNoShowRow] = await db
      .select({ value: count() })
      .from(bookings)
      .where(and(eq(bookings.orgId, orgId), gte(bookings.startsAt, start), lt(bookings.startsAt, end), eq(bookings.status, "no_show")));

    const [emailsSentRow] = await db
      .select({ value: count() })
      .from(emails)
      .where(and(eq(emails.orgId, orgId), gte(emails.sentAt, start), lt(emails.sentAt, end)));

    const [emailsOpenedRow] = await db
      .select({ value: count() })
      .from(emails)
      .where(and(eq(emails.orgId, orgId), gte(emails.sentAt, start), lt(emails.sentAt, end), gte(emails.openCount, 1)));

    const [emailsClickedRow] = await db
      .select({ value: count() })
      .from(emails)
      .where(and(eq(emails.orgId, orgId), gte(emails.sentAt, start), lt(emails.sentAt, end), gte(emails.clickCount, 1)));

    const [portalActiveClientsRow] = await db
      .select({ value: countDistinct(portalMessages.contactId) })
      .from(portalMessages)
      .where(and(eq(portalMessages.orgId, orgId), gte(portalMessages.createdAt, start), lt(portalMessages.createdAt, end)));

    const [revenueTotalRow] = await db
      .select({ value: sql<string>`coalesce(sum(${deals.value}), '0')` })
      .from(deals)
      .where(
        and(
          eq(deals.orgId, orgId),
          lt(deals.closedAt, end),
          or(eq(deals.probability, 100), ilike(deals.stage, "%won%"))
        )
      );

    const [revenueNewRow] = await db
      .select({ value: sql<string>`coalesce(sum(${deals.value}), '0')` })
      .from(deals)
      .where(
        and(
          eq(deals.orgId, orgId),
          gte(deals.closedAt, start),
          lt(deals.closedAt, end),
          or(eq(deals.probability, 100), ilike(deals.stage, "%won%"))
        )
      );

    const dealsWon = Number(dealsWonRow?.value ?? 0);
    const dealsLost = Number(dealsLostRow?.value ?? 0);
    const emailsSent = Number(emailsSentRow?.value ?? 0);
    const bookingsTotal = Number(bookingsTotalRow?.value ?? 0);

    const winRate = dealsWon + dealsLost > 0 ? dealsWon / (dealsWon + dealsLost) : 0;
    const bookingNoShowRate = bookingsTotal > 0 ? Number(bookingNoShowRow?.value ?? 0) / bookingsTotal : 0;
    const emailOpenRate = emailsSent > 0 ? Number(emailsOpenedRow?.value ?? 0) / emailsSent : 0;
    const emailClickRate = emailsSent > 0 ? Number(emailsClickedRow?.value ?? 0) / emailsSent : 0;

    await db
      .insert(metricsSnapshots)
      .values({
        orgId,
        date: snapshotDateKey,
        contactsTotal: Number(contactsTotalRow?.value ?? 0),
        contactsNew: Number(contactsNewRow?.value ?? 0),
        pipelineValue: pipelineValueRow?.value ?? "0",
        dealsWon,
        dealsLost,
        winRate: String(winRate),
        avgDealCycleDays: avgCycleRow?.value ?? "0",
        bookingsTotal,
        bookingNoShowRate: String(bookingNoShowRate),
        emailsSent,
        emailOpenRate: String(emailOpenRate),
        emailClickRate: String(emailClickRate),
        portalActiveClients: Number(portalActiveClientsRow?.value ?? 0),
        revenueTotal: revenueTotalRow?.value ?? "0",
        revenueNew: revenueNewRow?.value ?? "0",
        customMetrics: {},
      })
      .onConflictDoUpdate({
        target: [metricsSnapshots.orgId, metricsSnapshots.date],
        set: {
          contactsTotal: Number(contactsTotalRow?.value ?? 0),
          contactsNew: Number(contactsNewRow?.value ?? 0),
          pipelineValue: pipelineValueRow?.value ?? "0",
          dealsWon,
          dealsLost,
          winRate: String(winRate),
          avgDealCycleDays: avgCycleRow?.value ?? "0",
          bookingsTotal,
          bookingNoShowRate: String(bookingNoShowRate),
          emailsSent,
          emailOpenRate: String(emailOpenRate),
          emailClickRate: String(emailClickRate),
          portalActiveClients: Number(portalActiveClientsRow?.value ?? 0),
          revenueTotal: revenueTotalRow?.value ?? "0",
          revenueNew: revenueNewRow?.value ?? "0",
          customMetrics: {},
          createdAt: new Date(),
        },
      });

    processed += 1;
  }

  return {
    date: snapshotDateKey,
    organizationsProcessed: processed,
  };
}
