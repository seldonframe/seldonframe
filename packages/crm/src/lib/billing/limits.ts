// April 30, 2026 — free-tier hard caps + workspace creation gates.
//
// Three caps, one helper each:
//   - enforceContactLimit(orgId)   — used by the public intake POST
//     and any place that creates a contacts row. Returns
//     { allowed: false, message } when at limit on free; never blocks
//     paid tiers (they overflow into metered overage).
//   - enforceAgentRunLimit(orgId)  — used by the agent dispatcher
//     before creating a workflow_runs row. Same shape: free hard-caps,
//     paid tiers always allow (overage is metered).
//   - enforceWorkspaceLimit(userId) — used by the workspace creation
//     flows. Free = 1, Growth = 3, Scale = unlimited.
//
// We deliberately do NOT throw — callers branch on the returned shape
// so the UI can surface a consistent upgrade CTA. This also keeps the
// public intake form working when the workspace is at limit (the form
// still accepts submissions; the contact row just isn't created — the
// next slice will queue them for review when the operator upgrades).

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { normalizeTierId } from "./features";
import { getPlan, type TierId } from "./plans";
import { resolveTierForWorkspace } from "./tier-resolver";
import {
  getAgentRunsThisMonth,
  getCurrentContactCount,
} from "./usage";

export type LimitDecision =
  | { allowed: true; tier: TierId }
  | {
      allowed: false;
      tier: TierId;
      reason: "contact_limit_reached" | "agent_run_limit_reached" | "workspace_limit_reached";
      message: string;
      upgradeUrl: string;
      used: number;
      limit: number;
    };

async function loadOrgTier(orgId: string): Promise<TierId> {
  // 2026-05-17 — delegated to resolveTierForWorkspace, which walks the
  // parent_user_id chain for agency-managed workspaces (so a Scale-
  // paying operator's client workspaces inherit Scale automatically
  // instead of staying on free until manually backfilled). See
  // ./tier-resolver.ts header for the full resolution order.
  return resolveTierForWorkspace(orgId);
}

/**
 * Free-tier contacts cap. Returns `allowed: false` with an upgrade
 * message when the org has 50+ contacts and is on Free; paid tiers
 * always pass (overage is metered and billed per-contact on Growth,
 * unlimited on Scale).
 */
export async function enforceContactLimit(orgId: string): Promise<LimitDecision> {
  const tier = await loadOrgTier(orgId);
  if (tier !== "free") return { allowed: true, tier };

  const plan = getPlan("free")!;
  const cap = plan.limits.maxContacts; // 50
  const used = await getCurrentContactCount(orgId);

  if (used < cap) return { allowed: true, tier };

  return {
    allowed: false,
    tier,
    reason: "contact_limit_reached",
    message: `You've reached ${cap} contacts on the Free plan. Upgrade to Growth to keep adding clients.`,
    upgradeUrl: "/settings/billing",
    used,
    limit: cap,
  };
}

/**
 * Free-tier agent runs cap. Returns `allowed: false` with an upgrade
 * message when the org has 100+ workflow_runs this calendar month
 * and is on Free; paid tiers always pass (overage metered).
 */
export async function enforceAgentRunLimit(orgId: string): Promise<LimitDecision> {
  const tier = await loadOrgTier(orgId);
  if (tier !== "free") return { allowed: true, tier };

  const plan = getPlan("free")!;
  const cap = plan.limits.maxAgentRunsPerMonth; // 100
  const used = await getAgentRunsThisMonth(orgId);

  if (used < cap) return { allowed: true, tier };

  return {
    allowed: false,
    tier,
    reason: "agent_run_limit_reached",
    message: `Monthly agent run limit reached on the Free plan. Upgrade to Growth to continue running agents.`,
    upgradeUrl: "/settings/billing",
    used,
    limit: cap,
  };
}

/**
 * Workspace creation cap. Free = 1 workspace, Growth = 3, Scale =
 * unlimited. The user's tier is read from the user's "primary" org's
 * subscription (the org pointed to by users.orgId).
 *
 * 2026-05-27 — Copy revised for the deferred-card signup flow. Card
 * capture moved out of the mandatory signup chain (was a 100% drop-off);
 * the over-limit prompt is now the first place we ever ask the operator
 * to save a card. The copy reflects that change: instead of "Upgrade to
 * Growth" (jargony, implies a multi-tier choice the user hasn't seen
 * yet), free-tier users hit "add a card to unlock more workspaces" and
 * the upgradeUrl points at /signup/billing?next=/clients/new — the
 * existing SetupIntent page, now reached as an opt-in step. Paid-tier
 * upgrade copy (Growth → Scale) is unchanged because those users have
 * already seen the pricing matrix.
 */
export async function enforceWorkspaceLimit(params: {
  userId: string;
  primaryOrgId: string | null | undefined;
  ownedWorkspaceCount: number;
}): Promise<LimitDecision> {
  const tier = params.primaryOrgId
    ? await loadOrgTier(params.primaryOrgId)
    : "free";

  const plan = getPlan(tier) ?? getPlan("free")!;
  const cap = plan.limits.maxOrgs; // 1 / 3 / -1 (unlimited)

  if (cap === -1) return { allowed: true, tier };
  if (params.ownedWorkspaceCount < cap) return { allowed: true, tier };

  // Free-tier users — first ever ask to save a card. Route to the
  // existing /signup/billing SetupIntent page (now opt-in) instead of
  // /settings/billing so the visitor lands in a single-purpose surface
  // with the Stripe Elements card form already mounted. ?next=/clients/new
  // brings them straight back here after they save the card.
  if (tier === "free") {
    return {
      allowed: false,
      tier,
      reason: "workspace_limit_reached",
      message: `You've used ${params.ownedWorkspaceCount}/${cap} free workspace${cap === 1 ? "" : "s"} — add a card to unlock more.`,
      upgradeUrl: "/signup/billing?next=/clients/new",
      used: params.ownedWorkspaceCount,
      limit: cap,
    };
  }

  // Paid-tier upgrade prompt (Growth → Scale) keeps the old shape —
  // these users have already seen the pricing matrix and the
  // /settings/billing manager is the right surface for tier swaps.
  return {
    allowed: false,
    tier,
    reason: "workspace_limit_reached",
    message: `Workspace limit reached on the ${plan.name} plan (${cap} workspace${cap === 1 ? "" : "s"}). Upgrade to Scale for unlimited workspaces.`,
    upgradeUrl: "/settings/billing",
    used: params.ownedWorkspaceCount,
    limit: cap,
  };
}

/** Helper used by the dashboard's free-tier banner thresholds. Returns
 *  the percent-of-cap usage (clamped to 100) for display. */
export async function getFreeTierUsageBannerData(orgId: string) {
  const tier = await loadOrgTier(orgId);
  if (tier !== "free") return null;
  const [contactsUsed, runsUsed] = await Promise.all([
    getCurrentContactCount(orgId),
    getAgentRunsThisMonth(orgId),
  ]);
  const plan = getPlan("free")!;
  return {
    contactsUsed,
    contactsCap: plan.limits.maxContacts,
    contactsPercent: Math.min(100, Math.round((contactsUsed / plan.limits.maxContacts) * 100)),
    runsUsed,
    runsCap: plan.limits.maxAgentRunsPerMonth,
    runsPercent: Math.min(
      100,
      Math.round((runsUsed / plan.limits.maxAgentRunsPerMonth) * 100)
    ),
  };
}

