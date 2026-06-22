// packages/crm/src/lib/web-onboarding/owned-workspace-count.ts
//
// PATCHED PER PLAN CORRECTION (2026-05-16): tiny helper that resolves the
// number of orgs a user owns, so the route handler can populate the
// existing enforceWorkspaceLimit's `ownedWorkspaceCount` arg without
// reinventing the tier-limit logic.
//
// The "owner" relationship in this codebase is via orgMembers.role === "owner".

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { orgMembers, organizations } from "@/db/schema";

/** Pure helper extracted for testability — dedupes by orgId (defensive). */
export function countOwnedWorkspacesFromRows(
  rows: Array<{ orgId: string }>,
): number {
  return new Set(rows.map((r) => r.orgId)).size;
}

/**
 * Count orgs where this user is the owner. Returns 0 if the user has no
 * owner-role memberships.
 */
export async function getOwnedWorkspaceCount(userId: string): Promise<number> {
  const rows = await db
    .select({ orgId: orgMembers.orgId })
    .from(orgMembers)
    // Join organizations so archived client workspaces (front-office bridge) are
    // excluded from the workspace-limit count — they must not count against the
    // builder's limit / trigger a charge.
    .innerJoin(organizations, eq(organizations.id, orgMembers.orgId))
    .where(
      and(
        eq(orgMembers.userId, userId),
        eq(orgMembers.role, "owner"),
        isNull(organizations.archivedAt),
      ),
    );

  return countOwnedWorkspacesFromRows(rows);
}
