// Referral attribution capture — the `sf_ref` cookie (virality pack Task 5).
//
// When a visitor arrives at /build?ref=<referrerOrgId>, `proxy.ts` (the
// Next.js 16 request-boundary hook — see its own header for why cookie
// mutation can't happen inside /build's own page.tsx render: Next.js does
// not support setting cookies during Server Component rendering, only from
// a Route Handler / Server Function / proxy) reads the `ref` query param and
// sets an httpOnly `sf_ref` cookie so the value survives to whatever
// workspace-creation call happens next (a separate request entirely — the
// MCP client calls POST /api/v1/workspace/create with its OWN cookie jar,
// since /build is a pure marketing funnel with no client-side workspace
// creation).
//
// This module is the PURE half: given the raw `ref` query value, decide
// whether to capture it at all and what cookie to set. No Next.js imports,
// no request/response objects — so it unit-tests without a running server.
// proxy.ts (the thin glue) calls this and applies the result to a
// NextResponse.

/** The cookie name every capture + read call site must agree on. */
export const REF_COOKIE_NAME = "sf_ref";

/** 90 days, in seconds (the plan's mandated cookie lifetime). */
export const REF_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

/** The shared cookie-option shape (mirrors the httpOnly+secure+sameSite=lax
 *  convention every other auth-adjacent cookie in this codebase uses — see
 *  app/admin/[workspaceId]/route.ts's PROD_COOKIE_DEFAULTS). Exported so
 *  proxy.ts and any future reader agree on the exact same options. */
export const REF_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: REF_COOKIE_MAX_AGE_SECONDS,
};

/**
 * Decide whether an incoming `?ref=` query value should be captured into
 * the sf_ref cookie. Pure — takes the raw (possibly absent/malformed) query
 * value and the ALREADY-PRESENT cookie value (if any), returns either the
 * value to write or null (do nothing).
 *
 * Rules:
 *   • An absent/empty/whitespace-only `ref` → null (nothing to capture).
 *   • A `ref` value that's already the SAME as the current cookie → null
 *     (no-op re-write; avoids resetting the 90-day expiry on every repeat
 *     visit from the same referrer, which would let an attribution window
 *     silently extend forever).
 *   • Otherwise → the trimmed ref value (first-touch OR a genuinely new
 *     referrer overwrites — mirrors standard last-non-empty-touch
 *     attribution; recordReferral's own UNIQUE(refereeOrgId) is the actual
 *     money-safety backstop against re-attribution mattering at all once a
 *     referral is already recorded).
 *
 * Never throws — a malformed query value (e.g. an array from a duplicated
 * `?ref=a&ref=b`) is treated as absent rather than crashing the request.
 */
export function resolveRefCookieValue(
  rawRef: string | string[] | null | undefined,
  currentCookieValue: string | null | undefined,
): string | null {
  const ref = typeof rawRef === "string" ? rawRef.trim() : "";
  if (!ref) return null;
  if (ref === (currentCookieValue ?? "").trim()) return null; // already captured — no-op
  return ref;
}

/**
 * Read the sf_ref cookie's value out of a raw `Cookie` request header
 * string. Pure string parsing (mirrors this repo's existing
 * readScoreFromCookie idiom in api/v1/access-check/route.ts) so any Route
 * Handler that has `request.headers.get("cookie")` in scope — e.g. the
 * anonymous workspace-creation route — can read the referrer's org id
 * WITHOUT importing next/headers' cookies() API (which is read-write and
 * heavier than a one-line regex extraction needs to be here).
 *
 * Returns null when the header is absent or the cookie isn't present.
 * Never throws on a malformed header.
 */
export function readRefCookieFromHeader(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)sf_ref=([^;]+)/);
  if (!match) return null;
  const value = decodeURIComponent(match[1] ?? "").trim();
  return value.length > 0 ? value : null;
}
