// packages/crm/src/lib/marketplace/taste/taste-token.ts
//
// Taste mode — signed opaque session token. Same proven shape as the rental
// key (lib/marketplace/rental-token.ts): tst_<b64url(payload)>.<b64url(hmac)>,
// constant-time compare, slug-bound, expiry distinct from invalid. The token
// carries ONLY {slug, sessionId, exp}; the grounding blob stays server-side in
// agent_taste_sessions (design D1 — never ship 8KB through the renter's LLM).

import { createHmac, timingSafeEqual } from "node:crypto";
import { TASTE_SESSION_TTL_MS } from "./taste-policy";

export const TASTE_TOKEN_PREFIX = "tst_";
const TOKEN_VERSION = 1;

type TastePayload = { v: number; s: string; sid: string; x: number };

export type TasteTokenVerdict =
  | { kind: "valid"; sessionId: string }
  | { kind: "slug_mismatch" }
  | { kind: "expired" }
  | { kind: "invalid" };

export function mintTasteToken(input: {
  slug: string;
  sessionId: string;
  secret: string;
  now?: Date;
}): string {
  const now = input.now ?? new Date();
  const payload: TastePayload = {
    v: TOKEN_VERSION,
    s: input.slug,
    sid: input.sessionId,
    x: now.getTime() + TASTE_SESSION_TTL_MS,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${TASTE_TOKEN_PREFIX}${payloadB64}.${sign(payloadB64, input.secret)}`;
}

export function verifyTasteToken(input: {
  token: string;
  slug: string;
  secret: string;
  now: Date;
}): TasteTokenVerdict {
  if (!input.token.startsWith(TASTE_TOKEN_PREFIX)) return { kind: "invalid" };
  const body = input.token.slice(TASTE_TOKEN_PREFIX.length);
  const dot = body.indexOf(".");
  if (dot <= 0 || dot === body.length - 1) return { kind: "invalid" };

  const payloadB64 = body.slice(0, dot);
  const presented = body.slice(dot + 1);
  const expected = sign(payloadB64, input.secret);

  let a: Buffer;
  let b: Buffer;
  try {
    a = Buffer.from(presented, "base64url");
    b = Buffer.from(expected, "base64url");
  } catch {
    return { kind: "invalid" };
  }
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { kind: "invalid" };

  let payload: TastePayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as TastePayload;
  } catch {
    return { kind: "invalid" };
  }
  if (typeof payload !== "object" || payload === null) return { kind: "invalid" };
  if (payload.v !== TOKEN_VERSION) return { kind: "invalid" };
  if (typeof payload.s !== "string" || payload.s.length === 0) return { kind: "invalid" };
  if (typeof payload.sid !== "string" || payload.sid.length === 0) return { kind: "invalid" };
  if (typeof payload.x !== "number") return { kind: "invalid" };

  if (payload.s !== input.slug) return { kind: "slug_mismatch" };
  if (input.now.getTime() >= payload.x) return { kind: "expired" };
  return { kind: "valid", sessionId: payload.sid };
}

function sign(payloadB64: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadB64).digest("base64url");
}
