import crypto from "node:crypto";

export const PORTAL_SESSION_COOKIE = "seldon_portal_session";

export type PortalSession = {
  orgId: string;
  contactId: string;
  email: string;
  exp: number;
};

function getPortalSecret() {
  return process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "dev-portal-secret";
}

function toBase64Url(value: string) {
  return Buffer.from(value, "utf-8").toString("base64url");
}

function fromBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf-8");
}

export function signPortalSession(session: PortalSession) {
  const payload = toBase64Url(JSON.stringify(session));
  const signature = crypto.createHmac("sha256", getPortalSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyPortalSession(token: string | null | undefined): PortalSession | null {
  if (!token) {
    return null;
  }

  const [payload, signature] = token.split(".");

  if (!payload || !signature) {
    return null;
  }

  const expected = crypto.createHmac("sha256", getPortalSecret()).update(payload).digest("base64url");

  if (signature !== expected) {
    return null;
  }

  const parsed = JSON.parse(fromBase64Url(payload)) as PortalSession;

  if (!parsed?.orgId || !parsed?.contactId || !parsed?.email || typeof parsed.exp !== "number") {
    return null;
  }

  if (Date.now() > parsed.exp) {
    return null;
  }

  return parsed;
}
