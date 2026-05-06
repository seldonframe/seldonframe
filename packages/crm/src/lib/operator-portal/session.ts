// ============================================================================
// v1.20.0 — operator-portal session primitives
// ============================================================================
//
// Mirrors lib/portal/session.ts but for the SUB-TENANT OPERATOR audience
// (the HVAC business owner running their workspace, the agency support
// session impersonating that operator), NOT the customer audience
// (homeowner of the HVAC business).
//
// Two distinct token types issued from the same HMAC primitive:
//   - magic-link token: short TTL (15 min), one-shot, carries
//     { orgId, email, exp, kind: "magic" }
//   - session token:    long TTL (7 days), refreshable, carries
//     { orgId, email, exp, kind: "session" }
//
// We collapse both into one signed shape so the same verify path can
// cover both with a `kind` discriminator. Magic-link verification
// flips its kind="magic" payload into a kind="session" cookie on
// successful claim.

import crypto from "node:crypto";

export const OPERATOR_SESSION_COOKIE = "sf_operator_session";

export type OperatorTokenKind = "magic" | "session";

export type OperatorTokenPayload = {
  orgId: string;
  email: string;
  exp: number;
  kind: OperatorTokenKind;
  /** v1.21 hook: agency support session origin user id. NULL on
   *  normal operator-direct sessions. */
  supportOriginUserId?: string | null;
};

function getOperatorSecret(): string {
  return (
    process.env.AUTH_SECRET ??
    process.env.NEXTAUTH_SECRET ??
    "dev-operator-portal-secret"
  );
}

function toBase64Url(value: string): string {
  return Buffer.from(value, "utf-8").toString("base64url");
}

function fromBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf-8");
}

export function signOperatorToken(payload: OperatorTokenPayload): string {
  const body = toBase64Url(JSON.stringify(payload));
  const signature = crypto
    .createHmac("sha256", getOperatorSecret())
    .update(body)
    .digest("base64url");
  return `${body}.${signature}`;
}

export function verifyOperatorToken(
  token: string | null | undefined,
): OperatorTokenPayload | null {
  if (!token) return null;

  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = crypto
    .createHmac("sha256", getOperatorSecret())
    .update(body)
    .digest("base64url");
  if (signature !== expected) return null;

  let parsed: OperatorTokenPayload;
  try {
    parsed = JSON.parse(fromBase64Url(body)) as OperatorTokenPayload;
  } catch {
    return null;
  }

  if (
    !parsed?.orgId ||
    !parsed?.email ||
    typeof parsed.exp !== "number" ||
    (parsed.kind !== "magic" && parsed.kind !== "session")
  ) {
    return null;
  }

  if (Date.now() > parsed.exp) return null;

  return parsed;
}
