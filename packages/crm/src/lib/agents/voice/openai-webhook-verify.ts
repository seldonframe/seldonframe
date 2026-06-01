// OpenAI Realtime webhook signature verification — Standard Webhooks scheme.
//
// PHASE 0 (voice hello-world). This is the credential gate on the inbound
// `realtime.call.incoming` webhook. OpenAI signs webhooks per the Standard
// Webhooks spec (https://www.standardwebhooks.com), the SAME scheme Svix uses:
//
//   signed_content = `${webhook-id}.${webhook-timestamp}.${rawBody}`
//   signature      = base64( HMAC_SHA256( base64decode(secret_after_whsec_),
//                                         signed_content ) )
//
// Headers (lower-cased by fetch/Next):
//   webhook-id         — unique message id, part of the signed content
//   webhook-timestamp  — unix SECONDS, part of the signed content + replay guard
//   webhook-signature  — space-delimited list of `v1,<base64sig>` entries
//                        (multiple entries support zero-downtime key rotation)
//
// The secret arrives as `whsec_<base64>`. The bytes AFTER the `whsec_` prefix
// are base64 and must be decoded before use as the HMAC key. (A raw secret with
// no prefix is treated as UTF-8 bytes — tolerant fallback for misconfigured
// dashboards, matching the Standard Webhooks reference libs.)
//
// WHY HAND-ROLLED (not the `openai` SDK's webhooks.unwrap): the `openai`
// package is not a dependency of this app, and pulling the full client SDK
// into a Vercel function just to HMAC ~100 bytes is wasteful. The scheme is
// tiny, stable, and standardised — Node's built-in `crypto` covers it. This
// also keeps the verifier trivially unit-testable with a synthesized signature
// (no network, no client construction). If the SDK is later added for other
// reasons, this can be swapped for `client.webhooks.unwrap` with no behavior
// change.

import { createHmac, timingSafeEqual } from "node:crypto";

/** Tolerance (seconds) for the replay-protection timestamp check. Standard
 *  Webhooks recommends 5 minutes; OpenAI uses the same. A webhook whose
 *  `webhook-timestamp` is older/newer than this is rejected even if the HMAC
 *  is valid, so a captured-and-replayed request can't be re-accepted. */
export const WEBHOOK_TOLERANCE_SECONDS = 300;

export type WebhookHeaders = {
  /** `webhook-id` header. */
  id: string | null;
  /** `webhook-timestamp` header (unix seconds, as a string). */
  timestamp: string | null;
  /** `webhook-signature` header (`v1,<sig> v1,<sig> ...`). */
  signature: string | null;
};

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: VerifyFailureReason };

export type VerifyFailureReason =
  | "missing_secret"
  | "missing_headers"
  | "bad_timestamp"
  | "timestamp_out_of_tolerance"
  | "no_signatures"
  | "signature_mismatch";

/**
 * Pull the three Standard Webhooks headers out of a Fetch `Headers` object.
 * Header names are case-insensitive; `Headers.get` already lowercases.
 */
export function extractWebhookHeaders(headers: Headers): WebhookHeaders {
  return {
    id: headers.get("webhook-id"),
    timestamp: headers.get("webhook-timestamp"),
    signature: headers.get("webhook-signature"),
  };
}

/** Decode a `whsec_`-prefixed (or bare) secret into the raw HMAC key bytes. */
function secretToKey(secret: string): Buffer {
  const trimmed = secret.trim();
  const body = trimmed.startsWith("whsec_") ? trimmed.slice("whsec_".length) : trimmed;
  // Standard Webhooks secrets are base64 after the prefix. If the value isn't
  // valid base64 (a misconfigured raw secret), Buffer.from(..., "base64") is
  // lenient and yields *some* bytes; to stay aligned with the reference libs we
  // base64-decode the post-prefix value. For a prefix-less raw secret we still
  // base64-decode (that's what the spec mandates for `whsec_` secrets, and the
  // dashboard always emits the prefix form).
  return Buffer.from(body, "base64");
}

/**
 * Compute the expected base64 signature for a given id/timestamp/body.
 * Exported for tests so a fixture can be signed without duplicating the scheme.
 */
export function computeSignature(params: {
  secret: string;
  id: string;
  timestamp: string;
  body: string;
}): string {
  const signedContent = `${params.id}.${params.timestamp}.${params.body}`;
  return createHmac("sha256", secretToKey(params.secret))
    .update(signedContent, "utf8")
    .digest("base64");
}

/** Constant-time compare of two base64 signature strings. Length-mismatch is
 *  short-circuited (timingSafeEqual throws on unequal-length buffers) — the
 *  length of an HMAC-SHA256 base64 digest is fixed, so an early length check
 *  leaks nothing useful to an attacker. */
function signaturesEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Verify an OpenAI (Standard Webhooks) signature.
 *
 * @param params.payload   The RAW request body string. MUST be the exact bytes
 *                         received (read via `request.text()` BEFORE any JSON
 *                         parsing) — re-serializing parsed JSON changes
 *                         whitespace/key-order and breaks the HMAC.
 * @param params.headers   The three webhook-* headers.
 * @param params.secret    `OPENAI_WEBHOOK_SECRET` (`whsec_...`).
 * @param params.nowSeconds Injectable clock for tests; defaults to Date.now().
 *
 * Returns a discriminated result — never throws. The route maps `ok:false` to
 * a 401 and logs the `reason` (no secret material is ever logged).
 */
export function verifyOpenAiWebhook(params: {
  payload: string;
  headers: WebhookHeaders;
  secret: string | undefined;
  nowSeconds?: number;
}): VerifyResult {
  const { payload, headers, secret } = params;

  if (!secret || secret.trim() === "") {
    return { ok: false, reason: "missing_secret" };
  }
  if (!headers.id || !headers.timestamp || !headers.signature) {
    return { ok: false, reason: "missing_headers" };
  }

  // Replay protection: timestamp must be a number within tolerance of now.
  const ts = Number.parseInt(headers.timestamp, 10);
  if (!Number.isFinite(ts)) {
    return { ok: false, reason: "bad_timestamp" };
  }
  const now = params.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > WEBHOOK_TOLERANCE_SECONDS) {
    return { ok: false, reason: "timestamp_out_of_tolerance" };
  }

  const expected = computeSignature({
    secret,
    id: headers.id,
    timestamp: headers.timestamp,
    body: payload,
  });

  // The signature header is a space-delimited list of `version,signature`
  // pairs. We accept v1 entries and match against any of them (key rotation).
  const presented = headers.signature
    .split(" ")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const commaIdx = entry.indexOf(",");
      // `v1,<sig>` → take the part after the first comma. An entry with no
      // comma is treated as a bare signature (lenient).
      return commaIdx === -1 ? entry : entry.slice(commaIdx + 1);
    });

  if (presented.length === 0) {
    return { ok: false, reason: "no_signatures" };
  }

  const matched = presented.some((sig) => signaturesEqual(sig, expected));
  return matched ? { ok: true } : { ok: false, reason: "signature_mismatch" };
}
