import { auth } from "@/auth";
import type { Session } from "next-auth";
import { and, eq, or } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { orgMembers, organizations, partnerAgencies, users } from "@/db/schema";
import {
  isAdminTokenUserId,
  resolveAdminTokenContext,
} from "./admin-token";
import {
  isOperatorPortalUserId,
  resolveOperatorPortalContext,
} from "./operator-portal-context";

/**
 * Server components and route handlers can authenticate via THREE sources:
 *   1. NextAuth session (interactive login)
 *   2. Admin-token cookie (set by /admin/[workspaceId]?token=wst_…)
 *   3. v1.25.0 — Operator-portal session (sf_operator_session cookie).
 *      Set by the magic-link verifier in lib/operator-portal/auth.ts
 *      OR by createAgencySupportSession. Yields a synthetic Session-
 *      shaped object whose user.id carries the
 *      `__sf_operator_portal__:` prefix; downstream code that mutates
 *      the users table can no-op for these sessions via
 *      isOperatorPortalUserId, mirroring the admin-token treatment.
 *
 * Resolution order: NextAuth → operator portal → admin-token.
 * Operator portal precedes admin-token because the magic-link flow
 * is the dominant white-label entry path.
 */
export async function getCurrentUser() {
  // v1.25.2 — operator-portal session takes PRECEDENCE over NextAuth
  // when the cookie is explicitly set. Reason: when a user clicks
  // an operator magic link, their intent is clearly to use the
  // operator portal — even if they happen to have a stale NextAuth
  // session in the same browser (common: tried /signup earlier and
  // got the verification error but still got a partial NextAuth
  // cookie set; or this is the SF agency operator opening their
  // client's portal in the same browser as their own dashboard).
  // Operator cookie wins if present + valid; falls through to
  // NextAuth otherwise.
  const opCtx = await resolveOperatorPortalContext();
  if (opCtx) return opCtx.user;

  const session = await auth();
  if (session?.user) return session.user;

  const adminCtx = await resolveAdminTokenContext();
  if (adminCtx) return adminCtx.user;

  return null;
}

export async function getOrgId() {
  // v1.25.2 — operator-portal session takes precedence (same reason
  // as getCurrentUser above). Workspace-scoped, single round-trip.
  const opCtx = await resolveOperatorPortalContext();
  if (opCtx) return opCtx.orgId;

  // C6: admin-token sessions are scoped to a single workspace by design;
  // skip the user/org-membership round-trip and return the token's orgId.
  const adminCtx = await resolveAdminTokenContext();
  if (adminCtx) return adminCtx.orgId;

  const user = await getCurrentUser();

  if (!user?.id) {
    return null;
  }

  const cookieStore = await cookies();
  const activeOrgId = cookieStore.get("sf_active_org_id")?.value;

  if (!activeOrgId) {
    return user.orgId ?? null;
  }

  if (activeOrgId === user.orgId) {
    return activeOrgId;
  }

  const [memberOrg] = await db
    .select({ orgId: orgMembers.orgId })
    .from(orgMembers)
    .where(and(eq(orgMembers.orgId, activeOrgId), eq(orgMembers.userId, user.id)))
    .limit(1);

  if (memberOrg?.orgId) {
    return memberOrg.orgId;
  }

  const [managedOrg] = await db
    .select({ id: organizations.id, parentAgencyId: organizations.parentAgencyId })
    .from(organizations)
    .where(and(eq(organizations.id, activeOrgId), or(eq(organizations.ownerId, user.id), eq(organizations.parentUserId, user.id))))
    .limit(1);

  if (managedOrg?.id) {
    return managedOrg.id;
  }

  // 2026-06-16 — agency-attached workspaces. When a workspace was
  // created anonymously and later attached to a partner agency via
  // attachWorkspaceToAgency, ownerId and parentUserId remain null.
  // The agency owner should still be able to switch into these
  // workspaces. Check whether the active org's parentAgencyId points
  // to a partner agency owned by this user.
  const [agencyWs] = await db
    .select({ id: organizations.id, parentAgencyId: organizations.parentAgencyId })
    .from(organizations)
    .where(eq(organizations.id, activeOrgId))
    .limit(1);
  if (agencyWs?.parentAgencyId) {
    const [agency] = await db
      .select({ id: partnerAgencies.id })
      .from(partnerAgencies)
      .where(
        and(
          eq(partnerAgencies.id, agencyWs.parentAgencyId),
          eq(partnerAgencies.ownerUserId, user.id),
        ),
      )
      .limit(1);
    if (agency?.id) {
      return activeOrgId;
    }
  }

  return user.orgId ?? null;
}

export async function requireAuth() {
  // v1.25.2 — operator-portal session takes precedence over NextAuth
  // when the cookie is set. See getCurrentUser comment for rationale
  // (intent-based: clicking an operator magic link means the user
  // wants the operator portal even if they have stale NextAuth in
  // the same browser).
  const opCtx = await resolveOperatorPortalContext();
  if (opCtx) {
    const synthetic: Session = {
      user: opCtx.user,
      expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };
    return synthetic;
  }

  const session = await auth();
  if (session?.user) return session;

  // C6: admin-token cookie produces a synthetic session so the dashboard
  // layout / page renders without redirecting to /login.
  const adminCtx = await resolveAdminTokenContext();
  if (adminCtx) {
    const synthetic: Session = {
      user: adminCtx.user,
      expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };
    return synthetic;
  }

  redirect("/login");
}

export async function getCurrentWorkspaceRole() {
  const user = await getCurrentUser();
  const orgId = await getOrgId();

  if (!user?.id || !orgId) {
    return null;
  }

  // C6: admin-token sessions are always workspace admin. Skip the
  // users / org_members lookup since the synthetic user.id doesn't
  // exist in either table.
  if (isAdminTokenUserId(user.id)) {
    return "admin";
  }

  // v1.25.0 — operator-portal sessions are workspace-admin equivalent
  // for the workspace they're scoped to. Same skip-the-lookup pattern.
  if (isOperatorPortalUserId(user.id)) {
    return "admin";
  }

  if (user.orgId === orgId) {
    const [dbUser] = await db.select({ role: users.role }).from(users).where(eq(users.id, user.id)).limit(1);
    return dbUser?.role ?? user.role ?? "member";
  }

  const [member] = await db
    .select({ role: orgMembers.role })
    .from(orgMembers)
    .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, user.id)))
    .limit(1);

  return member?.role ?? user.role ?? "member";
}
