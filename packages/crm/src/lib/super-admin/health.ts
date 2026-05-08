// v1.35.5 — Super-admin platform health.
//
// What's available locally without instrumenting Sentry/Datadog:
//
//   1. Workflow run health   — workflow_runs status distribution
//                              (Vercel Workflows + the durable
//                              archetype runtime) + recent failures
//   2. Event volume          — seldonframe_events counts per day,
//                              last 7 days
//   3. Top events            — which product events fire most
//   4. Validator health      — share of agent turns with any failed
//                              validator (the v1.28.6 critical-fail
//                              architecture's signal)
//
// Future ships (v1.35.5.x): Sentry-backed API error rate, p95/p99
// latency from Vercel Analytics, LLM provider observed uptime.

import { sql, eq, count, desc } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/db";
import { workflowRuns, seldonframeEvents, agentTurns } from "@/db/schema";

export type WorkflowHealthRow = {
  status: string;
  count: number;
};

export type RecentFailedWorkflowRow = {
  id: string;
  archetypeId: string;
  orgId: string;
  status: string;
};

export type DailyEventBucket = {
  /** ISO date (YYYY-MM-DD). */
  day: string;
  count: number;
};

export type TopEventRow = {
  event: string;
  count: number;
};

export type HealthMetrics = {
  workflows: {
    distribution: WorkflowHealthRow[];
    total: number;
    completed: number;
    failed: number;
    /** Share of terminal runs that completed successfully, 0–1.
     *  Null when there are no terminal runs yet. */
    successRate: number | null;
    recentFailed: RecentFailedWorkflowRow[];
  };
  events: {
    last7DaysByDay: DailyEventBucket[];
    topLast7Days: TopEventRow[];
    /** Total events in the last 7d. */
    total7d: number;
  };
  validators: {
    /** Sample size — agent turns inspected. */
    sampleSize: number;
    /** Turns where any validator returned passed=false, 0–1.
     *  Null when sample is too small. */
    failureRate: number | null;
  };
  computedAt: string;
};

const getWorkflowHealth = unstable_cache(
  async () => {
    const rows = await db
      .select({ status: workflowRuns.status, c: count(workflowRuns.id) })
      .from(workflowRuns)
      .groupBy(workflowRuns.status);

    const distribution: WorkflowHealthRow[] = rows.map((r) => ({
      status: r.status,
      count: Number(r.c),
    }));

    let total = 0;
    let completed = 0;
    let failed = 0;
    for (const r of distribution) {
      total += r.count;
      if (r.status === "completed") completed = r.count;
      if (r.status === "failed") failed = r.count;
    }

    const terminalCount = completed + failed;
    const successRate = terminalCount > 0 ? completed / terminalCount : null;

    const recentFailed = await db
      .select({
        id: workflowRuns.id,
        archetypeId: workflowRuns.archetypeId,
        orgId: workflowRuns.orgId,
        status: workflowRuns.status,
      })
      .from(workflowRuns)
      .where(eq(workflowRuns.status, "failed"))
      .limit(10);

    return {
      distribution,
      total,
      completed,
      failed,
      successRate,
      recentFailed: recentFailed.map((r) => ({
        id: r.id,
        archetypeId: r.archetypeId,
        orgId: r.orgId,
        status: r.status,
      })),
    };
  },
  ["super-admin:health-workflows"],
  { revalidate: 300, tags: ["super-admin:health"] }
);

const getEventHealth = unstable_cache(
  async () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Group by day. Postgres date_trunc handles the bucketing in one query.
    const dayRows = await db.execute(sql`
      SELECT
        TO_CHAR(DATE_TRUNC('day', ${seldonframeEvents.createdAt}), 'YYYY-MM-DD') as day,
        COUNT(*)::int as c
      FROM ${seldonframeEvents}
      WHERE ${seldonframeEvents.createdAt} >= ${sevenDaysAgo}
      GROUP BY 1
      ORDER BY 1
    `);
    const dayMap = new Map<string, number>();
    for (const r of (dayRows.rows ?? []) as Array<{ day: string; c: number }>) {
      dayMap.set(r.day, Number(r.c));
    }

    // Fill in missing days with 0
    const last7DaysByDay: DailyEventBucket[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      last7DaysByDay.push({ day: key, count: dayMap.get(key) ?? 0 });
    }

    // Top events by count, last 7 days
    const topRows = await db
      .select({ event: seldonframeEvents.event, c: count(seldonframeEvents.id) })
      .from(seldonframeEvents)
      .where(sql`${seldonframeEvents.createdAt} >= ${sevenDaysAgo}`)
      .groupBy(seldonframeEvents.event)
      .orderBy(desc(count(seldonframeEvents.id)))
      .limit(10);

    return {
      last7DaysByDay,
      topLast7Days: topRows.map((r) => ({ event: r.event, count: Number(r.c) })),
      total7d: last7DaysByDay.reduce((sum, b) => sum + b.count, 0),
    };
  },
  ["super-admin:health-events"],
  { revalidate: 300, tags: ["super-admin:health"] }
);

const getValidatorHealth = unstable_cache(
  async () => {
    // Sample the last 1000 assistant turns; share with any failed
    // validator. Approximation — full sweep would be expensive at
    // scale and the recent sample is what matters anyway.
    const rows = await db.execute(sql`
      WITH recent AS (
        SELECT
          ${agentTurns.id} as id,
          ${agentTurns.validatorsPassed} as validators_passed
        FROM ${agentTurns}
        WHERE ${agentTurns.role} = 'assistant'
        ORDER BY ${agentTurns.createdAt} DESC
        LIMIT 1000
      )
      SELECT
        COUNT(*)::int as sample_size,
        SUM(
          CASE
            WHEN EXISTS (
              SELECT 1 FROM jsonb_array_elements(validators_passed) v
              WHERE (v->>'passed')::boolean = false
            ) THEN 1 ELSE 0
          END
        )::int as fails
      FROM recent
    `);
    const r = rows.rows?.[0] as { sample_size: number; fails: number } | undefined;
    const sampleSize = Number(r?.sample_size ?? 0);
    const fails = Number(r?.fails ?? 0);
    return {
      sampleSize,
      failureRate: sampleSize >= 20 ? fails / sampleSize : null,
    };
  },
  ["super-admin:health-validators"],
  { revalidate: 300, tags: ["super-admin:health"] }
);

export async function getHealthMetrics(): Promise<HealthMetrics> {
  const [workflows, events, validators] = await Promise.all([
    getWorkflowHealth().catch(() => ({
      distribution: [] as WorkflowHealthRow[],
      total: 0,
      completed: 0,
      failed: 0,
      successRate: null,
      recentFailed: [] as RecentFailedWorkflowRow[],
    })),
    getEventHealth().catch(() => ({
      last7DaysByDay: [] as DailyEventBucket[],
      topLast7Days: [] as TopEventRow[],
      total7d: 0,
    })),
    getValidatorHealth().catch(() => ({ sampleSize: 0, failureRate: null })),
  ]);

  return {
    workflows,
    events,
    validators,
    computedAt: new Date().toISOString(),
  };
}
