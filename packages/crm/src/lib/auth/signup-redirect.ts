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

// 2026-05-27 — Added /settings/domain so the BYOK-first onboarding arc
// can route free-tier upsell clicks through /signup/billing?next=/settings/domain
// and have /signup/billing bounce them back to the domain page after the
// card is saved (step 3 of the 3-step onboarding arc:
// connect-ai → clients/new → settings/domain). Without /settings/domain
// here, the next= would collapse to /clients/new and the operator would
// be stranded one click away from the surface they just upgraded for.
const VALID_NEXT_PREFIXES = ["/clients/new", "/dashboard", "/settings/domain"] as const;

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
 *
 * 2026-05-27 — RETAINED but no longer the primary post-magic-link target.
 * The mandatory step 2/2 is now /signup/connect-ai (Anthropic BYOK), which
 * is far more achievable for self-serve operators than card capture (live
 * data: 0/12 signups in 3.5d completed /signup/billing). /signup/billing
 * stays accessible from /settings/billing and the over-limit upgrade
 * prompt — this helper is preserved so callers that already point at the
 * card-collection step don't break, and so future A/B tests can re-route
 * a subset of traffic if needed.
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
 * 2026-05-27 — The new mandatory step 2/2 of signup, replacing the
 * card-collection step that was a 100% drop-off wall in early signup
 * telemetry. /signup/connect-ai asks for the operator's Anthropic API
 * key (BYOK) so /clients/new can extract the first workspace directly
 * after — without it, the SSE build fails with `needs_byok` and routes
 * back here as the safety net.
 *
 * Same ?next= passthrough contract as buildSignupBillingRedirect: the
 * eventual /clients/new destination is embedded as a single URL-encoded
 * query parameter so the original ?url= + ?intent=build survive the
 * round trip through magic-link verification.
 */
