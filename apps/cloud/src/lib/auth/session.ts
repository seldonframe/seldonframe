import crypto from "node:crypto";
import type { CloudTier } from "@/lib/cloud/types";

const CLOUD_SESSION_COOKIE = "seldon_cloud_session";

type CloudSessionPayload = {
  userId: string;
  orgId: string;
  orgSlug: string;
  email: string;
  tier: CloudTier;
  exp: number;
};

function getSecret() {
  return process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "dev-cloud-secret";
}

export function getCloudSessionCookieName() {
  return CLOUD_SESSION_COOKIE;
}

export function signCloudSession(payload: CloudSessionPayload) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url");
  const signature = crypto.createHmac("sha256", getSecret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyCloudSession(token: string | null | undefined): CloudSessionPayload | null {
  if (!token) {
    return null;
  }

  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) {
    return null;
  }

  const expected = crypto.createHmac("sha256", getSecret()).update(encoded).digest("base64url");
  if (signature !== expected) {
    return null;
  }

  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf-8")) as CloudSessionPayload;

  if (!payload?.userId || !payload?.orgId || !payload?.orgSlug || !payload?.email || !payload?.tier || typeof payload.exp !== "number") {
    return null;
  }

  if (Date.now() > payload.exp) {
    return null;
  }

  return payload;
}
