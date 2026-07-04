// v1.35.x — Super-admin activation funnel.
// Task 10 rewrite — signup → workspace → built → tested (P3).
//
// Answers "I have signups but I don't know if they're building or
// using anything." Earlier versions were workspace-unit and mixed
// paying/connections into the funnel body; this version is the
// literal customer journey, in ACCOUNT/WORKSPACE units per stage:
//
//   Signups              count(users) — funnel top.
//   Created a workspace  Distinct users who own >=1 organization.
//   Built an agent       Distinct orgs (owned) with >=1 agent.
//   Tested an agent      Distinct orgs (owned) with >=1 agent
//                        conversation OR >=1 agent eval run.
//
// Every stage's % is "of Signups" (ofTotalPct), not of the previous
// stage — this keeps the funnel readable as a single scan.
//
// SeldonFrame's own team + agency workspaces (demo/QA/preview-pitch
// orgs) are excluded by default via internal-exclusion.ts so the
// funnel reflects real customer activation, not internal noise.
// Pass { includeInternal: true } to see the unfiltered picture.
//
// Alongside the funnel: `paying` (top-level, not a stage — it's
// accounts on a paid plan, not part of the workspace journey) and
// `connections` — IDE-connection health (api_keys minted vs. ever
// used), the "connected but never built" activation gap.
//
// Same pattern as metrics.ts: single-SELECT queries, unstable_cache
// TTL 300s, every getter .catch-guarded to a zero default so one bad
// query never 500s the page. Cache keys are suffixed `:ext` (excluding
// internal, the default) / `:all` (includeInternal: true) so the two
// modes never collide in the cache.

import { sql, count } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/db";
import { users } from "@/db/schema";
import { PLANS } from "@/lib/billing/plans";
import { parseInternalIds, internalOrgPredicateSql, type InternalIds } from "./internal-exclusion";

export type FunnelStage = {
  label: string;
  count: number;
  /** Percent of total signups this stage represents (0-100, rounded). */
  ofTotalPct: number;
  /** One-line explanation of what qualifies for this stage. */
  hint: string;
};

export type ActivationSummary = {
  signupsTotal: number;
  signupsLast7d: number;
  stages: FunnelStage[];
  /** Accounts on a paid plan. Not part of the workspace journey funnel. */
  paying: number;
  connections: {
    minted: number;
    used: number;
    usedPct: number;
  };
  /** Whether internal (SeldonFrame team/agency/preview) orgs were excluded. */
  excludedInternal: boolean;
  /** Count of orgs matching the internal predicate, for context either way. */
  internalOrgCount: number;
  /** When the data was computed (server time). */
  computedAt: string;
};

const PAID_PLAN_IDS = PLANS.filter((p) => p.type === "paid").map((p) => p.id);

function getInternalIds(): InternalIds {
  return parseInternalIds({
    SF_INTERNAL_USER_IDS: process.env.SF_INTERNAL_USER_IDS,
    SF_INTERNAL_AGENCY_ID: process.env.SF_INTERNAL_AGENCY_ID,
  });
}

function cacheSuffix(includeInternal: boolean): "ext" | "all" {
  return includeInternal ? "all" : "ext";
}

const getSignupsTotal = (includeInternal: boolean) =>
  unstable_cache(
    async () => {
      const ids = getInternalIds();
      if (includeInternal || ids.userIds.length === 0) {
        const [row] = await db.select({ value: count(users.id) }).from(users);
        return row?.value ?? 0;
      }
      const result = await db.execute(sql`
        SELECT count(*)::int AS c FROM users
        WHERE NOT (id = ANY(ARRAY[${sql.join(
          ids.userIds.map((id) => sql`${id}`),
          sql`, `,
        )}]::uuid[]))
      `);
      return Number((result.rows?.[0] as { c: number } | undefined)?.c ?? 0);
    },
    [`super-admin:signups-total:${cacheSuffix(includeInternal)}`],
    { revalidate: 300, tags: ["super-admin:activation"] },
  )();

const getSignupsLast7d = (includeInternal: boolean) =>
  unstable_cache(
    async () => {
      const ids = getInternalIds();
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      if (includeInternal || ids.userIds.length === 0) {
        const [row] = await db
          .select({ value: count(users.id) })
          .from(users)
          .where(sql`${users.createdAt} >= ${sevenDaysAgo}`);
        return row?.value ?? 0;
      }
      const result = await db.execute(sql`
        SELECT count(*)::int AS c FROM users
        WHERE created_at >= ${sevenDaysAgo}
          AND NOT (id = ANY(ARRAY[${sql.join(
            ids.userIds.map((id) => sql`${id}`),
            sql`, `,
          )}]::uuid[]))
      `);
      return Number((result.rows?.[0] as { c: number } | undefined)?.c ?? 0);
    },
    [`super-admin:signups-7d:${cacheSuffix(includeInternal)}`],
    { revalidate: 300, tags: ["super-admin:activation"] },
  )();

/** Distinct users who own >=1 organization (an owned org not internal, when excluding). */
const getCreatedWorkspaceCount = (includeInternal: boolean) =>
  unstable_cache(
    async () => {
      const ids = getInternalIds();
      const internalPredicate = includeInternal ? sql`false` : internalOrgPredicateSql(ids);
      const result = await db.execute(sql`
        SELECT count(DISTINCT owner_id)::int AS c
        FROM organizations
        WHERE owner_id IS NOT NULL
          AND NOT (${internalPredicate})
      `);
      return Number((result.rows?.[0] as { c: number } | undefined)?.c ?? 0);
    },
    [`super-admin:created-workspace:${cacheSuffix(includeInternal)}`],
    { revalidate: 300, tags: ["super-admin:activation"] },
  )();