export function buildSignupConnectAiRedirect(input: {
  url?: string | null;
  biz?: string | null;
  intent?: string | null;
}): string {
  const next = buildSignupNextPath(input);
  return `/signup/connect-ai?next=${encodeURIComponent(next)}`;
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

// ─── Post-auth redirect safety (marketplace buy-intent return) ────────────────
//
// 2026-06-29 — A logged-out buyer who clicks Install/Rent on a PUBLIC agent
// listing is sent to `/login?callbackUrl=<absolute app-origin listing URL>`
// (see lib/marketplace/buy-box-auth.ts). The magic-link flow only honors a
// SAME-ORIGIN relative `redirectTo`, and the action's allowlist must permit
// `/marketplace/*` for the buy intent to survive and return them to the agent.
//
// Both the form adapter (`toInternalRedirectPath`, which converts the
// `?callbackUrl=` into the hidden `redirectTo`) and the action allowlist
// (`sanitizeRedirectTo` → delegates here) share this ONE open-redirect policy
// so they can never drift. The allowlist below is the superset of every
// internal target a post-auth redirect may legitimately land on.

/**
 * The set of internal path prefixes a post-authentication redirect may target.
 * A value matches if it equals a prefix exactly OR begins with `${prefix}/`.
 * Query strings are allowed (validated on the path portion only).
 *
 * Superset of VALID_NEXT_PREFIXES plus the signup-family stops and — the point
 * of this change — `/marketplace` so a buyer returns to the agent listing they
 * were buying. Deliberately small: every entry is a real, safe destination.
 */
const SAFE_REDIRECT_PREFIXES = [
  "/clients/new",
  "/dashboard",
  "/settings/domain",
  "/signup/connect-ai",
  "/signup/billing",
  "/claim",
  "/welcome",
  "/marketplace",
  // 2026-06-30 — the builder-marketplace surface. A logged-out developer who
  // arrives from SKILL.md and clicks "Get a developer key" is sent to
  // /login?callbackUrl=/build/keys; without /build here that callbackUrl fails
  // the allowlist and collapses to /clients/new (the SMB build flow), stranding
  // the builder. Covers /build, /build/keys, and /build/wallet.
  "/build",
] as const;

/**
 * True iff `value` is a SAFE same-origin internal redirect path: a string that
 * begins with a single `/`, carries no embedded host (no `//`, no backslash, no
 * control characters, no scheme), and whose path portion is on the allowlist.
 *
 * This is the open-redirect gate shared by the magic-link action and the form
 * adapter. It NEVER returns true for an absolute URL (those have no leading
 * `/`), a protocol-relative `//host`, or a scheme like `javascript:`/`data:`.
 */
export function isSafeInternalRedirect(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const raw = value.trim();
  if (!raw.startsWith("/")) return false; // absolute URLs + scheme tricks have no leading slash
  if (raw.startsWith("//")) return false; // protocol-relative → foreign host
  // Reject backslashes (browsers normalize `\` → `/`, so `/\evil.com` and
  // `/marketplace\@evil.com` can smuggle a host) and any ASCII control char
  // (tab/newline injected to defeat naive prefix checks).
  if (/[\\\x00-\x1f]/.test(raw)) return false;
  // Reject any `..` segment so a `/marketplace/..//evil.com` can't traverse out
  // of the allowed prefix into a protocol-relative host.
  if (raw.includes("..")) return false;

  const pathOnly = raw.split(/[?#]/)[0]!;
  return SAFE_REDIRECT_PREFIXES.some(
    (prefix) => pathOnly === prefix || pathOnly.startsWith(`${prefix}/`),
  );
}

/**
 * Hosts whose absolute URLs we trust enough to extract a relative redirect path
 * from. The buy box emits the callbackUrl as an absolute app-origin URL, so we
 * accept that exact host plus the seldonframe.com family and localhost (dev /
 * preview). An absolute URL to ANY other host returns null — we never rewrite a
 * foreign URL's path into our own redirect (that would be an open-redirect by
 * path-laundering). Pure (no env read at call sites that pass a host set).
 */
const TRUSTED_REDIRECT_HOSTS = new Set([
  "app.seldonframe.com",
  "www.seldonframe.com",
  "seldonframe.com",
  "localhost",
  "127.0.0.1",
]);

function isTrustedRedirectHost(host: string): boolean {
  const h = host.toLowerCase().replace(/:\d+$/, ""); // strip port
  if (TRUSTED_REDIRECT_HOSTS.has(h)) return true;
  // Any sub-host of seldonframe.com (e.g. staging.app.seldonframe.com) is ours.
  return h.endsWith(".seldonframe.com");
}

/**
 * Collapse a raw `callbackUrl` (which `buildListingSignInUrl` emits as an
 * ABSOLUTE app-origin URL, but which may also arrive already-relative) into a
 * SAFE same-origin RELATIVE path the magic-link `redirectTo` can carry — or
 * `null` when it is not a safe internal target.
 *
 * Two accepted shapes:
 *   1. An already-relative path → validated by `isSafeInternalRedirect`.
 *   2. An absolute http(s) URL on a TRUSTED host (our app origin / a
 *      *.seldonframe.com sub-host / localhost) → its host is discarded and the
 *      pathname+search is re-validated.
 * Everything else — a foreign host, a non-http scheme (javascript:/data:/
 * mailto:), or a non-allowlisted path — returns `null` so the caller falls back
 * to its default. We never path-launder a foreign URL into the redirect.
 */
export function toInternalRedirectPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;

  // Already-relative: validate as-is (covers the safe `/marketplace/...?install=1`).
  if (raw.startsWith("/")) {
    return isSafeInternalRedirect(raw) ? raw : null;
  }

  // Otherwise it must be an absolute http(s) URL — anything else (javascript:,
  // data:, mailto:, bare word) is not a navigable internal target.
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  // CRITICAL open-redirect guard: only a trusted host's path may be extracted.
  if (!isTrustedRedirectHost(parsed.host)) return null;

  const relative = `${parsed.pathname}${parsed.search}`;
  return isSafeInternalRedirect(relative) ? relative : null;
}
