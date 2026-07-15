// Flag pattern mirrors isRecordToAgentOn (lib/recordings/policy.ts): strict
// "1" so a stray "true"/"yes" in Vercel can never accidentally open the surface.

export function isDraftApprovalsOn(env: {
  SF_DRAFT_APPROVALS?: string | undefined;
}): boolean {
  return env.SF_DRAFT_APPROVALS === "1";
}

/** Hard ceiling on drafts filed per conversation (all statuses — a resolved
 *  draft still counts, so a loop can't drain the inbox by re-filing). The
 *  uniqueness guarantee lives in the DB partial index; this cap is the
 *  belt-and-suspenders volume bound (Max amendment 2026-07-15). */
export const MAX_DRAFTS_PER_CONVERSATION = 10;
