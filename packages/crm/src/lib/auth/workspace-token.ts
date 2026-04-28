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
  expiresAt: Date | null;
};

export interface MintWorkspaceTokenOptions {
  name?: string;
  /** Expiry in days. If omitted, the token never expires (existing behavior). */
  expiresInDays?: number;
}

/**
 * Mints a fresh workspace bearer token. The raw token is returned exactly
 * once (the DB only stores its SHA-256). Callers who lose the raw token
 * must mint a new one — there is no recovery path.
 *
 * `expiresInDays` is optional. C6 (admin-token access) sets it to 7; the
 * pre-C6 anonymous-workspace path passed nothing, which is preserved as
 * the never-expires fallback so existing workspaces don't get logged out.
 */
export async function mintWorkspaceToken(
  orgId: string,
  opts?: MintWorkspaceTokenOptions
): Promise<MintedWorkspaceToken> {
  const raw = crypto.randomBytes(TOKEN_BYTES).toString("base64url");
  const token = `${TOKEN_PREFIX}${raw}`;
  const prefix = token.slice(0, 8);
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt =
    opts?.expiresInDays && opts.expiresInDays > 0
      ? new Date(Date.now() + opts.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

  const [row] = await db
    .insert(apiKeys)
    .values({
      orgId,
      name: opts?.name ?? "mcp:device",
      keyHash: hash,
      keyPrefix: prefix,
      kind: "workspace",
      expiresAt,
    })
    .returning({ id: apiKeys.id });

  return { token, prefix, tokenId: row.id, expiresAt };
}

export type ResolvedWorkspaceBearer = {
  orgId: string;
  tokenId: string;
};

/**
 * Validates a raw `wst_…` token against the api_keys table. Returns the
 * resolved orgId + tokenId on hit, or `null` for any failure (unknown
 * token, expired, malformed). Callers must NOT distinguish between
 * "not found" and "expired" in error messages — that's a token-probing
 * vector.
 *
 * Single source of truth for token validation. Both the
 * `Authorization: Bearer …` request path and the cookie-based
 * `/admin/[workspaceId]?token=…` path call into here.
 */
export async function validateRawWorkspaceToken(
  raw: string
): Promise<ResolvedWorkspaceBearer | null> {
  if (!raw || !raw.startsWith(TOKEN_PREFIX)) return null;

  const prefix = raw.slice(0, 8);
  const hash = crypto.createHash("sha256").update(raw).digest("hex");

  const [record] = await db
    .select({
      id: apiKeys.id,
      orgId: apiKeys.orgId,
      expiresAt: apiKeys.expiresAt,
    })
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
  // Reject expired tokens. Tokens minted without an expiry (legacy mcp:device
  // tokens) keep working forever — only those minted with `expiresInDays`
  // carry an `expires_at` value.
  if (record.expiresAt && record.expiresAt.getTime() <= Date.now()) {
    return null;
  }

  // Best-effort touch of lastUsedAt; don't await in the hot path for now.
  void db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, record.id))
    .catch(() => undefined);

  return { orgId: record.orgId, tokenId: record.id };
}

export async function resolveWorkspaceBearer(headers: Headers): Promise<ResolvedWorkspaceBearer | null> {
  const auth = headers.get("authorization") ?? headers.get("Authorization");
  if (!auth) return null;

  const match = auth.match(/^Bearer\s+(\S+)$/i);
  if (!match) return null;

  return validateRawWorkspaceToken(match[1]);
}

export function isWorkspaceBearerPresent(headers: Headers): boolean {
  const auth = headers.get("authorization") ?? headers.get("Authorization");
  if (!auth) return false;
  const match = auth.match(/^Bearer\s+(\S+)$/i);
  return Boolean(match && match[1].startsWith(TOKEN_PREFIX));
}
