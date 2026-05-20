// packages/crm/src/lib/proposals/actions.ts
// 2026-05-19 — Proposal Builder server actions. Spec: §"Operator review + send".

"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import {
  proposalEvents,
  proposals,
  users,
  type Proposal,
  type ProposalScopeItem,
} from "@/db/schema";
import { assertTransition } from "./status";
// Plan called for sendEmail from "@/lib/messaging/send-email" which does not
// exist. The canonical transactional email sender in this codebase is
// sendEmailFromApi from "@/lib/emails/api" — same Resend path, suppression
// list, and audit-row insertion used by the outbound messaging dispatcher
// and MCP email tool. Passes userId:null (system-initiated, no human actor).
import { sendEmailFromApi } from "@/lib/emails/api";
import type { AgencyProposalTemplate } from "@/db/schema/agency-profile";

// Derive User type from Drizzle schema inferSelect.
type User = typeof users.$inferSelect;

type ActionResult<T = unknown> =
  | { ok: true; value?: T }
  | { ok: false; error: string };

type LoadResult =
  | { error: string }
  | { user: User; proposal: Proposal };

async function loadAuthorizedProposal(id: string): Promise<LoadResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "unauthorized" };

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!user) return { error: "user_not_found" };

  const [proposal] = await db
    .select()
    .from(proposals)
    .where(and(eq(proposals.id, id), eq(proposals.agencyOrgId, user.orgId)))
    .limit(1);
  if (!proposal) return { error: "not_found" };

  return { user, proposal };
}

export async function updateProposalAction(input: {
  id: string;
  monthlyPriceCents: number;
  scopeItems: ProposalScopeItem[];
}): Promise<ActionResult> {
  const loaded = await loadAuthorizedProposal(input.id);
  if ("error" in loaded) return { ok: false, error: loaded.error };
  if (loaded.proposal.status !== "draft") {
    return { ok: false, error: "proposal_not_editable" };
  }
  if (input.monthlyPriceCents < 5000) {
    return { ok: false, error: "price_below_minimum" };
  }

  await db
    .update(proposals)
    .set({
      monthlyPriceCents: input.monthlyPriceCents,
      scopeItems: input.scopeItems,
      updatedAt: new Date(),
    })
    .where(eq(proposals.id, input.id));

  revalidatePath(`/proposals/${input.id}`);
  return { ok: true };
}

export async function sendProposalAction(input: {
  id: string;
}): Promise<ActionResult> {
  const loaded = await loadAuthorizedProposal(input.id);
  if ("error" in loaded) return { ok: false, error: loaded.error };
  const { proposal, user } = loaded;

  try {
    assertTransition(proposal.status, "sent");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "invalid_transition" };
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://app.seldonframe.com";
  const publicUrl = `${baseUrl}/p/${proposal.signedToken}`;
  const template = (user.agencyProfile as { proposalTemplate?: AgencyProposalTemplate })
    ?.proposalTemplate;
  const subject = (template?.subject ?? "A proposal for {{prospectName}}").replace(
    /\{\{prospectName\}\}/g,
    proposal.prospectName,
  );

  // sendEmailFromApi is the canonical Resend wrapper used throughout this
  // codebase (outbound messaging dispatcher, MCP email tool). Accepts
  // { orgId, userId, contactId, toEmail, subject, body } — resolves the
  // operator's Resend key, checks suppression list, inserts emails audit row.
  const agencyName =
    (user.agencyProfile as { name?: string } | null)?.name ?? user.name;
  await sendEmailFromApi({
    orgId: user.orgId,
    userId: null,
    contactId: null,
    toEmail: proposal.prospectEmail,
    subject,
    body: `<p>Hi ${proposal.prospectFirstName ?? proposal.prospectName},</p>
<p>${agencyName} put together a proposal for you. View it here:</p>
<p><a href="${publicUrl}">${publicUrl}</a></p>`,
  });

  await db
    .update(proposals)
    .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
    .where(eq(proposals.id, input.id));

  await db.insert(proposalEvents).values({
    proposalId: input.id,
    eventType: "sent",
    metadata: { to: proposal.prospectEmail },
  });

  revalidatePath(`/proposals/${input.id}`);
  revalidatePath("/proposals");
  return { ok: true };
}
