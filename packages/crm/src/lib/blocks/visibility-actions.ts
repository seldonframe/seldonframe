"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { assertWritable } from "@/lib/demo/server";

export async function getHiddenBlocks(): Promise<string[]> {
  const orgId = await getOrgId();
  if (!orgId) return [];

  const [org] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const settings = (org?.settings ?? {}) as Record<string, unknown>;
  const hidden = settings.hiddenBlocks;
  return Array.isArray(hidden) ? hidden.filter((item): item is string => typeof item === "string") : [];
}

export async function toggleBlockVisibilityAction(blockSlug: string) {
  assertWritable();

  const orgId = await getOrgId();
  if (!orgId) {
    throw new Error("Unauthorized");
  }

  const [org] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org) {
    throw new Error("Organization not found");
  }

  const settings = (org.settings ?? {}) as Record<string, unknown>;
  const current: string[] = Array.isArray(settings.hiddenBlocks)
    ? settings.hiddenBlocks.filter((item): item is string => typeof item === "string")
    : [];

  const isHidden = current.includes(blockSlug);
  const next = isHidden ? current.filter((slug) => slug !== blockSlug) : [...current, blockSlug];

  await db
    .update(organizations)
    .set({
      settings: { ...settings, hiddenBlocks: next },
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));

  revalidatePath("/dashboard");
  revalidatePath("/");

  return { hidden: !isHidden };
}
