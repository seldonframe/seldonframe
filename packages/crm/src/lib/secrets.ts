import crypto from "node:crypto";
import { and, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { orgMembers, organizations, workspaceSecrets } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/helpers";
import { decryptValue, encryptValue } from "@/lib/encryption";

export type SecretScope = "workspace" | "org";

export type WorkspaceSecretMetadata = {
  id: string;
  workspaceId: string;
  scope: SecretScope;
  serviceName: string;
  keyVersion: number;
  fingerprint: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
};

export type SecretCaptureLinkOptions = {
  workspaceId: string;
  serviceName: string;
  scope?: SecretScope;
  actorUserId?: string | null;
  expiresInMinutes?: number;
  path?: string;
};

type SecretCapturePayload = {
  workspaceId: string;
  serviceName: string;
  scope: SecretScope;
  actorUserId: string | null;
  exp: number;
};

function normalizeScope(scope: string | null | undefined): SecretScope {
  return scope === "org" ? "org" : "workspace";
}

function getSecretKeyVersion() {
  return 1;
}

function getSecretFingerprintKey() {
  const secret =
    process.env.SELDON_SECRET_FINGERPRINT_SECRET?.trim() ||
    process.env.SELDON_SECRET_CAPTURE_SECRET?.trim() ||
    process.env.ENCRYPTION_KEY?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim();

  if (!secret) {
    throw new Error("Missing secret fingerprint key");
  }

  return crypto.createHash("sha256").update(secret).digest();
}

function createFingerprint(value: string) {
  return crypto.createHmac("sha256", getSecretFingerprintKey()).update(value).digest("hex").slice(0, 16);
}

function getSecretCaptureSigningKey() {
  const secret =
    process.env.SELDON_SECRET_CAPTURE_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    process.env.ENCRYPTION_KEY?.trim();

  if (!secret) {
    throw new Error("Missing SELDON_SECRET_CAPTURE_SECRET (or NEXTAUTH_SECRET / ENCRYPTION_KEY fallback)");
  }

  return crypto.createHash("sha256").update(secret).digest();
}

function signPayload(payload: string) {
  return crypto.createHmac("sha256", getSecretCaptureSigningKey()).update(payload).digest("base64url");
}

function getAppOrigin() {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    "http://localhost:3000"
  );
}

async function resolveActorUserId(actorUserId?: string | null) {
  if (actorUserId) {
    return actorUserId;
  }

  const currentUser = await getCurrentUser();
  return currentUser?.id ?? null;
}

async function assertWorkspaceSecretAccess(workspaceId: string, actorUserId?: string | null) {
  const resolvedActorUserId = await resolveActorUserId(actorUserId);
  if (!resolvedActorUserId) {
    throw new Error("Unauthorized");
  }

  const [workspace] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(
      and(
        eq(organizations.id, workspaceId),
        or(
          eq(organizations.ownerId, resolvedActorUserId),
          eq(organizations.parentUserId, resolvedActorUserId)
        )
      )
    )
    .limit(1);

  if (workspace?.id) {
    return resolvedActorUserId;
  }

  const [membership] = await db
    .select({ orgId: orgMembers.orgId })
    .from(orgMembers)
    .where(and(eq(orgMembers.orgId, workspaceId), eq(orgMembers.userId, resolvedActorUserId)))
    .limit(1);

  if (!membership?.orgId) {
    throw new Error("Unauthorized");
  }

  return resolvedActorUserId;
}

function toMetadataRow(row: typeof workspaceSecrets.$inferSelect): WorkspaceSecretMetadata {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    scope: normalizeScope(row.scope),
    serviceName: row.serviceName,
    keyVersion: row.keyVersion,
    fingerprint: row.fingerprint,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
  };
}

