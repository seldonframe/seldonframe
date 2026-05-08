// v1.35.3 — Super-admin agent fleet metrics.
//
// Platform-wide rollups of how the agent runtime is doing across
// every workspace. Five views:
//
//  1. Fleet status     — count by status (live / draft / test / paused)
//  2. Per-archetype    — count + recent eval pass rate per archetype
//                        (website-chatbot, voice-receptionist, etc.)
//  3. Recent pass rate — pass rate of the most recent eval run per
//                        live agent, averaged across the fleet
//  4. Top failing      — scenarios with lowest pass rate (drives the
//     scenarios          skill-pack improvement priority list)
//  5. Conversation     — total conversations 24h / 7d / 30d, with
//     volume             a "completed without escalation" share

import { sql, eq, count, desc, and } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/db";
import { agents, agentEvals, agentConversations } from "@/db/schema";

export type AgentFleetStatus = {
  total: number;
  live: number;
  draft: number;
  test: number;
  paused: number;
};

export type ArchetypeRow = {
  archetype: string;
  total: number;
  live: number;
  /** Most recent eval pass rate averaged across live agents of this
   *  archetype, 0–1. Null when no live agents have run evals yet. */
  recentPassRate: number | null;
};

export type FailingScenarioRow = {
  scenarioId: string;
  attempts: number;
  fails: number;
  /** Fail rate 0–1 across all observed runs of this scenario. */
  failRate: number;
};

export type ConversationVolume = {
  last24h: number;
  last7d: number;
  last30d: number;
  /** Share completed without escalation, 0–1, of the last-30d set. */
  completedShare30d: number;
};

export type AgentMetrics = {
  fleet: AgentFleetStatus;
  archetypes: ArchetypeRow[];
  recentPassRate: number | null;
  topFailingScenarios: FailingScenarioRow[];
  conversations: ConversationVolume;
  computedAt: string;
};

const getFleetStatus = unstable_cache(
  async (): Promise<AgentFleetStatus> => {
    const rows = await db
      .select({ status: agents.status, c: count(agents.id) })
      .from(agents)
      .groupBy(agents.status);

    const fleet: AgentFleetStatus = { total: 0, live: 0, draft: 0, test: 0, paused: 0 };
    for (const r of rows) {
      const c = Number(r.c);
      fleet.total += c;
      if (r.status === "live") fleet.live = c;
      else if (r.status === "draft") fleet.draft = c;
      else if (r.status === "test") fleet.test = c;
      else if (r.status === "paused") fleet.paused = c;
    }
    return fleet;
  },
  ["super-admin:fleet-status"],
  { revalidate: 300, tags: ["super-admin:agents"] }
);

const getArchetypeBreakdown = unstable_cache(
  async (): Promise<ArchetypeRow[]> => {
    // Counts by archetype × status
    const rows = await db
      .select({
        archetype: agents.archetype,
        status: agents.status,
        c: count(agents.id),
      })
      .from(agents)
      .groupBy(agents.archetype, agents.status);

    const map = new Map<string, { total: number; live: number }>();
    for (const r of rows) {
      const entry = map.get(r.archetype) ?? { total: 0, live: 0 };
      entry.total += Number(r.c);
      if (r.status === "live") entry.live = Number(r.c);
      map.set(r.archetype, entry);
    }

    // Recent pass rate per archetype: average pass rate of the most
    // recent eval run per (agent, scenario), across live agents of
    // that archetype. Computed in a single query via a CTE that
    // ranks evals per agent+scenario by ranAt DESC.
    const passRows = await db.execute(sql`
      WITH ranked_evals AS (
        SELECT
          a.archetype,
          a.id as agent_id,
          e.scenario_id,
          e.passed,
          ROW_NUMBER() OVER (
            PARTITION BY e.agent_id, e.scenario_id
            ORDER BY e.ran_at DESC
          ) as rn
        FROM ${agents} a
        INNER JOIN ${agentEvals} e ON e.agent_id = a.id
        WHERE a.status = 'live'
      )
      SELECT
        archetype,
        AVG(CASE WHEN passed THEN 1.0 ELSE 0.0 END)::float as pass_rate,
        COUNT(*)::int as eval_count
      FROM ranked_evals
      WHERE rn = 1
      GROUP BY archetype
    `);

    const passByArchetype = new Map<string, number>();
    for (const r of passRows.rows ?? []) {
      const a = r as { archetype: string; pass_rate: number; eval_count: number };
      if (a.eval_count > 0) {
        passByArchetype.set(a.archetype, a.pass_rate);
      }
    }

    return Array.from(map.entries())
      .map(([archetype, counts]) => ({
        archetype,
        total: counts.total,
        live: counts.live,
        recentPassRate: passByArchetype.get(archetype) ?? null,
      }))
      .sort((a, b) => b.total - a.total);
  },
  ["super-admin:archetype-breakdown"],
  { revalidate: 300, tags: ["super-admin:agents"] }
);

