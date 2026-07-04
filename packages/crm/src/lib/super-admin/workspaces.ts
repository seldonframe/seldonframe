// v1.35.2 — Super-admin workspace queries.
//
// listWorkspaces      — paginated, sortable by activity / name /
//                       created. Joins owner email so the list
//                       shows operator identity at a glance.
// getWorkspaceDetail  — full workspace profile + agents + activity
//                       windows + lifetime token/cost rollups.

import { sql, and, eq, ne, desc, asc, ilike, lt, count, countDistinct } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/db";
import {
  organizations,
  users,
  agents,
  agentConversations,
  activities,
} from "@/db/schema";

export type WorkspaceSort = "activity" | "created" | "name";

export type ListWorkspacesFilters = {
  search?: string;
  soulId?: string;
  sort?: WorkspaceSort;
  cursor?: string; // ISO for createdAt-based pagination
  limit?: number;
};

export type WorkspaceListRow = {
  id: string;
  name: string;
  slug: string;
  soulId: string | null;
  ownerEmail: string | null;
  createdAt: string;
  /** Most recent activity timestamp on this workspace, or null. */
  lastActivityAt: string | null;
  /** Conversations in the last 24h. */
  conversations24h: number;
  /** Live agent count (status='live'). */
  liveAgents: number;
};

export type ListWorkspacesResult = {
  rows: WorkspaceListRow[];
  nextCursor: string | null;
  totalForFilter: number;
};

export async function listWorkspaces(filters: ListWorkspacesFilters): Promise<ListWorkspacesResult> {
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  const sort: WorkspaceSort = filters.sort ?? "created";

  const conditions = [];
  if (filters.search) {
    conditions.push(
      sql`(${organizations.name} ILIKE ${`%${filters.search}%`} OR ${organizations.slug} ILIKE ${`%${filters.search}%`})`
    );
  }
  if (filters.soulId) {
    conditions.push(eq(organizations.soulId, filters.soulId));
  }
  if (filters.cursor && sort === "created") {
    conditions.push(lt(organizations.createdAt, new Date(filters.cursor)));
  }
  const whereClause = conditions.length ? and(...conditions) : undefined;

  // Sort can switch between created (cursor-pagination-friendly) and
  // name (alphabetical). Activity sort needs a join + max — handled
  // below via post-sort because cursoring on a derived column is messy.
  const orderClause =
    sort === "name" ? asc(organizations.name) : desc(organizations.createdAt);

  const orgRows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      soulId: organizations.soulId,
      ownerId: organizations.ownerId,
      createdAt: organizations.createdAt,
    })
    .from(organizations)
    .where(whereClause)
    .orderBy(orderClause)
    .limit(limit + 1);

  const hasMore = orgRows.length > limit;
  const pageRows = hasMore ? orgRows.slice(0, limit) : orgRows;
  const orgIds = pageRows.map((o) => o.id);
  const ownerIds = pageRows.map((o) => o.ownerId).filter((id): id is string => Boolean(id));

  // Owners
  const ownerRows = ownerIds.length
    ? await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(sql`${users.id} IN (${sql.join(ownerIds.map((id) => sql`${id}`), sql`, `)})`)
    : [];
  const ownerEmailMap = new Map(ownerRows.map((u) => [u.id, u.email]));

  // Last activity per org
  let lastActivityMap = new Map<string, Date>();
  if (orgIds.length) {
    const lastRows = await db
      .select({
        orgId: activities.orgId,
        lastAt: sql<Date>`MAX(${activities.createdAt})`,
      })
      .from(activities)
      .where(sql`${activities.orgId} IN (${sql.join(orgIds.map((id) => sql`${id}`), sql`, `)})`)
      .groupBy(activities.orgId);
    lastActivityMap = new Map(lastRows.map((r) => [r.orgId, r.lastAt]));
  }

  // Conversations 24h per org
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  let convo24hMap = new Map<string, number>();
  if (orgIds.length) {
    const rows = await db
      .select({
        orgId: agentConversations.orgId,
        c: count(agentConversations.id),
      })
      .from(agentConversations)
      .where(
        and(
          sql`${agentConversations.orgId} IN (${sql.join(orgIds.map((id) => sql`${id}`), sql`, `)})`,
          sql`${agentConversations.startedAt} >= ${twentyFourHoursAgo}`
        )
      )
      .groupBy(agentConversations.orgId);
    convo24hMap = new Map(rows.map((r) => [r.orgId, Number(r.c)]));
  }

  // Live agents per org
  let liveAgentsMap = new Map<string, number>();
  if (orgIds.length) {
    const rows = await db
      .select({
        orgId: agents.orgId,
        c: count(agents.id),
      })
      .from(agents)
      .where(
        and(
          sql`${agents.orgId} IN (${sql.join(orgIds.map((id) => sql`${id}`), sql`, `)})`,
          eq(agents.status, "live")
        )
      )
      .groupBy(agents.orgId);
    liveAgentsMap = new Map(rows.map((r) => [r.orgId, Number(r.c)]));
  }

  let rows: WorkspaceListRow[] = pageRows.map((o) => ({
    id: o.id,
    name: o.name,
    slug: o.slug,
    soulId: o.soulId,
    ownerEmail: o.ownerId ? ownerEmailMap.get(o.ownerId) ?? null : null,
    createdAt: o.createdAt.toISOString(),
    lastActivityAt: lastActivityMap.get(o.id)?.toISOString() ?? null,
    conversations24h: convo24hMap.get(o.id) ?? 0,
    liveAgents: liveAgentsMap.get(o.id) ?? 0,
  }));

  // Activity sort happens post-query — workspaces with no activity
  // sink to the bottom (null < any timestamp).
  if (sort === "activity") {
    rows = [...rows].sort((a, b) => {
      const aT = a.lastActivityAt ? Date.parse(a.lastActivityAt) : 0;
      const bT = b.lastActivityAt ? Date.parse(b.lastActivityAt) : 0;
      return bT - aT;
    });
  }

  const totalForFilter = await getCachedTotal(filters.search ?? "", filters.soulId ?? "");

  return {
    rows,
    nextCursor: hasMore && sort === "created"
      ? pageRows[pageRows.length - 1].createdAt.toISOString()
      : null,
    totalForFilter,
  };
}