export async function storeSecret(input: {
  workspaceId: string;
  serviceName: string;
  value: string;
  scope?: SecretScope;
  actorUserId?: string | null;
}) {
  const workspaceId = input.workspaceId.trim();
  const serviceName = input.serviceName.trim().toLowerCase();
  const value = input.value.trim();
  const scope = normalizeScope(input.scope);

  if (!workspaceId || !serviceName || !value) {
    throw new Error("workspaceId, serviceName, and value are required");
  }

  const actorUserId = await assertWorkspaceSecretAccess(workspaceId, input.actorUserId);
  const encryptedValue = encryptValue(value);
  const keyVersion = getSecretKeyVersion();
  const fingerprint = createFingerprint(value);
  const now = new Date();

  const [existing] = await db
    .select()
    .from(workspaceSecrets)
    .where(
      and(
        eq(workspaceSecrets.workspaceId, workspaceId),
        eq(workspaceSecrets.scope, scope),
        eq(workspaceSecrets.serviceName, serviceName)
      )
    )
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(workspaceSecrets)
      .set({
        encryptedValue,
        keyVersion,
        fingerprint,
        updatedBy: actorUserId,
        updatedAt: now,
      })
      .where(eq(workspaceSecrets.id, existing.id))
      .returning();

    return updated ? toMetadataRow(updated) : null;
  }

  const [created] = await db
    .insert(workspaceSecrets)
    .values({
      workspaceId,
      scope,
      serviceName,
      encryptedValue,
      keyVersion,
      fingerprint,
      createdBy: actorUserId,
      updatedBy: actorUserId,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return created ? toMetadataRow(created) : null;
}

export async function listSecrets(input: {
  workspaceId: string;
  scope?: SecretScope;
  actorUserId?: string | null;
}) {
  const workspaceId = input.workspaceId.trim();
  if (!workspaceId) {
    throw new Error("workspaceId is required");
  }

  await assertWorkspaceSecretAccess(workspaceId, input.actorUserId);
  const scope = input.scope ? normalizeScope(input.scope) : null;

  const rows = scope
    ? await db
        .select()
        .from(workspaceSecrets)
        .where(and(eq(workspaceSecrets.workspaceId, workspaceId), eq(workspaceSecrets.scope, scope)))
    : await db.select().from(workspaceSecrets).where(eq(workspaceSecrets.workspaceId, workspaceId));

  return rows
    .map(toMetadataRow)
    .sort((a, b) => Number(new Date(b.updatedAt)) - Number(new Date(a.updatedAt)));
}

export async function getSecretValue(input: {
  workspaceId: string;
  serviceName: string;
  scope?: SecretScope;
  actorUserId?: string | null;
  skipAccessCheck?: boolean;
}) {
  const workspaceId = input.workspaceId.trim();
  const serviceName = input.serviceName.trim().toLowerCase();
  const scope = normalizeScope(input.scope);

  if (!workspaceId || !serviceName) {
    throw new Error("workspaceId and serviceName are required");
  }

  if (!input.skipAccessCheck) {
    await assertWorkspaceSecretAccess(workspaceId, input.actorUserId);
  }

  const [row] = await db
    .select()
    .from(workspaceSecrets)
    .where(
      and(
        eq(workspaceSecrets.workspaceId, workspaceId),
        eq(workspaceSecrets.scope, scope),
        eq(workspaceSecrets.serviceName, serviceName)
      )
    )
    .limit(1);

  if (!row) {
    return null;
  }

  await db.update(workspaceSecrets).set({ lastUsedAt: new Date(), updatedAt: new Date() }).where(eq(workspaceSecrets.id, row.id));
  return decryptValue(row.encryptedValue);
}

export async function rotateSecret(input: {
  workspaceId: string;
  serviceName: string;
  scope?: SecretScope;
  actorUserId?: string | null;
  path?: string;
}) {
  const workspaceId = input.workspaceId.trim();
  const serviceName = input.serviceName.trim().toLowerCase();
  const scope = normalizeScope(input.scope);
  const actorUserId = await assertWorkspaceSecretAccess(workspaceId, input.actorUserId);

  const existing = await db
    .delete(workspaceSecrets)
    .where(
      and(
        eq(workspaceSecrets.workspaceId, workspaceId),
        eq(workspaceSecrets.scope, scope),
        eq(workspaceSecrets.serviceName, serviceName)
      )
    )
    .returning({ id: workspaceSecrets.id });

  return {
    deleted: existing.length > 0,
    captureUrl: createSecretCaptureLink({
      workspaceId,
      serviceName,
      scope,
      actorUserId,
      path: input.path,
    }),
  };
}

export function createSecretCaptureLink(options: SecretCaptureLinkOptions) {
  const payload: SecretCapturePayload = {
    workspaceId: options.workspaceId.trim(),
    serviceName: options.serviceName.trim().toLowerCase(),
    scope: normalizeScope(options.scope),
    actorUserId: options.actorUserId ?? null,
    exp: Date.now() + (options.expiresInMinutes ?? 15) * 60 * 1000,
  };

  if (!payload.workspaceId || !payload.serviceName) {
    throw new Error("workspaceId and serviceName are required");
  }

  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = signPayload(encodedPayload);
  const token = `${encodedPayload}.${signature}`;
  const path = options.path?.trim() || "/settings/integrations/secrets/capture";
  const url = new URL(path.startsWith("/") ? path : `/${path}`, getAppOrigin());
  url.searchParams.set("token", token);
  return url.toString();
}

export function verifySecretCaptureToken(token: string) {
  const [payloadRaw, signatureRaw] = token.split(".");
  if (!payloadRaw || !signatureRaw) {
    throw new Error("Invalid secret capture token");
  }

  const expectedSignature = signPayload(payloadRaw);
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");
  const receivedBuffer = Buffer.from(signatureRaw, "utf8");

  if (expectedBuffer.length !== receivedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)) {
    throw new Error("Invalid secret capture token signature");
  }

  const payload = JSON.parse(Buffer.from(payloadRaw, "base64url").toString("utf8")) as SecretCapturePayload;
  if (!payload.workspaceId || !payload.serviceName || !payload.exp) {
    throw new Error("Invalid secret capture token payload");
  }

  if (payload.exp < Date.now()) {
    throw new Error("Secret capture token expired");
  }

  return {
    workspaceId: payload.workspaceId,
    serviceName: payload.serviceName,
    scope: normalizeScope(payload.scope),
    actorUserId: payload.actorUserId,
    expiresAt: new Date(payload.exp).toISOString(),
  };
}
