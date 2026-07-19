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

/** The capability id for the draft_for_approval native tool. Canonical home
 *  is this pure policy module (no DB imports) so non-tools-runtime code
 *  (e.g. lib/recordings/compile-agent.ts) doesn't need to value-import
 *  tools.ts just for this constant. Re-exported from tools.ts so existing
 *  `import { DRAFT_FOR_APPROVAL_CAPABILITY } from "@/lib/agents/tools"`
 *  call sites keep working unchanged. */
export const DRAFT_FOR_APPROVAL_CAPABILITY = "draft_for_approval";
