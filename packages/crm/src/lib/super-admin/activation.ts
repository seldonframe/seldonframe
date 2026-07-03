// v1.35.x — Super-admin activation funnel.
//
// Answers "I have signups but I don't know if they're building or
// using anything." The funnel is in WORKSPACE (organization) units so
// it's monotonic — each stage is a distinct-org count, top-of-funnel
// is total organizations, and every stage's % is "of all workspaces":
//
//   Workspaces          count(organizations) — funnel top.
//   Built an agent       Distinct orgs with >=1 agent OR >=1 agent
//                        template (a builder org counts too).
//   Active · 30d         Distinct orgs with >=1 agent conversation
//                        started in the last 30 days.
//   Paying               Users on a paid plan (PAID_PLAN_IDS, reused
//                        from metrics.ts). This is accounts, not
//                        orgs — the funnel's terminal money stage.
//
// Alongside the funnel: IDE-connection health (api_keys minted vs.
// ever used) — the "connected but never built" activation gap.
//
// Same pattern as metrics.ts: single-SELECT queries, unstable_cache
// TTL 300s, every getter .catch-guarded to a zero default so one bad
// query never 500s the page.

import { sql, gte, count, countDistinct } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/db";
import { users, organizations, agentConversations } from "@/db/schema";
import { PLANS } from "@/lib/billing/plans";

export type FunnelStage = {
  label: string;
  count: number;
  /** Percent of total workspaces this stage represents (0-100, rounded). */
  ofTotalPct: number;
  /** One-line explanation of what qualifies for this stage. */
  hint: string;
};

export type ActivationSummary = {
  signupsTotal: number;
  signupsLast7d: number;
  stages: FunnelStage[];
  connections: {
    minted: number;
    used: number;
    usedPct: number;
  };
  /** When the data was computed (server time). */
  computedAt: string;
};

const PAID_PLAN_IDS = PLANS.filter((p) => p.type === "paid").map((p) => p.id);

const getSignupsTotal = unstable_cache(
  async () => {
    const [row] = await db.select({ value: count(users.id) }).from(users);
    return row?.value ?? 0;
  },
  ["super-admin:signups-total"],
  { revalidate: 300, tags: ["super-admin:activation"] }
);

const getSignupsLast7d = unstable_cache(
  async () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [row] = await db
      .select({ value: count(users.id) })
      .from(users)
      .where(gte(users.createdAt, sevenDaysAgo));
    return row?.value ?? 0;
  },
  ["super-admin:signups-7d"],
  { revalidate: 300, tags: ["super-admin:activation"] }
);

const getTotalWorkspaces = unstable_cache(
  async () => {
    const [row] = await db.select({ value: count(organizations.id) }).from(organizations);
    return row?.value ?? 0;
  },
  ["super-admin:activation-total-workspaces"],
  { revalidate: 300, tags: ["super-admin:activation"] }
);

const getBuiltOrgsCount = unstable_cache(
  async () => {
    const result = await db.execute(sql`
      SELECT count(*)::int AS c FROM (
        SELECT org_id FROM agents
        UNION
        SELECT builder_org_id AS org_id FROM agent_templates
      ) t
    `);
    return Number((result.rows?.[0] as { c: number } | undefined)?.c ?? 0);
  },
  ["super-admin:built-orgs"],
  { revalidate: 300, tags: ["super-admin:activation"] }
);

const getActiveOrgsLast30d = unstable_cache(
  async () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [row] = await db
      .select({ value: countDistinct(agentConversations.orgId) })
      .from(agentConversations)
      .where(gte(agentConversations.startedAt, thirtyDaysAgo));
    return row?.value ?? 0;
  },
  ["super-admin:active-orgs-30d"],
  { revalidate: 300, tags: ["super-admin:activation"] }
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
  { revalidate: 300, tags: ["super-admin:activation"] }
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

export async function getActivationFunnel(): Promise<ActivationSummary> {
  const [
    signupsTotal,
    signupsLast7d,
    totalWorkspaces,
    builtOrgs,
    activeOrgs30d,
    payingAccounts,
    connections,
  ] = await Promise.all([
    getSignupsTotal().catch(() => 0),
    getSignupsLast7d().catch(() => 0),
    getTotalWorkspaces().catch(() => 0),
    getBuiltOrgsCount().catch(() => 0),
    getActiveOrgsLast30d().catch(() => 0),
    getPayingAccounts().catch(() => 0),
    getConnectionsHealth().catch(() => ({ minted: 0, used: 0 })),
  ]);

  const stages: FunnelStage[] = [
    {
      label: "Workspaces",
      count: totalWorkspaces,
      ofTotalPct: 100,
      hint: "total organizations",
    },
    {
      label: "Built an agent",
      count: builtOrgs,
      ofTotalPct: pct(builtOrgs, totalWorkspaces),
      hint: "created ≥ 1 agent or template",
    },
    {
      label: "Active · 30d",
      count: activeOrgs30d,
      ofTotalPct: pct(activeOrgs30d, totalWorkspaces),
      hint: "had a real conversation in 30d",
    },
    {
      label: "Paying",
      count: payingAccounts,
      ofTotalPct: pct(payingAccounts, totalWorkspaces),
      hint: "paying accounts — on a paid plan",
    },
  ];

  return {
    signupsTotal,
    signupsLast7d,
    stages,
    connections: {
      minted: connections.minted,
      used: connections.used,
      usedPct: pct(connections.used, connections.minted),
    },
    computedAt: new Date().toISOString(),
  };
}
