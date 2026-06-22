import { NextResponse } from "next/server";
import { and, eq, isNull, or } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { orgMembers, organizations, partnerAgencies, users } from "@/db/schema";

// Server-side org switcher driven by `?to=<orgId>&next=<path>`.
//
// Flow:
//   1. Require session — if missing, redirect to /login with `next` preserved.
//   2. Verify the user owns or is a member of the target org.
//   3. Set sf_active_org_id cookie ON THE REDIRECT RESPONSE.
//   4. 302 to `next` (sanitized to internal paths only).
//
// 2026-05-17 — inlined the maybeSwitchActiveOrg call. The previous
// indirection used cookies().set() from a Server-Action context inside
// the route handler. In Next.js App Router that pattern is unreliable
// for redirect responses — the Set-Cookie header sometimes didn't make
// it onto the 302 the browser followed. Symptom in production: the
// switcher navigated to /clients/<slug>/ready but the sf_active_org_id
// cookie stayed pinned to the old workspace, so the sidebar + topbar
// kept rendering the previous workspace's chrome until the user
// manually refreshed.
//
// Fix: build the NextResponse first, then call `response.cookies.set`
// directly so the Set-Cookie header is part of the redirect response
// the browser receives + applies on the next navigation.
//
// ALSO: nostore + dynamic so prefetch can't silently consume the
// switch attempt without the browser following the redirect.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const COOKIE_NAME = "sf_active_org_id";
const COOKIE_OPTIONS = {
  path: "/",
  httpOnly: true,
  sameSite: "lax" as const,
  maxAge: 60 * 60 * 24 * 30,
};

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

  const access = await checkWorkspaceAccess(session.user.id, targetOrgId);
  if (!access.allowed) {
    return NextResponse.redirect(new URL("/dashboard?switch=denied", url.origin));
  }

  const response = NextResponse.redirect(new URL(next, url.origin));
  response.cookies.set(COOKIE_NAME, targetOrgId, COOKIE_OPTIONS);
  return response;
}

async function checkWorkspaceAccess(
  userId: string,
  targetOrgId: string,
): Promise<{ allowed: boolean }> {
  const [userRow] = await db
    .select({ orgId: users.orgId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!userRow) return { allowed: false };

  // Primary org — instant pass.
  if (userRow.orgId === targetOrgId) return { allowed: true };

  // Owner / parent — agency-managed client workspaces.
  const [owned] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(
      and(
        eq(organizations.id, targetOrgId),
        // Front-office bridge: an archived client workspace is not switchable.
        isNull(organizations.archivedAt),
        or(
          eq(organizations.ownerId, userId),
          eq(organizations.parentUserId, userId),
        ),
      ),
    )
    .limit(1);
  if (owned?.id) return { allowed: true };

  // Member — team workspaces.
  const [member] = await db
    .select({ orgId: orgMembers.orgId })
    .from(orgMembers)
    .where(
      and(eq(orgMembers.orgId, targetOrgId), eq(orgMembers.userId, userId)),
    )
    .limit(1);
  if (member?.orgId) return { allowed: true };

  // 2026-06-16 — agency-attached workspaces. When a workspace was
  // created anonymously and then attached to a partner agency via
  // attachWorkspaceToAgency, neither ownerId/parentUserId nor
  // org_members are set for the agency owner. Check whether the
  // target workspace's parentAgencyId belongs to an agency owned by
  // this user — if so, the switch is authorized.
  const [targetWs] = await db
    .select({ parentAgencyId: organizations.parentAgencyId })
    .from(organizations)
    // Front-office bridge: an archived client workspace is not switchable, even
    // via the agency-attached path.
    .where(and(eq(organizations.id, targetOrgId), isNull(organizations.archivedAt)))
    .limit(1);
  if (targetWs?.parentAgencyId) {
    const [agency] = await db
      .select({ id: partnerAgencies.id })
      .from(partnerAgencies)
      .where(
        and(
          eq(partnerAgencies.id, targetWs.parentAgencyId),
          eq(partnerAgencies.ownerUserId, userId),
        ),
      )
      .limit(1);
    if (agency?.id) return { allowed: true };
  }

  return { allowed: false };
}

function sanitizeNext(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  if (value.includes("://")) return "/dashboard";
  return value;
}
