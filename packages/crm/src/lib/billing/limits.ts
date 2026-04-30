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
  if (!orgId) return "free";
  const [row] = await db
    .select({ subscription: organizations.subscription, plan: organizations.plan })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!row) return "free";
  // Prefer subscription.tier (set by the webhook on every event),
  // fall back to the column-level `plan` field.
  return normalizeTierId(row.subscription?.tier ?? row.plan ?? "free");
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

  const upgradeTarget = tier === "free" ? "Growth" : "Scale";
  const upgradeBenefit =
    tier === "free"
      ? "up to 3 workspaces"
      : "unlimited workspaces";

  return {
    allowed: false,
    tier,
    reason: "workspace_limit_reached",
    message: `Workspace limit reached on the ${plan.name} plan (${cap} workspace${cap === 1 ? "" : "s"}). Upgrade to ${upgradeTarget} for ${upgradeBenefit}.`,
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

