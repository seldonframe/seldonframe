import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { organizations, users } from "@/db/schema";
import { resolveAdminTokenContext } from "@/lib/auth/admin-token";
import type { OrgSoul } from "@/lib/soul/types";

/**
 * v1.1.5 / Issue #9 — resolve the active orgId for either a real
 * NextAuth session OR an admin-token cookie. Without this branch,
 * admin-token sessions on the dashboard get a null soul (because
 * the synthetic user.id is the nil UUID and never appears in
 * `users.orgId`), which cascades into "Workspace defaults"
 * personality / labels in the rendered admin UI even though the
 * workspace itself has a real Soul on disk.
 */
async function resolveActiveOrgIdForReadPath(): Promise<string | null> {
  const session = await auth();
  if (session?.user?.id) {
    const [dbUser] = await db
      .select({ orgId: users.orgId })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);
    if (dbUser?.orgId) return dbUser.orgId;
  }

  // Admin-token branch: cookie-scoped to a single workspace; the orgId
  // travels on the token itself, not via a user row.
  const adminCtx = await resolveAdminTokenContext();
  if (adminCtx?.orgId) return adminCtx.orgId;

  return null;
}

export async function getSoul(): Promise<OrgSoul | null> {
  try {
    const orgId = await resolveActiveOrgIdForReadPath();
    if (!orgId) return null;

    const [org] = await db
      .select({ soul: organizations.soul })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    return (org?.soul as OrgSoul | null) ?? null;
  } catch {
    return null;
  }
}

export async function isSoulCompleted() {
  try {
    const orgId = await resolveActiveOrgIdForReadPath();
    if (!orgId) return false;

    const [org] = await db
      .select({ soulCompletedAt: organizations.soulCompletedAt })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    return Boolean(org?.soulCompletedAt);
  } catch {
    return false;
  }
}
