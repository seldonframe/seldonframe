import { NextFetchEvent, NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { enforcePlanGate } from "@/middleware/plan-gate";

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
  return pathname === "/login" || pathname === "/signup" || pathname === "/setup" || pathname === "/welcome";
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
  // /setup or /welcome would drop them into a dead-end with no auth
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
      return NextResponse.redirect(new URL("/setup", request.url));
    }
    return NextResponse.redirect(new URL(isWelcomeShown ? "/dashboard" : "/welcome", request.url));
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (isProtectedPath(pathname) && !isAuthenticated) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (isAuthenticated && !isSoulCompleted && pathname !== "/setup" && !isPublicPath(pathname)) {
    return NextResponse.redirect(new URL("/setup", request.url));
  }

  if (isAuthenticated && isSoulCompleted && !isWelcomeShown && pathname !== "/welcome" && !isPublicPath(pathname)) {
    return NextResponse.redirect(new URL("/welcome", request.url));
  }

  if (isAuthenticated && isSoulCompleted && pathname === "/setup" && !isPublicPath(pathname)) {
    return NextResponse.redirect(new URL(isWelcomeShown ? "/dashboard" : "/welcome", request.url));
  }

  const planGate = enforcePlanGate({
    request,
    pathname,
    user: {
      planId: user?.planId,
      subscriptionStatus: user?.subscriptionStatus,
      trialEndsAt: user?.trialEndsAt,
    },
    isAuthenticated,
  });

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
    "/setup",
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
  ],
};
