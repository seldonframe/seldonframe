// 2026-06-18 pricing migration — workspace-creation gate for the
// builder / workspace / agency ladder.
//
// The old Free-tier hard caps (50 contacts / 100 agent runs) are gone:
// there is no free tier, and the paid tiers are flat (unlimited
// contacts/runs). enforceContactLimit / enforceAgentRunLimit are kept
// as always-allow shims so existing call sites (the public intake POST,
// the agent dispatcher) keep compiling and never block.
//
// enforceWorkspaceLimit is the live gate:
//   inactive (no plan) = 0 full workspaces
//   builder            = 0 full workspaces (landing pages capped at 10
//                        separately via lib/tier/limits.ts)
//   workspace          = 1
//   agency             = unlimited (billed per-seat past 10)
//
// The tier resolver is injectable via `deps` so the gate is
// unit-testable without a DB (mirrors hasFeature's DI pattern).

import { normalizeTierId, type BillingTier } from "./features";
import { resolveTierForWorkspace } from "./tier-resolver";

export type LimitDecision =
  | { allowed: true; tier: BillingTier }
  | {
      allowed: false;
      tier: BillingTier;
      reason: "contact_limit_reached" | "agent_run_limit_reached" | "workspace_limit_reached";
      message: string;
      upgradeUrl: string;
      used: number;
      limit: number;
    };

export type WorkspaceLimitDeps = {
  /** Resolve the effective tier for an org. Injected in tests; the
   *  production default walks the agency chain via tier-resolver. */
  resolveTier: (orgId: string | null | undefined) => Promise<BillingTier>;
};

const defaultDeps: WorkspaceLimitDeps = {
  resolveTier: async (orgId) => normalizeTierId(await resolveTierForWorkspace(orgId)),
};

/** Full-workspace allowance per tier. builder + inactive get 0 (builder
 *  sells landing pages, not workspaces); workspace = 1; agency = -1
 *  (unlimited, overage billed per-seat past the included count). */
function maxFullWorkspacesForTier(tier: BillingTier): number {
  if (tier === "agency") return -1;
  if (tier === "workspace") return 1;
  return 0; // builder, inactive
}

/**
 * @deprecated No free tier → no contact hard cap. Always allows. Kept
 * so the public intake POST + contact-create paths keep compiling.
 */
export async function enforceContactLimit(orgId: string): Promise<LimitDecision> {
  const tier = normalizeTierId(await resolveTierForWorkspace(orgId));
  return { allowed: true, tier };
}

/**
 * @deprecated No free tier → no agent-run hard cap. Always allows.
 */
export async function enforceAgentRunLimit(orgId: string): Promise<LimitDecision> {
  const tier = normalizeTierId(await resolveTierForWorkspace(orgId));
  return { allowed: true, tier };
}

/**
 * Workspace-creation cap. builder/inactive = 0 full workspaces,
 * workspace = 1, agency = unlimited. The acting org's tier is resolved
 * from its primary org (walking the agency chain for managed
 * workspaces).
 */
export async function enforceWorkspaceLimit(
  params: {
    userId: string;
    primaryOrgId: string | null | undefined;
    ownedWorkspaceCount: number;
  },
  deps: WorkspaceLimitDeps = defaultDeps,
): Promise<LimitDecision> {
  const tier = params.primaryOrgId
    ? await deps.resolveTier(params.primaryOrgId)
    : "inactive";

  const cap = maxFullWorkspacesForTier(tier);

  if (cap === -1) return { allowed: true, tier };
  if (params.ownedWorkspaceCount < cap) return { allowed: true, tier };

  // Over (or at) the cap. 2026-06-22 magic first-run: the first workspace is
  // free on us, so the over-cap copy leads with that and points at the BYOK
  // + plan upgrade as the path to more — not a scolding "you're capped".
  const message =
    tier === "workspace"
      ? `Your first workspace is free. Add your Anthropic key and upgrade to spin up more client workspaces.`
      : tier === "builder"
        ? `Builder includes landing pages only. Upgrade to Workspace to create a full business workspace (CRM, booking, chatbot).`
        : `Your first workspace is free. Choose a plan to add more.`;

  return {
    allowed: false,
    tier,
    reason: "workspace_limit_reached",
    message,
    upgradeUrl: "/settings/billing",
    used: params.ownedWorkspaceCount,
    limit: cap,
  };
}

/** @deprecated No free tier → no free-usage banner. Always null. Kept
 *  so the dashboard banner caller keeps compiling. */
export async function getFreeTierUsageBannerData(_orgId: string): Promise<null> {
  return null;
}
