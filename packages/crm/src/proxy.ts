import { NextResponse } from "next/server";
import { auth } from "@/auth";

const protectedPrefixes = ["/hub", "/dashboard", "/contacts", "/deals", "/activities", "/forms", "/settings", "/api/v1"];
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
  const isSoulCompleted = Boolean((request.auth?.user as { soulCompleted?: boolean } | undefined)?.soulCompleted);

  if ((pathname === "/login" || pathname === "/signup") && isAuthenticated) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
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

  if (isAuthenticated && isSoulCompleted && pathname === "/setup") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (!isAuthenticated) {
    return NextResponse.next();
  }

  const orgId = (request.auth?.user as { orgId?: string } | undefined)?.orgId;
  const headers = new Headers(request.headers);

  if (orgId) {
    headers.set("x-org-id", orgId);
  }

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
    "/setup",
    "/hub/:path*",
    "/dashboard/:path*",
    "/contacts/:path*",
    "/deals/:path*",
    "/activities/:path*",
    "/forms/:path*",
    "/settings/:path*",
    "/api/v1/:path*",
    "/api/auth/:path*",
  ],
};
