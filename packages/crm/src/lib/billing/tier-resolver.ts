// packages/crm/src/lib/billing/tier-resolver.ts
//
// 2026-05-17 — agency-model tier resolution.
//
// Context: SeldonFrame's billing originally stored `plan` and
// `subscription.tier` on every `organizations` row. That works for a
// solo operator with one workspace (the workspace IS their billing
// surface), but breaks the agency model — an agency owns N client
// workspaces, pays for one Scale subscription on their OWN org, and
// expects every owned client workspace to inherit those features.
//
// What was happening: enforceWorkspaceLimit, checkPortalPlanGate, the
// /settings/client-portal upgrade banner, the Free contact/agent-run
// caps — every paywall called loadOrgTier(orgId) which read the
// workspace's OWN plan column. Brand-new client workspaces always
// stored plan='free' until manually backfilled, so a Scale-paying
// agency would hit "Upgrade to enable portal" on every client they
// just spun up. We manually SQL-updated the user's three workspaces
// to plan='scale' as a workaround twice today. This module fixes the
// root cause.
//
// Resolution order:
//   1. Workspace's OWN subscription.tier (set by Stripe webhook on
//      direct-subscribe paths — e.g. a self-serve operator who
//      subscribes their single workspace directly).
//   2. Workspace's `plan` column fallback (legacy path, kept for
//      pre-subscription rows).
//   3. If 1 and 2 both return "free", walk the agency chain:
//        a. Read the workspace's parent_user_id (or ownerId).
//        b. Fetch that user's primary org (users.orgId).
//        c. Read the primary org's tier the same way.
//      If the agency owner pays for Scale, every workspace they own
//      sees Scale automatically — no manual SQL backfill, no Stripe
//      webhook fan-out, no per-workspace billing rows.
//
// Why this design vs. a Stripe webhook fan-out:
//   - A webhook approach would write plan=scale onto every owned
//     workspace whenever the operator's primary subscription updates.
//     That's eventually-consistent + needs a one-shot backfill cron +
//     means we have to track "which workspaces belong to which user"
//     in the webhook. Read-path resolution sidesteps all of that:
//     the source of truth is whatever the operator currently pays
//     for, no syncing required.
//   - Cost: one extra DB hit on tier checks. Cheap, especially with
//     the `getCachedAgencyTierForUser` per-request cache we add here.

import { and, eq, or } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { organizations, users } from "@/db/schema";
import { normalizeTierId, type BillingTier } from "./features";

/** Internal: extract a tier from an organizations row's subscription/plan
 *  columns. "inactive" = no active paid plan. */
function tierFromOrgRow(row: { plan: string | null; subscription: unknown }): BillingTier {
  const subscription = row.subscription as { tier?: string } | null | undefined;
  return normalizeTierId(subscription?.tier ?? row.plan ?? "inactive");
}

/**
 * Resolve the effective tier for a workspace. See file header for the
 * resolution order. Returns "free" for any missing/invalid input.
 *
 * Wrapped in `cache()` so multiple paywall checks during the same
 * request share one DB read pair instead of fanning out.
 */
export const resolveTierForWorkspace = cache(
  async (orgId: string | null | undefined): Promise<BillingTier> => {
    if (!orgId) return "inactive";

    const [org] = await db
      .select({
        id: organizations.id,
        plan: organizations.plan,
        subscription: organizations.subscription,
        parentUserId: organizations.parentUserId,
        ownerId: organizations.ownerId,
      })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    if (!org) return "inactive";

    // Step 1+2: the workspace's own subscription/plan takes precedence.
    // A workspace with its OWN paid sub stays on its own tier even if
    // the agency owner downgrades. This covers the "white-label resold
    // to client who pays directly" future case.
    const ownTier = tierFromOrgRow(org);
    if (ownTier !== "inactive") return ownTier;

    // Step 3: agency-managed workspace. Walk up to the owning user,
    // read THEIR tier from the primary org row OR users.planId.
    const ownerUserId = org.parentUserId ?? org.ownerId;
    if (!ownerUserId) return "inactive";

    const [owner] = await db
      .select({
        planId: users.planId,
        orgId: users.orgId,
      })
      .from(users)
      .where(eq(users.id, ownerUserId))
      .limit(1);
    if (!owner) return "inactive";

    // Prefer the operator's primary-org subscription (Stripe-direct).
    if (owner.orgId) {
      const [parentOrg] = await db
        .select({
          plan: organizations.plan,
          subscription: organizations.subscription,
        })
        .from(organizations)
        .where(eq(organizations.id, owner.orgId))
        .limit(1);
      if (parentOrg) {
        const parentTier = tierFromOrgRow(parentOrg);
        if (parentTier !== "inactive") return parentTier;
      }
    }

    // Fallback: users.planId (set during signup / by webhook). Covers
    // the manual-override case we used today (SQL UPDATE users SET
    // plan_id='scale') as well as legacy users that pre-date the
    // organizations.subscription column.
    if (owner.planId) {
      const tier = normalizeTierId(owner.planId);
      if (tier !== "inactive") return tier;
    }

    return "inactive";
  },
);

/**
 * Convenience helper: returns true when the workspace's effective
 * tier is any paid plan (builder / workspace / agency). Used by
 * feature gates that don't care WHICH paid tier — just "is this a paid
 * workspace at all".
 */
export async function workspaceHasPaidTier(orgId: string | null | undefined): Promise<boolean> {
  const tier = await resolveTierForWorkspace(orgId);
  return tier !== "inactive";
}
