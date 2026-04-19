import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";

const TOKEN_PREFIX = "wst_";
const TOKEN_BYTES = 32;

export type MintedWorkspaceToken = {
  token: string;
  prefix: string;
  tokenId: string;
};

export async function mintWorkspaceToken(orgId: string, opts?: { name?: string }): Promise<MintedWorkspaceToken> {
  const raw = crypto.randomBytes(TOKEN_BYTES).toString("base64url");
  const token = `${TOKEN_PREFIX}${raw}`;
  const prefix = token.slice(0, 8);
  const hash = crypto.createHash("sha256").update(token).digest("hex");

  const [row] = await db
    .insert(apiKeys)
    .values({
      orgId,
      name: opts?.name ?? "mcp:device",
      keyHash: hash,
      keyPrefix: prefix,
      kind: "workspace",
    })
    .returning({ id: apiKeys.id });

  return { token, prefix, tokenId: row.id };
}

export type ResolvedWorkspaceBearer = {
  orgId: string;
  tokenId: string;
};

export async function resolveWorkspaceBearer(headers: Headers): Promise<ResolvedWorkspaceBearer | null> {
  const auth = headers.get("authorization") ?? headers.get("Authorization");
  if (!auth) return null;

  const match = auth.match(/^Bearer\s+(\S+)$/i);
  if (!match) return null;

  const token = match[1];
  if (!token.startsWith(TOKEN_PREFIX)) return null;

  const prefix = token.slice(0, 8);
  const hash = crypto.createHash("sha256").update(token).digest("hex");

  const [record] = await db
    .select({ id: apiKeys.id, orgId: apiKeys.orgId })
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.kind, "workspace"),
        eq(apiKeys.keyPrefix, prefix),
        eq(apiKeys.keyHash, hash)
      )
    )
    .limit(1);

  if (!record) return null;

  // Best-effort touch of lastUsedAt; don't await in the hot path for now.
  void db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, record.id))
    .catch(() => undefined);

  return { orgId: record.orgId, tokenId: record.id };
}

export function isWorkspaceBearerPresent(headers: Headers): boolean {
  const auth = headers.get("authorization") ?? headers.get("Authorization");
  if (!auth) return false;
  const match = auth.match(/^Bearer\s+(\S+)$/i);
  return Boolean(match && match[1].startsWith(TOKEN_PREFIX));
}
