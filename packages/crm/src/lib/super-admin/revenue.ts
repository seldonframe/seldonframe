// v1.35.4 — Super-admin revenue metrics.
//
// Local-DB-sourced for speed. Stripe API direct (source of truth)
// graduates in v1.35.4.x — for now this gives Maxime the right
// shape of the data within ~50ms.
//
// Views:
//
//  1. MRR by plan       — Free / Growth / Scale headcount + $ contribution
//  2. MRR over time     — Monthly MRR snapshot for the last 12 months
//                         (approximation: each signup added their
//                         current plan's MRR at signup; doesn't model
//                         downgrades/churn yet)
//  3. Conversion funnel — Signups → first workspace → published agent
//                         → paid plan, as counts + step % retained
//  4. Recent paid       — Last 20 users on Growth or Scale, by createdAt

import { sql, and, eq, desc, count, gte } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/db";
import { users, organizations, agents } from "@/db/schema";
import { PLANS } from "@/lib/billing/plans";

const PLAN_PRICES: Record<string, number> = Object.fromEntries(
  PLANS.filter((p) => p.type === "paid").map((p) => [p.id, p.price])
);
const PAID_PLAN_IDS = Object.keys(PLAN_PRICES);

export type PlanBreakdownRow = {
  planId: string;
  planLabel: string;
  userCount: number;
  monthlyDollars: number;
};

export type FunnelRow = {
  step: string;
  count: number;
  /** Share of the previous step's count, 0–1. Null on the first step. */
  retainedFromPrevious: number | null;
};

export type MonthlyMrrRow = {
  /** First day of the month, ISO date. */
  month: string;
  monthLabel: string;
  mrrDollars: number;
};

export type RecentPaidRow = {
  id: string;
  email: string;
  name: string;
  planId: string;
  planLabel: string;
  createdAt: string;
};

export type RevenueMetrics = {
  totalMrrDollars: number;
  totalArrDollars: number;
  totalPaidUsers: number;
  byPlan: PlanBreakdownRow[];
  funnel: FunnelRow[];
  monthly: MonthlyMrrRow[];
  recentPaid: RecentPaidRow[];
  computedAt: string;
};

const PLAN_LABEL: Record<string, string> = Object.fromEntries(
  PLANS.map((p) => [p.id, p.name])
);

const getByPlan = unstable_cache(
  async (): Promise<{
    rows: PlanBreakdownRow[];
    totalMrr: number;
    totalPaid: number;
  }> => {
    const groupRows = await db
      .select({ planId: users.planId, c: count(users.id) })
      .from(users)
      .groupBy(users.planId);

    const rows: PlanBreakdownRow[] = [];
    let totalMrr = 0;
    let totalPaid = 0;
    for (const r of groupRows) {
      const planId = r.planId ?? "free";
      const userCount = Number(r.c);
      const price = PLAN_PRICES[planId] ?? 0;
      const monthly = price * userCount;
      if (price > 0) {
        totalMrr += monthly;
        totalPaid += userCount;
      }
      rows.push({
        planId,
        planLabel: PLAN_LABEL[planId] ?? planId,
        userCount,
        monthlyDollars: monthly,
      });
    }
    // Stable order: free first, then by price asc
    rows.sort((a, b) => {
      const pa = PLAN_PRICES[a.planId] ?? 0;
      const pb = PLAN_PRICES[b.planId] ?? 0;
      return pa - pb;
    });
    return { rows, totalMrr, totalPaid };
  },
  ["super-admin:revenue-by-plan"],
  { revalidate: 300, tags: ["super-admin:revenue"] }
);

