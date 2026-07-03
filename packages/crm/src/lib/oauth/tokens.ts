import crypto from "node:crypto";

/**
 * SHA-256 hex digest — the SAME hashing scheme workspace-token.ts already
 * uses for wst_ bearer tokens (crypto.createHash("sha256").update(x).digest("hex")).
 * Reused verbatim here for authorization codes and refresh tokens so this
 * codebase has exactly one "how do we hash a secret at rest" convention,
 * not two.
 */
export function hashOauthSecret(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

const RANDOM_BYTES = 32;

export function generateAuthorizationCode(): string {
  return crypto.randomBytes(RANDOM_BYTES).toString("base64url");
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(RANDOM_BYTES).toString("base64url");
}
