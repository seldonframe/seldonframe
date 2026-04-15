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
      const domainOrg = domainPayload?.org;

      if (domainOrg?.slug) {
        const defaultLandingSlug = domainOrg.defaults?.landingSlug || "home";
        const defaultBookingSlug = domainOrg.defaults?.bookingSlug || "default";
        const defaultFormSlug = domainOrg.defaults?.formSlug || "intake";
        let rewritePath = pathname;
        const segments = pathname.split("/").filter(Boolean);

        if (pathname === "/" || pathname === "") {
          rewritePath = `/s/${domainOrg.slug}/${defaultLandingSlug}`;
        } else if (pathname === "/book") {
          rewritePath = `/book/${domainOrg.slug}/${defaultBookingSlug}`;
        } else if (pathname === "/forms") {
          rewritePath = `/forms/${domainOrg.slug}/${defaultFormSlug}`;
        } else if (pathname === "/l") {
          rewritePath = `/s/${domainOrg.slug}/${defaultLandingSlug}`;
        } else if (pathname === "/s") {
          rewritePath = `/s/${domainOrg.slug}/${defaultLandingSlug}`;
        } else if (pathname.startsWith("/book/") && segments.length === 2) {
          rewritePath = `/book/${domainOrg.slug}/${segments[1] || defaultBookingSlug}`;
        } else if (pathname.startsWith("/forms/") && segments.length === 2) {
          rewritePath = `/forms/${domainOrg.slug}/${segments[1] || defaultFormSlug}`;
        } else if (pathname.startsWith("/l/") && segments.length === 2) {
          rewritePath = `/s/${domainOrg.slug}/${segments[1] || defaultLandingSlug}`;
        } else if (!pathname.startsWith("/book/") && !pathname.startsWith("/forms/") && !pathname.startsWith("/api/")) {
          const normalizedPath = pathname.replace(/^\/+/, "");
          rewritePath = normalizedPath
            ? `/s/${domainOrg.slug}/${normalizedPath}`
            : `/s/${domainOrg.slug}/${defaultLandingSlug}`;
        }

        if (rewritePath !== pathname) {
          const rewriteUrl = request.nextUrl.clone();
          rewriteUrl.pathname = rewritePath;
          return NextResponse.rewrite(rewriteUrl);
        }

        return NextResponse.next();
      }
    } catch {
      return NextResponse.next();
    }
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
