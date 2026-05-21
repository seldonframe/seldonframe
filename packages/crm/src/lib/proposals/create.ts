// packages/crm/src/lib/proposals/create.ts
// 2026-05-21 — Phase E: createProposal no longer accepts a generateHtml
// callback. The caller passes pre-composed HTML directly (via composeProposalHtml).
// Pricing is passed as explicit cents rather than via the tier enum.
// The original resolvePricing helper is retained for backward compat.

import { db } from "@/db";
import {
  proposals,
  proposalEvents,
  type Proposal,
  type ProposalPricingTier,
  type ProposalScopeItem,
} from "@/db/schema";
import { generateProposalToken } from "./signed-token";
import {
  DEFAULT_PROPOSAL_TEMPLATE,
} from "./generate-html";
import type { AgencyProposalTemplate } from "@/db/schema/agency-profile";

export const PROPOSAL_TIER_PRICES: Record<Exclude<ProposalPricingTier, "custom">, number> = {
  starter: 29700,
  growth: 49700,
  pro: 99700,
};

export type ResolvePricingInput =
  | { tier: "starter" | "growth" | "pro" }
  | { tier: "custom"; customCents?: number };

export function resolvePricing(input: ResolvePricingInput): {
  tier: ProposalPricingTier;
  monthlyPriceCents: number;
} {
  if (input.tier === "custom") {
    if (typeof input.customCents !== "number") {
      throw new Error("custom_pricing_requires_amount");
    }
    if (input.customCents < 5000) {
      throw new Error("custom_price_below_minimum");
    }
    return { tier: "custom", monthlyPriceCents: input.customCents };
  }
  return { tier: input.tier, monthlyPriceCents: PROPOSAL_TIER_PRICES[input.tier] };
}

export type CreateProposalInput = {
  agencyOrgId: string;
  createdByUserId: string;
  prospectName: string;
  prospectEmail: string;
  prospectFirstName?: string | null;
  prospectPhone?: string | null;
  scopeItems: ProposalScopeItem[];
  agencyName: string;
  agencyBrandColor?: string;
  template?: AgencyProposalTemplate;
  monthlyPriceCents: number;
  setupFeeCents?: number;
  previewWorkspaceId: string | null;
  emailSubject?: string | null;
  emailBody?: string | null;
  introText?: string | null;
  timelineText?: string | null;
  termsText?: string | null;
  generatedHtml: string;
};

export async function createProposal(
  input: CreateProposalInput,
): Promise<Proposal> {
  if (input.monthlyPriceCents < 5000) {
    throw new Error("custom_price_below_minimum");
  }
  const setupFeeCents = Math.max(0, Math.floor(input.setupFeeCents ?? 0));

  const token = generateProposalToken();

  // Determine pricing tier from the cents value for backward compat
  let pricingTier: ProposalPricingTier = "custom";
  for (const [tier, price] of Object.entries(PROPOSAL_TIER_PRICES) as [Exclude<ProposalPricingTier, "custom">, number][]) {
    if (price === input.monthlyPriceCents) {
      pricingTier = tier;
      break;
    }
  }

  const [created] = await db
    .insert(proposals)
    .values({
      agencyOrgId: input.agencyOrgId,
      createdByUserId: input.createdByUserId,
      prospectUrl: "",  // no longer URL-driven; kept non-null for schema compat
      prospectName: input.prospectName,
      prospectEmail: input.prospectEmail,
      prospectFirstName: input.prospectFirstName ?? null,
      prospectPhone: input.prospectPhone ?? null,
      previewWorkspaceId: input.previewWorkspaceId,
      pricingTier,
      monthlyPriceCents: input.monthlyPriceCents,
      setupFeeCents,
      generatedHtml: input.generatedHtml,
      scopeItems: input.scopeItems,
      ...(input.emailSubject !== undefined && { emailSubject: input.emailSubject }),
      ...(input.emailBody !== undefined && { emailBody: input.emailBody }),
      ...(input.introText !== undefined && { introText: input.introText }),
      ...(input.timelineText !== undefined && { timelineText: input.timelineText }),
      ...(input.termsText !== undefined && { termsText: input.termsText }),
      signedToken: token,
      status: "draft",
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    })
    .returning();

  await db.insert(proposalEvents).values({
    proposalId: created.id,
    eventType: "created",
    metadata: { monthlyPriceCents: input.monthlyPriceCents },
  });

  return created;
}
