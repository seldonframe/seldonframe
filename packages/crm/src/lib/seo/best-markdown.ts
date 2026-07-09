// Pure Markdown renderer for the /best/<slug>.md twins — the agent-legible
// representation of the listicle pages, mirroring alternative-markdown.ts.
// Served by the static dotted route folders (app/best/<slug>.md/route.ts); no
// proxy changes needed because those segments are static.

import { getBestPage, LAST_UPDATED, midSentence, type BestContender } from "./best-pages";
import { START_HREF, DEMO_HREF } from "./alternative-pages-extras";
import { emphasizeMd } from "./emphasize";
import { composeCheapestOption, composeQuickPicks } from "@/components/seo/best-page";

const BASE = "https://www.seldonframe.com";

function contenderLine(c: BestContender): string {
  const source = c.sourceUrl ? ` Source: ${c.sourceUrl}` : "";
  return `- **${c.name}** — ${emphasizeMd(c.from)}. ${c.oneLiner} Best for: ${c.bestFor}. Watch out: ${c.watchOut}${source}`;
}

export function renderBestMarkdown(slug: string): string {
  const { page, category, audience } = getBestPage(slug);
  const total = category.contenders.length + 1;
  const h1 = `The ${total} Best ${category.nounPlural} for ${audience.label} (2026)`;
  const L: string[] = [];

  L.push(`# ${h1}`);
  L.push("");
  L.push(`> Updated ${LAST_UPDATED}. We build one of these, so SeldonFrame is ranked #1 below — but every other pick gets a genuine strength list and an honest catch.`);
  L.push("");
  L.push(`HTML version: ${BASE}/best/${slug}`);
  L.push("");
  L.push(`Reviewed by Maxime Houle, Founder, SeldonFrame`);
  L.push("");
  if (page.videoId) {
    L.push(`▶ Watch: [${h1}](https://www.youtube.com/watch?v=${page.videoId})`);
    L.push("");
  }
  L.push(`## Our picks at a glance`);
  L.push("");
  composeQuickPicks(category, audience).forEach((line, i) => {
    L.push(`${i + 1}. ${emphasizeMd(line)}`);
  });
  L.push("");
  L.push(`## How we ranked`);
  L.push("");
  L.push(`- Pricing verified from each vendor's own public pricing page as of ${LAST_UPDATED}.`);
  L.push(`- We build SeldonFrame and rank it #1 for the front-office job — the honest catch on every other pick is listed too, so you can disagree.`);
  L.push(`- Rankings weigh fit for ${midSentence(audience.label)} over raw feature count.`);
  L.push(`- No vendor paid for placement on this page.`);
  L.push("");
  L.push(`## The short version`);
  L.push("");
  L.push(
    `- **Our pick:** ${emphasizeMd("SeldonFrame — the whole front office at $29/mo flat (we build it, and we say below when the others win)")}`,
  );
  L.push(`- **Cheapest real option:** ${emphasizeMd(composeCheapestOption(category))}`);
  L.push(`- **How to choose:** ${emphasizeMd(category.intentLine)}`);
  L.push("");
  L.push(
    `${audience.label} looking for the best ${midSentence(category.nounPlural)} are usually trying to solve one thing: ${category.intentLine}. And ${audience.painHook}.`,
  );
  L.push("");

  L.push(`## 1. SeldonFrame — best overall`);
  L.push("");
  L.push(category.sfPitch);
  if (audience.exampleService) {
    L.push("");
    L.push(`For ${midSentence(audience.label)}, that means ${audience.exampleService} gets captured and booked automatically, whether the customer calls, texts or fills out a form.`);
  }
  L.push("");
  L.push(`- Price: $29/mo flat, unlimited workspaces — first workspace free forever`);
  L.push(`- Build it free in about 3 minutes before you sign up: ${BASE}${START_HREF}`);
  L.push(`- Book a demo: ${DEMO_HREF}`);
  L.push(`- Honest caveat: SeldonFrame is newer than several names on this list and isn't a dedicated funnel-builder — if that's specifically what you need, see the alternatives below.`);
  L.push("");

  L.push(`## ${category.contenders.length} more ${midSentence(category.nounPlural)}, ranked`);
  L.push("");
  category.contenders.forEach((c, i) => {
    L.push(`### ${i + 2}. ${c.name}`);
    L.push("");
    L.push(contenderLine(c));
    if (c.fitNotes?.[audience.group]) {
      L.push("");
      L.push(`For ${audience.label}: ${c.fitNotes[audience.group]}`);
    }
    L.push("");
  });

  L.push(`## Comparison table`);
  L.push("");
  L.push(`| ${category.noun} | Best for | From price | The catch |`);
  L.push("|---|---|---|---|");
  L.push(`| **SeldonFrame** | ${emphasizeMd(category.intentLine)} | ${emphasizeMd("$29/mo flat, unlimited workspaces")} | Newer platform; not a dedicated funnel-builder |`);
  for (const c of category.contenders) {
    L.push(`| ${c.name} | ${emphasizeMd(c.bestFor)} | ${emphasizeMd(c.from)} | ${emphasizeMd(c.watchOut)} |`);
  }
  L.push("");

  if (audience.group === "general") {
    L.push(`## What about free ${midSentence(category.nounPlural)}?`);
    L.push("");
    L.push(category.freeAngle);
    L.push("");
    L.push(
      `SeldonFrame's honest free-tier answer: the first workspace is free forever, and the whole build — site, CRM, booking, AI receptionist — is free and testable before you ever enter a card. The free build IS the trial.`,
    );
    L.push("");
  }

  L.push(`## FAQ`);
  L.push("");
  for (const item of category.faq) {
    L.push(`**${item.q}**`);
    L.push("");
    L.push(item.a);
    L.push("");
  }
  L.push(`**What's the best ${midSentence(category.noun)} for ${midSentence(audience.label)}?**`);
  L.push("");
  L.push(
    `Honestly, it depends on what's already missing. If leads are falling through the cracks between "someone reached out" and "someone followed up," SeldonFrame's combined AI receptionist + CRM + booking is built for exactly that gap. If the need is narrower — just a calendar link, just a CRM, just a form — one of the specialist tools above may be simpler for now.`,
  );
  L.push("");

  L.push(`## Get started`);
  L.push("");
  L.push(`- Start free (build in ~3 minutes, before signing up): ${BASE}${START_HREF}`);
  L.push(`- Book a 15-minute demo: ${DEMO_HREF}`);
  L.push(`- All best-of pages: ${BASE}/best`);
  L.push("");

  return L.join("\n");
}
