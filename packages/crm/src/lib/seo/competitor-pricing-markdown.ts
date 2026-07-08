// Pure Markdown renderer for the /<slug>-pricing.md twins — the agent-legible
// representation of the pricing pages. Served by the static dotted route
// folders (<slug>-pricing.md/route.ts); mirrors alternative-markdown.ts.

import { getCompetitorPricing, type CompetitorPricing } from "@/lib/seo/competitor-pricing";
import { getCompetitor } from "@/lib/seo/alternative-pages";
import { emphasizeMd } from "@/lib/seo/emphasize";

const BASE = "https://seldonframe.com";

export function renderCompetitorPricingMarkdown(slug: string): string {
  const p = getCompetitorPricing(slug);
  const c = getCompetitor(slug);
  const L: string[] = [];

  L.push(`# ${c.name} Pricing (2026): What You'll Actually Pay`);
  L.push("");
  L.push(`> Pricing breakdown, checked ${p.verified}. Source: ${p.pricingUrl}`);
  L.push("");
  L.push(`Last checked: ${p.verified}. HTML version: ${BASE}/${p.slug}-pricing`);
  L.push("");
  L.push(`## The short version`);
  L.push("");
  L.push(`- **Starts at:** ${emphasizeMd(startsAt(p))}`);
  L.push(`- **What stacks on top:** ${emphasizeMd(p.stacks[0]?.detail ?? "no published add-ons")}`);
  L.push(`- **SeldonFrame comparison:** ${emphasizeMd("$29/mo flat, unlimited workspaces — no meters")}`);
  if (p.freeTier) L.push(`- **Free tier:** ${emphasizeMd(p.freeTier)}`);
  L.push("");
  L.push(`## Plans`);
  L.push("");
  L.push(`| Plan | Price | Who it's for |`);
  L.push("|---|---|---|");
  for (const plan of p.plans) {
    L.push(`| ${plan.name} | ${emphasizeMd(plan.price)} | ${plan.whoFor} |`);
  }
  L.push("");
  L.push(`## What stacks on top`);
  L.push("");
  for (const s of p.stacks) {
    L.push(`- **${s.label}:** ${emphasizeMd(s.detail)}`);
  }
  L.push("");
  if (p.freeTier) {
    L.push(`## Free tier`);
    L.push("");
    L.push(emphasizeMd(p.freeTier));
    L.push("");
  }
  if (p.annualNote) {
    L.push(`## Annual billing`);
    L.push("");
    L.push(emphasizeMd(p.annualNote));
    L.push("");
  }
  L.push(`## The bottom line`);
  L.push("");
  L.push(emphasizeMd(p.bottomLine));
  L.push("");
  L.push(`## How this compares to SeldonFrame`);
  L.push("");
  L.push(
    `SeldonFrame is ${emphasizeMd("$29/mo flat")}, unlimited workspaces, with AI and telephony on your own keys at raw provider cost — no meters to track. See the full comparison: ${BASE}/compare/seldonframe-vs-${c.slug} and ${BASE}/alternative-to-${c.slug}.`,
  );
  L.push("");
  L.push(`## FAQ`);
  L.push("");
  for (const item of buildFaq(p, c.name)) {
    L.push(`**${item.q}**`);
    L.push("");
    L.push(item.a);
    L.push("");
  }
  L.push(`## Sources`);
  L.push("");
  L.push(`Prices checked ${p.verified} on ${p.pricingUrl}`);
  L.push("");
  L.push(`## Get started`);
  L.push("");
  L.push(`- Start free (build the workspace in ~3 minutes, before signing up): ${BASE}/signup`);
  L.push(`- All pricing pages: ${BASE}/alternatives`);
  L.push("");
  return L.join("\n");
}

function startsAt(p: CompetitorPricing): string {
  if (p.quoteGated && p.plans.every((pl) => /quote|contact sales|custom/i.test(pl.price))) {
    return "Quote-gated — no public pricing";
  }
  return p.plans[0]?.price ?? "Quote-gated — no public pricing";
}

function buildFaq(p: CompetitorPricing, name: string): { q: string; a: string }[] {
  return [
    { q: `How much does ${name} cost?`, a: p.bottomLine },
    {
      q: `Does ${name} have a free plan?`,
      a: p.freeTier ? p.freeTier : `No — ${name} does not publish a permanent free tier.`,
    },
    {
      q: `What's the cheapest ${name} alternative?`,
      a: `SeldonFrame: $29/mo flat, unlimited workspaces, first workspace free forever, with AI and telephony on your own keys at raw provider cost. ${BASE}/alternative-to-${p.slug}`,
    },
  ];
}
