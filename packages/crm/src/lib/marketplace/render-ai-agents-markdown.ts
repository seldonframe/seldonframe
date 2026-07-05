// /ai-agents → clean Markdown (the "agent-legible twin" of the GEO answer pages).
//
// SINGLE SOURCE OF TRUTH: this renders from the SAME registry the HTML
// /ai-agents pages render (lib/seo/agent-pages → AGENT_JOBS / getJob /
// composePageCopy and lib/seo/verticals → VERTICALS / getVertical). It NEVER
// reads a parallel content store, so the Markdown can never drift from the page.
//
// Everything here is PURE (no I/O, no db, no React) so it unit-tests with plain
// fixtures. The `.md` route handler (app/ai-agents/listing.md) does the
// param-reading and hands the resolved job/vertical to these functions.
//
// Why the Markdown leads with the cited stat, the concrete bullets, and the
// deploy link (not metadata): the GEO research (Princeton "GEO", Princeton/
// IIT-Delhi) found that quotable, stat-backed content — direct quotations,
// in-text statistics, cited sources — is what moves AI visibility, not schema
// metadata. So the page Markdown front-loads the load-bearing, citable facts.

import {
  composePageCopy,
  relatedJobsForVertical,
  type AgentJob,
  type Vertical,
} from "@/lib/seo/agent-pages";

/** The canonical public origin for absolute links in the Markdown. Mirrors the
 *  site's metadataBase (sitemap.siteBaseUrl / llms.txt), so a pasted `.md`
 *  always carries clickable, on-brand URLs. An env override wins for non-prod. */
export const AI_AGENTS_BASE_URL =
  (process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "") || "") ||
  "https://seldonframe.com";

function trimBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

/** Absolute URL of the /ai-agents index hub. */
export function aiAgentsIndexUrl(baseUrl: string = AI_AGENTS_BASE_URL): string {
  return `${trimBase(baseUrl)}/ai-agents`;
}

/** Absolute URL of a Tier-1 job page, or a Tier-2 job×vertical page. */
export function aiAgentUrl(
  jobSlug: string,
  verticalSlug: string | undefined,
  baseUrl: string = AI_AGENTS_BASE_URL,
): string {
  const base = `${trimBase(baseUrl)}/ai-agents/${jobSlug}`;
  return verticalSlug ? `${base}/for/${verticalSlug}` : base;
}

/** Absolute URL of a marketplace listing (for the "see it on the marketplace"
 *  cross-link). Kept local so this module has no marketplace-data import. */
function marketplaceListingUrl(slug: string, baseUrl: string = AI_AGENTS_BASE_URL): string {
  return `${trimBase(baseUrl)}/marketplace/${slug}`;
}

/** One honest line for the index list: name — one-liner — link. */
function indexLine(job: AgentJob, baseUrl: string): string {
  const oneLiner = job.oneLiner.trim();
  const suffix = oneLiner ? ` — ${oneLiner}` : "";
  return `- [${job.name}](${aiAgentUrl(job.slug, undefined, baseUrl)})${suffix}`;
}

// ─── renderAiAgentsIndexMarkdown ─────────────────────────────────────────────

/**
 * Render the /ai-agents hub as clean Markdown: an H1, a one-line intro, and a
 * bulleted list of every agent job (name — one-liner — link). The jobs are
 * listed in registry order — exactly the order the HTML grid shows them — so the
 * Markdown twin matches the page. Pure: pass the same AGENT_JOBS the page reads.
 */
export function renderAiAgentsIndexMarkdown(
  jobs: AgentJob[],
  baseUrl: string = AI_AGENTS_BASE_URL,
): string {
  const lines: string[] = [];
  lines.push("# AI agents that work 24/7 for your business");
  lines.push("");
  lines.push(
    "Pick the job you need done. Each agent deploys into your own hosted SeldonFrame workspace in about a minute — grounded in your real services, hours, and pricing — or rents over MCP.",
  );
  lines.push("");

  if (jobs.length === 0) {
    lines.push("_No agents are published yet._");
    lines.push("");
    return lines.join("\n");
  }

  lines.push(`## Agents (${jobs.length})`);
  lines.push("");
  for (const job of jobs) {
    lines.push(indexLine(job, baseUrl));
  }
  lines.push("");
  lines.push(`Browse the full agent library: ${aiAgentsIndexUrl(baseUrl)}`);
  lines.push("");

  return lines.join("\n");
}

// ─── shared per-page body (Tier-1 and Tier-2 are the same shape) ─────────────

/**
 * The shared body of a single agent answer page as Markdown — the load-bearing,
 * citable facts in source order: H1, the answer-shaped intro, the CITED stat
 * WITH its source (the GEO centerpiece), what-it-does bullets, the 3-step "how
 * it works", channels + tools, the FAQ (job FAQ + the shared value-frame block,
 * exactly as composePageCopy assembles it for the HTML page), the deploy link,
 * and — when present — the rent-via-MCP hint + marketplace cross-link.
 *
 * Pure: `copy` comes from composePageCopy(job, vertical) — the SAME composed copy
 * the HTML template (components/seo/agent-page.tsx) renders, so it can't drift.
 */
