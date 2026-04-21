import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { suppressionList } from "@/db/schema";

export type SuppressionReason = "manual" | "unsubscribe" | "bounce" | "complaint";

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export async function isEmailSuppressed(orgId: string, email: string) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const [row] = await db
    .select({
      id: suppressionList.id,
      reason: suppressionList.reason,
      createdAt: suppressionList.createdAt,
    })
    .from(suppressionList)
    .where(and(eq(suppressionList.orgId, orgId), eq(suppressionList.email, normalized)))
    .limit(1);

  return row ?? null;
}

export async function addSuppression(params: {
  orgId: string;
  email: string;
  reason?: SuppressionReason;
  source?: string;
}) {
  const normalized = normalizeEmail(params.email);
  if (!normalized) {
    throw new Error("email is required");
  }

  const existing = await isEmailSuppressed(params.orgId, normalized);
  if (existing) return existing;

  const [row] = await db
    .insert(suppressionList)
    .values({
      orgId: params.orgId,
      email: normalized,
      reason: params.reason ?? "manual",
      source: params.source ?? null,
    })
    .returning({
      id: suppressionList.id,
      reason: suppressionList.reason,
      createdAt: suppressionList.createdAt,
    });

  return row;
}

export async function removeSuppression(params: { orgId: string; email: string }) {
  const normalized = normalizeEmail(params.email);
  if (!normalized) return 0;

  const deleted = await db
    .delete(suppressionList)
    .where(and(eq(suppressionList.orgId, params.orgId), eq(suppressionList.email, normalized)))
    .returning({ id: suppressionList.id });

  return deleted.length;
}

export async function listSuppressions(orgId: string, limit = 200) {
  return db
    .select({
      id: suppressionList.id,
      email: suppressionList.email,
      reason: suppressionList.reason,
      source: suppressionList.source,
      createdAt: suppressionList.createdAt,
    })
    .from(suppressionList)
    .where(eq(suppressionList.orgId, orgId))
    .orderBy(desc(suppressionList.createdAt))
    .limit(limit);
}
