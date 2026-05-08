// v1.35.1 — Super-admin user queries.
//
// listUsers       — paginated table of all SF users with optional
//                   email search + plan filter. Cursor-paginated by
//                   createdAt DESC for stable ordering.
// getUserDetail   — single user + the orgs they own + the orgs they
//                   joined as a member but don't own. Used by the
//                   per-user drill-down page.
//
// Both queries are tagged super-admin:users for revalidation. TTL is
// 60 seconds (shorter than the overview's 5min — the detail data
// changes more often as users sign up + click around).

import { sql, and, or, eq, ilike, lt, desc, count } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/db";
import { users, organizations, memberships, activities } from "@/db/schema";
import { PLANS, type TierId } from "@/lib/billing/plans";

const PLAN_LABEL: Record<string, string> = Object.fromEntries(
  PLANS.map((p) => [p.id, p.name])
);

export type ListUsersFilters = {
  /** Email search (case-insensitive substring). */
  search?: string;
  /** Plan filter — restrict to users on this tier. */
  plan?: TierId;
  /** ISO timestamp from previous page's last row (for cursor pagination). */
  cursor?: string;
  /** Page size. Default 50, max 200. */
  limit?: number;
};

export type UserListRow = {
  id: string;
  name: string;
  email: string;
  planId: string | null;
  planLabel: string;
  stripeCustomerId: string | null;
  createdAt: string;
  workspacesOwned: number;
};

export type ListUsersResult = {
  rows: UserListRow[];
  /** ISO timestamp to pass as `cursor` on the next request, or null
   *  when there's no more data. */
  nextCursor: string | null;
  /** Approximate count for the current filter set (cached). */
  totalForFilter: number;
};

export async function listUsers(filters: ListUsersFilters): Promise<ListUsersResult> {
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);

  const conditions = [];
  if (filters.search) {
    conditions.push(
      or(
        ilike(users.email, `%${filters.search}%`),
        ilike(users.name, `%${filters.search}%`)
      )
    );
  }
  if (filters.plan) {
    conditions.push(eq(users.planId, filters.plan));
  }
  if (filters.cursor) {
    conditions.push(lt(users.createdAt, new Date(filters.cursor)));
  }
  const whereClause = conditions.length ? and(...conditions) : undefined;

  // Page of users
  const userRows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      planId: users.planId,
      stripeCustomerId: users.stripeCustomerId,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(whereClause)
    .orderBy(desc(users.createdAt))
    .limit(limit + 1); // +1 to detect more pages

  const hasMore = userRows.length > limit;
  const pageRows = hasMore ? userRows.slice(0, limit) : userRows;

  // Workspace counts in a single query keyed by ownerId
  const ownerIds = pageRows.map((u) => u.id);
  const ownerCounts = ownerIds.length
    ? await db
        .select({
          ownerId: organizations.ownerId,
          c: count(organizations.id),
        })
        .from(organizations)
        .where(sql`${organizations.ownerId} IN (${sql.join(ownerIds.map((id) => sql`${id}`), sql`, `)})`)
        .groupBy(organizations.ownerId)
    : [];
  const ownerCountMap = new Map(ownerCounts.map((r) => [r.ownerId, Number(r.c)]));

  const rows: UserListRow[] = pageRows.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    planId: u.planId,
    planLabel: u.planId ? PLAN_LABEL[u.planId] ?? u.planId : "Free",
    stripeCustomerId: u.stripeCustomerId,
    createdAt: u.createdAt.toISOString(),
    workspacesOwned: ownerCountMap.get(u.id) ?? 0,
  }));

  // Approximate total — caches separately so search/filter changes
  // don't blow away unrelated cache entries.
  const totalForFilter = await getCachedTotal(filters.search ?? "", filters.plan ?? "");

  return {
    rows,
    nextCursor: hasMore ? pageRows[pageRows.length - 1].createdAt.toISOString() : null,
    totalForFilter,
  };
}