const getCachedTotal = unstable_cache(
  async (search: string, soulId: string) => {
    const conditions = [];
    if (search) {
      conditions.push(
        sql`(${organizations.name} ILIKE ${`%${search}%`} OR ${organizations.slug} ILIKE ${`%${search}%`})`
      );
    }
    if (soulId) {
      conditions.push(eq(organizations.soulId, soulId));
    }
    const [row] = await db
      .select({ value: count(organizations.id) })
      .from(organizations)
      .where(conditions.length ? and(...conditions) : undefined);
    return row?.value ?? 0;
  },
  ["super-admin:workspaces-total"],
  { revalidate: 60, tags: ["super-admin:workspaces"] }
);

export type AgentRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  archetype: string;
  channel: string;
  createdAt: string;
};

export type WorkspaceDetail = {
  id: string;
  name: string;
  slug: string;
  soulId: string | null;
  ownerEmail: string | null;
  ownerId: string | null;
  createdAt: string;
  /** Bucketed activity counts. */
  activity: {
    last24h: number;
    last7d: number;
    last30d: number;
  };
  /** Lifetime LLM cost across all agent conversations, in cents. */
  lifetimeLlmCostCents: number;
  /** Lifetime tokens (in + out) across all agent conversations. */
  lifetimeTokens: number;
  /** Total conversations ever. */
  totalConversations: number;
  /** Distinct contacts that have engaged. */
  distinctContacts: number;
  agents: AgentRow[];
};

export async function getWorkspaceDetail(workspaceId: string): Promise<WorkspaceDetail | null> {
  const [org] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      soulId: organizations.soulId,
      ownerId: organizations.ownerId,
      createdAt: organizations.createdAt,
    })
    .from(organizations)
    .where(eq(organizations.id, workspaceId))
    .limit(1);

  if (!org) return null;

  let ownerEmail: string | null = null;
  if (org.ownerId) {
    const [u] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, org.ownerId))
      .limit(1);
    ownerEmail = u?.email ?? null;
  }

  // Agents in this workspace
  const agentRows = await db
    .select({
      id: agents.id,
      name: agents.name,
      slug: agents.slug,
      status: agents.status,
      archetype: agents.archetype,
      channel: agents.channel,
      createdAt: agents.createdAt,
    })
    .from(agents)
    // copilot rows are plumbing, not user agents (win-ladder plan T2)
    .where(and(eq(agents.orgId, workspaceId), ne(agents.archetype, "workspace_copilot")))
    .orderBy(desc(agents.createdAt));

  // Activity buckets
  const now = Date.now();
  const _24h = new Date(now - 24 * 60 * 60 * 1000);
  const _7d = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const _30d = new Date(now - 30 * 24 * 60 * 60 * 1000);

  const [act24h, act7d, act30d] = await Promise.all([
    db.select({ c: count(activities.id) })
      .from(activities)
      .where(and(eq(activities.orgId, workspaceId), sql`${activities.createdAt} >= ${_24h}`)),
    db.select({ c: count(activities.id) })
      .from(activities)
      .where(and(eq(activities.orgId, workspaceId), sql`${activities.createdAt} >= ${_7d}`)),
    db.select({ c: count(activities.id) })
      .from(activities)
      .where(and(eq(activities.orgId, workspaceId), sql`${activities.createdAt} >= ${_30d}`)),
  ]);

  // Lifetime conversation rollups
  const [convoStats] = await db
    .select({
      totalConvos: count(agentConversations.id),
      llmCostCents: sql<number>`COALESCE(SUM(${agentConversations.llmCostCents}), 0)`,
      tokensIn: sql<number>`COALESCE(SUM(${agentConversations.tokensIn}), 0)`,
      tokensOut: sql<number>`COALESCE(SUM(${agentConversations.tokensOut}), 0)`,
      distinctContacts: countDistinct(agentConversations.contactId),
    })
    .from(agentConversations)
    .where(eq(agentConversations.orgId, workspaceId));

  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    soulId: org.soulId,
    ownerEmail,
    ownerId: org.ownerId,
    createdAt: org.createdAt.toISOString(),
    activity: {
      last24h: Number(act24h[0]?.c ?? 0),
      last7d: Number(act7d[0]?.c ?? 0),
      last30d: Number(act30d[0]?.c ?? 0),
    },
    lifetimeLlmCostCents: Number(convoStats?.llmCostCents ?? 0),
    lifetimeTokens:
      Number(convoStats?.tokensIn ?? 0) + Number(convoStats?.tokensOut ?? 0),
    totalConversations: Number(convoStats?.totalConvos ?? 0),
    distinctContacts: Number(convoStats?.distinctContacts ?? 0),
    agents: agentRows.map((a) => ({
      id: a.id,
      name: a.name,
      slug: a.slug,
      status: a.status,
      archetype: a.archetype,
      channel: a.channel,
      createdAt: a.createdAt.toISOString(),
    })),
  };
}
