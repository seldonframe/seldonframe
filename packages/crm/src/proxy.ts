import { NextRequest, NextResponse } from "next/server";
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

function resolveWorkspaceSlugFromHost(host: string) {
  const workspaceBaseDomain = (process.env.WORKSPACE_BASE_DOMAIN?.trim().toLowerCase() || "seldonframe.com")
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

  if (pathname === "/forms") {
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

const authProxy = auth(async (request) => {
  const pathname = request.nextUrl.pathname;
  const host = normalizeHost(request.headers.get("host"));
  const appHost = isAppHost(host);
  const isMarketingHost = marketingHosts.has(host);

  const isAuthenticated = Boolean(request.auth?.user);
  const user = request.auth?.user as {
    orgId?: string;
    soulCompleted?: boolean;
    welcomeShown?: boolean;
    planId?: string | null;
    subscriptionStatus?: "trialing" | "active" | "past_due" | "canceled" | "unpaid";
    trialEndsAt?: string | null;
  } | undefined;
  const isSoulCompleted = Boolean(user?.soulCompleted);
  let isWelcomeShown = Boolean(user?.welcomeShown);

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

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const host = normalizeHost(request.headers.get("host"));
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
      domainLookupUrl.host = appHostFallback;
      domainLookupUrl.protocol = "https:";
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

  return (authProxy as (req: NextRequest) => Promise<Response | NextResponse>)(request);
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
