// Pure helpers for the public listing buy box's auth/UX gating.
//
// The agent marketplace listing page is PUBLIC and SEO/GEO — it is served on
// BOTH www.seldonframe.com and app.seldonframe.com and is browsable by anonymous
// visitors. Its Install / Rent-via-MCP actions require a logged-in org. But the
// NextAuth session cookie is HOST-ONLY (no cookies.domain override in
// authConfig), so it exists only on app.seldonframe.com — never on www. So a
// logged-out visitor (or any visitor on www) must be sent to the APP origin's
// sign-in, with a callbackUrl back to the listing on the APP origin, so that
// after login the action runs where the cookie lives.
//
// These are pure string builders (no Next, no cookies) so they're unit-testable
// and shared by the server page (which passes signInUrl to the client island).

/** The canonical app origin where the session cookie + Install action live.
 *  Prefer NEXT_PUBLIC_APP_URL; fall back to the production app host the listing
 *  UI already advertises elsewhere (rental endpoint, OG strip). Trailing slash
 *  stripped. */
export function resolveAppOrigin(envUrl?: string | null): string {
  const raw = (envUrl ?? "").trim();
  const base = raw.length > 0 ? raw : "https://app.seldonframe.com";
  return base.replace(/\/+$/, "");
}

/**
 * Build the sign-in URL a logged-out buyer is sent to from the buy box.
 *
 * Always targets the APP origin (where the session cookie lives) and carries a
 * `callbackUrl` pointing back to THIS listing on the APP origin, so post-login
 * the visitor returns to the listing already authenticated and can install.
 *
 * @param slug      the listing slug (e.g. "ai-phone-receptionist")
 * @param appOrigin the resolved app origin (defaults to resolveAppOrigin()).
 */
export function buildListingSignInUrl(slug: string, appOrigin?: string): string {
  const origin = (appOrigin ?? resolveAppOrigin(process.env.NEXT_PUBLIC_APP_URL)).replace(/\/+$/, "");
  const safeSlug = String(slug ?? "").trim();
  // The post-login destination: the listing itself, on the app origin (so the
  // session cookie is present when Install runs).
  const callbackPath = safeSlug ? `/marketplace/${encodeURIComponent(safeSlug)}` : "/marketplace";
  const callbackUrl = `${origin}${callbackPath}`;
  return `${origin}/login?callbackUrl=${encodeURIComponent(callbackUrl)}`;
}
