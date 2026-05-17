// Portal plan gating — May 1, 2026.
//
// The Client Portal is a Growth/Scale tier feature. Free workspaces
// can't enable it (the operator UI shows a disabled toggle + upgrade
// CTA). This module is the single source of truth for the gate so the
// operator settings UI, the per-contact toggle, and the auth flow all
// agree on who's allowed.

import { canUseClientPortal } from "@/lib/billing/entitlements";
import { resolvePlanFromPlanId } from "@/lib/billing/entitlements";
import { resolveTierForWorkspace } from "@/lib/billing/tier-resolver";

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

  // 2026-05-17 — delegated to resolveTierForWorkspace so agency-managed
  // client workspaces inherit the agency operator's tier instead of
  // their own (always-free) row. Fixes "Upgrade to enable portal"
  // appearing on every new client workspace despite the operator
  // paying Scale.
  const tier = await resolveTierForWorkspace(orgId);
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
