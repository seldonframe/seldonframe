import { NextFetchEvent, NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { resolveRefCookieValue, REF_COOKIE_NAME, REF_COOKIE_OPTIONS } from "@/lib/growth/ref-cookie";
import { auth } from "@/auth";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { enforcePlanGate } from "@/middleware/plan-gate";
import { negotiate } from "@/lib/http/negotiate";
import {
  AI_AGENTS_INDEX_MD_ROUTE,
  AI_AGENTS_LISTING_MD_ROUTE,
  parseExplicitAiAgentMarkdownPath,
  negotiableAiAgentPage,
  type AiAgentMarkdownTarget,
} from "@/lib/http/ai-agents-md-paths";
import {
  logMarkdownFetch,
  type MarkdownSurface,
  type MarkdownFetchMode,
} from "@/lib/marketplace/md-analytics";

const protectedPrefixes = ["/hub", "/dashboard", "/welcome", "/orgs", "/contacts", "/deals", "/activities", "/forms", "/settings", "/api/v1"];
const publicPrefixes = ["/api/v1", "/api/auth"];
const defaultAppHosts = new Set(["app.seldonframe.com", "localhost", "127.0.0.1"]);
const marketingHosts = new Set(["seldonframe.com", "www.seldonframe.com"]);
const appHostFallback = "app.seldonframe.com";
// The builder MCP host the /build page's connect snippet + SKILL.md advertise
// (mirrors SKILL_MD_MCP_URL / MCP_URL — src/lib/build/skill-md.ts,
// src/components/settings/api-key-manager.tsx). Hardcoded like those two, for
// the same reason: it's one fixed, publicly-documented URL, not a per-tenant
// domain.
const builderMcpHosts = new Set(["mcp.seldonframe.com"]);

function normalizeHost(host: string | null) {
  if (!host) return "";
  return host.trim().toLowerCase().replace(/:\d+$/, "");
}

function getRequestHost(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const candidate = forwardedHost?.split(",")[0]?.trim() || request.headers.get("host");
  return normalizeHost(candidate);
}

function resolveWorkspaceSlugFromHost(host: string) {
  const workspaceBaseDomain = (process.env.WORKSPACE_BASE_DOMAIN?.trim().toLowerCase() || "app.seldonframe.com")
    .replace(/^\.+/, "")
    .replace(/\.+$/, "");

  if (!workspaceBaseDomain || host === workspaceBaseDomain) {
    return null;
  }

  const suffix = `.${workspaceBaseDomain}`;
  if (!host.endsWith(suffix)) {
    return null;
  }

  const subdomain = host.slice(0, -suffix.length);
  if (!subdomain || subdomain.includes(".")) {
    return null;
  }

  if (subdomain === "app" || subdomain === "www") {
    return null;
  }

  return subdomain;
}

// Admin paths that should NEVER be served from a workspace subdomain.
// When a user visits e.g. `<slug>.app.seldonframe.com/dashboard`, the proxy
// 302-redirects to `app.seldonframe.com/switch-workspace?to=<orgId>&next=/dashboard`
// — which authenticates them, sets the active-org cookie, and lands on the
// admin page. Without this, the request would fall through to the catch-all
// rewrite and return 404 (no `/s/<slug>/dashboard` landing page exists).
const WORKSPACE_SUBDOMAIN_ADMIN_PREFIXES = [
  "/dashboard",
  "/contacts",
  "/deals",
  "/agents",
  "/settings",
  "/activities",
];

function resolveWorkspaceAdminRedirect(
  pathname: string,
  orgId: string,
  search: string,
): URL | null {
  if (!orgId) return null;
  const isAdminPath = WORKSPACE_SUBDOMAIN_ADMIN_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (!isAdminPath) return null;
  const target = new URL("https://app.seldonframe.com/switch-workspace");
  target.searchParams.set("to", orgId);
  target.searchParams.set("next", `${pathname}${search ?? ""}`);
  return target;
}

function resolveWorkspaceRewritePath(
  pathname: string,
  slug: string,
  defaults?: {
    landingSlug?: string;
    bookingSlug?: string;
    formSlug?: string;
  }
) {
  const defaultLandingSlug = defaults?.landingSlug || "home";
  const defaultBookingSlug = defaults?.bookingSlug || "default";
  const defaultFormSlug = defaults?.formSlug || "intake";
  const segments = pathname.split("/").filter(Boolean);

  if (pathname === "/" || pathname === "") {
    return `/s/${slug}/${defaultLandingSlug}`;
  }

  if (pathname === "/book") {
    return `/book/${slug}/${defaultBookingSlug}`;
  }

  if (pathname === "/forms" || pathname === "/intake") {
    return `/forms/${slug}/${defaultFormSlug}`;
  }

  if (pathname === "/l" || pathname === "/s") {
    return `/s/${slug}/${defaultLandingSlug}`;
  }

  if (pathname.startsWith("/book/") && segments.length === 2) {
    return `/book/${slug}/${segments[1] || defaultBookingSlug}`;
  }

  if (pathname.startsWith("/forms/") && segments.length === 2) {
    return `/forms/${slug}/${segments[1] || defaultFormSlug}`;
  }

  if (pathname.startsWith("/intake/") && segments.length === 2) {
    return `/forms/${slug}/${segments[1] || defaultFormSlug}`;
  }

  if (pathname.startsWith("/l/") && segments.length === 2) {
    return `/s/${slug}/${segments[1] || defaultLandingSlug}`;
  }

  // Smoke FIX-6: R1 multi-page service links. Generated sites emit
  // root-relative href="/services/<svc>"; the per-service detail renderer
  // lives at /w/[slug]/services/[service], NOT in the /s catch-all the
  // generic fallback below rewrites into (which 404s). Route it directly.
  if (segments[0] === "services" && segments.length === 2) {
    return `/w/${slug}/services/${segments[1]}`;
  }

  if (!pathname.startsWith("/book/") && !pathname.startsWith("/forms/") && !pathname.startsWith("/api/")) {
    const normalizedPath = pathname.replace(/^\/+/, "");
    return normalizedPath ? `/s/${slug}/${normalizedPath}` : `/s/${slug}/${defaultLandingSlug}`;
  }

  return pathname;
}

function isAppHost(host: string) {
  return defaultAppHosts.has(host) || host.endsWith(".vercel.app");
}

function isAuthPath(pathname: string) {
  return pathname === "/login" || pathname === "/signup" || pathname === "/clients/new" || pathname === "/welcome";
}

function isProtectedPath(pathname: string) {
  return protectedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isPublicPath(pathname: string) {
  if (publicPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return true;
  }

  if (pathname.startsWith("/forms/") && pathname.split("/").filter(Boolean).length >= 3) {
    return true;
  }

  if (pathname.startsWith("/book/") && pathname.split("/").filter(Boolean).length >= 3) {
    return true;
  }

  if (pathname.startsWith("/l/") && pathname.split("/").filter(Boolean).length >= 3) {
    return true;
  }

  if (pathname.startsWith("/s/") && pathname.split("/").filter(Boolean).length >= 3) {
    return true;
  }

  return false;
}

// C6: presence-only admin-token check. Validation happens at the page layer
// (requireAuth → resolveAdminTokenContext) where we have full server-runtime
// access to the DB. The middleware just needs to know whether to LET THE
// REQUEST THROUGH — a forged cookie reaches the page, fails requireAuth's
// real validation, and redirects to /login. No security risk because every
// data access still requires a real session from requireAuth.
const ADMIN_TOKEN_COOKIE_NAME = "sf_admin_token";
function hasAdminTokenCookie(request: NextRequest): boolean {
  const value = request.cookies.get(ADMIN_TOKEN_COOKIE_NAME)?.value;
  return Boolean(value && value.startsWith("wst_"));
}

// ─── Agent-Markdown content negotiation (scoped to /marketplace only) ─────────
//
// SAFETY: this runs ONLY for the marketplace paths the matcher admits
// (/marketplace, /marketplace/<slug>, and an explicit /marketplace/<slug>.md),
// and only ever serves Markdown when the request asks for it — either by an
// explicit `.md` URL, or when the client EXPLICITLY prefers text/markdown
// (negotiate() compares q-values and requires text/markdown to be named —
// `*/*` browsers get HTML). Every HTML case returns the normal HTML response,
// merely annotated with `Vary: Accept` + a `Link` rel="alternate" pointing at
// the public `.md` twin so CDNs cache the two representations separately and
// crawlers can discover the twin.
//
// The per-listing Markdown is served by a STATIC route, `/marketplace/listing.md`,
// that reads the slug from a `?slug=` query param. We do NOT use a `[slug].md`
// dynamic-dot folder: Next 16 cannot extract the param from a dotted dynamic
// segment, so its generated route-type validator can't be satisfied and
// typecheck breaks (TS2344). The public URLs are preserved entirely here — both
// the explicit `/marketplace/<slug>.md` and the negotiated `/marketplace/<slug>`
// are internally rewritten to `/marketplace/listing.md?slug=<slug>`.
//
// The index `.md` (`/marketplace.md`) IS a static route too and is reached
// directly (it has no dynamic segment), so we only need to rewrite it for the
// negotiated `/marketplace` HTML request.

/**
 * Best-effort server-side measurement of an agent-Markdown fetch from the proxy
 * (design doc technique #6). Logged HERE — at the single choke point every
 * matched `.md` / negotiated request passes through — so we capture the real
 * public URL + the request's UA/Referer once per request, BEFORE the internal
 * rewrite to a `listing.md`/index route hides them. `mode` distinguishes an
 * explicit `.md` URL from an `Accept`-negotiated HTML→Markdown flip (the
 * high-signal "a real agent speaks text/markdown" case). Never throws — the
 * helper is fully guarded — so it can't affect routing.
 */
function logMd(request: NextRequest, surface: MarkdownSurface, mode: MarkdownFetchMode): void {
  logMarkdownFetch(request, { surface, mode, path: request.nextUrl.pathname });
}

/** Rewrite target on the app for a per-listing Markdown request (the static
 *  `listing.md` route, slug carried as a query param so the folder stays a
 *  bracket-free static segment). A fresh `URL` is built from the request URL so
 *  the origin is preserved while the path + query are set cleanly. */
function listingMarkdownRewrite(url: URL, slug: string): NextResponse {
  const target = new URL("/marketplace/listing.md", url);
  target.searchParams.set("slug", slug);
  const res = NextResponse.rewrite(target);
  res.headers.set("Vary", "Accept");
  return res;
}

/** The PUBLIC path of the `.md` twin for a negotiable marketplace HTML path
 *  (used only for the advertised `Link` header), or null when none. */
function markdownTwinPath(pathname: string): string | null {
  if (pathname === "/marketplace") return "/marketplace.md";
  const m = /^\/marketplace\/([^/]+)$/.exec(pathname);
  if (!m) return null;
  const slug = m[1];
  if (slug === "build" || slug.includes(".")) return null;
  return `/marketplace/${slug}.md`;
}

/**
 * Handle a request to a marketplace path. Returns a Response when this branch
 * OWNS the request; returns null ONLY for non-marketplace paths so the caller
 * falls through to the normal proxy pipeline untouched.
 *
 * It owns EVERY `/marketplace` and `/marketplace/...` path (all public, served
 * on the app host) so none of them ever reach authProxy — preserving today's
 * behavior, where the proxy matcher didn't admit marketplace at all.
 *
 * Three things produce Markdown:
 *   1. An explicit `/marketplace/<slug>.md` URL → rewrite to the static
 *      `/marketplace/listing.md?slug=<slug>` (strip `.md`, pass the slug).
 *   2. A `/marketplace/<slug>` HTML request whose Accept prefers markdown →
 *      same rewrite (the visible URL is unchanged).
 *   3. The index: `/marketplace.md` is reached directly; a `/marketplace` HTML
 *      request whose Accept prefers markdown → rewrite to `/marketplace.md`.
 * Everything else (the HTML pages, /marketplace/build, the static `.md` routes
 * themselves) passes through, the HTML listing/index pages additionally
 * advertising their `.md` twin via Vary + Link.
 */
function handleMarketplaceNegotiation(request: NextRequest): NextResponse | null {
  const pathname = request.nextUrl.pathname;
  if (pathname !== "/marketplace" && !pathname.startsWith("/marketplace/")) {
    return null; // not a marketplace path → don't touch it.
  }

  // Loop guard + static-route passthrough: the rewrite targets (and the index
  // `.md`) are already the Markdown routes — never rewrite them again, just let
  // them reach their handler. `/marketplace/listing.md` is also where (1)/(2)
  // land, so this MUST come before any rewrite below.
  //
  // Measurement note: the index `.md` reached DIRECTLY (a crawler fetching
  // `/marketplace.md`) is logged here. `/marketplace/listing.md` is ONLY ever the
  // internal rewrite target of (1)/(2) — it is NOT logged here (those branches
  // already logged the originating public URL), so each request is counted once.
  if (pathname === "/marketplace.md") {
    logMd(request, "marketplace_index", "explicit_md");
    return NextResponse.next();
  }
  if (pathname === "/marketplace/listing.md") {
    return NextResponse.next();
  }

  // (1) Explicit per-listing `.md` URL → serve Markdown from the static route.
  const explicitMd = /^\/marketplace\/([^/]+)\.md$/.exec(pathname);
  if (explicitMd) {
    const slug = explicitMd[1];
    // `/marketplace/build.md` etc. have no listing twin — let them 404 naturally
    // rather than rewriting to a guaranteed-missing slug.
    if (slug && slug !== "build") {
      logMd(request, "marketplace_listing", "explicit_md");
      return listingMarkdownRewrite(request.nextUrl, slug);
    }
    return NextResponse.next();
  }

  const twin = markdownTwinPath(pathname);
  if (!twin) {
    // A marketplace path with no Markdown twin (e.g. /marketplace/build, or a
    // deeper subpath) — pass it straight through to its own page as HTML.
    return NextResponse.next();
  }

  const wantsMarkdown = negotiate(request.headers.get("accept")) === "markdown";

  if (wantsMarkdown) {
    // Same URL, Markdown representation — rewrite (not redirect) so the visible
    // URL is unchanged. Declared via Vary: Accept.
    if (pathname === "/marketplace") {
      logMd(request, "marketplace_index", "accept_negotiated");
      const url = request.nextUrl.clone();
      url.pathname = "/marketplace.md";
      const res = NextResponse.rewrite(url);
      res.headers.set("Vary", "Accept");
      return res;
    }
    // /marketplace/<slug> → static listing route with the slug as a query param.
    logMd(request, "marketplace_listing", "accept_negotiated");
    const slug = /^\/marketplace\/([^/]+)$/.exec(pathname)?.[1] ?? "";
    return listingMarkdownRewrite(request.nextUrl, slug);
  }

  // Default: serve the HTML page unchanged, advertising the public `.md` twin.
  const res = NextResponse.next();
  res.headers.set("Vary", "Accept");
  res.headers.append("Link", `<${twin}>; rel="alternate"; type="text/markdown"`);
  return res;
}

// ─── Agent-Markdown content negotiation (scoped to /ai-agents only) ───────────
//
// SAFETY: identical, conservative shape to the marketplace handler above —
// scoped ONLY to the /ai-agents paths the matcher admits, only ever serving
// Markdown when the request asks for it (an explicit `.md` URL, or an Accept
// that EXPLICITLY prefers text/markdown — `*/*` browsers get HTML). Every HTML
// case returns the normal HTML response, merely annotated with `Vary: Accept` +
// a `Link` rel="alternate" pointing at the public `.md` twin.
//
// The per-page Markdown is served by a STATIC route, `/ai-agents/listing.md`,
// that reads the job (+ optional vertical) from `?job=`/`?vertical=` query
// params — NOT a `[job].md`/`[vertical].md` dotted dynamic folder (Next 16 can't
// extract the param from a dotted dynamic segment, so its generated route-type
// validator can't be satisfied and typecheck breaks — the M1 lesson). The
// public `.md` URLs are preserved entirely here: the Tier-1 `/ai-agents/<job>.md`
// and the Tier-2 `/ai-agents/<job>/for/<vertical>.md` (and their negotiated HTML
// twins) are all internally rewritten to `/ai-agents/listing.md?job=…&vertical=…`.
//
// The index `.md` (`/ai-agents.md`) IS a static route reached directly (no
// dynamic segment), so we only rewrite it for the negotiated `/ai-agents` HTML.

/** Rewrite a request to the static `/ai-agents/listing.md` route, carrying the
 *  page's job + optional vertical as query params so the folder stays a
 *  bracket-free static segment (the M1 dotted-route lesson). */
function aiAgentMarkdownRewrite(url: URL, target: AiAgentMarkdownTarget): NextResponse {
  const dest = new URL(AI_AGENTS_LISTING_MD_ROUTE, url);
  dest.searchParams.set("job", target.job);
  if (target.vertical) dest.searchParams.set("vertical", target.vertical);
  const res = NextResponse.rewrite(dest);
  res.headers.set("Vary", "Accept");
  return res;
}

/**
 * Handle a request to an /ai-agents path. Returns a Response when this branch
 * OWNS the request (every /ai-agents and /ai-agents/... path is public, served
 * on the app host); returns null ONLY for non-/ai-agents paths so the caller
 * falls through untouched.
 *
 * It owns EVERY `/ai-agents` and `/ai-agents/...` path (all public) so none of
 * them reach authProxy — they were never in the proxy matcher before, so this
 * preserves today's behavior (the pages already render publicly via the
 * (public) route group).
 *
 * The path math (which public `.md` URL maps to which `listing.md` query, and
 * which HTML page is negotiable) lives in the pure, unit-tested
 * lib/http/ai-agents-md-paths module so this stays a thin Next adapter.
 *
 * Markdown is produced for:
 *   1. An explicit `/ai-agents/<job>.md` or `/ai-agents/<job>/for/<vertical>.md`
 *      URL → rewrite to `/ai-agents/listing.md?job=…&vertical=…`.
 *   2. An HTML request (`/ai-agents`, `/ai-agents/<job>`, `/ai-agents/<job>/for/
 *      <vertical>`) whose Accept explicitly prefers markdown → same rewrite (the
 *      visible URL is unchanged).
 * Everything else passes through as HTML, the answer pages additionally
 * advertising their `.md` twin via Vary + Link.
 */
function handleAiAgentsNegotiation(request: NextRequest): NextResponse | null {
  const pathname = request.nextUrl.pathname;
  if (pathname !== "/ai-agents" && !pathname.startsWith("/ai-agents/")) {
    return null; // not an /ai-agents path → don't touch it.
  }

  // Loop guard + static-route passthrough: the rewrite targets (and the index
  // `.md`) are already the Markdown routes — never rewrite them again. This MUST
  // come before any rewrite below.
  //
  // Measurement note: the index `.md` reached DIRECTLY is logged here.
  // `/ai-agents/listing.md` is ONLY ever the internal rewrite target of (1)/(2),
  // so it is NOT logged here — its originating public URL was already logged.
  if (pathname === AI_AGENTS_INDEX_MD_ROUTE) {
    logMd(request, "ai_agents_index", "explicit_md");
    return NextResponse.next();
  }
  if (pathname === AI_AGENTS_LISTING_MD_ROUTE) {
    return NextResponse.next();
  }

  // (1) Explicit `.md` URLs → serve Markdown from the static route.
  const explicit = parseExplicitAiAgentMarkdownPath(pathname);
  if (explicit) {
    logMd(request, "ai_agents_listing", "explicit_md");
    return aiAgentMarkdownRewrite(request.nextUrl, explicit);
  }

  // The index is negotiable but has a fixed twin/route (no job param).
  if (pathname === "/ai-agents") {
    if (negotiate(request.headers.get("accept")) === "markdown") {
      logMd(request, "ai_agents_index", "accept_negotiated");
      const url = request.nextUrl.clone();
      url.pathname = AI_AGENTS_INDEX_MD_ROUTE;
      const res = NextResponse.rewrite(url);
      res.headers.set("Vary", "Accept");
      return res;
    }
    const res = NextResponse.next();
    res.headers.set("Vary", "Accept");
    res.headers.append("Link", `<${AI_AGENTS_INDEX_MD_ROUTE}>; rel="alternate"; type="text/markdown"`);
    return res;
  }

  const page = negotiableAiAgentPage(pathname);
  if (!page) {
    // An /ai-agents path with no Markdown twin (e.g. a deeper/unknown subpath) —
    // pass it straight through to its own page as HTML.
    return NextResponse.next();
  }

  if (negotiate(request.headers.get("accept")) === "markdown") {
    // Same URL, Markdown representation — rewrite (not redirect). Vary: Accept.
    logMd(request, "ai_agents_listing", "accept_negotiated");
    return aiAgentMarkdownRewrite(request.nextUrl, page.target);
  }

  // Default: serve the HTML page unchanged, advertising the public `.md` twin.
  const res = NextResponse.next();
  res.headers.set("Vary", "Accept");
  res.headers.append("Link", `<${page.twin}>; rel="alternate"; type="text/markdown"`);
  return res;
}

// ─── Agent-Markdown content negotiation (the marketing root `/`) ──────────────
//
// SAFETY: the MOST conservative of the three handlers. The homepage renders ONLY
// on the marketing host (`seldonframe.com` / `www.seldonframe.com`) — on the app
// host `/` redirects to /dashboard|/login, which this must never touch. So the
// caller invokes this ONLY for the marketing host, and it acts ONLY on `/`, and
// ONLY ever flips to Markdown when the client EXPLICITLY prefers text/markdown
// (negotiate() — `*/*` browsers always get the HTML homepage). The HTML case is
// returned unchanged, merely annotated with Vary + a Link to the `/home.md` twin.
//
// The Markdown itself is the static `/home.md` route (renderHomeMarkdown); we
// rewrite `/` → `/home.md` (not redirect) so the visible URL is unchanged.
const HOME_MD_ROUTE = "/home.md";

function handleHomeNegotiation(request: NextRequest): NextResponse | null {
  if (request.nextUrl.pathname !== "/") return null;

  if (negotiate(request.headers.get("accept")) === "markdown") {
    logMd(request, "home", "accept_negotiated");
    const url = request.nextUrl.clone();
    url.pathname = HOME_MD_ROUTE;
    const res = NextResponse.rewrite(url);
    res.headers.set("Vary", "Accept");
    return res;
  }

  // Default: let the homepage render as HTML, advertising the `.md` twin so
  // DOM-parsing crawlers / headless fetchers can discover it.
  const res = NextResponse.next();
  res.headers.set("Vary", "Accept");
  res.headers.append("Link", `<${HOME_MD_ROUTE}>; rel="alternate"; type="text/markdown"`);
  return res;
}

// ─── Builder MCP host rewrite (mcp.seldonframe.com/v1) ────────────────────────
//
// The /build page's connect snippet + SKILL.md tell an IDE agent to
// `claude mcp add seldonframe --transport http https://mcp.seldonframe.com/v1
// --header "Authorization: Bearer wst_..."`. Before this handler existed, that
// host had NO special-casing here at all, so a request to it fell all the way
// through to the generic non-appHost branch below (a wasted /api/v1/public/
// domain lookup treating it as an unknown custom workspace domain) and then to
// Next's own router, which served the marketing catch-all as HTML 200/404 —
// "failed to connect" for every MCP client.
//
// This owns EVERY request to the mcp host (not just `/v1`) so nothing on this
// host ever reaches authProxy or the workspace-domain lookup — there is no
// session cookie, no org, nothing to authenticate against a browser-facing
// flow here; the endpoint is bearer-only (see guardApiRequest in the route).
// Only `/v1` (POST/GET/OPTIONS) has a real handler
// (app/api/mcp/v1/route.ts) — it is rewritten (not redirected) so the
// advertised URL stays exactly what a client dialed. Root `mcp.seldonframe.com/`
// and any other path pass straight through to Next's router (a future health/
// docs page can live there without touching this rewrite).
function handleBuilderMcpHost(request: NextRequest, host: string): NextResponse | null {
  if (!builderMcpHosts.has(host)) return null;
  if (request.nextUrl.pathname !== "/v1") return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/api/mcp/v1";
  return NextResponse.rewrite(url);
}

const authProxy = auth(async (request) => {
  const pathname = request.nextUrl.pathname;
  const host = getRequestHost(request);
  const appHost = isAppHost(host);
  const isMarketingHost = marketingHosts.has(host);

  const hasNextAuth = Boolean(request.auth?.user);
  const hasAdminToken = hasAdminTokenCookie(request);
  // C6: admin-token cookie counts as "authenticated" for middleware
  // routing decisions. Plan-gate / welcome-shown / soul-completed checks
  // still skip admin-token sessions because the synthetic user has no
  // billing or onboarding state.
  const isAuthenticated = hasNextAuth || hasAdminToken;
  const user = request.auth?.user as {
    orgId?: string;
    soulCompleted?: boolean;
    welcomeShown?: boolean;
    planId?: string | null;
    subscriptionStatus?: "trialing" | "active" | "past_due" | "canceled" | "unpaid";
    trialEndsAt?: string | null;
  } | undefined;
  // C6: admin-token sessions skip Soul / Welcome onboarding. They're
  // workspace-scoped guests, not signed-up users — there's nothing to
  // complete in the user-onboarding flow, and forcing them through
  // /clients/new or /welcome would drop them into a dead-end with no auth
  // chrome. Treat both gates as already passed.
  const isSoulCompleted = hasNextAuth ? Boolean(user?.soulCompleted) : true;
  let isWelcomeShown = hasNextAuth ? Boolean(user?.welcomeShown) : true;

  // NOTE (2026-07-04): on the marketing host this block is DEAD CODE — proxy()
  // returns NextResponse.next() when !appHost before authProxy ever runs, so it
  // never fires for www/apex. The redirect that actually pins /signup + /login
  // to the app host lives in the PAGES themselves (redirectToAppHostIfNeeded in
  // (auth)/signup/page.tsx + (auth)/login/page.tsx — the cross-host OAuth pkce
  // fix). Do not delete the page guards as "redundant" with this block, and if
  // this block is ever made reachable, keep both (double-redirect is harmless).
  if (!appHost && isMarketingHost && (isProtectedPath(pathname) || isAuthPath(pathname))) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.host = appHostFallback;
    redirectUrl.protocol = "https:";
    return NextResponse.redirect(redirectUrl);
  }

  if (pathname === "/") {
    if (!appHost) {
      return NextResponse.next();
    }

    return NextResponse.redirect(new URL(isAuthenticated ? "/dashboard" : "/login", request.url));
  }

  if (isAuthenticated && isSoulCompleted && !isWelcomeShown) {
    const activeOrgId = request.cookies.get("sf_active_org_id")?.value || user?.orgId;

    if (activeOrgId) {
      try {
        const [org] = await db
          .select({ settings: organizations.settings })
          .from(organizations)
          .where(eq(organizations.id, activeOrgId))
          .limit(1);

        isWelcomeShown = Boolean((org?.settings as Record<string, unknown> | undefined)?.welcomeShown);
      } catch {
        // keep token value fallback when DB lookup fails
      }
    }
  }

  if ((pathname === "/login" || pathname === "/signup") && isAuthenticated) {
    if (!isSoulCompleted) {
      return NextResponse.redirect(new URL("/clients/new", request.url));
    }
    return NextResponse.redirect(new URL(isWelcomeShown ? "/dashboard" : "/welcome", request.url));
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (isProtectedPath(pathname) && !isAuthenticated) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (isAuthenticated && !isSoulCompleted && pathname !== "/clients/new" && !isPublicPath(pathname)) {
    return NextResponse.redirect(new URL("/clients/new", request.url));
  }

  if (isAuthenticated && isSoulCompleted && !isWelcomeShown && pathname !== "/welcome" && !isPublicPath(pathname)) {
    return NextResponse.redirect(new URL("/welcome", request.url));
  }

  // 2026-05-17 — REMOVED the redirect-/clients/new-to-dashboard rule
  // that used to live here. It was written for the old single-workspace
  // onboarding model where /clients/new was a one-shot "complete your
  // setup" screen, so once `soulCompleted` flipped true we shoved the
  // user to /dashboard to keep them from re-doing onboarding.
  //
  // In the agency model /clients/new is the RECURRING "add another
  // client workspace" page — operators need to reach it every time they
  // onboard a new client. The redirect was bouncing every click on the
  // dashboard's "Add client workspace" CTA back to /dashboard, making
  // the button look completely dead. /clients/new is now allowed for
  // any authed user regardless of soulCompleted state.

  // C6: skip plan-gate for admin-token sessions. They're attached to
  // a workspace, not a user, and the workspace's plan is enforced at
  // API-call time. Running them through the user-plan gate would 307
  // them to /pricing because the synthetic session has no plan/billing
  // state.
  const planGate =
    hasNextAuth
      ? enforcePlanGate({
          request,
          pathname,
          user: {
            planId: user?.planId,
            subscriptionStatus: user?.subscriptionStatus,
            trialEndsAt: user?.trialEndsAt,
          },
          isAuthenticated,
        })
      : { response: null, billingStatus: "active" as const, readOnly: false };

  if (planGate.response) {
    return planGate.response;
  }

  if (!isAuthenticated) {
    return NextResponse.next();
  }

  const orgId = request.cookies.get("sf_active_org_id")?.value || user?.orgId;
  const headers = new Headers(request.headers);

  if (orgId) {
    headers.set("x-org-id", orgId);
  }

  headers.set("x-billing-status", planGate.billingStatus);
  headers.set("x-billing-readonly", planGate.readOnly ? "1" : "0");

  return NextResponse.next({
    request: {
      headers,
    },
  });
});

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  const pathname = request.nextUrl.pathname;
  const host = getRequestHost(request);
  const appHost = isAppHost(host);
  const hostWorkspaceSlug = resolveWorkspaceSlugFromHost(host);

  // Builder MCP host — checked FIRST and returns immediately when matched, so
  // mcp.seldonframe.com never reaches the workspace-domain lookup below (which
  // would otherwise treat it as an unrecognized custom domain) or authProxy
  // (there's no session here — the endpoint is bearer-only).
  const mcpHandled = handleBuilderMcpHost(request, host);
  if (mcpHandled) return mcpHandled;

  // Referral-attribution capture (virality pack T5). /build is admitted by
  // the matcher SOLELY for this branch: read ?ref= into the httpOnly sf_ref
  // cookie (90d) and return immediately. /build had NO proxy behavior before
  // (it wasn't in the matcher), so returning next() preserves the pre-existing
  // pipeline-free serving on every host — subdomain /build behavior is
  // unchanged. Fail-soft: any error → plain next(); a lost attribution is
  // acceptable, a broken /build page is not. Pure decision logic lives in
  // lib/growth/ref-cookie.ts (unit-tested with zero Next imports).
  if (pathname === "/build") {
    try {
      const rawRef = request.nextUrl.searchParams.get("ref");
      const currentCookie = request.cookies.get(REF_COOKIE_NAME)?.value ?? null;
      const nextValue = resolveRefCookieValue(rawRef, currentCookie);
      const response = NextResponse.next();
      if (nextValue) {
        response.cookies.set(REF_COOKIE_NAME, nextValue, REF_COOKIE_OPTIONS);
      }
      return response;
    } catch {
      return NextResponse.next();
    }
  }

  // Agent-Markdown negotiation: ONLY the marketplace HTML pages, ONLY on the
  // app/preview host (where /marketplace actually lives — custom workspace hosts
  // rewrite into /s/<slug>/… below and have no marketplace). Owns the request
  // for /marketplace + /marketplace/<slug>; returns null for everything else so
  // the rest of the pipeline is reached untouched.
  if (appHost) {
    const negotiated = handleMarketplaceNegotiation(request);
    if (negotiated) return negotiated;
    // Same conservative Accept-negotiation for the /ai-agents SEO pages. Owns
    // every /ai-agents + /ai-agents/<job>[/for/<vertical>] path; returns null
    // for everything else so the rest of the pipeline is reached untouched.
    const aiNegotiated = handleAiAgentsNegotiation(request);
    if (aiNegotiated) return aiNegotiated;
  }

  // Marketing root `/` Accept-negotiation — ONLY on the marketing host (where the
  // homepage actually renders; on the app host `/` redirects, handled below). The
  // most conservative handler: flips to /home.md ONLY when text/markdown is
  // explicitly preferred, else serves the HTML homepage with a Link to the twin.
  // Runs BEFORE the workspace domain-lookup fetch so the homepage skips it.
  if (marketingHosts.has(host) && pathname === "/") {
    const homeNegotiated = handleHomeNegotiation(request);
    if (homeNegotiated) return homeNegotiated;
  }

  if (
    host &&
    !appHost &&
    !pathname.startsWith("/_next") &&
    !pathname.startsWith("/api/")
  ) {
    try {
      const domainLookupUrl = new URL("/api/v1/public/domain", request.url);
      domainLookupUrl.searchParams.set("host", host);

      const domainResponse = await fetch(domainLookupUrl, { cache: "no-store" });
      const domainPayload = (await domainResponse.json()) as {
        org?: {
          id: string;
          slug: string;
          defaults?: {
            landingSlug?: string;
            bookingSlug?: string;
            formSlug?: string;
          };
        } | null;
      };
      const domainOrg = domainPayload?.org ?? (hostWorkspaceSlug
        ? {
            id: "",
            slug: hostWorkspaceSlug,
          }
        : null);

      if (domainOrg?.slug) {
        // Admin path on workspace subdomain → redirect to main app's
        // switch-workspace flow. Requires orgId (only available when the
        // domain lookup succeeded; the slug-only fallback below can't do
        // this since it lacks the org id).
        if (domainOrg.id) {
          const adminRedirect = resolveWorkspaceAdminRedirect(
            pathname,
            domainOrg.id,
            request.nextUrl.search,
          );
          if (adminRedirect) {
            return NextResponse.redirect(adminRedirect);
          }
        }

        const rewritePath = resolveWorkspaceRewritePath(pathname, domainOrg.slug, domainOrg.defaults);

        if (rewritePath !== pathname) {
          const rewriteUrl = request.nextUrl.clone();
          rewriteUrl.pathname = rewritePath;
          return NextResponse.rewrite(rewriteUrl);
        }

        return NextResponse.next();
      }
    } catch {
      if (hostWorkspaceSlug) {
        const rewritePath = resolveWorkspaceRewritePath(pathname, hostWorkspaceSlug);
        if (rewritePath !== pathname) {
          const rewriteUrl = request.nextUrl.clone();
          rewriteUrl.pathname = rewritePath;
          return NextResponse.rewrite(rewriteUrl);
        }

        return NextResponse.next();
      }

      return NextResponse.next();
    }
  }

  if (!appHost) {
    return NextResponse.next();
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  try {
    return await (authProxy as unknown as (req: NextRequest, event: NextFetchEvent) => Promise<Response | NextResponse>)(
      request,
      event
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("Cannot destructure property 'auth'")) {
      console.error("[proxy] authProxy fallback", {
        host,
        pathname,
        appHost,
      });
      return NextResponse.next();
    }

    throw error;
  }
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/signup",
    "/pricing",
    // Referral-attribution capture ONLY — the early /build branch in proxy()
    // owns this path entirely and returns next() (+ the sf_ref cookie when
    // ?ref= is present) before any other pipeline stage can touch it.
    "/build",
    // FIX-6b: R1 multi-page service links. Generated sites emit root-relative
    // /services/<svc> hrefs on workspace subdomains + custom domains. WITHOUT
    // this entry those requests never reach the proxy at all (this matcher is
    // a whitelist), so BOTH service renderers (/w/[slug]/services and the /s
    // catch-all's services branch) were unreachable and every multipage
    // site's service links 404'd — on the app host the path stays unhandled
    // and 404s exactly as before.
    "/services/:path*",
    "/l/:path*",
    "/book/:path*",
    "/forms/:path*",
    "/intake",
    "/intake/:path*",
    "/clients/new",
    "/welcome",
    "/orgs/:path*",
    "/hub/:path*",
    "/dashboard/:path*",
    "/contacts/:path*",
    "/deals/:path*",
    "/activities/:path*",
    "/forms/:path*",
    "/settings/:path*",
    "/api/v1/:path*",
    // Agent-Markdown negotiation — the marketplace pages. `/marketplace` (exact)
    // is the browse page; `/marketplace/:path*` admits the listing pages AND the
    // explicit per-listing `/marketplace/<slug>.md` URLs (`:path*` matches a
    // dotted final segment). handleMarketplaceNegotiation rewrites those `.md`
    // URLs (and Markdown-negotiated HTML requests) to the static
    // `/marketplace/listing.md?slug=…` route, and short-circuits the rewrite
    // targets (`/marketplace.md`, `/marketplace/listing.md`) so they reach their
    // handler without looping. The index `.md` (`/marketplace.md`) has no
    // trailing slash so `/marketplace/:path*` can't match it, and `/marketplace`
    // is exact. handleMarketplaceNegotiation owns every matched marketplace
    // path, so none reach the auth/onboarding pipeline.
    "/marketplace",
    "/marketplace/:path*",
    // Agent-Markdown negotiation — the /ai-agents SEO pages. `/ai-agents` (exact)
    // is the library hub; `/ai-agents/:path*` admits the Tier-1 job pages, the
    // Tier-2 job×vertical pages, AND the explicit per-page `.md` URLs (`:path*`
    // matches dotted final segments, incl. the nested `/for/<vertical>.md`).
    // handleAiAgentsNegotiation rewrites those `.md` URLs (and Markdown-negotiated
    // HTML requests) to the static `/ai-agents/listing.md?job=…&vertical=…` route,
    // and short-circuits the rewrite targets (`/ai-agents.md`,
    // `/ai-agents/listing.md`) so they reach their handler without looping. The
    // index `.md` (`/ai-agents.md`) has no trailing slash so `/ai-agents/:path*`
    // can't match it, and `/ai-agents` is exact. handleAiAgentsNegotiation owns
    // every matched /ai-agents path, so none reach the auth/onboarding pipeline.
    "/ai-agents",
    "/ai-agents/:path*",
    // Builder MCP host rewrite — mcp.seldonframe.com/v1 only. `/v1` is a path
    // this matcher admits on EVERY host, but handleBuilderMcpHost immediately
    // no-ops (returns null) unless the request's Host is actually
    // mcp.seldonframe.com (builderMcpHosts), so this can never collide with a
    // real `/v1` page on app.seldonframe.com or a workspace subdomain — there
    // isn't one today, and even if one existed later it would only be shadowed
    // on the mcp host itself, never on any other host.
    "/v1",
  ],
};
