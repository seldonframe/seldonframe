// packages/crm/src/lib/workspace/link-workspace-to-operator.ts
//
// 2026-05-17 — fixes the silent "workspace was created but I can't see
// it" bug surfaced by the agency-mode smoke test.
//
// Background:
//   createAnonymousWorkspace (called by createFullWorkspace) inserts the
//   new organizations row with `ownerId: null` and never writes an
//   org_members entry. That made sense in the MCP-driven anonymous flow
//   (the bearer token is the workspace's identity until /link-owner gets
//   called separately). It does NOT make sense in the web-onboarding
//   flow where the operator IS authed and clicking "Add client workspace"
//   from their own dashboard — they expect to own the result immediately.
//
//   Symptom in production:
//     - SSE emits all 5 progress events + done with the new workspace's
//       slug.
//     - Browser navigates to /dashboard?ws=<slug>.
//     - workspace is in DB (workspace_output_contract: pass logged).
//     - /clients page shows only the operator's own org — the new
//       client workspace is invisible.
//     - getOwnedWorkspaceCount returns 0 because it counts org_members
//       rows where role='owner'; the new workspace has none.
//
// Fix:
//   Call this helper from run-create-from-url.ts AFTER createFullWorkspace
//   returns ready. It does the same two writes the existing /v1/workspace/
//   [id]/link-owner route does (used by the MCP claim flow):
//     1. UPDATE organizations SET ownerId, parentUserId = userId
//        WHERE id = workspaceId AND ownerId IS NULL
//        (atomic guard prevents races if claim-owner is also called)
//     2. INSERT INTO org_members (orgId, userId, role='owner')
//        ON CONFLICT DO NOTHING (unique index handles dupes)
//
// Result: the operator becomes both the ownerId and an org_members
// 'owner' row, so dashboard / /clients / proxy all recognise them as
// authorized + their workspace count increments correctly.

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { orgMembers, organizations } from "@/db/schema";

export type LinkResult =
  | { ok: true; alreadyOwned: false }
  | { ok: true; alreadyOwned: true }
  | { ok: false; reason: "workspace_not_found" | "owned_by_other" };

/**
 * Link a freshly-created workspace to the operator who triggered its
 * creation. Idempotent — calling it twice for the same (workspaceId,
 * userId) pair returns { ok: true, alreadyOwned: true } the second time.
 *
 * Returns `owned_by_other` if some other user already claimed the
 * workspace — caller can log and continue (the workspace exists but
 * isn't yours; that's a separate problem to surface).
 */
export async function linkWorkspaceToOperator(
  workspaceId: string,
  userId: string,
): Promise<LinkResult> {
  if (!workspaceId || !userId) {
    return { ok: false, reason: "workspace_not_found" };
  }

  // Look up current ownership state. If already set to this user,
  // short-circuit and still ensure the org_members row exists.
  const [org] = await db
    .select({ id: organizations.id, ownerId: organizations.ownerId })
    .from(organizations)
    .where(eq(organizations.id, workspaceId))
    .limit(1);
  if (!org) {
    return { ok: false, reason: "workspace_not_found" };
  }

  if (org.ownerId && org.ownerId !== userId) {
    return { ok: false, reason: "owned_by_other" };
  }

  let alreadyOwned = false;
  if (org.ownerId === userId) {
    alreadyOwned = true;
  } else {
    // Atomic ownership claim — only succeeds if ownerId is still null.
    const updated = await db
      .update(organizations)
      .set({
        ownerId: userId,
        parentUserId: userId,
        updatedAt: new Date(),
      })
      .where(
        and(eq(organizations.id, workspaceId), isNull(organizations.ownerId)),
      )
      .returning({ id: organizations.id });
    if (updated.length === 0) {
      // Lost the race to another claimer.
      return { ok: false, reason: "owned_by_other" };
    }
  }

  // Best-effort membership upsert. The unique (org_id, user_id) index
  // makes onConflictDoNothing the right move — re-claims are a no-op
  // on the membership side.
  await db
    .insert(orgMembers)
    .values({ orgId: workspaceId, userId, role: "owner" })
    .onConflictDoNothing({ target: [orgMembers.orgId, orgMembers.userId] });

  return { ok: true, alreadyOwned };
}
