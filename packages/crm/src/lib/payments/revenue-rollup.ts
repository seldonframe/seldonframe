// packages/crm/src/lib/payments/revenue-rollup.ts
//
// Autopay console (2026-07-08) — Task 5: the month-to-date revenue strip.
// Mirrors getAgencyUsageRollup's shape (lib/billing/usage-rollup.ts): ONE
// grouped paymentRecords query for the agency's whole book (retainer +
// proposal sourceBlocks, status "completed", this calendar month UTC).
//
// MONEY-SAFETY: GMV_FEE_PERCENT (lib/billing/gmv.ts) is imported READ-ONLY —
// no new percentage is computed or introduced anywhere in this file.

import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { contacts, paymentRecords } from "@/db/schema";
import { GMV_FEE_PERCENT } from "@/lib/billing/gmv";

/** Calendar-month UTC period boundary — same convention as
 *  currentPeriodStartUtc in lib/billing/usage-rollup.ts. */
export function currentRevenuePeriodStartUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

/** One grouped-query result row: `GROUP BY contact_id` over paymentRecords
 *  for the agency's book, period-scoped, status "completed". */
export type RevenueRollupRow = {
  contactId: string | null;
  contactName: string | null;
  cents: number;
};

export type RevenueRollupDeps = {
  /** ONE `GROUP BY contact_id` query over paymentRecords for the agency org,
   *  sourceBlock IN ('retainer', 'proposal'), status 'completed',
   *  createdAt >= periodStart. */
  queryCompletedRevenueRollup: (agencyOrgId: string, periodStart: Date) => Promise<RevenueRollupRow[]>;
};

export type RevenueClientRow = {
  contactId: string | null;
  contactName: string;
  collectedCents: number;
};

export type RevenueRollupTotals = {
  collectedCents: number;
  /** The 2% platform-fee transparency line — READ from GMV_FEE_PERCENT, the
   *  single source. Not a separate charge; Stripe already collected this at
   *  the application_fee_percent level on each charge. This is a DISPLAY
   *  number only. */
  feeCents: number;
};

export type AgencyRevenueRollup = {
  perClient: RevenueClientRow[];
  totals: RevenueRollupTotals;
};

async function defaultQueryCompletedRevenueRollup(
  agencyOrgId: string,
  periodStart: Date,
): Promise<RevenueRollupRow[]> {
  const rows = await db
    .select({
      contactId: paymentRecords.contactId,
      cents: sql<number>`coalesce(sum(${paymentRecords.amount} * 100), 0)::int`,
    })
    .from(paymentRecords)
    .where(
      and(
        eq(paymentRecords.orgId, agencyOrgId),
        inArray(paymentRecords.sourceBlock, ["retainer", "proposal"]),
        eq(paymentRecords.status, "completed"),
        gte(paymentRecords.createdAt, periodStart),
      ),
    )
    .groupBy(paymentRecords.contactId);

  const contactIds = rows.map((r) => r.contactId).filter((id): id is string => Boolean(id));
  const nameByContactId = new Map<string, string>();
  if (contactIds.length > 0) {
    const contactRows = await db
      .select({ id: contacts.id, firstName: contacts.firstName, company: contacts.company })
      .from(contacts)
      .where(inArray(contacts.id, contactIds));
    for (const c of contactRows) {
      nameByContactId.set(c.id, c.company?.trim() || c.firstName?.trim() || "Unknown");
    }
  }

  return rows.map((r) => ({
    contactId: r.contactId,
    contactName: r.contactId ? nameByContactId.get(r.contactId) ?? "Unknown" : null,
    cents: Number(r.cents ?? 0),
  }));
}

export function defaultRevenueRollupDeps(): RevenueRollupDeps {
  return { queryCompletedRevenueRollup: defaultQueryCompletedRevenueRollup };
}

/** ONE grouped query for the agency's whole book → per-client breakdown
 *  (sorted highest-revenue-first) + book total + the 2% fee transparency
 *  line. Empty book → zeroed totals, empty perClient (never omitted rows —
 *  the grouped query naturally returns nothing to iterate). */
export async function getAgencyRevenueRollup(
  agencyOrgId: string,
  now: Date = new Date(),
  deps: RevenueRollupDeps = defaultRevenueRollupDeps(),
): Promise<AgencyRevenueRollup> {
  const periodStart = currentRevenuePeriodStartUtc(now);
  const rows = await deps.queryCompletedRevenueRollup(agencyOrgId, periodStart);

  const perClient: RevenueClientRow[] = rows
    .map((r) => ({
      contactId: r.contactId,
      contactName: r.contactName?.trim() || "Unknown",
      collectedCents: r.cents,
    }))
    .sort((a, b) => b.collectedCents - a.collectedCents);

  const collectedCents = rows.reduce((sum, r) => sum + r.cents, 0);
  const feeCents = Math.round((collectedCents * GMV_FEE_PERCENT) / 100);

  return { perClient, totals: { collectedCents, feeCents } };
}