const getCachedTotal = unstable_cache(
  async (search: string, plan: string) => {
    const conditions = [];
    if (search) {
      conditions.push(
        or(ilike(users.email, `%${search}%`), ilike(users.name, `%${search}%`))
      );
    }
    if (plan) {
      conditions.push(eq(users.planId, plan));
    }
    const [row] = await db
      .select({ value: count(users.id) })
      .from(users)
      .where(conditions.length ? and(...conditions) : undefined);
    return row?.value ?? 0;
  },
  ["super-admin:users-total"],
  { revalidate: 60, tags: ["super-admin:users"] }
);

export type UserDetailWorkspace = {
  id: string;
  name: string;
  slug: string;
  soulId: string | null;
  createdAt: string;
  /** Most recent activity timestamp on this workspace, or null if none. */
  lastActivityAt: string | null;
  /** "owner" or "member" — relationship of this user to the workspace. */
  relation: "owner" | "member";
  /** For memberships: status (active, paused, etc.). */
  membershipStatus?: string;
};

export type UserDetail = {
  id: string;
  name: string;
  email: string;
  planId: string | null;
  planLabel: string;
  stripeCustomerId: string | null;
  createdAt: string;
  emailVerifiedAt: string | null;
  workspaces: UserDetailWorkspace[];
};

export async function getUserDetail(userId: string): Promise<UserDetail | null> {
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      emailVerified: users.emailVerified,
      planId: users.planId,
      stripeCustomerId: users.stripeCustomerId,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return null;

  // Workspaces owned
  const owned = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      soulId: organizations.soulId,
      createdAt: organizations.createdAt,
    })
    .from(organizations)
    .where(eq(organizations.ownerId, userId))
    .orderBy(desc(organizations.createdAt));

  // Workspaces joined via memberships (excluding owned)
  const ownedIds = new Set(owned.map((w) => w.id));
  const joinedRaw = await db
    .select({
      orgId: memberships.orgId,
      status: memberships.status,
      org: {
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        soulId: organizations.soulId,
        createdAt: organizations.createdAt,
      },
    })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.orgId))
    .where(eq(memberships.userId, userId));
  const joined = joinedRaw.filter((m) => !ownedIds.has(m.orgId));

  // Last activity per workspace (across the page's set)
  const allOrgIds = [...owned.map((w) => w.id), ...joined.map((j) => j.orgId)];
  let lastActivityMap = new Map<string, Date>();
  if (allOrgIds.length) {
    const lastRows = await db
      .select({
        orgId: activities.orgId,
        lastAt: sql<Date>`MAX(${activities.createdAt})`,
      })
      .from(activities)
      .where(sql`${activities.orgId} IN (${sql.join(allOrgIds.map((id) => sql`${id}`), sql`, `)})`)
      .groupBy(activities.orgId);
    lastActivityMap = new Map(lastRows.map((r) => [r.orgId, r.lastAt]));
  }

  const workspaces: UserDetailWorkspace[] = [
    ...owned.map((w) => ({
      id: w.id,
      name: w.name,
      slug: w.slug,
      soulId: w.soulId,
      createdAt: w.createdAt.toISOString(),
      lastActivityAt: lastActivityMap.get(w.id)?.toISOString() ?? null,
      relation: "owner" as const,
    })),
    ...joined.map((j) => ({
      id: j.org.id,
      name: j.org.name,
      slug: j.org.slug,
      soulId: j.org.soulId,
      createdAt: j.org.createdAt.toISOString(),
      lastActivityAt: lastActivityMap.get(j.orgId)?.toISOString() ?? null,
      relation: "member" as const,
      membershipStatus: j.status,
    })),
  ];

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    planId: user.planId,
    planLabel: user.planId ? PLAN_LABEL[user.planId] ?? user.planId : "Free",
    stripeCustomerId: user.stripeCustomerId,
    createdAt: user.createdAt.toISOString(),
    emailVerifiedAt: user.emailVerified?.toISOString() ?? null,
    workspaces,
  };
}
