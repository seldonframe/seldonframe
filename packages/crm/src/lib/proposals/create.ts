// packages/crm/src/lib/proposals/create.ts
// 2026-05-19 — Proposal Builder orchestrator. Resolves pricing, calls
// soul extraction (existing), provisions the preview workspace (existing
// createFullWorkspace with preview_mode=true), generates HTML via
// Anthropic, and inserts the proposals row. Spec: §"Proposal creation".

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
  buildProposalPrompt,
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
  prospectUrl: string;
  prospectName: string;
  prospectEmail: string;
  prospectFirstName?: string | null;
  prospectPhone?: string | null;
  prospectServices: string[];
  agencyName: string;
  agencyBrandColor?: string;
  template?: AgencyProposalTemplate;
  pricing: ResolvePricingInput;
  setupFeeCents?: number;
  previewWorkspaceId: string | null;
  generateHtml: (prompt: string) => Promise<string>;
};

export async function createProposal(
  input: CreateProposalInput,
): Promise<Proposal> {
  const pricing = resolvePricing(input.pricing);
  const setupFeeCents = Math.max(0, Math.floor(input.setupFeeCents ?? 0));
  const template = input.template ?? DEFAULT_PROPOSAL_TEMPLATE;

  const prompt = buildProposalPrompt({
    agencyName: input.agencyName,
    agencyBrandColor: input.agencyBrandColor,
    prospectName: input.prospectName,
    prospectFirstName: input.prospectFirstName,
    prospectServices: input.prospectServices,
    monthlyPriceCents: pricing.monthlyPriceCents,
    template,
  });

  const html = await input.generateHtml(prompt);
  const token = generateProposalToken();

  const scopeItems: ProposalScopeItem[] = template.scopeCopy
    .split(",")
    .map((item) => ({ label: item.trim() }))
    .filter((item) => item.label.length > 0);

  const [created] = await db
    .insert(proposals)
    .values({
      agencyOrgId: input.agencyOrgId,
      createdByUserId: input.createdByUserId,
      prospectUrl: input.prospectUrl,
      prospectName: input.prospectName,
      prospectEmail: input.prospectEmail,
      prospectFirstName: input.prospectFirstName ?? null,
      prospectPhone: input.prospectPhone ?? null,
      previewWorkspaceId: input.previewWorkspaceId,
      pricingTier: pricing.tier,
      monthlyPriceCents: pricing.monthlyPriceCents,
      setupFeeCents,
      generatedHtml: html,
      scopeItems,
      signedToken: token,
      status: "draft",
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    })
    .returning();

  await db.insert(proposalEvents).values({
    proposalId: created.id,
    eventType: "created",
    metadata: { pricingTier: pricing.tier, monthlyPriceCents: pricing.monthlyPriceCents },
  });

  return created;
}
