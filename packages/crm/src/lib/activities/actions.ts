"use server";

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { activities } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { assertWritable } from "@/lib/demo/server";

export async function listActivities() {
  const orgId = await getOrgId();

  if (!orgId) {
    return [];
  }

  return db.select().from(activities).where(eq(activities.orgId, orgId)).orderBy(desc(activities.createdAt));
}

export async function createActivityAction(formData: FormData) {
  assertWritable();

  const orgId = await getOrgId();

  if (!orgId) {
    throw new Error("Unauthorized");
  }

  await db.insert(activities).values({
    orgId,
    userId: String(formData.get("userId") ?? ""),
    contactId: (formData.get("contactId") as string | null) || null,
    dealId: (formData.get("dealId") as string | null) || null,
    type: String(formData.get("type") ?? "note"),
    subject: String(formData.get("subject") ?? ""),
    body: String(formData.get("body") ?? ""),
    scheduledAt: formData.get("scheduledAt") ? new Date(String(formData.get("scheduledAt"))) : null,
  });
}

export async function completeTaskAction(activityId: string) {
  assertWritable();

  const orgId = await getOrgId();

  if (!orgId) {
    throw new Error("Unauthorized");
  }

  await db
    .update(activities)
    .set({ completedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(activities.orgId, orgId), eq(activities.id, activityId)));
}
