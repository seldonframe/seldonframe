// /llms.txt — the GEO map for LLMs (the llmstxt.org convention). A clean
// Markdown index that tells an AI assistant what SeldonFrame is, leads with the
// agent MARKETPLACE (the thing an AI reads when a buyer asks "what agents can I
// buy"), then the /ai-agents answer-page library and the key pages. Generated
// from the SAME sources the pages render (the storefront catalog + the agent-page
// registry), so it never drifts.
//
// Served as text/markdown at /llms.txt.

import { AGENT_JOBS, VERTICALS } from "@/lib/seo/agent-pages";
import { siteBaseUrl } from "@/app/sitemap";
import { loadStorefrontCatalog } from "@/lib/marketplace/load-storefront";

export const dynamic = "force-dynamic";

/** How many top agents to surface inline in the Marketplace section. */
const TOP_AGENTS = 8;

export async function GET(): Promise<Response> {
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

  lines.push("## Pages");
  lines.push("");
  lines.push(`- [Agent Marketplace](${base}/marketplace): browse and install vetted agents, or rent them over MCP.`);
  lines.push(`- [AI agent library](${base}/ai-agents): every stat-backed agent answer page.`);
  lines.push(`- [Pricing](${base}/pricing): plans and what a workspace costs.`);
  lines.push(
    `- Full URL list: ${base}/sitemap.xml lists every agent page (all ${AGENT_JOBS.length} jobs × ${VERTICALS.length} industries).`,
  );
  lines.push("");

  return new Response(lines.join("\n"), {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
