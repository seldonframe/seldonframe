import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { enforcePlanGate } from "@/middleware/plan-gate";

const protectedPrefixes = ["/hub", "/dashboard", "/welcome", "/orgs", "/contacts", "/deals", "/activities", "/forms", "/settings", "/api/v1"];
const publicPrefixes = ["/api/v1", "/api/auth"];
const defaultAppHosts = new Set(["app.seldonframe.com", "localhost", "127.0.0.1"]);

function normalizeHost(host: string | null) {
  if (!host) return "";
  return host.trim().toLowerCase().replace(/:\d+$/, "");
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

  return false;
}

export const proxy = auth(async (request) => {
  const pathname = request.nextUrl.pathname;
  const host = normalizeHost(request.headers.get("host"));

  if (
    host &&
    !defaultAppHosts.has(host) &&
    !pathname.startsWith("/_next") &&
    !pathname.startsWith("/api/")
  ) {
    try {
      const domainLookupUrl = new URL("/api/v1/public/domain", request.url);
      domainLookupUrl.searchParams.set("host", host);

      const domainResponse = await fetch(domainLookupUrl, { cache: "no-store" });
      const domainPayload = (await domainResponse.json()) as { org?: { id: string; slug: string } | null };
      const domainOrg = domainPayload?.org;

      if (domainOrg?.slug) {
        let rewritePath = pathname;
        const segments = pathname.split("/").filter(Boolean);

        if (pathname === "/" || pathname === "") {
          rewritePath = `/l/${domainOrg.slug}/home`;
        } else if (pathname === "/book") {
          rewritePath = `/book/${domainOrg.slug}/default`;
        } else if (pathname === "/forms") {
          rewritePath = `/forms/${domainOrg.slug}/intake`;
        } else if (pathname === "/l") {
          rewritePath = `/l/${domainOrg.slug}/home`;
        } else if (pathname.startsWith("/book/") && segments.length === 2) {
          rewritePath = `/book/${domainOrg.slug}/${segments[1]}`;
        } else if (pathname.startsWith("/forms/") && segments.length === 2) {
          rewritePath = `/forms/${domainOrg.slug}/${segments[1]}`;
        } else if (pathname.startsWith("/l/") && segments.length === 2) {
          rewritePath = `/l/${domainOrg.slug}/${segments[1]}`;
        }

        if (rewritePath !== pathname) {
          const rewriteUrl = request.nextUrl.clone();
          rewriteUrl.pathname = rewritePath;
          return NextResponse.rewrite(rewriteUrl);
        }
      }
    } catch {
      // fall through to normal auth and routing behavior
    }
  }

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
