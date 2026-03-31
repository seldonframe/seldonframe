import { auth } from "@/auth";
import { and, eq, or } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { organizations } from "@/db/schema";

export async function getCurrentUser() {
  const session = await auth();
  return session?.user ?? null;
}

export async function getOrgId() {
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

  const [managedOrg] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(and(eq(organizations.id, activeOrgId), or(eq(organizations.ownerId, user.id), eq(organizations.parentUserId, user.id))))
    .limit(1);

  return managedOrg?.id ?? user.orgId ?? null;
}

export async function requireAuth() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return session;
}
