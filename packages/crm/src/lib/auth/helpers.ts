import { auth } from "@/auth";
import type { Session } from "next-auth";
import { and, eq, or } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { orgMembers, organizations, users } from "@/db/schema";
import {
  isAdminTokenUserId,
  resolveAdminTokenContext,
} from "./admin-token";

/**
 * C6: server components and route handlers can authenticate via either
 *   - a real NextAuth session (interactive login)
 *   - an admin-token cookie (set by /admin/[workspaceId]?token=wst_…)
 * The admin-token path returns a synthetic Session-shaped object whose
 * `user.id` carries the `__sf_admin_token__:` prefix so callers that
 * need to skip user-table writes can detect it via `isAdminTokenUserId`.
 */
export async function getCurrentUser() {
  const session = await auth();
  if (session?.user) return session.user;

  const adminCtx = await resolveAdminTokenContext();
  if (adminCtx) return adminCtx.user;

  return null;
}

export async function getOrgId() {
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
    .select({ id: organizations.id })
    .from(organizations)
    .where(and(eq(organizations.id, activeOrgId), or(eq(organizations.ownerId, user.id), eq(organizations.parentUserId, user.id))))
    .limit(1);

  return managedOrg?.id ?? user.orgId ?? null;
}

export async function requireAuth() {
  const session = await auth();
  if (session?.user) return session;

  // C6: admin-token cookie produces a synthetic session so the dashboard
  // layout / page renders without redirecting to /login. The synthetic
  // user.id is recognizable via isAdminTokenUserId so downstream code
  // that mutates the users table can no-op for token sessions.
  const adminCtx = await resolveAdminTokenContext();
  if (adminCtx) {
    // Cast to `Session` directly — `Awaited<ReturnType<typeof auth>>`
    // is a union that includes `NextMiddleware`, which doesn't have a
    // `user` field, so callers like layout.tsx that read `session.user`
    // would fail to typecheck against the wider type.
    const synthetic: Session = {
      user: adminCtx.user,
      // Match the rough NextAuth Session shape — `expires` gives the
      // dashboard a plausible session-end timestamp for any code that
      // checks it (most doesn't).
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
