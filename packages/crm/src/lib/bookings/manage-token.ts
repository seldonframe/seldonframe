// 2026-05-18 — Signed token for /booking/manage/[bookingId].
//
// Customers should be able to reschedule or cancel their booking
// directly from the confirmation email + SMS without logging in.
// We can't ask them to authenticate (they don't have an account),
// so the security model is: the email/SMS contains a URL with a
// signed token. Anyone who has the URL can manage the booking.
//
// Trade-offs:
//   - If a customer forwards the email, the recipient could cancel.
//     Acceptable for v1 — same risk as forwarding a calendar invite.
//   - Tokens don't expire. We could add an exp claim later if abuse
//     emerges. For now, tokens are valid as long as the booking row
//     exists.
//   - HMAC-SHA256 with a secret. We prefer a dedicated env var
//     BOOKING_MANAGE_SECRET; if not set, we derive a stable secret
//     from AUTH_SECRET (always present in production) so signing
//     still works without ops touching the config.
//
// Token shape: <bookingId>.<base64url(hmac)>. We include the booking
// id in the token so we don't need to parse it out of the URL path
// for verification — the path-id and token-id MUST match.

import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_DERIVATION_INPUT = "seldonframe:booking-manage-token:v1";

function getSecret(): string {
  const explicit = process.env.BOOKING_MANAGE_SECRET?.trim();
  if (explicit && explicit.length > 0) return explicit;
  // Fall back to a stable derivation off AUTH_SECRET so the signing
  // works on every Vercel deploy without requiring a new env var.
  const authSecret = process.env.AUTH_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim() || "";
  if (!authSecret) {
    // Even in tests / local dev we want SOMETHING — a deterministic
    // string is fine. Production should always have AUTH_SECRET.
    return DEFAULT_DERIVATION_INPUT;
  }
  return createHmac("sha256", authSecret).update(DEFAULT_DERIVATION_INPUT).digest("hex");
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): Buffer | null {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "==".slice(0, (4 - (value.length % 4)) % 4);
    return Buffer.from(padded, "base64");
  } catch {
    return null;
  }
}

/** Sign a bookingId into a URL-safe token. The resulting token IS
 *  the bookingId plus an HMAC suffix, so it's self-contained. */
export function signBookingManageToken(bookingId: string): string {
  if (!bookingId) return "";
  const sig = createHmac("sha256", getSecret()).update(bookingId).digest();
  return `${bookingId}.${base64UrlEncode(sig)}`;
}

/** Verify a token matches the expected bookingId. Returns true only
 *  when the token decodes, the embedded id matches, and the HMAC is
 *  valid. Constant-time comparison — no timing-leak signal. */
export function verifyBookingManageToken(expectedBookingId: string, token: string): boolean {
  if (!expectedBookingId || !token) return false;
  const dotIndex = token.indexOf(".");
  if (dotIndex <= 0) return false;
  const idPart = token.slice(0, dotIndex);
  const sigPart = token.slice(dotIndex + 1);
  if (idPart !== expectedBookingId) return false;
  const providedSig = base64UrlDecode(sigPart);
  if (!providedSig) return false;
  const expectedSig = createHmac("sha256", getSecret()).update(expectedBookingId).digest();
  if (providedSig.length !== expectedSig.length) return false;
  try {
    return timingSafeEqual(providedSig, expectedSig);
  } catch {
    return false;
  }
}

/** Convenience: build the full public URL for the manage page.
 *  baseUrl should be the workspace's configured base (custom domain
 *  takes precedence; falls back to app.seldonframe.com). */
export function buildBookingManageUrl(baseUrl: string, bookingId: string): string {
  const token = signBookingManageToken(bookingId);
  const trimmedBase = baseUrl.replace(/\/+$/, "");
  return `${trimmedBase}/booking/manage/${bookingId}?token=${encodeURIComponent(token)}`;
}
