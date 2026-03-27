import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";

export async function verifyApiKey(orgId: string, rawKey: string | null) {
  if (!rawKey) {
    return false;
  }

  const keyPrefix = rawKey.slice(0, 8);
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

  const [record] = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.orgId, orgId), eq(apiKeys.keyPrefix, keyPrefix), eq(apiKeys.keyHash, keyHash)))
    .limit(1);

  return Boolean(record);
}
