// packages/crm/src/lib/proposals/compose-html.ts
// 2026-05-21 — Phase E: compose proposal-page HTML from operator inputs
// + agency template. Replaces the Claude-generated HTML for new proposals.
//
// Pure function. No DB, no LLM, no I/O. Inputs: prospect facts, pricing,
// agency template, operator's per-proposal overrides. Output: an HTML
// string that the /p/[token] public route renders inside its <section>.

import type { AgencyProposalTemplate } from "@/db/schema/agency-profile";
import type { ProposalScopeItem } from "@/db/schema/proposals";

export type ComposeProposalHtmlInput = {
  prospectName: string;
  prospectFirstName?: string | null;
  monthlyPriceCents: number;
  setupFeeCents: number;
  scopeItems: ProposalScopeItem[];
  agencyTemplate: AgencyProposalTemplate;
  introOverride?: string | null;
  timelineOverride?: string | null;
  termsOverride?: string | null;
  brandColor: string;
};

const VARS_PATTERN = /\{\{(\w+)\}\}/g;

function substitute(copy: string, vars: Record<string, string>): string {
  return copy.replace(VARS_PATTERN, (_, key) => vars[key] ?? `{{${key}}}`);
}

function formatPriceUSD(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function paragraphize(text: string): string {
  return text
    .trim()
    .split(/\n\n+/)
    .map((p) => `<p>${esc(p).replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

export function composeProposalHtml(input: ComposeProposalHtmlInput): string {
  const vars: Record<string, string> = {
    prospectName: input.prospectName,
    prospectFirstName: input.prospectFirstName ?? input.prospectName,
    price: formatPriceUSD(input.monthlyPriceCents),
  };

  const intro = (input.introOverride?.trim() ||
    substitute(input.agencyTemplate.introCopy, vars));
  const timeline = (input.timelineOverride?.trim() ||
    substitute(input.agencyTemplate.timelineCopy, vars));
  const terms = (input.termsOverride?.trim() ||
    substitute(input.agencyTemplate.termsCopy, vars));

  const scopeList = input.scopeItems.length > 0
    ? `<ul>${input.scopeItems.map((item) => `<li>${esc(item.label)}</li>`).join("")}</ul>`
    : `<p>${esc(substitute(input.agencyTemplate.scopeCopy, vars))}</p>`;

  return `
<section>
  <h2>${esc(input.prospectName)}</h2>
  ${paragraphize(intro)}

  <h3>What's included</h3>
  ${scopeList}

  <h3>Timeline</h3>
  ${paragraphize(timeline)}

  <p style="color: ${esc(input.brandColor)};">
    ${esc(terms)}
  </p>
</section>
  `.trim();
}