function renderAgentBody(job: AgentJob, vertical: Vertical | undefined, baseUrl: string): string {
  const copy = composePageCopy(job, vertical);
  const lines: string[] = [];

  lines.push(`# ${copy.h1}`);
  lines.push("");

  // Answer-shaped intro (weaves the one-liner + the cited stat + the vertical).
  lines.push(copy.intro.trim());
  lines.push("");

  // THE CITED STAT — rendered as a Markdown blockquote with its source linked,
  // so an LLM can quote the figure AND attribute it. This is the GEO payload.
  lines.push(`> "${job.painStat.text}"`);
  lines.push(`> — Source: [${job.painStat.source}](${job.painStat.url})`);
  lines.push("");

  // What it does — the concrete, quotable bullets.
  lines.push(`## What ${aOrAnLower(job.name)} ${job.name} does`);
  lines.push("");
  for (const line of job.whatItDoes) {
    lines.push(`- ${line}`);
  }
  lines.push("");

  // How it works — the 3 registry steps.
  lines.push("## How it works");
  lines.push("");
  job.howItWorks.forEach((step, i) => {
    lines.push(`${i + 1}. **${step.label}** — ${step.detail}`);
  });
  lines.push("");

  // The load-bearing facts as a compact key/value block.
  lines.push("## Details");
  lines.push("");
  lines.push(`- **Channels:** ${channelsLabel(job)}`);
  lines.push(`- **Works with:** ${job.tools.map((t) => t.name).join(", ")}`);
  if (vertical) {
    lines.push(`- **Industry:** ${vertical.plural}`);
  }
  lines.push("- **Pricing:** $29/mo flat, unlimited workspaces, cancel anytime (your AI key billed at cost by the provider).");
  lines.push("");

  // FAQ — the SAME array the HTML FAQPage JSON-LD is built from (job FAQ +
  // the shared value-frame block, already assembled by composePageCopy).
  lines.push("## Frequently asked questions");
  lines.push("");
  for (const item of copy.faq) {
    lines.push(`### ${item.q}`);
    lines.push("");
    lines.push(item.a);
    lines.push("");
  }

  // The close: deploy link first (the page ends in a working deployment, not a
  // how-to), then the rent-via-MCP hint + the marketplace cross-link if any.
  lines.push(`Deploy this agent into your own workspace in about 60 seconds: ${aiAgentUrl(job.slug, vertical?.slug, baseUrl)}`);
  lines.push("");
  lines.push(`Prefer to rent it over MCP? ${capitalize(job.mcpToolHint)}.`);
  if (job.marketplaceSlug) {
    lines.push("");
    lines.push(`See this agent on the SeldonFrame Marketplace: ${marketplaceListingUrl(job.marketplaceSlug, baseUrl)}`);
  }
  lines.push("");

  // Flywheel: a short list of related agents (deep-linked to the SAME vertical
  // on Tier-2), mirroring the page's "More agents for …" cross-links.
  const related = relatedJobsForVertical(job.slug, 5);
  if (related.length > 0) {
    lines.push(`## More agents for ${vertical ? vertical.plural : "your business"}`);
    lines.push("");
    for (const r of related) {
      const name = vertical ? `${r.name} for ${vertical.plural}` : r.name;
      lines.push(`- [${name}](${aiAgentUrl(r.slug, vertical?.slug, baseUrl)})`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ─── renderAiAgentJobMarkdown (Tier-1) ───────────────────────────────────────

/**
 * Render ONE Tier-1 job page (/ai-agents/[job]) as clean Markdown. Pure — pass
 * the SAME AgentJob the page renders (getJob(jobSlug)).
 */
export function renderAiAgentJobMarkdown(
  job: AgentJob,
  baseUrl: string = AI_AGENTS_BASE_URL,
): string {
  return renderAgentBody(job, undefined, baseUrl);
}

// ─── renderAiAgentJobVerticalMarkdown (Tier-2) ───────────────────────────────

/**
 * Render ONE Tier-2 job×vertical page (/ai-agents/[job]/for/[vertical]) as clean
 * Markdown, with the copy localized to the trade. Pure — pass the SAME AgentJob
 * + Vertical the page renders (getJob(jobSlug) + getVertical(verticalSlug)).
 */
export function renderAiAgentJobVerticalMarkdown(
  job: AgentJob,
  vertical: Vertical,
  baseUrl: string = AI_AGENTS_BASE_URL,
): string {
  return renderAgentBody(job, vertical, baseUrl);
}

// ─── small pure helpers ──────────────────────────────────────────────────────

/** The channels label for a job (its surfaces), e.g. "Voice + SMS". */
function channelsLabel(job: AgentJob): string {
  const META: Record<AgentJob["surfaces"][number], string> = {
    voice: "Voice",
    chat: "Chat",
    sms: "SMS",
    email: "Email",
  };
  if (job.surfaces.length === 0) return "—";
  return job.surfaces.map((s) => META[s]).join(" + ");
}

/** "a"/"an" lowercase for mid-sentence headline use ("What an AI Receptionist
 *  does" / "What a Win-Back Agent does"). Mirrors the HTML template's aOrAnLower. */
function aOrAnLower(name: string): string {
  return /^[aeiou]/i.test(name.trim()) ? "an" : "a";
}

/** Uppercase the first letter (for the mcpToolHint sentence). */
function capitalize(s: string): string {
  const t = s.trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}
