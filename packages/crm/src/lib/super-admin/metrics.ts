// v1.35.0 — Super-admin hero metrics.
//
// Four numbers above the fold. Each one is the smallest cut of "is
// the business healthy today" that compounds into useful decisions.
//
//   MRR                 SF's monthly recurring revenue, computed
//                       from users.planId × plan.price. Stripe is
//                       the source of truth; this is a fast local
//                       approximation. Drift fix in v1.35.4 when
//                       we wire the Stripe API.
//   ARR                 MRR × 12. Trivial; just a more legible big
//                       number for the slack screenshot.
//   Paid signups (7d)   Count of users who moved to a paid plan in
//                       the last 7 days. Leading indicator of MRR
//                       direction.
//   Active workspaces   Distinct organizations with any activity in
//   (24h)               the last 24 hours. The "are operators
//                       actually using it" pulse.
//
// Each query is a single SELECT. All wrapped in `unstable_cache` with
// a 5-minute TTL — the dashboard refreshes on visit but doesn't hit
// the DB on every render. Tagged for revalidation when we wire
// up admin actions in later phases.

import { sql, gte, and, ne, count, countDistinct } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/db";
import { users, organizations, activities } from "@/db/schema";
import { PLANS } from "@/lib/billing/plans";

export type HeroMetric = {
  /** Display label for the card. */
  label: string;
  /** Pre-formatted value (e.g. "$1,247" or "12"). */
  value: string;
  /** Optional sub-label below the value (e.g. "across 43 paid users"). */
  subtitle?: string;
  /** Whether the underlying source returned data. False renders a
   *  "Configure" hint instead of a number. */
  ready: boolean;
};

export type HeroMetrics = {
  mrr: HeroMetric;
  arr: HeroMetric;
  paidSignupsLast7d: HeroMetric;
  activeWorkspacesLast24h: HeroMetric;
  /** When the data was computed (server time). UI shows "5 min ago"
   *  so admins know they're looking at cached data. */
  computedAt: string;
};

const PLAN_PRICES: Record<string, number> = Object.fromEntries(
  PLANS.filter((p) => p.type === "paid").map((p) => [p.id, p.price])
);

const PAID_PLAN_IDS = Object.keys(PLAN_PRICES);

const getMrrData = unstable_cache(
  async () => {
    // Group paid users by planId, multiply by plan price.
    // Stripe overage is excluded from this v1.35.0 cut — base
    // subscription revenue is the headline number; usage MRR
    // graduates in v1.35.4.
    const rows = await db
      .select({
        planId: users.planId,
        userCount: count(users.id),
      })
      .from(users)
      .where(sql`${users.planId} IN (${sql.join(PAID_PLAN_IDS.map((id) => sql`${id}`), sql`, `)})`)
      .groupBy(users.planId);

    let totalMrr = 0;
    let totalPaidUsers = 0;
    for (const row of rows) {
      if (!row.planId) continue;
      const price = PLAN_PRICES[row.planId] ?? 0;
      totalMrr += price * row.userCount;
      totalPaidUsers += row.userCount;
    }

    return { mrrCents: totalMrr * 100, paidUsers: totalPaidUsers };
  },
  ["super-admin:mrr"],
  { revalidate: 300, tags: ["super-admin:billing"] }
);

const getPaidSignupsLast7d = unstable_cache(
  async () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [row] = await db
      .select({ value: count(users.id) })
      .from(users)
      .where(
        and(
          sql`${users.planId} IN (${sql.join(PAID_PLAN_IDS.map((id) => sql`${id}`), sql`, `)})`,
          gte(users.createdAt, sevenDaysAgo)
        )
      );
    return row?.value ?? 0;
  },
  ["super-admin:paid-signups-7d"],
  { revalidate: 300, tags: ["super-admin:billing"] }
);

const getActiveWorkspacesLast24h = unstable_cache(
  async () => {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [row] = await db
      .select({ value: countDistinct(activities.orgId) })
      .from(activities)
      .where(gte(activities.createdAt, twentyFourHoursAgo));
    return row?.value ?? 0;
  },
  ["super-admin:active-workspaces-24h"],
  { revalidate: 300, tags: ["super-admin:activity"] }
);

const getTotalWorkspaces = unstable_cache(
  async () => {
    const [row] = await db.select({ value: count(organizations.id) }).from(organizations);
    return row?.value ?? 0;
  },
  ["super-admin:total-workspaces"],
  { revalidate: 300, tags: ["super-admin:activity"] }
);

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

export async function getHeroMetrics(): Promise<HeroMetrics> {
  const [mrrData, paidSignups, activeWs, totalWs] = await Promise.all([
    getMrrData().catch(() => ({ mrrCents: 0, paidUsers: 0 })),
    getPaidSignupsLast7d().catch(() => 0),
    getActiveWorkspacesLast24h().catch(() => 0),
    getTotalWorkspaces().catch(() => 0),
  ]);

  return {
    mrr: {
      label: "MRR",
      value: formatCurrency(mrrData.mrrCents),
      subtitle: mrrData.paidUsers
        ? `across ${formatNumber(mrrData.paidUsers)} paid user${mrrData.paidUsers === 1 ? "" : "s"}`
        : "no paid users yet",
      ready: true,
    },
    arr: {
      label: "ARR",
      value: formatCurrency(mrrData.mrrCents * 12),
      subtitle: "MRR × 12",
      ready: true,
    },
    paidSignupsLast7d: {
      label: "Paid signups · 7d",
      value: formatNumber(paidSignups),
      subtitle: paidSignups > 0 ? "leading indicator of MRR" : "convert someone this week",
      ready: true,
    },
    activeWorkspacesLast24h: {
      label: "Active workspaces · 24h",
      value: formatNumber(activeWs),
      subtitle: totalWs ? `of ${formatNumber(totalWs)} total (${Math.round((activeWs / totalWs) * 100)}%)` : "no workspaces yet",
      ready: true,
    },
    computedAt: new Date().toISOString(),
  };
}
