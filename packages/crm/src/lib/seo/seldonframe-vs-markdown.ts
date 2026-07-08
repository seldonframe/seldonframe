// Markdown twin for the flagship /compare/seldonframe-vs-<slug> pages — the
// GEO/agent-legible representation, mirroring alternative-markdown.ts's
// conventions (title, updated line, table, both-sides pros/cons, switch
// steps, FAQ, links). Served by a static dotted route folder at
// /compare/seldonframe-vs-<slug>.md.

import {
  COMPARISON_LABELS,
  SF_COLUMN,
  SHARED_FAQ,
  LAST_UPDATED,
  type Competitor,
} from "@/lib/seo/alternative-pages";
import { getExtras, SF_PROS, SF_CONS, SWITCH_STEPS, DEMO_HREF } from "@/lib/seo/alternative-pages-extras";
import { composeSeldonframeVsFaq, composeSeldonframeVsIntro } from "@/components/seo/seldonframe-vs-page";
import { emphasizeMd } from "@/lib/seo/emphasize";

const BASE = "https://seldonframe.com";

export function renderSeldonframeVsMarkdown(c: Competitor): string {
  const x = getExtras(c.slug);
  const faq = [...c.faq, ...composeSeldonframeVsFaq(c), ...SHARED_FAQ];
  const L: string[] = [];

  L.push(`# SeldonFrame vs ${c.name}: Which Should You Choose? (${LAST_UPDATED.split(" ").pop() ?? "2026"})`);
  L.push("");
  L.push(`> ${c.heroSub}`);
  L.push("");
  L.push(`Last updated: ${LAST_UPDATED}. HTML version: ${BASE}/compare/seldonframe-vs-${c.slug}`);
  L.push("");
  L.push(`## The short version`);
  L.push("");
  L.push(`- **${c.name} pricing:** ${emphasizeMd(c.them.pricingModel)}`);
  L.push(`- **SeldonFrame pricing:** ${emphasizeMd("$29/mo flat, unlimited workspaces, first workspace free forever")}`);
  L.push(`- **Pick ${c.name} if:** ${emphasizeMd(x.chooseThem[0])}`);
  L.push(`- **Pick SeldonFrame if:** ${emphasizeMd(x.chooseSf[0])}`);
  L.push("");
  L.push(`## SeldonFrame vs ${c.name}: what you need to know`);
  L.push("");
  for (const p of composeSeldonframeVsIntro(c)) {
    L.push(p);
    L.push("");
  }
  L.push(
    `We make SeldonFrame, so read this with that in mind — but we've tried to be specific about where ${c.name} genuinely wins, not just where it doesn't.`,
  );
  L.push("");
  L.push(`## Full feature & pricing comparison`);
  L.push("");
  L.push(`| Feature | SeldonFrame | ${c.name} |`);
  L.push("|---|---|---|");
  for (const row of COMPARISON_LABELS) {
    L.push(`| ${row.label} | ${emphasizeMd(SF_COLUMN[row.key])} | ${emphasizeMd(c.them[row.key])} |`);
  }
  L.push("");
  L.push(`## Where ${c.name} wins`);
  L.push("");
  for (const p of x.pros) L.push(`- ${p}`);
  L.push("");
  L.push(`The honest take: ${c.whenTheyWin}`);
  L.push("");
  L.push(`## Where SeldonFrame wins`);
  L.push("");
  for (const r of c.switchReasons) L.push(`- **${r.title}** — ${r.body}`);
  L.push("");
  L.push(`## Pros & cons, side by side`);
  L.push("");
  L.push(`### SeldonFrame`);
  L.push("");
  for (const p of SF_PROS) L.push(`- **Pro:** ${p}`);
  for (const p of SF_CONS) L.push(`- **Con:** ${p}`);
  L.push("");
  L.push(`### ${c.name}`);
  L.push("");
  for (const p of x.pros) L.push(`- **Pro:** ${p}`);
  for (const p of x.cons) L.push(`- **Con:** ${p}`);
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
  L.push(`- Full switching guide: ${BASE}/alternative-to-${c.slug}`);
  L.push(`- Start free (build the workspace in ~3 minutes, before signing up): ${BASE}/signup`);
  L.push(`- Book a 15-minute demo: ${DEMO_HREF}`);
  L.push(`- All comparisons: ${BASE}/alternatives`);
  L.push("");
  return L.join("\n");
}
