// packages/crm/proxy.ts — the request-boundary hook (Next.js 16 renamed
// `middleware.ts` → `proxy.ts`; `export function middleware()` →
// `export function proxy()`; same runtime semantics, see the Next.js 16
// upgrade guide).
//
// The FIRST proxy/middleware file in this repo, added SOLELY for the
// virality pack's referral-attribution capture (Task 5) — scoped to
// exactly one path via `config.matcher` so it has zero effect on any other
// route. Everything else in the app is completely unaffected.
//
// WHY THIS FILE EXISTS (rather than doing the capture inside
// app/build/page.tsx itself): Next.js does not support mutating cookies
// during a Server Component's render — only from a Server Function, a
// Route Handler, or here. /build is a plain page.tsx (no sibling route.ts —
// a page.tsx and route.ts can't coexist at the same segment), so the ONLY
// place left to intercept `?ref=` and set a cookie before the page renders
// is this proxy. See src/lib/growth/ref-cookie.ts for the pure decision
// logic (whether to capture at all, and what value) — this file is pure
// glue: read the query param + the current cookie, ask the pure helper
// what to do, apply it to the response.
//
// FAIL-SOFT (per the plan's Global Constraints): a referral bug must NEVER
// break /build. Every step here is defensive — a malformed URL, a missing
// query param, or any thrown error simply falls through to
// NextResponse.next() with no cookie mutation. The referral growth loop
// losing an attribution is an acceptable failure mode; a broken /build page
// is not.

import { NextResponse, type NextRequest } from "next/server";
import { resolveRefCookieValue, REF_COOKIE_NAME, REF_COOKIE_OPTIONS } from "@/lib/growth/ref-cookie";

export function proxy(request: NextRequest): NextResponse {
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
    // Fail-soft: never let a referral-capture bug break /build itself.
    return NextResponse.next();
  }
}

/** Scoped to EXACTLY /build — this proxy has zero effect on any other
 *  route in the app. Growth-loop entry points that grow beyond /build
 *  (e.g. the marketplace fork CTA) should add their own path here rather
 *  than widening this matcher unnecessarily. */
export const config = {
  matcher: ["/build"],
};
