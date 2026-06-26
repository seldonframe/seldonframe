import { NextFetchEvent, NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { enforcePlanGate } from "@/middleware/plan-gate";
import { negotiate } from "@/lib/http/negotiate";

const protectedPrefixes = ["/hub", "/dashboard", "/welcome", "/orgs", "/contacts", "/deals", "/activities", "/forms", "/settings", "/api/v1"];
const publicPrefixes = ["/api/v1", "/api/auth"];
const defaultAppHosts = new Set(["app.seldonframe.com", "localhost", "127.0.0.1"]);
const marketingHosts = new Set(["seldonframe.com", "www.seldonframe.com"]);
const appHostFallback = "app.seldonframe.com";

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
// SAFETY: this runs ONLY for the two marketplace HTML paths the matcher admits
// (/marketplace and /marketplace/<slug>), and ONLY rewrites to the `.md` twin
// when the client EXPLICITLY prefers text/markdown (negotiate() compares
// q-values and requires text/markdown to be named — `*/*` browsers get HTML).
// Every other case returns the normal HTML response, merely annotated with
// `Vary: Accept` + a `Link` rel="alternate" pointing at the `.md` so CDNs cache
// the two representations separately and crawlers can discover the twin.
//
// The `.md` route handlers themselves are NOT matched here (they end in `.md`),
// so explicit `.md` URLs always serve Markdown with no negotiation. We also skip
// any non-listing marketplace subpath (e.g. /marketplace/build) — it has no
// Markdown twin.

/** The path of the `.md` twin for a negotiable marketplace HTML path, or null
 *  when the path has no twin (so we leave it completely untouched). */
function markdownTwinPath(pathname: string): string | null {
  if (pathname === "/marketplace") return "/marketplace.md";
  // /marketplace/<slug> → /marketplace/<slug>.md, but NOT deeper paths, not the
  // build page, and not anything that already looks like a file (contains ".").
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
 * behavior, where the proxy matcher didn't admit marketplace at all. Only the
 * two paths WITH a Markdown twin (`/marketplace`, `/marketplace/<slug>`) get the
 * negotiation + advertise headers; the rest (e.g. /marketplace/build, or a `.md`
 * URL that slipped past the matcher) just pass through as plain HTML.
 */
function handleMarketplaceNegotiation(request: NextRequest): NextResponse | null {
  const pathname = request.nextUrl.pathname;
  if (pathname !== "/marketplace" && !pathname.startsWith("/marketplace/")) {
    return null; // not a marketplace path → don't touch it.
  }

  const twin = markdownTwinPath(pathname);
  if (!twin) {
    // A marketplace path with no Markdown twin (e.g. /marketplace/build, or a
    // `.md` URL) — pass it straight through to its own page/handler as HTML.
    return NextResponse.next();
  }

  const wantsMarkdown = negotiate(request.headers.get("accept")) === "markdown";

  if (wantsMarkdown) {
    // Same URL, Markdown representation — rewrite (not redirect) to the `.md`
    // route so the visible URL is unchanged. Declared via Vary: Accept.
    const url = request.nextUrl.clone();
    url.pathname = twin;
    const res = NextResponse.rewrite(url);
    res.headers.set("Vary", "Accept");
    return res;
  }

  // Default: serve the HTML page unchanged, advertising the `.md` twin.
  const res = NextResponse.next();
  res.headers.set("Vary", "Accept");
  res.headers.append("Link", `<${twin}>; rel="alternate"; type="text/markdown"`);
  return res;
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

  // Agent-Markdown negotiation: ONLY the marketplace HTML pages, ONLY on the
  // app/preview host (where /marketplace actually lives — custom workspace hosts
  // rewrite into /s/<slug>/… below and have no marketplace). Owns the request
  // for /marketplace + /marketplace/<slug>; returns null for everything else so
  // the rest of the pipeline is reached untouched.
  if (appHost) {
    const negotiated = handleMarketplaceNegotiation(request);
    if (negotiated) return negotiated;
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
    // is the browse page; `/marketplace/:path*` admits the listing pages. The
    // `.md` route handlers are NOT matched: `/marketplace.md` has no trailing
    // slash so `/marketplace/:path*` can't match it, and `/marketplace` is exact.
    // A `/marketplace/<slug>.md` URL that does match is passed straight through
    // (handleMarketplaceNegotiation returns next() for any path with no twin),
    // so the `.md` handler still serves it. handleMarketplaceNegotiation owns
    // every matched marketplace path, so none reach the auth/onboarding pipeline.
    "/marketplace",
    "/marketplace/:path*",
  ],
};
