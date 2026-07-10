// Record-to-agent session tokens — anonymous bearer auth for the /record
// capture flow. Mirrors the L-14 hashing convention used by
// lib/auth/magic-link.ts: mint a raw random token, hand the RAW value to the
// client exactly once, store only a keyed hash server-side.
//
// Unlike magic-link.ts (which defers to Auth.js's own verification_tokens
// table + NextAuth callback), this is a bespoke bearer scheme for the public,
// unauthenticated recording routes — there is no NextAuth session at capture
// time, only this token.

import crypto from "node:crypto";

/** The env shape resolveTokenSecret needs — narrowed the same way
 *  lib/web-build/policy.ts's flag helpers narrow `process.env` rather than
 *  taking the full `NodeJS.ProcessEnv` (keeps tests free of `as` casts). */
export type TokenSecretEnv = {
  AUTH_SECRET?: string | undefined;
  NEXTAUTH_SECRET?: string | undefined;
};

/** 32 random bytes, hex-encoded (64 chars). The raw value is returned to the
 *  client exactly once and never persisted — only its hash is stored. */
export function mintSessionToken(): { raw: string } {
  return { raw: crypto.randomBytes(32).toString("hex") };
}

/** sha256(raw + secret) hex — same shape as magic-link.ts's hashToken. */
export function hashSessionToken(raw: string, secret: string): string {
  return crypto.createHash("sha256").update(`${raw}${secret}`).digest("hex");
}

/** AUTH_SECRET first, NEXTAUTH_SECRET as fallback; throws when neither is
 *  set so a misconfigured deployment fails loudly instead of minting tokens
 *  no one can ever verify. */
export function resolveTokenSecret(env: TokenSecretEnv): string {
  const secret = env.AUTH_SECRET?.trim() || env.NEXTAUTH_SECRET?.trim() || "";
  if (!secret) {
    throw new Error(
      "Cannot resolve recording session token secret: AUTH_SECRET (or NEXTAUTH_SECRET) is not set.",
    );
  }
  return secret;
}

/** sha256(ip + secret) hex — raw IPs are never stored (mirrors
 *  taste-policy.ts's hashTasteIp, reusing the same token secret rather than
 *  a second env var). */
export function hashIp(ip: string, secret: string): string {
  return crypto.createHash("sha256").update(`${ip}${secret}`).digest("hex");
}
