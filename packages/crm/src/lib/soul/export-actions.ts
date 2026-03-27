"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { exportSoulConfig, importSoulConfig } from "@seldonframe/core/virality";
import { assertWritable } from "@/lib/demo/server";

export async function exportSoulAction() {
  const orgId = await getOrgId();

  if (!orgId) {
    throw new Error("Unauthorized");
  }

  const [org] = await db
    .select({ soul: organizations.soul })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org?.soul) {
    throw new Error("Soul not configured");
  }

  return exportSoulConfig(orgId, org.soul as Record<string, unknown>);
}

export async function importSoulAction(jsonString: string) {
  assertWritable();

  const orgId = await getOrgId();

  if (!orgId) {
    throw new Error("Unauthorized");
  }

  const parsed = importSoulConfig(jsonString);

  await db
    .update(organizations)
    .set({
      soul: parsed.soul as Record<string, unknown>,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));

  return { success: true };
}
