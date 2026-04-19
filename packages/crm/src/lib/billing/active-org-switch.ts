import { and, eq, or } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { orgMembers, organizations, users } from "@/db/schema";

export type SwitchResult =
  | { switched: true; orgId: string }
  | { switched: false; reason: "no-user" | "unknown-user" | "denied" };

// Verifies the user has access to `targetOrgId` via one of:
//   - organizations.ownerId === userId
//   - organizations.parentUserId === userId
//   - users.orgId === targetOrgId (primary org, may predate orgMembers)
//   - orgMembers entry for (target, user)
//
// If authorized, sets the sf_active_org_id cookie and returns switched=true.
// Never throws; callers handle the denied/no-user paths.
export async function maybeSwitchActiveOrg(
  userId: string | null | undefined,
  targetOrgId: string | null | undefined
): Promise<SwitchResult> {
  const uid = userId?.trim() ?? "";
  const tgt = targetOrgId?.trim() ?? "";
  if (!uid) return { switched: false, reason: "no-user" };
  if (!tgt) return { switched: false, reason: "denied" };

  const [userRow] = await db
    .select({ orgId: users.orgId })
    .from(users)
    .where(eq(users.id, uid))
    .limit(1);
  if (!userRow) return { switched: false, reason: "unknown-user" };

  if (userRow.orgId === tgt) {
    await setActiveOrgCookie(tgt);
    return { switched: true, orgId: tgt };
  }

  const [owned] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(
      and(
        eq(organizations.id, tgt),
        or(
          eq(organizations.ownerId, uid),
          eq(organizations.parentUserId, uid)
        )
      )
    )
    .limit(1);
  if (owned?.id) {
    await setActiveOrgCookie(tgt);
    return { switched: true, orgId: tgt };
  }

  const [member] = await db
    .select({ orgId: orgMembers.orgId })
    .from(orgMembers)
    .where(and(eq(orgMembers.orgId, tgt), eq(orgMembers.userId, uid)))
    .limit(1);
  if (member?.orgId) {
    await setActiveOrgCookie(tgt);
    return { switched: true, orgId: tgt };
  }

  return { switched: false, reason: "denied" };
}

async function setActiveOrgCookie(orgId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set("sf_active_org_id", orgId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  });
}
