// packages/crm/src/lib/proposals/check-tier-quota.ts
// 2026-05-19 — Proposal Builder tier gate. Spec open-question #5.
// Growth: 10/mo cap. Scale: unlimited. Free: blocked.
//
// 2026-05-20 — production hotfix: production stores legacy plan IDs
// (cloud-pro, pro-3, etc.) that don't match the canonical free/growth/
// scale enum. Use the existing getPlan() resolver from lib/billing/plans
// to alias legacy IDs to current TierIds before quota evaluation.

import { and, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { proposals } from "@/db/schema";
import { getPlan } from "@/lib/billing/plans";

const GROWTH_MONTHLY_CAP = 10;

export type ProposalQuotaResult =
  | { allowed: true; remaining?: number }
  | { allowed: false; reason: string; capacity: number };

/** Normalize whatever string lives on users.planId into the canonical
 *  TierId space (free | growth | scale). Returns "free" for null /
 *  unknown so the gate fails closed. */
export function resolveTierId(planId: string | null | undefined): "free" | "growth" | "scale" {
  if (!planId) return "free";
  const plan = getPlan(planId);
  if (!plan) return "free";
  return plan.id;
}

export function evaluateProposalQuota(input: {
  tier: string;
  proposalsThisMonth: number;
}): ProposalQuotaResult {
  // Map any legacy / paid tier string to the canonical proposal tier
  // before branching. Callers may pass user.planId directly.
  const tier = resolveTierId(input.tier);

  if (tier === "scale") return { allowed: true };
  if (tier === "growth") {
    if (input.proposalsThisMonth >= GROWTH_MONTHLY_CAP) {
      return {
        allowed: false,
        reason: "monthly_quota_exceeded",
        capacity: GROWTH_MONTHLY_CAP,
      };
    }
    return { allowed: true, remaining: GROWTH_MONTHLY_CAP - input.proposalsThisMonth };
  }
  return { allowed: false, reason: "tier_does_not_include_proposals", capacity: 0 };
}

export async function countProposalsThisMonth(agencyOrgId: string): Promise<number> {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const rows = await db
    .select({ id: proposals.id })
    .from(proposals)
    .where(
      and(
        eq(proposals.agencyOrgId, agencyOrgId),
        gte(proposals.createdAt, monthStart),
      ),
    );
  return rows.length;
}
