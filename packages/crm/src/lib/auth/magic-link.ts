import crypto from "node:crypto";
import { db } from "@/db";
import { verificationTokens } from "@/db/schema";

// Mints a single-use magic link that signs the user in via NextAuth's standard
// /api/auth/callback/email handler. Works with the existing Resend email
// provider — we don't need a custom provider or sendVerificationRequest
// override; we just insert a valid row into `verification_tokens`.
//
// Flow:
//   1. Caller invokes mintClaimMagicLink(userEmail, "/some/path")
//   2. We insert (identifier, token, expires) into verification_tokens
//   3. Return URL: {NEXTAUTH_URL}/api/auth/callback/email?token=...&email=...&callbackUrl=...
//   4. User clicks → NextAuth validates token → signs them in → redirects to callbackUrl
//
// The token is single-use: NextAuth deletes the row on successful validation.
// Expiry is 15 minutes — long enough to click, short enough to contain leak
// damage if the URL ends up in a chat transcript.

const TTL_MINUTES = 15;

export type MintedMagicLink = {
  url: string;
  expires_at: string;
};

export async function mintClaimMagicLink(
  userEmail: string,
  callbackPath: string
): Promise<MintedMagicLink> {
  const baseUrl = (
    process.env.NEXTAUTH_URL?.trim() || "https://app.seldonframe.com"
  ).replace(/\/+$/, "");

  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + TTL_MINUTES * 60 * 1000);

  await db.insert(verificationTokens).values({
    identifier: userEmail,
    token,
    expires,
  });

  // callbackPath is expected to be an internal path like "/dashboard". Resolve
  // it against NEXTAUTH_URL so NextAuth's callback accepts it (it enforces
  // same-origin callback URLs by default).
  const safePath = callbackPath.startsWith("/") ? callbackPath : `/${callbackPath}`;
  const callbackUrl = `${baseUrl}${safePath}`;

  const params = new URLSearchParams({
    token,
    email: userEmail,
    callbackUrl,
  });
  const url = `${baseUrl}/api/auth/callback/email?${params.toString()}`;

  return { url, expires_at: expires.toISOString() };
}
