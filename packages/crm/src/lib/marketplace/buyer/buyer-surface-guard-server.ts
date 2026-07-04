// Marketplace buyer onboarding — the server-side buyer-surface GUARD enforcer.
//
// The DB-backed wiring around the pure `shouldRedirectToBuyerAgent`. Called from
// the top of the agency surfaces (/clients/new, the agency dashboard) so a
// BUYER-only org is bounced to their "My Agent" home instead of the agency app.
//
// WHY a server-page guard (not proxy.ts): the buyer-vs-agency distinction needs a
// DB read (partner_agencies + the deployment's template `sourceListingId` stamp),
// and proxy.ts runs on the Edge with NO DB access. A guard at the top of the
// specific server pages is the most surgical, regression-safe option — it ADDS a
// redirect only for buyer-only orgs and leaves every agency-operator path
// untouched.
//
// FAIL-OPEN: any resolution error (no org, DB hiccup) simply does NOT redirect —
// a legitimate operator must never be locked out of their own dashboard by a
// guard error. The guard only ever ADDS a redirect for a positively-identified
// buyer-only org.

import { redirect } from "next/navigation";

import { getCurrentUser, getOrgId } from "@/lib/auth/helpers";
import { resolveBuilderAgency } from "@/lib/deployments/store";
import {
  isBuyerOnlyOrg,
  shouldRedirectToBuyerAgent,
} from "@/lib/marketplace/buyer/buyer-surface-guard";

/** Does this user own/belong to ANY org OTHER than `orgId`? Pure DB, no
 *  redirect logic — the escape hatch for the buyer-only classification (Bug
 *  3: a user must never be imprisoned in the buyer shell just because their
 *  currently-ACTIVE org happens to be buyer-only, when they own/belong to an
 *  agency or a claimed workspace elsewhere). Fail-open on error: returns
 *  `false` (i.e. "no known other orgs") so a DB hiccup here can only ever
 *  ADD the (already fail-open) buyer-only redirect, never remove it — the
 *  outer guard functions' own catch blocks are the actual fail-open net. */
async function resolveUserHasOtherOrgs(userId: string, orgId: string): Promise<boolean> {
  try {
    const { db } = await import("@/db");
    const { orgMembers, organizations } = await import("@/db/schema");
    const { and, eq, ne } = await import("drizzle-orm");

    const [ownedElsewhere] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(and(eq(organizations.ownerId, userId), ne(organizations.id, orgId)))
      .limit(1);
    if (ownedElsewhere?.id) return true;

    const [memberElsewhere] = await db
      .select({ orgId: orgMembers.orgId })
      .from(orgMembers)
      .where(and(eq(orgMembers.userId, userId), ne(orgMembers.orgId, orgId)))
      .limit(1);
    if (memberElsewhere?.orgId) return true;

    return false;
  } catch {
    return false;
  }
}

/** Resolve the caller org's FIRST buyer deployment id (a deployment whose cloned
 *  template is stamped `sourceListingId`), or null. Buyer-only orgs typically own
 *  exactly one. Lazy DB; returns null on any error (fail-open). */
async function findFirstBuyerDeploymentId(orgId: string): Promise<string | null> {
  try {
    const { db } = await import("@/db");
    const { deployments } = await import("@/db/schema/deployments");
    const { agentTemplates } = await import("@/db/schema/agent-templates");
    const { and, desc, eq, sql } = await import("drizzle-orm");
    const rows = await db
      .select({ id: deployments.id })
      .from(deployments)
      .innerJoin(agentTemplates, eq(agentTemplates.id, deployments.agentTemplateId))
      .where(
        and(
          eq(deployments.builderOrgId, orgId),
          eq(agentTemplates.builderOrgId, orgId),
          sql`${agentTemplates.blueprint} ->> 'sourceListingId' IS NOT NULL`,
        ),
      )
      .orderBy(desc(deployments.createdAt))
      .limit(1);
    return rows[0]?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Enforce the buyer-surface guard for `pathname`. If the current org is a
 * BUYER-only org (owns a buyer deployment, is not an agency operator) on an
 * agency surface, `redirect()` to their "My Agent" home (never returns).
 * Otherwise a no-op. Fail-open on any error.
 *
 * Call this near the TOP of an agency surface's server component (after its own
 * auth gate), e.g. `await enforceBuyerSurfaceGuard("/clients/new")`.
 */
export async function enforceBuyerSurfaceGuard(pathname: string): Promise<void> {
  let to: string | null = null;
  try {
    const orgId = await getOrgId();
    if (!orgId) return; // unauthenticated → the page's own auth gate handles it.

    const user = await getCurrentUser();
    const userId = user?.id ?? null;

    // Resolve the signals. A buyer deployment id doubles as the
    // hasBuyerDeployment signal AND the redirect target.
    const [agencyId, buyerDeploymentId, userHasOtherOrgs] = await Promise.all([
      resolveBuilderAgency(orgId).catch(() => null),
      findFirstBuyerDeploymentId(orgId),
      userId ? resolveUserHasOtherOrgs(userId, orgId) : Promise.resolve(false),
    ]);

    const decision = shouldRedirectToBuyerAgent({
      pathname,
      isAgencyOperator: Boolean(agencyId),
      hasBuyerDeployment: Boolean(buyerDeploymentId),
      userHasOtherOrgs,
      buyerDeploymentId,
    });
    if (decision.redirect) to = decision.to;
  } catch {
    return; // fail-open: never block a legitimate operator on a guard error.
  }
  // redirect() throws NEXT_REDIRECT — call it OUTSIDE the try so the guard's
  // catch never swallows the navigation.
  if (to) redirect(to);
}

/**
 * Enforce the buyer-surface guard for the AGENCY DASHBOARD SHELL — call this once
 * from the `(dashboard)` layout (the single chokepoint that renders the full
 * agency left-nav). Because that layout wraps ONLY agency surfaces, rendering it
 * at all is the signal: a BUYER-only org reaching ANY `(dashboard)` route is
 * `redirect()`-ed to their "My Agent" home — so they only ever see the minimal
 * buyer shell (Bug 2: hide every agency nav item a buyer can't use).
 *
 * Path-independent on purpose: no fragile pathname-from-headers read, and no way
 * for a single un-listed agency sub-route to leak through. Agency operators are
 * 100% unaffected — `isBuyerOnlyOrg` is false for anyone owning a partner_agencies
 * row. Fail-open on any error (a legitimate operator is never locked out).
 */
export async function enforceBuyerAgencyShellGuard(): Promise<void> {
  let to: string | null = null;
  try {
    const orgId = await getOrgId();
    if (!orgId) return; // unauthenticated → the layout's own auth gate handles it.

    const user = await getCurrentUser();
    const userId = user?.id ?? null;

    const [agencyId, buyerDeploymentId, userHasOtherOrgs] = await Promise.all([
      resolveBuilderAgency(orgId).catch(() => null),
      findFirstBuyerDeploymentId(orgId),
      userId ? resolveUserHasOtherOrgs(userId, orgId) : Promise.resolve(false),
    ]);

    const buyerOnly = isBuyerOnlyOrg({
      isAgencyOperator: Boolean(agencyId),
      hasBuyerDeployment: Boolean(buyerDeploymentId),
      userHasOtherOrgs,
    });
    // Only redirect when we have a concrete target (never emit a broken /agent/).
    if (buyerOnly && buyerDeploymentId) to = `/agent/${buyerDeploymentId}`;
  } catch {
    return; // fail-open: never block a legitimate operator on a guard error.
  }
  if (to) redirect(to);
}
