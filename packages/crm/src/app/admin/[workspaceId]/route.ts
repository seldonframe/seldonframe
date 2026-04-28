import { NextResponse } from "next/server";
import { validateRawWorkspaceToken } from "@/lib/auth/workspace-token";
import {
  ADMIN_TOKEN_COOKIE,
  ACTIVE_ORG_COOKIE,
  ADMIN_TOKEN_COOKIE_MAX_AGE,
} from "@/lib/auth/admin-token";

/**
 * GET /admin/[workspaceId]?token=wst_…
 *
 * The bearer-token admin entry point (C6). Operators paste this URL
 * once after `create_workspace` returns it; the route validates the
 * token, sets the admin-token cookie + active-org cookie, and bounces
 * to /dashboard. From there the dashboard layout's `requireAuth()`
 * picks up the cookie via `resolveAdminTokenContext` and serves the
 * full admin UI scoped to that one workspace.
 *
 * Security model:
 *   - Token MUST belong to the workspace in the URL path. We don't trust
 *     a token that resolves to a *different* org — that's a confusion
 *     attack where someone shares a URL with their token but a friend's
 *     workspace id.
 *   - Cookie is `httpOnly` + `Secure` + `SameSite=lax`. Lax (not Strict)
 *     so the redirect from this route to /dashboard preserves it; the
 *     trade-off is acceptable because the token in the URL is single-use
 *     for the duration of the session.
 *   - Failures redirect to a stable static `/admin/invalid` URL rather
 *     than echoing the token in any error message — defense in depth
 *     against accidental token leakage in browser history / referer.
 */

const PROD_COOKIE_DEFAULTS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params;
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    // No token at all — show the friendly setup page rather than 401.
    // Most operators landing here without a token mistyped the URL or
    // followed a stale bookmark; sending them to a help page is kinder
    // than a raw error.
    return NextResponse.redirect(new URL("/admin/invalid?reason=missing-token", url.origin));
  }

  const validated = await validateRawWorkspaceToken(token);
  if (!validated) {
    return NextResponse.redirect(new URL("/admin/invalid?reason=expired-or-unknown", url.origin));
  }

  if (validated.orgId !== workspaceId) {
    // Token resolves but to a different workspace — refuse rather than
    // silently switch context. This protects against "wrong link"
    // user-error AND a (hypothetical) confusion attack.
    return NextResponse.redirect(new URL("/admin/invalid?reason=workspace-mismatch", url.origin));
  }

  // Bounce to /dashboard with the cookies set. We use 303 (See Other)
  // to make sure the browser issues a GET on the redirect target —
  // important because some legacy bots resubmit the original method.
  const dashboard = new URL("/dashboard", url.origin);
  const response = NextResponse.redirect(dashboard, 303);

  response.cookies.set(ADMIN_TOKEN_COOKIE, token, {
    ...PROD_COOKIE_DEFAULTS,
    maxAge: ADMIN_TOKEN_COOKIE_MAX_AGE,
  });
  response.cookies.set(ACTIVE_ORG_COOKIE, validated.orgId, {
    // Active-org cookie is read by getOrgId on the server. Not httpOnly
    // — existing client-side code reads it for UX hints (workspace
    // switcher state, etc.). Matches the existing convention.
    httpOnly: false,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: ADMIN_TOKEN_COOKIE_MAX_AGE,
  });

  return response;
}
