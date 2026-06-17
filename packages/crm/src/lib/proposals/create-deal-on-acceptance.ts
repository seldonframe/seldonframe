// packages/crm/src/lib/proposals/create-deal-on-acceptance.ts
// 2026-05-21 — Phase L.
//
// When a prospect accepts a proposal (Stripe checkout.session.completed),
// this helper:
//   1. Find-or-creates the prospect as a contact in the agency's org.
//   2. Finds the agency's default pipeline and its "Won" stage.
//   3. Creates a Won-stage deal linking back to the proposal.
//   4. Appends a deal_created proposal_event for audit trail.
//   5. (2026-06-17) Updates existing contact status/fields; inserts a
//      payment_records row so Lifetime Revenue shows correctly.
//   6. (2026-06-17 Slice 2) Merges customFields.plan, customFields.workspaceId,
//      and optionally customFields.billing onto the contact.
//
// Called in a try/catch inside the webhook route — if it throws, the
// webhook still returns 200 (Stripe doesn't care about CRM bookkeeping).

import { and, asc, eq, ilike } from "drizzle-orm";
import { db } from "@/db";
import { contacts, deals, paymentRecords, pipelines, proposalEvents } from "@/db/schema";
import type { Proposal } from "@/db/schema/proposals";
import { logEvent } from "@/lib/observability/log";

// ── Billing shape written to customFields.billing ────────────────────────────

export type BillingInfo = {
  card: {
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
  } | null;
  address: {
    line1: string | null;
    line2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
  } | null;
};

/**
 * Pick the best "win" stage from an ordered stages array.
 *
 * Priority:
 *  1. First stage whose name matches a win-synonym regex
 *     (won, signed, closed-won, live, active, customer — case-insensitive).
 *  2. If no name matches, the highest-probability stage with probability > 0.
 *  3. Never falls back to the last stage (which is typically "Did Not Convert").
 */
function pickWinStage(
  stages: Array<{ name: string; color: string; probability: number }>,
): { name: string; color: string; probability: number } | undefined {
  const winRe = /\b(won|signed|closed[\s-]?won|live|active|customer)\b/i;
  const byName = stages.find((s) => winRe.test(s.name));
  if (byName) return byName;

  // Fall back to highest-probability stage with probability > 0
  let best: (typeof stages)[number] | undefined;
  for (const s of stages) {
    if (s.probability > 0 && (!best || s.probability > best.probability)) {
      best = s;
    }
  }
  return best;
}

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

export async function createDealOnAcceptance(
  proposal: Proposal,
  billing?: BillingInfo,
): Promise<void> {
  const agencyOrgId = proposal.agencyOrgId;

  // ── Build customFields.plan from the proposal ─────────────────────────────
  const planFields = {
    monthlyPriceCents: proposal.monthlyPriceCents,
    setupFeeCents: proposal.setupFeeCents,
    pricingTier: proposal.pricingTier,
    services: Array.isArray(proposal.scopeItems)
      ? (proposal.scopeItems as Array<{ label: string }>).map((s) => s.label)
      : [],
  };

  /** Merge plan + workspaceId (and optionally billing) into an existing
   *  customFields JSONB, preserving all keys not mentioned here. */
  function mergeCustomFields(existing: Record<string, unknown>): Record<string, unknown> {
    const merged: Record<string, unknown> = { ...existing };
    merged.plan = planFields;
    merged.workspaceId = proposal.previewWorkspaceId ?? null;
    if (billing !== undefined) {
      merged.billing = billing;
    }
    return merged;
  }

  // ── 1. Find or create the contact ──────────────────────────────────────
  let contactId: string;

  const prospectEmail = proposal.prospectEmail?.trim().toLowerCase();

  if (prospectEmail) {
    const [existing] = await db
      .select({ id: contacts.id, status: contacts.status, company: contacts.company, phone: contacts.phone, customFields: contacts.customFields })
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

      // Promote the contact to 'customer', backfill company/phone if missing,
      // and merge customFields.plan + workspaceId (+ billing if provided).
      const patch: Partial<typeof contacts.$inferInsert> = {
        status: "customer",
        customFields: mergeCustomFields((existing.customFields as Record<string, unknown>) ?? {}),
        updatedAt: new Date(),
      };
      if (!existing.company && proposal.prospectName) {
        patch.company = proposal.prospectName;
      }
      if (!existing.phone && proposal.prospectPhone) {
        patch.phone = proposal.prospectPhone;
      }
      await db
        .update(contacts)
        .set(patch)
        .where(eq(contacts.id, contactId));

      logEvent("proposal_acceptance_contact_updated", {
        proposalId: proposal.id,
        contactId,
        previousStatus: existing.status,
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
          customFields: mergeCustomFields({}),
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
        customFields: mergeCustomFields({}),
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

  // Smart win-stage selection — never falls back to last stage (usually "Did Not Convert").
  const winStage = pickWinStage(stages);
  const stageName = winStage?.name ?? "Won";
  const stageProbability = winStage?.probability ?? 100;

  if (!winStage) {
    logEvent("proposal_acceptance_no_win_stage_fallback", {
      proposalId: proposal.id,
      pipelineId: pipeline.id,
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
      probability: stageProbability,
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

  // ── 5. Record the payment so Lifetime Revenue shows correctly ──────────
  // payment_records is what getContactRevenue() sums; acceptance never
  // wrote one before, so the contact always showed $0 lifetime.
  // Amount = monthlyPriceCents + setupFeeCents (initial payment),
  // converted to dollars (the column is numeric(12,2) in USD).
  // Idempotent: we key off stripeCheckoutSessionId as sourceId — if the
  // webhook fires twice, the second insert is a no-op via the DB's unique
  // handling (both rows would be identical; we do an ignoreDuplicates-style
  // approach by only inserting when no row already exists for this sourceId).
  const initialPaymentDollars = (
    (proposal.monthlyPriceCents + proposal.setupFeeCents) / 100
  ).toFixed(2);

  const existingPayment = proposal.stripeCheckoutSessionId
    ? await db
        .select({ id: paymentRecords.id })
        .from(paymentRecords)
        .where(
          and(
            eq(paymentRecords.orgId, agencyOrgId),
            eq(paymentRecords.sourceId, proposal.stripeCheckoutSessionId),
          ),
        )
        .limit(1)
    : [];

  if (existingPayment.length === 0) {
    await db.insert(paymentRecords).values({
      orgId: agencyOrgId,
      contactId,
      stripePaymentIntentId: null,
      stripeAccountId: null,
      stripeChargeId: null,
      amount: initialPaymentDollars,
      currency: "USD",
      status: "completed",
      sourceBlock: "proposal",
      sourceId: proposal.stripeCheckoutSessionId ?? proposal.id,
      metadata: {
        proposalId: proposal.id,
        dealId: deal.id,
        monthlyPriceCents: proposal.monthlyPriceCents,
        setupFeeCents: proposal.setupFeeCents,
      },
    });

    logEvent("proposal_acceptance_payment_recorded", {
      proposalId: proposal.id,
      contactId,
      amountDollars: initialPaymentDollars,
    });
  } else {
    logEvent("proposal_acceptance_payment_already_recorded", {
      proposalId: proposal.id,
      contactId,
    });
  }
}
