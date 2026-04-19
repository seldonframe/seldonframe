import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { maybeSwitchActiveOrg } from "@/lib/billing/active-org-switch";

// Server-side org switcher driven by `?to=<orgId>&next=<path>`.
// Used by `create_workspace` + `link_workspace_owner` responses so a builder
// clicking an admin URL lands on the intended workspace without manual switching.
//
// Flow:
//   1. Require session — if missing, redirect to /login with `next` preserved.
//   2. Verify the user owns or is a member of the target org.
//   3. Set sf_active_org_id cookie.
//   4. 302 to `next` (sanitized to internal paths only).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const targetOrgId = url.searchParams.get("to")?.trim() ?? "";
  const rawNext = url.searchParams.get("next")?.trim() ?? "/dashboard";
  const next = sanitizeNext(rawNext);

  if (!targetOrgId) {
    return NextResponse.redirect(new URL(next, url.origin));
  }

  const session = await auth();
  if (!session?.user?.id) {
    const loginUrl = new URL("/login", url.origin);
    loginUrl.searchParams.set(
      "next",
      `/switch-workspace?to=${encodeURIComponent(targetOrgId)}&next=${encodeURIComponent(next)}`
    );
    return NextResponse.redirect(loginUrl);
  }

  const result = await maybeSwitchActiveOrg(session.user.id, targetOrgId);
  if (!result.switched) {
    // Don't leak whether the org exists — send them to dashboard with their
    // existing active org intact.
    return NextResponse.redirect(new URL("/dashboard?switch=denied", url.origin));
  }

  return NextResponse.redirect(new URL(next, url.origin));
}

function sanitizeNext(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  if (value.includes("://")) return "/dashboard";
  return value;
}
