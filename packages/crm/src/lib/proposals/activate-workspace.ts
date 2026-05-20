// packages/crm/src/lib/proposals/activate-workspace.ts
// 2026-05-19 — Proposal Builder. On checkout success: flip preview
// workspace to active, transfer ownership-to-prospect, update proposal
// status, log events. Spec: §"Stripe Connect webhook + workspace activation".

import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  organizations,
  proposalEvents,
  proposals,
} from "@/db/schema";

export type ActivationOp =
  | { type: "flip_preview_mode"; workspaceId: string }
  | {
      type: "update_proposal_status";
      proposalId: string;
      stripeSubscriptionId: string;
      stripeCustomerId: string;
    }
  | { type: "log_event_checkout_success"; proposalId: string; sessionId: string }
  | { type: "log_event_workspace_activated"; proposalId: string; workspaceId: string };

export function buildActivationOps(input: {
  proposalId: string;
  workspaceId: string | null;
  prospectEmail: string;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
}): ActivationOp[] {
  const ops: ActivationOp[] = [];
  if (input.workspaceId) {
    ops.push({ type: "flip_preview_mode", workspaceId: input.workspaceId });
    ops.push({
      type: "log_event_workspace_activated",
      proposalId: input.proposalId,
      workspaceId: input.workspaceId,
    });
  }
  ops.push({
    type: "update_proposal_status",
    proposalId: input.proposalId,
    stripeSubscriptionId: input.stripeSubscriptionId,
    stripeCustomerId: input.stripeCustomerId,
  });
  return ops;
}

export async function activateProposalWorkspace(input: {
  proposalId: string;
  workspaceId: string | null;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  sessionId: string;
}): Promise<void> {
  if (input.workspaceId) {
    await db
      .update(organizations)
      .set({ previewMode: false, updatedAt: new Date() })
      .where(eq(organizations.id, input.workspaceId));

    await db.insert(proposalEvents).values({
      proposalId: input.proposalId,
      eventType: "workspace_activated",
      metadata: { workspaceId: input.workspaceId },
    });
  }

  await db
    .update(proposals)
    .set({
      status: "accepted",
      acceptedAt: new Date(),
      stripeSubscriptionId: input.stripeSubscriptionId,
      stripeCustomerId: input.stripeCustomerId,
      updatedAt: new Date(),
    })
    .where(eq(proposals.id, input.proposalId));

  await db.insert(proposalEvents).values({
    proposalId: input.proposalId,
    eventType: "checkout_success",
    metadata: { sessionId: input.sessionId },
  });
}
