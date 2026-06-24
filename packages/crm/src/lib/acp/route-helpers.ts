// Shared helpers for the ACP checkout route handlers — body/header parsing +
// a uniform server-error response, so each thin route file stays a few lines.
//
// SIGNATURE NOTE: ACP supports a request-signature header (HMAC over the body).
// It is verified ONLY when ACP_WEBHOOK_SECRET is set — absent in v1, so the gate
// here is a no-op pass-through that becomes enforcing the moment Max sets the
// secret. Until then the endpoints are server-to-server (OpenAI-driven) and the
// signed Idempotency-Key + the no-charge processor are the safety surface.

import { NextRequest, NextResponse } from "next/server";
import type { AcpError } from "./types";

/** Read the Idempotency-Key header (ACP dedupe on create/complete). */
export function readIdempotencyKey(request: NextRequest): string | null {
  const v = request.headers.get("idempotency-key");
  return v && v.trim() ? v.trim() : null;
}

/** Parse the JSON body, tolerating an empty/malformed body as `{}` (the
 *  validators then return a structured invalid_request rather than a 500). */
export async function readJsonBody(request: NextRequest): Promise<unknown> {
  const raw = await request.text();
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Whether the request signature is acceptable. Returns true (pass) unless
 * ACP_WEBHOOK_SECRET is set AND the signature is missing/invalid. In v1 the
 * secret is unset, so this always passes — wiring real verification is a
 * documented follow-on (compare an HMAC of the raw body to a signature header).
 */
export function isRequestSignatureOk(_request: NextRequest, _rawBody: string): boolean {
  const secret = process.env.ACP_WEBHOOK_SECRET;
  if (!secret) return true; // flagged off in v1 — server-to-server only.
  // TODO(Max): when the secret is set, compute HMAC-SHA-256 over the raw body
  // and constant-time compare it to the request's signature header (mirror
  // lib/marketplace/rental-token's HMAC idiom). Until implemented, a SET secret
  // means "reject" so enabling the flag can't silently no-op.
  return false;
}

/** Uniform 500 for an unexpected error in an ACP route. Logs + returns a
 *  structured processing_error (never leaks internals to ChatGPT). */
export function acpServerError(err: unknown, op: string): NextResponse {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[acp] ${op}_error: ${message}`);
  const body: AcpError = {
    type: "processing_error",
    code: "internal_error",
    message: "An unexpected error occurred processing the checkout request.",
  };
  return NextResponse.json(body, { status: 500 });
}
