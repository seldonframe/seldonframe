// Improve verb + trust rail (2026-07-02) — Task 12: a small, ADDITIVE
// read-only action the Studio improve panel needs that T9's actions.ts
// doesn't expose.
//
// WHY THIS FILE EXISTS (documented gap, not a silent workaround): T9's
// `ImproveRunResult` (improve-run.ts) never carries the proposal's PATCH —
// only `proposalId`. The patch lives solely on the persisted
// `agent_improve_proposals` row. To render the field diff the brief
// requires (diffBlueprintFields(before, after) against the CURRENT
// blueprint), the panel needs to read that one row back by id. Rather than
// modify T9's committed `actions.ts` (out of scope per this task's brief —
// "consume, don't modify") or fabricate a patch that was never returned,
// this is a NEW, narrowly-scoped, org-scoped read action: it loads exactly
// one field (`patch`) off exactly one row, gated by id+orgId the same way
// every other action in this feature is. No write path, no logic beyond the
// lookup — mirrors defaultApplyProposalDeps's own `loadProposal` query
// (deps.ts) byte-for-byte, just exposed as a thin "use server" action.
//
// "use server": only async functions are exported here.

"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { agentImproveProposals } from "@/db/schema/eval-runs";
import type { AgentBlueprint } from "@/db/schema/agents";
import { getOrgId } from "@/lib/auth/helpers";

export type GetImproveProposalPatchResult =
  | { ok: true; patch: Partial<AgentBlueprint> }
  | { ok: false };

/**
 * Read-only, org-scoped: the PATCH of one improve proposal, by id. Returns
 * `{ ok: false }` for an unauthenticated caller, a missing proposal, or a
 * proposal owned by a different org — never leaks whether the id exists
 * cross-org (same "not found"-shaped rejection every other action in this
 * feature returns).
 */
export async function getImproveProposalPatchAction(
  proposalId: string,
): Promise<GetImproveProposalPatchResult> {
  const orgId = await getOrgId();
  if (!orgId) return { ok: false };

  const [row] = await db
    .select({ patch: agentImproveProposals.patch })
    .from(agentImproveProposals)
    .where(and(eq(agentImproveProposals.id, proposalId), eq(agentImproveProposals.orgId, orgId)))
    .limit(1);
  if (!row) return { ok: false };

  return { ok: true, patch: row.patch };
}
