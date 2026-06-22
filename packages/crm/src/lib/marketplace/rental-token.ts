// Agent-marketplace MCP rental — signed rental-key mint/verify.
//
// Phase 2 of the agent marketplace ("Rent via MCP"). An external human/agent
// rents a listed agent by connecting to it as an MCP-over-HTTP server at
// /api/v1/agents/[slug]/mcp, authenticating with a per-renter RENTAL KEY.
//
// DESIGN — no table (explicitly preferred by the spec). The rental key is a
// SELF-CONTAINED signed token: HMAC-SHA-256 over { slug, renterOrgId, exp }
// using a server secret. Validating it on each call needs only the secret + the
// slug from the request path — zero DB round-trips. This mirrors the proven
// magic-link token pattern (lib/workflow/approvals/magic-link.ts): base64url
// payload + HMAC signature, constant-time compare, "expired" distinct from
// "invalid", recognizable-but-non-credential-looking prefix (L-28).
//
// Token format (debuggable, NOT format-matching any real credential per L-28):
//
//   rk_<base64url(payload)>.<base64url(hmacSha256(secret, payload))>
//
//   payload (JSON-encoded for readability):
//     { v: 1, s: <slug>, o: <renterOrgId>, n: <nonce>, x: <expiresAtMs> }
//
// The slug is signed INTO the payload AND cross-checked against the endpoint's
// path slug on verify — so a key minted for agent A can never authenticate
// against agent B even though both share the platform secret.
//
// FOLLOW-ON (explicitly out of scope here): a revocable per-key TABLE (so an
// operator can revoke a leaked key before its TTL) and metered 2%-on-rentals
// billing. This module is the stateless auth primitive those build on. Pure +
// stateless (the secret is passed in by the caller) so it unit-tests with no
// env + no Postgres.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Recognizable prefix — "rental key". Self-documenting, and deliberately NOT
 *  a real-credential shape (L-28). */
export const RENTAL_KEY_PREFIX = "rk_";
const TOKEN_VERSION = 1;
const NONCE_BYTES = 12;

/** 90 days — a rental engagement spans weeks/months, unlike a one-shot magic
 *  link. Long enough to be useful in a copied MCP config; bounded so a leaked
 *  key eventually dies even before the revocation table (follow-on) exists. */
export const RENTAL_KEY_DEFAULT_TTL_SECONDS = 90 * 24 * 60 * 60;

type MintInput = {
  /** The listing slug this key is scoped to (marketplaceListings.slug). */
  slug: string;
  /** The renter's org id (the caller's org, from getOrgId()). */
  renterOrgId: string;
  /** Server signing secret (resolved by the caller from env). */
  secret: string;
  /** TTL in seconds; defaults to 90 days. */
  ttlSeconds?: number;
  /** For test determinism — defaults to Date.now() at call time. */
  now?: Date;
};

type VerifyInput = {
  /** The presented bearer key. */
  key: string;
  /** The slug from the request path — MUST match the key's signed slug. */
  slug: string;
  /** Server signing secret. */
  secret: string;
  /** Current wall-clock (injected for determinism / closed-open expiry). */
  now: Date;
};

type RentalPayload = {
  v: number;
  s: string;
  o: string;
  n: string;
  x: number;
};

export type RentalKeyVerdict =
  | { kind: "valid"; slug: string; renterOrgId: string; expiresAt: Date }
  /** Signature ok but the key was minted for a DIFFERENT agent. */
  | { kind: "slug_mismatch" }
  /** Signature ok but the key has expired (distinct from invalid for UX). */
  | { kind: "expired" }
  /** Malformed / tampered / wrong-secret. */
  | { kind: "invalid" };

/** Mint a signed rental key for { slug, renterOrgId } with a bounded TTL. */
export function mintRentalKey(input: MintInput): string {
  const ttl = input.ttlSeconds ?? RENTAL_KEY_DEFAULT_TTL_SECONDS;
  const now = input.now ?? new Date();
  const payload: RentalPayload = {
    v: TOKEN_VERSION,
    s: input.slug,
    o: input.renterOrgId,
    n: randomBytes(NONCE_BYTES).toString("base64url"),
    x: now.getTime() + ttl * 1000,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = signPayload(payloadB64, input.secret);
  return `${RENTAL_KEY_PREFIX}${payloadB64}.${sig}`;
}

/**
 * Verify a presented rental key against the endpoint's path slug + the server
 * secret + the current time. Verdict order: malformed/tampered → invalid;
 * good signature but wrong agent → slug_mismatch; good signature but past exp
 * → expired; otherwise valid (carrying the renter org for usage logging).
 */
export function verifyRentalKey(input: VerifyInput): RentalKeyVerdict {
  if (!input.key.startsWith(RENTAL_KEY_PREFIX)) return { kind: "invalid" };
  const body = input.key.slice(RENTAL_KEY_PREFIX.length);
  const dotIdx = body.indexOf(".");
  if (dotIdx <= 0 || dotIdx === body.length - 1) return { kind: "invalid" };

  const payloadB64 = body.slice(0, dotIdx);
  const presentedSig = body.slice(dotIdx + 1);
  const expectedSig = signPayload(payloadB64, input.secret);

  // Constant-time signature comparison. timingSafeEqual needs equal-length
  // buffers; mismatched lengths => not equal (and never throw).
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

  let payload: RentalPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as RentalPayload;
  } catch {
    return { kind: "invalid" };
  }
  if (typeof payload !== "object" || payload === null) return { kind: "invalid" };
  if (payload.v !== TOKEN_VERSION) return { kind: "invalid" };
  if (typeof payload.s !== "string" || payload.s.length === 0) return { kind: "invalid" };
  if (typeof payload.o !== "string" || payload.o.length === 0) return { kind: "invalid" };
  if (typeof payload.x !== "number") return { kind: "invalid" };

  // Slug binding: the signed agent must equal the endpoint's path slug. This is
  // checked AFTER signature validity so we can return a precise verdict (the
  // key is authentic, just for a different agent).
  if (payload.s !== input.slug) return { kind: "slug_mismatch" };

  // Closed-open expiry: now < exp is valid; now >= exp is expired.
  if (input.now.getTime() >= payload.x) return { kind: "expired" };

  return {
    kind: "valid",
    slug: payload.s,
    renterOrgId: payload.o,
    expiresAt: new Date(payload.x),
  };
}

function signPayload(payloadB64: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadB64).digest("base64url");
}
