// Pure Markdown renderers for the /alternative-to-<slug>.md twins (and the
// /compare/<a>-vs-<b>.md twins) — the agent-legible representation of the
// comparison pages, mirroring the marketplace/ai-agents .md-twin convention.
// Served by the static dotted route folders (alternative-to-<slug>.md/route.ts);
// no proxy changes needed because those segments are static.

import {
  COMPARISON_LABELS,
  SF_COLUMN,
  SHARED_FAQ,
  LAST_UPDATED,
  type Competitor,
} from "@/lib/seo/alternative-pages";
import { getExtras, SF_PROS, SF_CONS, SWITCH_STEPS, DEMO_HREF, type VsPair } from "@/lib/seo/alternative-pages-extras";
import { emphasizeMd } from "@/lib/seo/emphasize";

const BASE = "https://www.seldonframe.com";

export function renderAlternativeMarkdown(c: Competitor): string {
  const x = getExtras(c.slug);
  const faq = [...c.faq, ...SHARED_FAQ];
  const L: string[] = [];

  L.push(`# Best ${c.name} Alternative for Agencies & Builders`);
  L.push("");
  L.push(`> ${c.heroSub}`);
  L.push("");
  L.push(`Last updated: ${LAST_UPDATED}. HTML version: ${BASE}/alternative-to-${c.slug}`);
  L.push("");
  L.push(`## The short version`);
  L.push("");
  L.push(`- **${c.name} pricing:** ${emphasizeMd(c.them.pricingModel)}`);
  L.push(`- **SeldonFrame pricing:** ${emphasizeMd("$29/mo flat, unlimited workspaces, first workspace free forever")}`);
  L.push(`- **Pick ${c.name} if:** ${emphasizeMd(x.chooseThem[0])}`);
  L.push(`- **Pick SeldonFrame if:** ${emphasizeMd(x.chooseSf[0])}`);
  L.push("");
  L.push(`## ${c.name} vs SeldonFrame: what you need to know`);
  L.push("");
  for (const p of c.intro) {
    L.push(p);
    L.push("");
  }
  L.push(`## Features & pricing comparison`);
  L.push("");
  L.push(`| Feature | ${c.name} | SeldonFrame |`);
  L.push("|---|---|---|");
  for (const row of COMPARISON_LABELS) {
    L.push(`| ${row.label} | ${emphasizeMd(c.them[row.key])} | ${emphasizeMd(SF_COLUMN[row.key])} |`);
  }
  L.push("");
  L.push(`Prices checked ${LAST_UPDATED} on [${c.name}'s pricing page](${c.pricingSourceUrl}).`);
  L.push("");
  L.push(`## Pros & cons`);
  L.push("");
  L.push(`### ${c.name}`);
  L.push("");
  for (const p of x.pros) L.push(`- **Pro:** ${p}`);
  for (const p of x.cons) L.push(`- **Con:** ${p}`);
  L.push("");
  L.push(`### SeldonFrame`);
  L.push("");
  for (const p of SF_PROS) L.push(`- **Pro:** ${p}`);
  for (const p of SF_CONS) L.push(`- **Con:** ${p}`);
  L.push("");
  L.push(`## Why agencies & builders switch from ${c.name}`);
  L.push("");
  for (const r of c.switchReasons) L.push(`- **${r.title}** — ${r.body}`);
  L.push("");
  L.push(`## Who should use ${c.name} vs SeldonFrame`);
  L.push("");
  L.push(`Choose ${c.name} if:`);
  x.chooseThem.forEach((item, i) => L.push(`${i + 1}. ${item}`));
  L.push("");
  L.push(`Choose SeldonFrame if:`);
  x.chooseSf.forEach((item, i) => L.push(`${i + 1}. ${item}`));
  L.push("");
  L.push(`To be fair: ${c.whenTheyWin}`);
  L.push("");
  L.push(`## How to switch from ${c.name} to SeldonFrame`);
  L.push("");
  SWITCH_STEPS.forEach((step, i) => {
    L.push(`${i + 1}. **${step.title}** — ${i === 1 ? x.switchNote : step.body}`);
  });
  L.push("");
  L.push(`## FAQ`);
  L.push("");
  for (const item of faq) {
    L.push(`**${item.q}**`);
    L.push("");
    L.push(item.a);
    L.push("");
  }
  L.push(`## Get started`);
  L.push("");
  L.push(`- Start free (build the workspace in ~3 minutes, before signing up): ${BASE}/signup`);
  L.push(`- Book a 15-minute demo: ${DEMO_HREF}`);
  L.push(`- All comparisons: ${BASE}/alternatives`);
  L.push("");
  return L.join("\n");
}

export function renderVsMarkdown(pair: VsPair, a: Competitor, b: Competitor): string {
  const L: string[] = [];
  L.push(`# ${a.name} vs ${b.name}: What You Need to Know (${LAST_UPDATED})`);
  L.push("");
  L.push(`> ${pair.angle}`);
  L.push("");
  L.push(`HTML version: ${BASE}/compare/${pair.a}-vs-${pair.b}`);
  L.push("");
  L.push(`## The short version`);
  L.push("");
  L.push(`- **${a.name} pricing:** ${emphasizeMd(a.them.pricingModel)}`);
  L.push(`- **${b.name} pricing:** ${emphasizeMd(b.them.pricingModel)}`);
  L.push(`- **The real trade-off:** ${emphasizeMd(pair.angle)}`);
  L.push(`- **The third option:** ${emphasizeMd("SeldonFrame ships the whole front office at $29/mo flat — see below")}`);
  L.push("");
  for (const c of [a, b]) {
    L.push(`## ${c.name}`);
    L.push("");
    L.push(c.oneLiner);
    L.push("");
    L.push(`- Best for: ${c.them.bestFor}`);
    L.push(`- Pricing: ${c.them.pricingModel}`);
    L.push(`- AI receptionist: ${c.them.aiReceptionist}`);
    L.push(`- Website/CRM/booking behind the agent: ${c.them.frontOffice}`);
    L.push(`- Whitelabel: ${c.them.whitelabel}`);
    L.push("");
  }
  L.push(`## Side-by-side`);
  L.push("");
  L.push(`| Feature | ${a.name} | ${b.name} | SeldonFrame |`);
  L.push("|---|---|---|---|");
  for (const row of COMPARISON_LABELS) {
    L.push(`| ${row.label} | ${emphasizeMd(a.them[row.key])} | ${emphasizeMd(b.them[row.key])} | ${emphasizeMd(SF_COLUMN[row.key])} |`);
  }
  L.push("");
  L.push(`Prices checked ${LAST_UPDATED} on [${a.name}'s pricing page](${a.pricingSourceUrl}) and [${b.name}'s pricing page](${b.pricingSourceUrl}).`);
  L.push("");
  L.push(`## If you need what BOTH do`);
  L.push("");
  L.push(
    `Most people comparing ${a.name} and ${b.name} actually need the outcome underneath both: calls and chats answered, leads qualified, jobs booked into a real calendar and CRM, on a site the client owns. SeldonFrame ships that whole front office from one conversation at $29/mo flat (unlimited workspaces, bring-your-own AI keys), with whitelabel included for agencies.`,
  );
  L.push("");
  L.push(`- Honest deep-dives: ${BASE}/alternative-to-${a.slug} and ${BASE}/alternative-to-${b.slug}`);
  L.push(`- Start free: ${BASE}/signup · Book a demo: ${DEMO_HREF}`);
  L.push("");
  return L.join("\n");
}