/** Distinct owned, non-internal orgs with >=1 agent. */
const getBuiltAgentOrgCount = (includeInternal: boolean) =>
  unstable_cache(
    async () => {
      const ids = getInternalIds();
      const internalPredicate = includeInternal ? sql`false` : internalOrgPredicateSql(ids);
      const result = await db.execute(sql`
        SELECT count(DISTINCT agents.org_id)::int AS c
        FROM agents
        JOIN organizations ON organizations.id = agents.org_id
        WHERE organizations.owner_id IS NOT NULL
          AND NOT (${internalPredicate})
      `);
      return Number((result.rows?.[0] as { c: number } | undefined)?.c ?? 0);
    },
    [`super-admin:built-agent-orgs:${cacheSuffix(includeInternal)}`],
    { revalidate: 300, tags: ["super-admin:activation"] },
  )();

/** Distinct owned, non-internal orgs with >=1 conversation OR >=1 eval run. */
const getTestedAgentOrgCount = (includeInternal: boolean) =>
  unstable_cache(
    async () => {
      const ids = getInternalIds();
      const internalPredicate = includeInternal ? sql`false` : internalOrgPredicateSql(ids);
      const result = await db.execute(sql`
        SELECT count(DISTINCT t.org_id)::int AS c
        FROM (
          SELECT org_id FROM agent_conversations
          UNION
          SELECT agents.org_id FROM agent_evals
          JOIN agents ON agents.id = agent_evals.agent_id
        ) t
        JOIN organizations ON organizations.id = t.org_id
        WHERE organizations.owner_id IS NOT NULL
          AND NOT (${internalPredicate})
      `);
      return Number((result.rows?.[0] as { c: number } | undefined)?.c ?? 0);
    },
    [`super-admin:tested-agent-orgs:${cacheSuffix(includeInternal)}`],
    { revalidate: 300, tags: ["super-admin:activation"] },
  )();

/** Count of orgs matching the internal predicate (context stat, always computed). */
const getInternalOrgCount = unstable_cache(
  async () => {
    const ids = getInternalIds();
    const internalPredicate = internalOrgPredicateSql(ids);
    const result = await db.execute(sql`
      SELECT count(*)::int AS c FROM organizations WHERE (${internalPredicate})
    `);
    return Number((result.rows?.[0] as { c: number } | undefined)?.c ?? 0);
  },
  ["super-admin:internal-org-count"],
  { revalidate: 300, tags: ["super-admin:activation"] },
);

const getPayingAccounts = unstable_cache(
  async () => {
    if (PAID_PLAN_IDS.length === 0) return 0;
    const [row] = await db
      .select({ value: count(users.id) })
      .from(users)
      .where(sql`${users.planId} IN (${sql.join(PAID_PLAN_IDS.map((id) => sql`${id}`), sql`, `)})`);
    return row?.value ?? 0;
  },
  ["super-admin:paying-accounts"],
  { revalidate: 300, tags: ["super-admin:activation"] },
);

const getConnectionsHealth = unstable_cache(
  async () => {
    const result = await db.execute(sql`
      SELECT
        count(*)::int AS minted,
        count(*) FILTER (WHERE last_used_at IS NOT NULL)::int AS used
      FROM api_keys
      WHERE kind IN ('workspace', 'oauth', 'user', 'mcp')
    `);
    const row = result.rows?.[0] as { minted: number; used: number } | undefined;
    return {
      minted: Number(row?.minted ?? 0),
      used: Number(row?.used ?? 0),
    };
  },
  ["super-admin:connections-health"],
  { revalidate: 300, tags: ["super-admin:activation"] }
);

function pct(part: number, whole: number): number {
  if (!whole) return 0;
  return Math.round((part / whole) * 100);
}

export async function getActivationFunnel(opts?: { includeInternal?: boolean }): Promise<ActivationSummary> {
  const includeInternal = opts?.includeInternal ?? false;

  const [
    signupsTotal,
    signupsLast7d,
    createdWorkspace,
    builtAgentOrgs,
    testedAgentOrgs,
    internalOrgCount,
    payingAccounts,
    connections,
  ] = await Promise.all([
    getSignupsTotal(includeInternal).catch(() => 0),
    getSignupsLast7d(includeInternal).catch(() => 0),
    getCreatedWorkspaceCount(includeInternal).catch(() => 0),
    getBuiltAgentOrgCount(includeInternal).catch(() => 0),
    getTestedAgentOrgCount(includeInternal).catch(() => 0),
    getInternalOrgCount().catch(() => 0),
    getPayingAccounts().catch(() => 0),
    getConnectionsHealth().catch(() => ({ minted: 0, used: 0 })),
  ]);

  const stages: FunnelStage[] = [
    {
      label: "Signups",
      count: signupsTotal,
      ofTotalPct: 100,
      hint: "total signed-up users",
    },
    {
      label: "Created a workspace",
      count: createdWorkspace,
      ofTotalPct: pct(createdWorkspace, signupsTotal),
      hint: "owns >= 1 organization",
    },
    {
      label: "Built an agent",
      count: builtAgentOrgs,
      ofTotalPct: pct(builtAgentOrgs, signupsTotal),
      hint: "owned workspace with >= 1 agent",
    },
    {
      label: "Tested an agent",
      count: testedAgentOrgs,
      ofTotalPct: pct(testedAgentOrgs, signupsTotal),
      hint: "owned workspace with >= 1 conversation or eval run",
    },
  ];

  return {
    signupsTotal,
    signupsLast7d,
    stages,
    paying: payingAccounts,
    connections: {
      minted: connections.minted,
      used: connections.used,
      usedPct: pct(connections.used, connections.minted),
    },
    excludedInternal: !includeInternal,
    internalOrgCount,
    computedAt: new Date().toISOString(),
  };
}
