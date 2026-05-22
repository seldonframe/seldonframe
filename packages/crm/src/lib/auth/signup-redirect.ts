// packages/crm/src/lib/auth/signup-redirect.ts
//
// 2026-05-22 — Query-passthrough plumbing for the new card-at-signup
// flow. The marketing site funnels visitors to /signup?url=...&intent=build
// (or /signup?biz=...&intent=build). The mental model:
//
//   Marketing prompt → /signup → magic-link confirm → /signup/billing
//   (card collection) → /clients/new (build animation auto-starts)
//
// We thread the original ?url= / ?biz= / ?intent= through three redirects
// without losing them. The simplest scheme is to embed the final
// destination as a single signed-ish `next` query param at each hop:
//
//   1. /signup posts: redirectTo = "/signup/billing?next=/clients/new?url=..."
//   2. Magic-link callback redirects to that redirectTo verbatim (NextAuth
//      treats redirectTo as opaque so the embedded ?next= survives).
//   3. /signup/billing reads ?next= and validates it, then redirects on
//      submit.
//
// All path values are sanitized at every hop so a hostile ?url= can't
// turn into an open-redirect. The whitelist of next-paths is small:
// /clients/new is the post-signup landing for the build flow, /dashboard
// is the safe default if no intent was passed.
//
// Why not cookies? A signed cookie would also work, but it adds a
// dependency on cookie-domain handling (which has bitten this repo
// already — see the PKCE-cookie incident in auth.ts) AND it makes the
// flow harder to test (each hop would need cookie state). Embedding
// the path in the URL keeps the flow stateless and testable.

const VALID_NEXT_PREFIXES = ["/clients/new", "/dashboard"] as const;

/**
 * Build the `next` query value the /signup form embeds into its
 * redirectTo. The resulting path lands the user on /clients/new with
 * the right prefill — either ?url=, or ?biz=, plus ?intent=build so
 * the build animation auto-starts on mount.
 *
 * Defaults to /clients/new (without prefill) if both url + biz are
 * empty — preserves the existing "signup → /clients/new" landing
 * behaviour for organic signups.
 */
export function buildSignupNextPath(input: {
  url?: string | null;
  biz?: string | null;
  intent?: string | null;
}): string {
  const params = new URLSearchParams();

  // Trim + length-cap each value so a malicious caller can't bloat the
  // redirect URL past sane bounds. 2048 chars is the practical floor
  // across browsers + Vercel's edge.
  const url = (input.url ?? "").trim().slice(0, 1024);
  const biz = (input.biz ?? "").trim().slice(0, 1024);

  if (url) {
    params.set("url", url);
  } else if (biz) {
    params.set("biz", biz);
  }

  // intent=build is the signal /clients/new uses to auto-submit on
  // mount. Only forward it when we actually have a payload to submit;
  // bare /clients/new without prefill should NOT auto-submit (the user
  // typed nothing on the marketing site).
  const intent = (input.intent ?? "").trim();
  if (intent === "build" && (url || biz)) {
    params.set("intent", "build");
  }

  const qs = params.toString();
  return qs ? `/clients/new?${qs}` : "/clients/new";
}

/**
 * Build the redirectTo URL the magic-link callback will land on after
 * the user confirms their email. Embeds the eventual /clients/new
 * destination as ?next= so /signup/billing can pick it up after card
 * confirmation.
 *
 * Returned path is always relative (no host) — NextAuth's redirectTo
 * validation refuses cross-origin redirects, so keeping this relative
 * matches the project's existing sanitizeRedirectTo policy.
 */
export function buildSignupBillingRedirect(input: {
  url?: string | null;
  biz?: string | null;
  intent?: string | null;
}): string {
  const next = buildSignupNextPath(input);
  return `/signup/billing?next=${encodeURIComponent(next)}`;
}

/**
 * Sanitize the ?next= query param /signup/billing reads. Returns a
 * safe internal path that one of /clients/new or /dashboard. Anything
 * else (cross-origin, no leading slash, protocol-relative //, unknown
 * route) collapses to /clients/new — the most useful default for a
 * post-billing landing.
 *
 * Allows query strings on the matched routes (so ?url= + ?biz= +
 * ?intent= survive the trip through /signup/billing untouched).
 */
export function sanitizeNextPath(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "/clients/new";
  if (!raw.startsWith("/")) return "/clients/new";
  if (raw.startsWith("//")) return "/clients/new"; // protocol-relative

  // Strip the query for the prefix check — we only validate the path
  // portion against the allowlist. Query string is left intact.
  const pathOnly = raw.split("?")[0]!;

  const matched = VALID_NEXT_PREFIXES.some(
    (prefix) => pathOnly === prefix || pathOnly.startsWith(`${prefix}/`),
  );
  return matched ? raw : "/clients/new";
}
