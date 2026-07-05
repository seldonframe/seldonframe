"use server";

// Server action for the command bar's auto-open-once flow (Task 7 of the
// simple-home plan). Fire-and-forget: the client dispatches the
// "seldonchat:open" event immediately and calls this in the background so a
// slow/failed write never blocks the chat panel from opening. Org is
// resolved from the session (getOrgId) — no args trusted, mirrors
// settings/features/actions.ts's toggleModuleAction pattern.

import { getOrgId } from "@/lib/auth/helpers";
import { markChatIntroSeen } from "@/lib/workspace/surface";

export async function markChatIntroSeenAction(): Promise<void> {
  const orgId = await getOrgId();
  if (!orgId) return;

  await markChatIntroSeen(orgId).catch(() => {});
}
