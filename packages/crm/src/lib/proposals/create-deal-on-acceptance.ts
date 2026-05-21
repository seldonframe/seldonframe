// packages/crm/src/lib/proposals/create-deal-on-acceptance.ts
// 2026-05-21 — Phase L.
//
// When a prospect accepts a proposal (Stripe checkout.session.completed),
// this helper:
//   1. Find-or-creates the prospect as a contact in the agency's org.
//   2. Finds the agency's default pipeline and its "Won" stage.
//   3. Creates a Won-stage deal linking back to the proposal.
//   4. Appends a deal_created proposal_event for audit trail.
//
// Called in a try/catch inside the webhook route — if it throws, the
// webhook still returns 200 (Stripe doesn't care about CRM bookkeeping).

import { and, asc, eq, ilike } from "drizzle-orm";
import { db } from "@/db";
import { contacts, deals, pipelines, proposalEvents } from "@/db/schema";
import type { Proposal } from "@/db/schema/proposals";
import { logEvent } from "@/lib/observability/log";

/** Format cents to a USD string like "$497/mo". */
function formatPriceUSD(cents: number): string {
  const dollars = (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return dollars;
}

export async function createDealOnAcceptance(proposal: Proposal): Promise<void> {
  const agencyOrgId = proposal.agencyOrgId;

  // ── 1. Find or create the contact ──────────────────────────────────────
  let contactId: string;

  const prospectEmail = proposal.prospectEmail?.trim().toLowerCase();

  if (prospectEmail) {
    const [existing] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(
          eq(contacts.orgId, agencyOrgId),
          ilike(contacts.email, prospectEmail),
        ),
      )
      .limit(1);

    if (existing) {
      contactId = existing.id;
      logEvent("proposal_acceptance_contact_found", {
        proposalId: proposal.id,
        contactId,
      });
    } else {
      // INSERT new contact
      const firstName =
        proposal.prospectFirstName?.trim() ||
        proposal.prospectName?.trim() ||
        "Unknown";

      const [created] = await db
        .insert(contacts)
        .values({
          orgId: agencyOrgId,
          firstName,
          lastName: null,
          email: proposal.prospectEmail,
          company: proposal.prospectName ?? null,
          phone: proposal.prospectPhone ?? null,
          source: "proposal",
          status: "customer",
        })
        .returning({ id: contacts.id });

      if (!created) {
        throw new Error("Failed to insert contact for proposal acceptance");
      }
      contactId = created.id;
      logEvent("proposal_acceptance_contact_created", {
        proposalId: proposal.id,
        contactId,
      });
    }
  } else {
    // No email on the proposal — create a contact without email
    const firstName =
      proposal.prospectFirstName?.trim() ||
      proposal.prospectName?.trim() ||
      "Unknown";

    const [created] = await db
      .insert(contacts)
      .values({
        orgId: agencyOrgId,
        firstName,
        lastName: null,
        email: null,
        company: proposal.prospectName ?? null,
        phone: proposal.prospectPhone ?? null,
        source: "proposal",
        status: "customer",
      })
      .returning({ id: contacts.id });

    if (!created) {
      throw new Error("Failed to insert email-less contact for proposal acceptance");
    }
    contactId = created.id;
    logEvent("proposal_acceptance_contact_created_no_email", {
      proposalId: proposal.id,
      contactId,
    });
  }

  // ── 2. Find the agency's default pipeline + Won stage ─────────────────
  const [pipeline] = await db
    .select()
    .from(pipelines)
    .where(eq(pipelines.orgId, agencyOrgId))
    .orderBy(asc(pipelines.createdAt))
    .limit(1);

  if (!pipeline) {
    logEvent("proposal_acceptance_no_pipeline", {
      proposalId: proposal.id,
      agencyOrgId,
    });
    // Still created the contact — just can't create the deal. Return cleanly.
    return;
  }

  // stages is a JSONB array of { name, color, probability }
  const stages: Array<{ name: string; color: string; probability: number }> =
    Array.isArray(pipeline.stages) ? pipeline.stages : [];

  // Case-insensitive match for "Won". Fallback: last stage in the pipeline.
  const wonStage = stages.find((s) => s.name.toLowerCase() === "won");
  const stageName = wonStage?.name ?? stages[stages.length - 1]?.name ?? "Won";

  if (!wonStage) {
    logEvent("proposal_acceptance_no_won_stage_fallback", {
      proposalId: proposal.id,
      pipelineId: pipeline.id,
      fallbackStage: stageName,
      stagesFound: stages.map((s) => s.name),
    });
  }

  // ── 3. Create the deal ─────────────────────────────────────────────────
  // Deal value = annual MRR + setup fee (standard CRM convention)
  const dealValueCents =
    proposal.monthlyPriceCents * 12 + proposal.setupFeeCents;
  const dealValueDollars = (dealValueCents / 100).toFixed(2);

  const dealTitle = `${proposal.prospectName} — ${formatPriceUSD(proposal.monthlyPriceCents)}/mo`;

  const [deal] = await db
    .insert(deals)
    .values({
      orgId: agencyOrgId,
      contactId,
      pipelineId: pipeline.id,
      title: dealTitle,
      value: dealValueDollars,
      currency: "USD",
      stage: stageName,
      probability: 100,
      closedAt: new Date(),
      customFields: {
        proposal_id: proposal.id,
        monthly_cents: proposal.monthlyPriceCents,
        setup_fee_cents: proposal.setupFeeCents,
        workspace_id: proposal.previewWorkspaceId ?? null,
      },
    })
    .returning({ id: deals.id });

  if (!deal) {
    throw new Error("Failed to insert deal for proposal acceptance");
  }

  logEvent("proposal_acceptance_deal_created", {
    proposalId: proposal.id,
    dealId: deal.id,
    contactId,
    stage: stageName,
    valueDollars: dealValueDollars,
  });

  // ── 4. Append deal_created proposal event ─────────────────────────────
  await db.insert(proposalEvents).values({
    proposalId: proposal.id,
    eventType: "accepted",
    metadata: { dealId: deal.id, contactId },
  });
}
