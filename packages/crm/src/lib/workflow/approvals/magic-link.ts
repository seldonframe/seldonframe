// Magic-link token generator + verifier for client_owner approvals.
// SLICE 10 PR 1 C3 per audit §8.3 + Max's gate-resolution prompt.
//
// Token format (recognizable, debuggable, NOT format-matching any
// known credential type per L-28):
//
//   apl_<base64url(payload)>.<base64url(hmacSha256(secret, payload))>
//
//   payload (CBOR-style structured but JSON-encoded for readability):
//     { v: 1, a: <approvalId>, n: <nonce>, x: <expiresAtMs> }
//
// Properties:
//   - Single-use is enforced at the DB layer (status='pending' → CAS
//     resolution invalidates). The token itself doesn't track use;
//     storage tells us if the approval is already resolved.
//   - 24h TTL (G-10-8 v1 fixed). Expiration encoded in the payload
//     and signed; tampering with `x` mutates the signature.
//   - HMAC-SHA-256 with the workspace's signing secret (resolved at
//     the API layer; passed in by the caller — this module is pure
//     and stateless).
//   - Nonce ensures token uniqueness even for repeated emissions.
//   - "expired" is a distinct verdict from "invalid" so the API can
//     decide which surface to show (UX hint, not security boundary —
//     both block resolution).
//   - hashMagicLinkToken() returns a deterministic SHA-256 hex used
//     as the DB lookup key; the raw token never lives in the DB.

import { createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const MAGIC_LINK_DEFAULT_TTL_SECONDS = 24 * 60 * 60;
const TOKEN_PREFIX = "apl_";
const TOKEN_VERSION = 1;
const NONCE_BYTES = 12;

type GenerateInput = {
  approvalId: string;
  secret: string;
  /** TTL in seconds; defaults to 24h per G-10-8. */
  ttlSeconds?: number;
  /** For test determinism — defaults to Date.now() at call time. */
  now?: Date;
};

type VerifyInput = {
  token: string;
  secret: string;
  now: Date;
};

type HashInput = {
  token: string;
  secret: string;
};

export type VerifyVerdict =
  | { kind: "valid"; approvalId: string; expiresAt: Date }
  | { kind: "expired" }
  | { kind: "invalid" };

export function generateMagicLinkToken(input: GenerateInput): string {
  const ttl = input.ttlSeconds ?? MAGIC_LINK_DEFAULT_TTL_SECONDS;
  const now = input.now ?? new Date();
  const payload = {
    v: TOKEN_VERSION,
    a: input.approvalId,
    n: randomBytes(NONCE_BYTES).toString("base64url"),
    x: now.getTime() + ttl * 1000,
  };
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = Buffer.from(payloadJson, "utf8").toString("base64url");
  const sig = signPayload(payloadB64, input.secret);
  return `${TOKEN_PREFIX}${payloadB64}.${sig}`;
}

export function verifyMagicLinkToken(input: VerifyInput): VerifyVerdict {
  if (!input.token.startsWith(TOKEN_PREFIX)) return { kind: "invalid" };
  const body = input.token.slice(TOKEN_PREFIX.length);
  const dotIdx = body.indexOf(".");
  if (dotIdx <= 0 || dotIdx === body.length - 1) return { kind: "invalid" };
  const payloadB64 = body.slice(0, dotIdx);
  const presentedSig = body.slice(dotIdx + 1);
  const expectedSig = signPayload(payloadB64, input.secret);
  // Constant-time comparison to defeat timing oracles. timingSafeEqual
  // requires equal-length buffers; bail early if they differ.
  let presentedBuf: Buffer;
  let expectedBuf: Buffer;
  try {
    presentedBuf = Buffer.from(presentedSig, "base64url");
    expectedBuf = Buffer.from(expectedSig, "base64url");
  } catch {
    return { kind: "invalid" };
  }
  if (presentedBuf.length !== expectedBuf.length) return { kind: "invalid" };
  if (!timingSafeEqual(presentedBuf, expectedBuf)) return { kind: "invalid" };

  let payload: { v: number; a: string; n: string; x: number };
  try {
    const json = Buffer.from(payloadB64, "base64url").toString("utf8");
    payload = JSON.parse(json) as typeof payload;
  } catch {
    return { kind: "invalid" };
  }
  if (typeof payload !== "object" || payload === null) return { kind: "invalid" };
  if (payload.v !== TOKEN_VERSION) return { kind: "invalid" };
  if (typeof payload.a !== "string" || payload.a.length === 0) return { kind: "invalid" };
  if (typeof payload.x !== "number") return { kind: "invalid" };

  // Closed-open expiration: now < expiresAt is valid; now >= expiresAt
  // is expired. Eliminates the boundary edge case ambiguity.
  if (input.now.getTime() >= payload.x) return { kind: "expired" };

  return { kind: "valid", approvalId: payload.a, expiresAt: new Date(payload.x) };
}

/**
 * Deterministic hash of the token for DB lookup. Uses HMAC-SHA-256
 * (not raw SHA-256) so attackers who scrape the DB can't pre-compute
 * a rainbow table mapping common tokens → known approval rows.
 */
export function hashMagicLinkToken(input: HashInput): string {
  return createHmac("sha256", input.secret).update(input.token).digest("hex");
}

function signPayload(payloadB64: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadB64).digest("base64url");
}

// Re-export createHash so consumers don't need a separate node:crypto
// import for token-related helpers.
export { createHash };
