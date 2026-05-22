// packages/crm/src/lib/landing/r1-auth.ts
//
// Dual-path auth resolver for the R1 landing customize / revert / versions
// API routes. These routes serve TWO callers:
//
//   1. The in-app editor at /clients/[slug]/landing/edit — uses a session
//      cookie (browser user) and passes x-org-id as the workspace target.
//   2. The MCP tools (customize_landing, list_landing_versions,
//      revert_landing) — use the workspace bearer or x-api-key + x-org-id
//      that guardApiRequest already understands.
//
// We try session auth first; if there's no session, fall back to
// guardApiRequest. Returning a NextResponse on failure keeps each route's
// shape simple (early return + the NextResponse).

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/db";
import { organizations, orgMembers, users } from "@/db/schema";
import { guardApiRequest } from "@/lib/api/guard";

export type R1AuthOk = {
  ok: true;
  orgId: string;
  userId: string;
};

export type R1AuthErr = {
  ok: false;
  response: NextResponse;
};

/**
 * Resolve the calling identity for an R1 landing API route. Returns the
 * orgId (workspace) and userId (for audit), or a NextResponse with the
 * appropriate error code.
 *
 * Order of preference:
 *   1. NextAuth session + x-org-id header (browser editor)
 *   2. guardApiRequest (workspace bearer, or x-api-key + x-org-id)
 */
export async function resolveR1Auth(request: Request): Promise<R1AuthOk | R1AuthErr> {
  // ── Path 1: NextAuth session (browser editor) ─────────────────────────
  const session = await auth();
  if (session?.user?.id) {
    const workspaceId = request.headers.get("x-org-id");
    if (!workspaceId) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "x-org-id header required when calling with a session cookie" },
          { status: 400 },
        ),
      };
    }

    // Verify the user has access to the workspace.
    const [workspace] = await db
      .select({
        id: organizations.id,
        ownerId: organizations.ownerId,
        parentUserId: organizations.parentUserId,
      })
      .from(organizations)
      .where(eq(organizations.id, workspaceId))
      .limit(1);

    if (!workspace) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "workspace_not_found" },
          { status: 404 },
        ),
      };
    }

    const isOwner = workspace.ownerId === session.user.id;
    const isParent = workspace.parentUserId === session.user.id;
    if (!isOwner && !isParent) {
      const [member] = await db
        .select({ userId: orgMembers.userId })
        .from(orgMembers)
        .where(
          and(
            eq(orgMembers.orgId, workspaceId),
            eq(orgMembers.userId, session.user.id),
          ),
        )
        .limit(1);
      if (!member) {
        return {
          ok: false,
          response: NextResponse.json(
            { error: "forbidden" },
            { status: 403 },
          ),
        };
      }
    }

    return { ok: true, orgId: workspaceId, userId: session.user.id };
  }

  // ── Path 2: guardApiRequest (workspace bearer / x-api-key) ────────────
  const guard = await guardApiRequest(request);
  if ("error" in guard) {
    // Belt + braces: guard.error is typed as NextResponse | undefined in
    // strict mode. Fall back to a 401 if for some reason it's missing.
    return {
      ok: false,
      response:
        guard.error ??
        NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  // Resolve a userId for audit. Use the org owner as a fallback when the
  // bearer doesn't carry a user ID (API-key mode).
  const [ownerRow] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.orgId, guard.orgId), eq(users.role, "owner")))
    .limit(1);

  return {
    ok: true,
    orgId: guard.orgId,
    userId: ownerRow?.id ?? guard.orgId, // last-resort: orgId as placeholder
  };
}
