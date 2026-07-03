// POST /api/marketplace/fork — the "Fork this agent" form target.
//
// A plain HTML <form method="POST"> on the listing page (no client JS) posts
// here with the listing's slug. On success we 303-redirect straight to the
// new workspace's token-scoped admin URL — the buyer never sees a JSON
// response or an intermediate confirmation page, just lands in their own
// live workspace. On any refusal we 303 back to the listing page with
// `?fork_error=<reason>` so the page can render a small friendly notice.
//
// This route NEVER returns a JSON error for this form flow — every failure
// path (bad content-type, missing slug, rate limit, paid listing, unknown
// slug, internal error) redirects back to the listing. That keeps the UX
// consistent with a plain-form submission (no fetch(), no client-side error
// handling required) and fails closed: an unexpected exception still lands
// the visitor on a page that explains something went wrong, never a raw 500.
//
// SECURITY: the only client input read from the form is `slug`. There is no
// orgId anywhere in this request — org creation happens exclusively inside
// forkListingIntoNewWorkspace via createAnonymousWorkspace.

import { NextResponse } from "next/server";
import { forkListingIntoNewWorkspace, buildRealForkListingDeps } from "@/lib/marketplace/fork-listing";

function resolveRequestIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}

/** Redirect back to the listing page with a friendly error reason. Always
 *  303 so the browser issues a GET on the target (matches the admin-token
 *  route's convention: some legacy bots resubmit the original method). */
function backToListing(origin: string, slug: string, reason: string): NextResponse {
  const url = new URL(`/marketplace/${encodeURIComponent(slug)}`, origin);
  url.searchParams.set("fork_error", reason);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const ip = resolveRequestIp(request.headers);

  let slug = "";
  try {
    const form = await request.formData();
    const raw = form.get("slug");
    slug = typeof raw === "string" ? raw.trim() : "";
  } catch {
    // Malformed body — no slug to redirect back to a specific listing, so
    // send the visitor to the marketplace root with the error flag.
    const fallback = new URL("/marketplace", url.origin);
    fallback.searchParams.set("fork_error", "invalid_request");
    return NextResponse.redirect(fallback, 303);
  }

  if (!slug) {
    const fallback = new URL("/marketplace", url.origin);
    fallback.searchParams.set("fork_error", "missing_slug");
    return NextResponse.redirect(fallback, 303);
  }

  try {
    const result = await forkListingIntoNewWorkspace({ slug, ip }, buildRealForkListingDeps());
    if (!result.ok) {
      return backToListing(url.origin, slug, result.reason);
    }
    return NextResponse.redirect(result.adminUrl, 303);
  } catch {
    // Fail closed — never leak an internal error, never a raw 500 for this
    // form flow. The listing page's ?fork_error notice covers it generically.
    return backToListing(url.origin, slug, "Something went wrong — please try again.");
  }
}
