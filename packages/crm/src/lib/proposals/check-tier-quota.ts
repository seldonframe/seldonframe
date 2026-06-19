// packages/crm/src/lib/proposals/check-tier-quota.ts
// 2026-05-19 — Proposal Builder tier gate. Spec open-question #5.
//
// 2026-06-18 pricing migration — remapped to the builder/workspace/
// agency ladder:
//   Agency:    unlimited proposals.
//   Workspace: 10/mo cap (the single-workspace operator can still pitch).
//   Builder / no-plan: blocked (proposals are a workspace+ feature).
//
// Production may store legacy plan IDs (cloud-pro, pro-3, growth, etc.);
// getPlan() aliases them to current TierIds before quota evaluation.

import { and, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { proposals } from "@/db/schema";
import { getPlan, type TierId } from "@/lib/billing/plans";

const WORKSPACE_MONTHLY_CAP = 10;

export type ProposalQuotaResult =
  | { allowed: true; remaining?: number }
  | { allowed: false; reason: string; capacity: number };

/** Normalize whatever string lives on users.planId into the offered
 *  TierId space (builder | workspace | agency), or null when there's no
 *  active plan / unknown id, so the gate fails closed. */
export function resolveTierId(planId: string | null | undefined): TierId | null {
  if (!planId) return null;
  const plan = getPlan(planId);
  return plan?.id ?? null;
}

export function evaluateProposalQuota(input: {
  tier: string;
  proposalsThisMonth: number;
}): ProposalQuotaResult {
  // Map any legacy / paid tier string to the canonical proposal tier
  // before branching. Callers may pass user.planId directly.
  const tier = resolveTierId(input.tier);

  if (tier === "agency") return { allowed: true };
  if (tier === "workspace") {
    if (input.proposalsThisMonth >= WORKSPACE_MONTHLY_CAP) {
      return {
        allowed: false,
        reason: "monthly_quota_exceeded",
        capacity: WORKSPACE_MONTHLY_CAP,
      };
    }
    return { allowed: true, remaining: WORKSPACE_MONTHLY_CAP - input.proposalsThisMonth };
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
