"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isDraftApprovalsOn } from "@/lib/agent-drafts/policy";
import { resolveDraftForOperator } from "@/lib/agent-drafts/resolve";
import { createDrizzleDraftStore } from "@/lib/agent-drafts/storage-drizzle";

async function resolveWith(status: "approved" | "dismissed", draftId: string) {
  if (!isDraftApprovalsOn({ SF_DRAFT_APPROVALS: process.env.SF_DRAFT_APPROVALS })) {
    return { ok: false as const };
  }
  const session = await auth();
  const orgId = session?.user?.orgId;
  if (!session?.user?.id || !orgId) redirect("/login");
  const out = await resolveDraftForOperator(createDrizzleDraftStore(), {
    orgId,
    draftId,
    status,
    userId: session.user.id,
  });
  revalidatePath("/approvals");
  return out;
}

export async function approveDraftAction(draftId: string) {
  return resolveWith("approved", draftId);
}

export async function dismissDraftAction(draftId: string) {
  return resolveWith("dismissed", draftId);
}
