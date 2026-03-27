import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { organizations, users } from "@/db/schema";
import type { OrgSoul } from "@/lib/soul/types";

export async function getSoul(): Promise<OrgSoul | null> {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const [dbUser] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);

  if (!dbUser) {
    return null;
  }

  const [org] = await db.select().from(organizations).where(eq(organizations.id, dbUser.orgId)).limit(1);

  return (org?.soul as OrgSoul | null) ?? null;
}

export async function isSoulCompleted() {
  const session = await auth();

  if (!session?.user?.id) {
    return false;
  }

  const [dbUser] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);

  if (!dbUser) {
    return false;
  }

  const [org] = await db.select().from(organizations).where(eq(organizations.id, dbUser.orgId)).limit(1);

  return Boolean(org?.soulCompletedAt);
}
