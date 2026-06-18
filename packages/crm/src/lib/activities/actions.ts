"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
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

  const contactId = (formData.get("contactId") as string | null) || null;

  await db.insert(activities).values({
    orgId,
    userId: String(formData.get("userId") ?? ""),
    contactId,
    dealId: (formData.get("dealId") as string | null) || null,
    type: String(formData.get("type") ?? "note"),
    subject: String(formData.get("subject") ?? ""),
    body: String(formData.get("body") ?? ""),
    scheduledAt: formData.get("scheduledAt") ? new Date(String(formData.get("scheduledAt"))) : null,
  });

  // Revalidate so the contact page shows the new activity immediately.
  if (contactId) {
    revalidatePath(`/contacts/${contactId}`);
  }
  revalidatePath("/activities");
}

export async function completeTaskAction(activityId: string) {
  assertWritable();

  const orgId = await getOrgId();

  if (!orgId) {
    throw new Error("Unauthorized");
  }

  const [row] = await db
    .select({ contactId: activities.contactId })
    .from(activities)
    .where(and(eq(activities.orgId, orgId), eq(activities.id, activityId)))
    .limit(1);

  await db
    .update(activities)
    .set({ completedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(activities.orgId, orgId), eq(activities.id, activityId)));

  if (row?.contactId) {
    revalidatePath(`/contacts/${row.contactId}`);
  }
}

/**
 * Persist operator notes on a specific activity.
 *
 * Storage: `activities.metadata.notes` (string inside existing jsonb).
 * Read-modify-write so other metadata keys are preserved.
 * Auth-scoped: activity must belong to the operator's orgId.
 */
export async function updateActivityNotesAction({
  activityId,
  notes,
}: {
  activityId: string;
  notes: string;
}) {
  assertWritable();

  const orgId = await getOrgId();

  if (!orgId) {
    throw new Error("Unauthorized");
  }

  // Fetch existing metadata to preserve other keys.
  const [existing] = await db
    .select({ metadata: activities.metadata, contactId: activities.contactId })
    .from(activities)
    .where(and(eq(activities.orgId, orgId), eq(activities.id, activityId)))
    .limit(1);

  if (!existing) {
    throw new Error("Activity not found");
  }

  const updatedMetadata: Record<string, unknown> = {
    ...(existing.metadata ?? {}),
    notes: notes.trim(),
  };

  await db
    .update(activities)
    .set({ metadata: updatedMetadata, updatedAt: new Date() })
    .where(and(eq(activities.orgId, orgId), eq(activities.id, activityId)));

  if (existing.contactId) {
    revalidatePath(`/contacts/${existing.contactId}`);
  }
}