const getFunnel = unstable_cache(
  async (): Promise<FunnelRow[]> => {
    const [signupRow] = await db.select({ c: count(users.id) }).from(users);
    const totalSignups = Number(signupRow?.c ?? 0);

    // Distinct users who own at least one workspace
    const [createdWsRow] = await db
      .select({ c: sql<number>`COUNT(DISTINCT ${organizations.ownerId})::int` })
      .from(organizations)
      .where(sql`${organizations.ownerId} IS NOT NULL`);
    const createdWorkspace = Number(createdWsRow?.c ?? 0);

    // Distinct ownerIds whose orgs have any agent published
    const publishedResult = await db.execute(sql`
      SELECT COUNT(DISTINCT o.owner_id)::int as c
      FROM ${organizations} o
      INNER JOIN ${agents} a ON a.org_id = o.id
      WHERE o.owner_id IS NOT NULL
    `);
    const publishedAgent = Number(
      (publishedResult.rows?.[0] as { c: number } | undefined)?.c ?? 0
    );

    // Users on a paid plan
    const [paidRow] = await db
      .select({ c: count(users.id) })
      .from(users)
      .where(sql`${users.planId} IN (${sql.join(PAID_PLAN_IDS.map((id) => sql`${id}`), sql`, `)})`);
    const paidUsers = Number(paidRow?.c ?? 0);

    const stepCounts = [
      { step: "Signed up", count: totalSignups },
      { step: "Created a workspace", count: createdWorkspace },
      { step: "Has at least 1 agent", count: publishedAgent },
      { step: "Upgraded to paid", count: paidUsers },
    ];

    return stepCounts.map((s, i) => ({
      ...s,
      retainedFromPrevious:
        i === 0
          ? null
          : stepCounts[i - 1].count > 0
          ? s.count / stepCounts[i - 1].count
          : 0,
    }));
  },
  ["super-admin:revenue-funnel"],
  { revalidate: 300, tags: ["super-admin:revenue"] }
);

const getMonthlyMrr = unstable_cache(
  async (): Promise<MonthlyMrrRow[]> => {
    // 12 months of MRR snapshots. Approximation: at month M end,
    // count paid users with createdAt <= M-end and multiply by their
    // current plan price. Doesn't model downgrades / churn — those
    // come with the Stripe API integration in v1.35.4.x.
    const months: MonthlyMrrRow[] = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const rows = await db
        .select({ planId: users.planId, c: count(users.id) })
        .from(users)
        .where(
          and(
            sql`${users.planId} IN (${sql.join(PAID_PLAN_IDS.map((id) => sql`${id}`), sql`, `)})`,
            sql`${users.createdAt} <= ${monthEnd}`
          )
        )
        .groupBy(users.planId);

      let mrr = 0;
      for (const r of rows) {
        const price = PLAN_PRICES[r.planId ?? ""] ?? 0;
        mrr += price * Number(r.c);
      }
      months.push({
        month: monthStart.toISOString().slice(0, 10),
        monthLabel: monthStart.toLocaleDateString(undefined, { month: "short", year: "2-digit" }),
        mrrDollars: mrr,
      });
    }
    return months;
  },
  ["super-admin:revenue-monthly"],
  { revalidate: 300, tags: ["super-admin:revenue"] }
);

const getRecentPaid = unstable_cache(
  async (): Promise<RecentPaidRow[]> => {
    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        planId: users.planId,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(sql`${users.planId} IN (${sql.join(PAID_PLAN_IDS.map((id) => sql`${id}`), sql`, `)})`)
      .orderBy(desc(users.createdAt))
      .limit(20);

    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name,
      planId: r.planId ?? "",
      planLabel: r.planId ? PLAN_LABEL[r.planId] ?? r.planId : "",
      createdAt: r.createdAt.toISOString(),
    }));
  },
  ["super-admin:revenue-recent-paid"],
  { revalidate: 300, tags: ["super-admin:revenue"] }
);

export async function getRevenueMetrics(): Promise<RevenueMetrics> {
  const [byPlan, funnel, monthly, recentPaid] = await Promise.all([
    getByPlan().catch(() => ({ rows: [] as PlanBreakdownRow[], totalMrr: 0, totalPaid: 0 })),
    getFunnel().catch((): FunnelRow[] => []),
    getMonthlyMrr().catch((): MonthlyMrrRow[] => []),
    getRecentPaid().catch((): RecentPaidRow[] => []),
  ]);

  return {
    totalMrrDollars: byPlan.totalMrr,
    totalArrDollars: byPlan.totalMrr * 12,
    totalPaidUsers: byPlan.totalPaid,
    byPlan: byPlan.rows,
    funnel,
    monthly,
    recentPaid,
    computedAt: new Date().toISOString(),
  };
}
