// /llms.txt — the GEO map for LLMs (the llmstxt.org convention). A clean
// Markdown index that tells an AI assistant what SeldonFrame is, leads with the
// agent MARKETPLACE (the thing an AI reads when a buyer asks "what agents can I
// buy"), then the /ai-agents answer-page library and the key pages. Generated
// from the SAME sources the pages render (the storefront catalog + the agent-page
// registry), so it never drifts.
//
// Served as text/markdown at /llms.txt.

import { AGENT_JOBS, VERTICALS } from "@/lib/seo/agent-pages";
import { COMPETITORS, getCompetitor } from "@/lib/seo/alternative-pages";
import { VS_PAIRS, vsSlug } from "@/lib/seo/alternative-pages-extras";
import { BEST_PAGES, bestSlug, getBestPage, midSentence } from "@/lib/seo/best-pages";
import { allGuideSlugs, getGuide } from "@/lib/seo/guides";
import { siteBaseUrl } from "@/app/sitemap";
import { loadStorefrontCatalog } from "@/lib/marketplace/load-storefront";
import { logMarkdownFetch } from "@/lib/marketplace/md-analytics";

export const dynamic = "force-dynamic";

/** How many top agents to surface inline in the Marketplace section. */
const TOP_AGENTS = 8;

export async function GET(req: Request): Promise<Response> {
  // Measure AI traffic server-side (the only signal that survives — crawlers
  // don't run JS). Best-effort; never blocks. `/llms.txt` is not in the proxy
  // matcher, so it logs itself.
  logMarkdownFetch(req, { surface: "llms_txt", mode: "explicit_md", path: "/llms.txt" });

  const base = siteBaseUrl();
  const agents = await loadStorefrontCatalog();

  const lines: string[] = [];
  lines.push("# SeldonFrame — AI agents for local business");
  lines.push("");
  lines.push(
    "> SeldonFrame lets a local service business deploy a real, working AI agent into its own hosted workspace in about 60 seconds — or rent one over MCP. Buyers can browse a marketplace of vetted agents, and each /ai-agents page is a citable, stat-backed answer page that ends in a working deployment (not a how-to).",
  );
  lines.push("");

  // Marketplace FIRST — the highest-value answer to "what agents can I buy".
  lines.push("## Marketplace");
  lines.push("");
  lines.push(
    `Vetted AI agents you can install into your own workspace in under a minute, or rent over MCP. Browse: [${base}/marketplace](${base}/marketplace)`,
  );
  lines.push("");
  for (const agent of agents.slice(0, TOP_AGENTS)) {
    const tagline = agent.tagline.trim();
    const suffix = tagline ? `: ${tagline}` : "";
    lines.push(`- [${agent.name}](${base}/marketplace/${agent.slug})${suffix}`);
  }
  lines.push("");

  // Tier-1: the agent library (one entry per job, with its cited stat).
  lines.push("## AI agents (deploy a working one in 60 seconds)");
  lines.push("");
  lines.push(`- [The agent library](${base}/ai-agents): browse every AI agent for local service businesses.`);
  for (const job of AGENT_JOBS) {
    lines.push(
      `- [${job.name}](${base}/ai-agents/${job.slug}): ${job.oneLiner} Cited stat: ${job.painStat.text} (${job.painStat.source})`,
    );
  }
  lines.push("");

  // Tier-2: a representative sample of job × vertical pages (the long tail is
  // enumerated in sitemap.xml; here we list a focused, useful subset per job so
  // the file stays scannable while still revealing the vertical pattern).
  lines.push("## AI agents by industry (examples)");
  lines.push("");
  const sampleVerticals = VERTICALS.slice(0, 6);
  for (const job of AGENT_JOBS) {
    for (const v of sampleVerticals) {
      lines.push(
        `- [${job.name} for ${v.plural}](${base}/ai-agents/${job.slug}/for/${v.slug}): ${job.name} tailored for ${v.plural}.`,
      );
    }
  }
  lines.push("");

  // Honest competitor comparisons — the highest-intent answer pages for a
  // buyer (or an AI) asking "what's the best alternative to X".
  lines.push("## Comparisons (honest, updated)");
  lines.push("");
  lines.push(`- [All comparisons](${base}/alternatives): how SeldonFrame compares to every major alternative.`);
  for (const c of COMPETITORS) {
    lines.push(`- [SeldonFrame vs ${c.name}](${base}/compare/seldonframe-vs-${c.slug}): head-to-head — pricing, AI receptionist, whitelabel, and where ${c.name} wins.`);
  }
  for (const c of COMPETITORS) {
    lines.push(`- [Best ${c.name} alternative](${base}/alternative-to-${c.slug}): ${c.oneLiner}`);
  }
  for (const c of COMPETITORS) {
    lines.push(`- [${c.name} pricing breakdown](${base}/${c.slug}-pricing): plans, the costs that stack on top, and what you'll actually pay.`);
  }
  for (const p of VS_PAIRS) {
    lines.push(
      `- [${getCompetitor(p.a).name} vs ${getCompetitor(p.b).name}](${base}/compare/${vsSlug(p)}): ${p.angle}`,
    );
  }
  lines.push("");

  // Best-of buying guides — the "best <tool> for <business>" listicles.
  lines.push("## Best-of guides (the best tool for each business)");
  lines.push("");
  lines.push(
    `- [All best-of guides](${base}/best): the best CRM, website builder, booking system and AI receptionist for each kind of business, honestly ranked.`,
  );
  for (const p of BEST_PAGES) {
    const slug = bestSlug(p);
    const { category, audience } = getBestPage(slug);
    lines.push(`- [Best ${category.noun} for ${midSentence(audience.label)}](${base}/best/${slug})`);
  }
  lines.push("");

  lines.push("## Free tools");
  lines.push("");
  lines.push(
    `- [Speed-to-Lead Calculator](${base}/tools/speed-to-lead-calculator): estimate the revenue slow lead follow-up costs, and what replying in under 5 minutes recovers.`,
  );
  lines.push(
    `- [No-Show Cost Calculator](${base}/tools/no-show-cost-calculator): estimate the revenue no-shows cost a booking-heavy business, and what automated reminders recover.`,
  );
  lines.push(
    `- [AI Receptionist Script Generator](${base}/tools/ai-receptionist-script-generator): generate a complete AI receptionist call script for any business — greeting, questions, booking, after-hours.`,
  );
  lines.push(
    `- [Service Business FAQ Generator](${base}/tools/service-business-faq-generator): generate a ready customer FAQ (and AI-agent knowledge base) for a service business.`,
  );
  lines.push(
    `- [Booking Friction Grader](${base}/tools/booking-friction-grader): score how easy you make it to book and get the specific fixes losing you appointments.`,
  );
  lines.push(
    `- [AI Visibility Checker](${base}/tools/ai-visibility-checker): grade whether ChatGPT and Google's AI can recommend your business, plus the exact prompts to test it yourself.`,
  );
  lines.push(
    `- [Missed Call Cost Calculator](${base}/tools/missed-call-calculator): estimate the revenue missed calls cost a service business.`,
  );
  lines.push(
    `- [Google Review Link Generator](${base}/tools/google-review-link-generator): create a direct Google review link + printable QR code for any business.`,
  );
  lines.push(
    `- [AI Receptionist Cost Calculator](${base}/tools/ai-receptionist-cost-calculator): compare a human receptionist, an answering service and per-minute AI on real monthly cost.`,
  );
  lines.push(
    `- [A2P 10DLC Compliance Checker](${base}/tools/a2p-10dlc-checker): check whether your business texting meets US carrier registration rules before it gets filtered.`,
  );
  lines.push(
    `- [Review Response Generator](${base}/tools/review-response-generator): well-written replies to any Google review — no signup, no AI required.`,
  );
  lines.push(
    `- [Claude Project Brief Generator](${base}/tools/claude-project-brief-generator): generate the standing-instructions block for a Claude Project (and see how SeldonFrame automates it per client).`,
  );
  lines.push(
    `- [HubSpot Pricing Calculator](${base}/tools/hubspot-pricing-calculator): seats × contacts × hubs × onboarding — what HubSpot really costs.`,
  );
  lines.push(
    `- [GoHighLevel Cost Calculator](${base}/tools/gohighlevel-cost-calculator): base plan + AI Employee per sub-account + usage at N clients.`,
  );
  lines.push(
    `- [Voice AI Cost Calculator](${base}/tools/voice-ai-cost-calculator): the real per-minute cost of a voice AI stack (STT + LLM + TTS + telephony).`,
  );
  lines.push(
    `- [Klaviyo Cost Calculator](${base}/tools/klaviyo-cost-calculator): profiles + SMS sends → your monthly Klaviyo bill.`,
  );
  lines.push(
    `- [Agency Margin Calculator](${base}/tools/agency-margin-calculator): retainer minus tool stack minus labor — your real margin per client.`,
  );
  lines.push(
    `- [AI Website Generator](${base}/tools/ai-website-generator): paste your Google Business Profile or describe your business, and get a real hosted website, booking page, intake form and CRM in about 3 minutes.`,
  );
  lines.push(
    `- [Free Booking Page](${base}/tools/free-booking-page): a real online booking page on your own subdomain, with appointment types, an intake form and CRM sync, live in about 3 minutes.`,
  );
  lines.push(
    `- [Local Business Website Grader](${base}/tools/website-grader): score your website on the 7 things that win local jobs, with a prioritized fix list.`,
  );
  lines.push("");

  // Live charts — the interactive, re-verified data pages.
  lines.push("## Live charts");
  lines.push("");
  lines.push(`- [All charts](${base}/charts): interactive, re-verified data on AI front offices for local business.`);
  lines.push(`- [The CRM Pricing Index](${base}/charts/crm-pricing-index): real CRM cost vs business size, re-verified monthly.`);
  lines.push(`- [AI Front-Office Trends](${base}/charts/ai-front-office-trends): where every trend in local-business AI is on its curve — the founder's subjective map.`);
  lines.push(`- [Missed-Revenue Decay](${base}/charts/missed-revenue-decay): what slow follow-up costs, minute by minute, by industry.`);
  lines.push(`- [The AI Recommendation Index](${base}/charts/ai-recommendation-index): which software brands AI engines actually recommend — monthly snapshot.`);
  lines.push("");

  lines.push("## Guides (practical, sourced articles)");
  lines.push("");
  for (const slug of allGuideSlugs()) {
    const g = getGuide(slug);
    lines.push(`- [${g.title}](${base}/guides/${slug}): ${g.description}`);
  }
  lines.push("");

  lines.push("## Pages");
  lines.push("");
  lines.push(`- [Agent Marketplace](${base}/marketplace): browse and install vetted agents, or rent them over MCP.`);
  lines.push(`- [Sell AI agents](${base}/sell): the four ways to sell an agent you build — direct, white-label, marketplace, or rent via MCP.`);
  lines.push(`- [AI agent library](${base}/ai-agents): every stat-backed agent answer page.`);
  lines.push(`- [Pricing](${base}/pricing): plans and what a workspace costs.`);
  lines.push(
    `- Full URL list: ${base}/sitemap.xml lists every agent page (all ${AGENT_JOBS.length} jobs × ${VERTICALS.length} industries).`,
  );
  lines.push("");

  // Markdown twins — the clean, token-light versions of every page, for agents
  // and coding tools that fetch URLs. Each `.md` renders from the SAME data as
  // its HTML page (no drift); append `.md` to any agent/marketplace URL above.
  lines.push("## Markdown versions (clean, for AI/LLM tools)");
  lines.push("");
  lines.push(`- [Marketplace (Markdown)](${base}/marketplace.md): the full agent catalog as clean Markdown.`);
  lines.push(`- Each listing: append \`.md\` to any \`${base}/marketplace/<slug>\` URL.`);
  lines.push(`- [AI agent library (Markdown)](${base}/ai-agents.md): every agent, as clean Markdown.`);
  lines.push(`- Each agent page: append \`.md\` (e.g. [${base}/ai-agents/${AGENT_JOBS[0].slug}.md](${base}/ai-agents/${AGENT_JOBS[0].slug}.md)), including the by-industry pages (\`${base}/ai-agents/<job>/for/<vertical>.md\`).`);
  lines.push(`- Each comparison: append \`.md\` to any \`${base}/alternative-to-<name>\` or \`${base}/compare/<a>-vs-<b>\` URL.`);
  lines.push(`- Each best-of guide: append \`.md\` to any \`${base}/best/<slug>\` URL.`);
  lines.push("");

  return new Response(lines.join("\n"), {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
