import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { suppressionList } from "@/db/schema";
import { toE164 } from "./providers";

export type SmsSuppressionReason = "manual" | "stop_keyword" | "carrier_block" | "complaint";

export function normalizePhone(value: string) {
  return toE164(value);
}

export async function isPhoneSuppressed(orgId: string, phone: string) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  const [row] = await db
    .select({
      id: suppressionList.id,
      reason: suppressionList.reason,
      createdAt: suppressionList.createdAt,
    })
    .from(suppressionList)
    .where(
      and(
        eq(suppressionList.orgId, orgId),
        eq(suppressionList.channel, "sms"),
        eq(suppressionList.phone, normalized)
      )
    )
    .limit(1);

  return row ?? null;
}

export async function addPhoneSuppression(params: {
  orgId: string;
  phone: string;
  reason?: SmsSuppressionReason;
  source?: string;
}) {
  const normalized = normalizePhone(params.phone);
  if (!normalized) {
    throw new Error("phone is required");
  }

  const existing = await isPhoneSuppressed(params.orgId, normalized);
  if (existing) return existing;

  const [row] = await db
    .insert(suppressionList)
    .values({
      orgId: params.orgId,
      channel: "sms",
      phone: normalized,
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

export async function removePhoneSuppression(params: { orgId: string; phone: string }) {
  const normalized = normalizePhone(params.phone);
  if (!normalized) return 0;

  const deleted = await db
    .delete(suppressionList)
    .where(
      and(
        eq(suppressionList.orgId, params.orgId),
        eq(suppressionList.channel, "sms"),
        eq(suppressionList.phone, normalized)
      )
    )
    .returning({ id: suppressionList.id });

  return deleted.length;
}

export async function listPhoneSuppressions(orgId: string, limit = 200) {
  const rows = await db
    .select({
      id: suppressionList.id,
      phone: suppressionList.phone,
      reason: suppressionList.reason,
      source: suppressionList.source,
      createdAt: suppressionList.createdAt,
    })
    .from(suppressionList)
    .where(and(eq(suppressionList.orgId, orgId), eq(suppressionList.channel, "sms")))
    .orderBy(desc(suppressionList.createdAt))
    .limit(limit);

  return rows.filter((row): row is typeof row & { phone: string } => row.phone !== null);
}

// STOP-keyword detection for inbound webhook. Carriers have legal
// obligations around these; treat them as auto-suppression triggers.
const STOP_KEYWORDS = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit"]);

export function isStopKeyword(body: string) {
  const normalized = body.trim().toLowerCase();
  return STOP_KEYWORDS.has(normalized);
}
