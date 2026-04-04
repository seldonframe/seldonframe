import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { enforcePlanGate } from "@/middleware/plan-gate";

const protectedPrefixes = ["/hub", "/dashboard", "/welcome", "/orgs", "/contacts", "/deals", "/activities", "/forms", "/settings", "/api/v1"];
const publicPrefixes = ["/api/v1", "/api/auth"];

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

  return false;
}

export const proxy = auth((request) => {
  const pathname = request.nextUrl.pathname;
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
  const isWelcomeShown = Boolean(user?.welcomeShown);

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

  if (isAuthenticated && !isSoulCompleted && pathname !== "/setup") {
    return NextResponse.redirect(new URL("/setup", request.url));
  }

  if (isAuthenticated && isSoulCompleted && !isWelcomeShown && pathname !== "/welcome") {
    return NextResponse.redirect(new URL("/welcome", request.url));
  }

  if (isAuthenticated && isSoulCompleted && pathname === "/setup") {
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
    "/login",
    "/signup",
    "/pricing",
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
