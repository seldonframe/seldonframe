// packages/crm/src/lib/auth/signup-redirect.ts
//
// 2026-05-22 — Query-passthrough plumbing for the new card-at-signup
// flow. The marketing site funnels visitors to /signup?url=...&intent=build
// (or /signup?biz=...&intent=build). The mental model:
//
//   Marketing prompt → /signup → magic-link confirm → /signup/billing
//   (card collection) → /clients/new (build animation auto-starts)
//
// We thread the original ?url= / ?intent= through three redirects
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
// 2026-05-23 — Bug #1 fix: STOP putting `biz` in the URL chain.
// The previous code double-URL-encoded the visitor's paste through every
// hop (`/signup?biz=…` → `/signup/billing?next=…?biz=…` → Stripe's
// `return_url`). Stripe's confirmSetupIntent rejects return URLs over
// 2048 chars, so a 3KB paste blew up the whole signup. The fix is to
// move the `biz` payload off the URL entirely: marketing-hero now writes
// `sf-workspace-seed` to localStorage (per-origin, survives the magic-
// link new-tab landing), and /clients/new hydrates from it on mount.
// We keep `?url=` flowing through the URL chain since short URLs are
// harmless and that's what most marketing test traffic uses, but we
// always drop `?biz=` from the redirect chain — it must come from
// localStorage instead.
//
// Why not cookies? A signed cookie would also work, but it adds a
// dependency on cookie-domain handling (which has bitten this repo
// already — see the PKCE-cookie incident in auth.ts) AND it makes the
// flow harder to test (each hop would need cookie state). Embedding
// the short ?url= in the URL keeps that path stateless and testable;
// the long ?biz= payload lives in localStorage where it belongs.

const VALID_NEXT_PREFIXES = ["/clients/new", "/dashboard"] as const;

/**
 * Build the `next` query value the /signup form embeds into its
 * redirectTo. The resulting path lands the user on /clients/new with
 * the right prefill — either ?url=, plus ?intent=build so the build
 * animation auto-starts on mount.
 *
 * Note: `biz` is intentionally NOT placed in the URL even when passed.
 * Long paste payloads (the prod incident on 2026-05-22 was a 3KB Google
 * Maps + reviews paste) explode the URL chain past Stripe's 2048-char
 * return_url cap. Callers that have a `biz` payload should write it to
 * localStorage('sf-workspace-seed') instead; /clients/new hydrates from
 * there on mount. We still accept the param here so callers can pass
 * the intent through; this function adds `intent=build` whenever
 * `biz` is present, so /clients/new knows to auto-submit from the
 * localStorage seed.
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

  if (url) {
    params.set("url", url);
  }
  // NOTE: `biz` is deliberately NOT added to the URL — see file header.
  // It lives in localStorage('sf-workspace-seed') for the entire flow.
  // The `input.biz` parameter is intentionally ignored here; we keep
  // it in the signature so existing call sites (e.g. /signup/page.tsx)
  // don't need to change, and so future linting catches callers that
  // wrongly try to thread biz through the URL.

  // intent=build is the signal /clients/new uses to auto-submit on
  // mount. Forward it whenever the caller asked for it. /clients/new
  // resolves the actual payload from URL query first, then falls back
  // to localStorage('sf-workspace-seed') for long paste payloads. If
  // neither source has a payload, the auto-submit gracefully no-ops
  // (the user sees the IdleScene with empty inputs).
  //
  // We deliberately don't gate on `(url || biz)` anymore: the marketing
  // hero in BIZ mode forwards `?intent=build` with NO biz in the URL
  // (the biz payload is in localStorage). Gating on biz would drop
  // intent on that path and break auto-submit.
  //
  // We keep a weaker gate of "intent must literally be `build`" so an
  // arbitrary `?intent=something-else` doesn't unintentionally trigger
  // auto-submit.
  const intent = (input.intent ?? "").trim();
  if (intent === "build") {
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
 * Allows query strings on the matched routes (so ?url= + ?intent= survive
 * the trip through /signup/billing untouched).
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
