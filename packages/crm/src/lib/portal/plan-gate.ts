// Portal plan gating — May 1, 2026.
//
// The Client Portal is a Growth/Scale tier feature. Free workspaces
// can't enable it (the operator UI shows a disabled toggle + upgrade
// CTA). This module is the single source of truth for the gate so the
// operator settings UI, the per-contact toggle, and the auth flow all
// agree on who's allowed.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { canUseClientPortal } from "@/lib/billing/entitlements";
import { resolvePlanFromPlanId } from "@/lib/billing/entitlements";
import { normalizeTierId } from "@/lib/billing/features";

export interface PortalGateResult {
  allowed: boolean;
  /** Stored tier (free / growth / scale / legacy aliases). */
  tier: string;
  /** Operator-facing message when allowed === false. */
  reason?: string;
}

/**
 * Decide whether the workspace's tier allows the Client Portal.
 * Returns `{ allowed: true }` for Growth + Scale; otherwise denies
 * with a short upgrade message.
 *
 * Backward compat: legacy tier strings (cloud_pro, pro_3, etc.) are
 * normalized via normalizeTierId — grandfathered customers keep portal
 * access without a re-tier event.
 */
export async function checkPortalPlanGate(orgId: string): Promise<PortalGateResult> {
  if (!orgId) {
    return { allowed: false, tier: "free", reason: "missing_org_id" };
  }

  const [row] = await db
    .select({ subscription: organizations.subscription, plan: organizations.plan })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!row) return { allowed: false, tier: "free", reason: "org_not_found" };

  const storedTier = row.subscription?.tier ?? row.plan ?? "free";
  const tier = normalizeTierId(storedTier);
  // canUseClientPortal returns true on growth + scale via the entitlements
  // helper (plan.limits.clientPortal).
  const plan = resolvePlanFromPlanId(tier);
  const allowed = canUseClientPortal(plan);

  if (allowed) return { allowed: true, tier };

  return {
    allowed: false,
    tier,
    reason:
      "The client portal is a Growth ($29/mo) or Scale ($99/mo) feature. Upgrade your workspace to enable portal access.",
  };
}
