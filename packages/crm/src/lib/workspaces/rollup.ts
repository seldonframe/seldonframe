// packages/crm/src/lib/workspaces/rollup.ts
//
// Per-workspace rollup query for GET /api/v1/web/workspaces/mine.
// Fans out three light queries (soul completion, last activity, new
// leads this week) per workspace. Called once per org from the
// orchestrator. Returns nullable values so the downstream
// `summarizeWorkspace` can fall back to "setup" / "no activity" states.
//
// The route fires these in parallel (Promise.all) — the per-row cost
// is small (each query hits a covered index: organizations PK,
// activities(org_id, created_at), deals(org_id, created_at)).

import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { activities, bookings, deals, organizations, soulSources } from "@/db/schema";

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type WorkspaceRollup = {
  orgId: string;
  soulCompletedAt: Date | null;
  lastActivityAt: Date | null;
  newLeadsThisWeek: number;
  /** 2026-05-19 — bookings starting in the next 7 days. Mini-stat for the /clients card. */
  bookingsThisWeek: number;
  /**
   * 2026-05-19 — first `type='url'` row in soul_sources for this org.
   * This is the URL the operator pasted into /clients/new (e.g.
   * https://roofsbyshiloh.com). Shown on /clients cards under the
   * workspace name as the actual brand the operator built FOR — the
   * auto-generated SeldonFrame subdomain is a dev preview, not the
   * customer-facing brand.
   */
  originalSiteUrl: string | null;
};

export async function rollupWorkspace(orgId: string): Promise<WorkspaceRollup> {
  // Soul completion lives on organizations — single PK lookup.
  const [orgRow] = await db
    .select({ soulCompletedAt: organizations.soulCompletedAt })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  // Most recent activity row. Uses the activities_org_contact_created_idx
  // (org_id leads, created_at desc) so this is an index-only scan that
  // stops after the first row.
  const [lastActivity] = await db
    .select({ createdAt: activities.createdAt })
    .from(activities)
    .where(eq(activities.orgId, orgId))
    .orderBy(desc(activities.createdAt))
    .limit(1);

  // Deals created in the last 7 days. "Lead" here = a new deal row; the
  // pipeline-stage rules vary by workspace so we don't filter on stage.
  const sinceISO = new Date(Date.now() - ONE_WEEK_MS);
  const [leadsRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(deals)
    .where(and(eq(deals.orgId, orgId), gte(deals.createdAt, sinceISO)));

  // 2026-05-19 — upcoming bookings in the next 7 days. Filters out
  // template rows + cancelled bookings so the count reflects real
  // appointments. Same index strategy as the leads count.
  const nowISO = new Date();
  const oneWeekFromNow = new Date(Date.now() + ONE_WEEK_MS);
  const [bookingsRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(bookings)
    .where(
      and(
        eq(bookings.orgId, orgId),
        gte(bookings.startsAt, nowISO),
        sql`${bookings.startsAt} < ${oneWeekFromNow}`,
        sql`${bookings.status} <> 'template'`,
        sql`${bookings.status} <> 'cancelled'`,
      ),
    );

  // 2026-05-19 — original brand URL the operator pasted into /clients/new.
  // Picks the first `type='url'` row (seedSoulWikiSourceUrl is idempotent
  // and seeds exactly one per workspace during v2 creation).
  const [originalUrlRow] = await db
    .select({ sourceUrl: soulSources.sourceUrl })
    .from(soulSources)
    .where(and(eq(soulSources.orgId, orgId), eq(soulSources.type, "url")))
    .limit(1);

  return {
    orgId,
    soulCompletedAt: orgRow?.soulCompletedAt ?? null,
    lastActivityAt: lastActivity?.createdAt ?? null,
    newLeadsThisWeek: Number(leadsRow?.count ?? 0),
    bookingsThisWeek: Number(bookingsRow?.count ?? 0),
    originalSiteUrl: originalUrlRow?.sourceUrl ?? null,
  };
}
