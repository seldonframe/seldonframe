import crypto from "node:crypto";

/**
 * Computes the S256 PKCE code_challenge for a given code_verifier, per
 * RFC 7636 §4.2: BASE64URL-ENCODE(SHA256(ASCII(code_verifier))).
 */
export function computeCodeChallengeS256(verifier: string): string {
  return crypto.createHash("sha256").update(verifier, "ascii").digest("base64url");
}

export type PkceMethod = "S256";

/**
 * Verifies a presented code_verifier against a stored code_challenge.
 * S256-ONLY by design (this codebase's OAuth AS never advertises or accepts
 * "plain" — see 2026-07-03-oauth-connector-design.md §4, "PKCE S256 only").
 * Any method other than the literal string "S256" is rejected unconditionally,
 * regardless of whether verifier/challenge would otherwise "match" under a
 * plain comparison — this prevents a caller from ever downgrading via a
 * mislabeled method string.
 */
export function verifyPkce(params: { verifier: string; challenge: string; method: string }): boolean {
  if (params.method !== "S256") return false;
  if (!params.verifier || !params.challenge) return false;
  const computed = computeCodeChallengeS256(params.verifier);
  // Constant-time compare to avoid timing side-channels on the challenge match.
  const a = Buffer.from(computed);
  const b = Buffer.from(params.challenge);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
