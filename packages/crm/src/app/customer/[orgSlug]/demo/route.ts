// v1.55.x — One-click demo-login route for the customer portal.
//
// Operators paste /customer/<slug>/demo at a prospect; the prospect
// lands directly in a populated portal (seeded "Demo Customer" with a
// sample upcoming appointment + a welcome message thread). NO email,
// NO magic-link. The portal session is signed server-side and the
// cookie is set on the same response that redirects to the portal
// dashboard.
//
// Graceful fallback: if the workspace exists but no demo contact is
// found (pre-v1.55 workspaces, or soft-failed seed at workspace
// creation), redirect to /login so the operator still has a usable
// surface. If the workspace itself doesn't exist, 404 — there's no
// path forward and we don't want to leak slug existence via a
// downstream redirect.
//
// Mirrors the structure of /customer/[orgSlug]/magic/route.ts so the
// two flows are easy to compare side by side.

import { NextRequest, NextResponse } from "next/server";
import { establishPortalDemoSession } from "@/lib/portal/auth";

/** Pure target resolver — given the result of establishPortalDemoSession,
 *  decide where the route should redirect. Extracted so the routing
 *  policy can be unit-tested without mocking next/headers cookies. */
export function resolveDemoRedirect(
  input:
    | { ok: true; orgSlug: string; orgId: string; contactId: string; redirectTo: string }
    | { ok: false; reason: "org_not_found" | "no_demo_contact" },
): { kind: "redirect"; target: string } | { kind: "not_found" } {
  if (input.ok) {
    return { kind: "redirect", target: input.redirectTo };
  }
  if (input.reason === "org_not_found") {
    return { kind: "not_found" };
  }
  // no_demo_contact — fall back to the magic-link login path. The
  // operator can still demo the portal end-to-end; they just have to
  // go through the email step manually.
  return { kind: "redirect", target: "/customer/" };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ orgSlug: string }> },
) {
  const { orgSlug } = await context.params;

  let result: Awaited<ReturnType<typeof establishPortalDemoSession>>;
  try {
    result = await establishPortalDemoSession({ orgSlug });
  } catch (err) {
    // Defensive: establishPortalDemoSession is designed not to throw,
    // but if something upstream (db connection drop, etc.) blows up,
    // we still want the operator's demo link to fall through to the
    // magic-link login rather than 500. The link is meant for prospect
    // hands — a 500 page would be the worst possible UX.
    console.warn(
      `[demo-login] unexpected error for slug=${orgSlug}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return NextResponse.redirect(new URL(`/customer/${orgSlug}/login?error=demo_unavailable`, request.url));
  }

  if (result.ok) {
    return NextResponse.redirect(new URL(result.redirectTo, request.url));
  }

  if (result.reason === "org_not_found") {
    // 404 via Next's notFound semantics: respond with a 404 status
    // and let the framework render the not-found page. Note: NextResponse
    // with a status of 404 is the appropriate primitive for a route
    // handler (notFound() is for server components/pages).
    return new NextResponse("Workspace not found", { status: 404 });
  }

  // no_demo_contact — fall back to /login. The customer portal's
  // magic-link flow still works on this workspace; the operator just
  // can't one-click demo it.
  return NextResponse.redirect(new URL(`/customer/${orgSlug}/login`, request.url));
}