const getRecentPassRate = unstable_cache(
  async (): Promise<number | null> => {
    // Pass rate of the most recent eval run per (agent, scenario),
    // across all live agents.
    const rows = await db.execute(sql`
      WITH ranked_evals AS (
        SELECT
          e.passed,
          ROW_NUMBER() OVER (
            PARTITION BY e.agent_id, e.scenario_id
            ORDER BY e.ran_at DESC
          ) as rn
        FROM ${agents} a
        INNER JOIN ${agentEvals} e ON e.agent_id = a.id
        WHERE a.status = 'live'
      )
      SELECT
        AVG(CASE WHEN passed THEN 1.0 ELSE 0.0 END)::float as pass_rate,
        COUNT(*)::int as eval_count
      FROM ranked_evals
      WHERE rn = 1
    `);
    const row = rows.rows?.[0] as { pass_rate: number | null; eval_count: number } | undefined;
    if (!row || !row.eval_count) return null;
    return row.pass_rate;
  },
  ["super-admin:recent-pass-rate"],
  { revalidate: 300, tags: ["super-admin:agents"] }
);

const getTopFailingScenarios = unstable_cache(
  async (): Promise<FailingScenarioRow[]> => {
    // Across ALL eval runs (not just most recent), which scenarios
    // fail most often. Min 3 attempts to filter noise.
    const rows = await db
      .select({
        scenarioId: agentEvals.scenarioId,
        attempts: count(agentEvals.id),
        fails: sql<number>`SUM(CASE WHEN ${agentEvals.passed} = false THEN 1 ELSE 0 END)::int`,
      })
      .from(agentEvals)
      .groupBy(agentEvals.scenarioId)
      .having(sql`COUNT(${agentEvals.id}) >= 3`);

    return rows
      .map((r) => ({
        scenarioId: r.scenarioId,
        attempts: Number(r.attempts),
        fails: Number(r.fails),
        failRate: Number(r.fails) / Number(r.attempts),
      }))
      .filter((r) => r.failRate > 0)
      .sort((a, b) => b.failRate - a.failRate)
      .slice(0, 10);
  },
  ["super-admin:top-failing"],
  { revalidate: 300, tags: ["super-admin:agents"] }
);

const getConversationVolume = unstable_cache(
  async (): Promise<ConversationVolume> => {
    const now = Date.now();
    const _24h = new Date(now - 24 * 60 * 60 * 1000);
    const _7d = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const _30d = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const [r24, r7, r30, r30Completed] = await Promise.all([
      db.select({ c: count(agentConversations.id) })
        .from(agentConversations)
        .where(sql`${agentConversations.startedAt} >= ${_24h}`),
      db.select({ c: count(agentConversations.id) })
        .from(agentConversations)
        .where(sql`${agentConversations.startedAt} >= ${_7d}`),
      db.select({ c: count(agentConversations.id) })
        .from(agentConversations)
        .where(sql`${agentConversations.startedAt} >= ${_30d}`),
      db.select({ c: count(agentConversations.id) })
        .from(agentConversations)
        .where(
          and(
            sql`${agentConversations.startedAt} >= ${_30d}`,
            eq(agentConversations.status, "completed")
          )
        ),
    ]);

    const last30d = Number(r30[0]?.c ?? 0);
    const completed30 = Number(r30Completed[0]?.c ?? 0);
    return {
      last24h: Number(r24[0]?.c ?? 0),
      last7d: Number(r7[0]?.c ?? 0),
      last30d,
      completedShare30d: last30d > 0 ? completed30 / last30d : 0,
    };
  },
  ["super-admin:convo-volume"],
  { revalidate: 300, tags: ["super-admin:agents"] }
);

export async function getAgentMetrics(): Promise<AgentMetrics> {
  const [fleet, archetypes, recentPassRate, topFailingScenarios, conversations] = await Promise.all([
    getFleetStatus().catch((): AgentFleetStatus => ({ total: 0, live: 0, draft: 0, test: 0, paused: 0 })),
    getArchetypeBreakdown().catch((): ArchetypeRow[] => []),
    getRecentPassRate().catch(() => null),
    getTopFailingScenarios().catch((): FailingScenarioRow[] => []),
    getConversationVolume().catch((): ConversationVolume => ({
      last24h: 0, last7d: 0, last30d: 0, completedShare30d: 0,
    })),
  ]);

  return {
    fleet,
    archetypes,
    recentPassRate,
    topFailingScenarios,
    conversations,
    computedAt: new Date().toISOString(),
  };
}
