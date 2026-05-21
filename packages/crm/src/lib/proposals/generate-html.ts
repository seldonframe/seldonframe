// packages/crm/src/lib/proposals/generate-html.ts
// 2026-05-19 — Proposal Builder. Builds the Claude prompt that produces
// the proposal HTML body. Pure: takes agency + prospect context,
// returns a string. The actual Anthropic call lives in lib/proposals/create.ts
// so this stays test-friendly. Spec: §"Proposal creation".

import type { AgencyProposalTemplate } from "@/db/schema/agency-profile";

export type BuildProposalPromptInput = {
  agencyName: string;
  agencyBrandColor?: string;
  prospectName: string;
  prospectFirstName?: string | null;
  prospectServices: string[];
  monthlyPriceCents: number;
  template: AgencyProposalTemplate;
};

const VARIABLE_PATTERN = /\{\{(\w+)\}\}/g;

function substitute(copy: string, vars: Record<string, string>): string {
  return copy.replace(VARIABLE_PATTERN, (_, key) => vars[key] ?? `{{${key}}}`);
}

function formatPriceUSD(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

export function buildProposalPrompt(input: BuildProposalPromptInput): string {
  const vars: Record<string, string> = {
    prospectName: input.prospectName,
    prospectFirstName: input.prospectFirstName ?? input.prospectName,
    agencyName: input.agencyName,
    price: formatPriceUSD(input.monthlyPriceCents),
  };

  const subject = substitute(input.template.subject, vars);
  const intro = substitute(input.template.introCopy, vars);
  const scope = substitute(input.template.scopeCopy, vars);
  const timeline = substitute(input.template.timelineCopy, vars);
  const terms = substitute(input.template.termsCopy, vars);
  const brandColor = input.agencyBrandColor ?? "#0ea5e9";

  return [
    `You are writing a sales proposal HTML body for ${input.agencyName}.`,
    "",
    "Output requirements:",
    "1. Return HTML wrapped in a single <section> element. No <html>, <head>, or <body>.",
    "2. Use semantic tags (h1, h2, p, ul, li). No inline styles except brand color accents.",
    `3. Brand accent color: ${brandColor}. Use it on h1 and the price callout only.`,
    "4. Three sections: intro paragraph, what's included, timeline + terms.",
    "5. Output ONLY the <section>...</section> markup. No commentary.",
    "",
    "Context:",
    `- Prospect business name: ${input.prospectName}`,
    `- Prospect first name: ${vars.prospectFirstName}`,
    `- Services they offer: ${input.prospectServices.join(", ")}`,
    `- Monthly price: ${vars.price}`,
    "",
    "Agency-supplied copy you must use verbatim (or near-verbatim) for each section:",
    `Subject: ${subject}`,
    `Intro: ${intro}`,
    `What's included: ${scope}`,
    `Timeline: ${timeline}`,
    `Terms: ${terms}`,
    "",
    "Write the proposal now.",
  ].join("\n");
}

export const DEFAULT_PROPOSAL_TEMPLATE: AgencyProposalTemplate = {
  subject: "Your proposal — {{prospectName}}",
  introCopy:
    "Hi {{prospectFirstName}} — thanks for the conversation. We put together a working booking page, CRM, and AI chatbot for {{prospectName}}. Everything you see in this proposal is real and ready to go live the moment you click Accept.",
  scopeCopy:
    "Branded booking page on your domain, intake form, AI chatbot trained on your services, CRM with deal pipeline, speed-to-lead SMS + email automations. Hosted, monitored, and maintained.",
  timelineCopy:
    "Sign → your workspace goes live within 60 seconds → we email you the admin link → you launch.",
  termsCopy:
    "Month-to-month. Cancel anytime from your Stripe receipt. We don't lock you in.",
};
