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
import { activities, deals, organizations } from "@/db/schema";

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type WorkspaceRollup = {
  orgId: string;
  soulCompletedAt: Date | null;
  lastActivityAt: Date | null;
  newLeadsThisWeek: number;
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

  return {
    orgId,
    soulCompletedAt: orgRow?.soulCompletedAt ?? null,
    lastActivityAt: lastActivity?.createdAt ?? null,
    newLeadsThisWeek: Number(leadsRow?.count ?? 0),
  };
}
