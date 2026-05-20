// packages/crm/src/lib/proposals/check-tier-quota.ts
// 2026-05-19 — Proposal Builder tier gate. Spec open-question #5.
// Growth: 10/mo cap. Scale: unlimited. Free: blocked.

import { and, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { proposals } from "@/db/schema";

const GROWTH_MONTHLY_CAP = 10;

export type ProposalQuotaResult =
  | { allowed: true; remaining?: number }
  | { allowed: false; reason: string; capacity: number };

export function evaluateProposalQuota(input: {
  tier: string;
  proposalsThisMonth: number;
}): ProposalQuotaResult {
  if (input.tier === "scale") return { allowed: true };
  if (input.tier === "growth") {
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
