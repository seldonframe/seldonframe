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

import { getOrgId } from "@/lib/auth/helpers";
import { resolveBuilderAgency } from "@/lib/deployments/store";
import { shouldRedirectToBuyerAgent } from "@/lib/marketplace/buyer/buyer-surface-guard";

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

    // Resolve the two signals. A buyer deployment id doubles as the
    // hasBuyerDeployment signal AND the redirect target.
    const [agencyId, buyerDeploymentId] = await Promise.all([
      resolveBuilderAgency(orgId).catch(() => null),
      findFirstBuyerDeploymentId(orgId),
    ]);

    const decision = shouldRedirectToBuyerAgent({
      pathname,
      isAgencyOperator: Boolean(agencyId),
      hasBuyerDeployment: Boolean(buyerDeploymentId),
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
