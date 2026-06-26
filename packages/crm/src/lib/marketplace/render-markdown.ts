// Marketplace → clean Markdown (the "agent-legible twin" of the storefront).
//
// SINGLE SOURCE OF TRUTH: this renders from the SAME StorefrontAgent view-model
// the HTML pages render (lib/marketplace/agent-listings → rowToStorefrontAgent,
// with the seed catalog as the fallback). It NEVER reads a parallel content
// store, so the Markdown can never drift from the page.
//
// Everything here is PURE (no I/O, no db, no React) so it unit-tests with plain
// fixtures. The `.md` route handlers (app/marketplace.md, app/marketplace/
// listing.md) do the data-loading and hand the result to these functions.
//
// Why Markdown leads with concrete specifics (what it does, channels, price,
// the install link) rather than metadata: the GEO research (Princeton/IIT-Delhi)
// found that quotable, stat-backed content — not schema metadata — is what moves
// AI visibility. So the listing Markdown front-loads the load-bearing facts.

import {
  CATEGORY_META,
  SURFACE_META,
  priceLabel,
  installsLabel,
  type StorefrontAgent,
} from "@/components/marketplace/marketplace-data";

/** The canonical public origin for absolute links in the Markdown. Defaults to
 *  the live storefront host so a pasted `.md` always carries clickable URLs. */
export const MARKETPLACE_BASE_URL = "https://app.seldonframe.com";

/** Absolute URL of a listing's HTML storefront page. */
export function listingUrl(slug: string, baseUrl: string = MARKETPLACE_BASE_URL): string {
  return `${trimBase(baseUrl)}/marketplace/${slug}`;
}

/** Absolute URL of the marketplace browse page. */
export function marketplaceUrl(baseUrl: string = MARKETPLACE_BASE_URL): string {
  return `${trimBase(baseUrl)}/marketplace`;
}

function trimBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

/** The "Voice + SMS" channels label for an agent (its surfaces). */
function channelsLabel(agent: StorefrontAgent): string {
  if (agent.surfaces.length === 0) return "—";
  return agent.surfaces.map((s) => SURFACE_META[s].label).join(" + ");
}

/** One honest line for an agent in the index list: name — tagline — link. */
function indexLine(agent: StorefrontAgent, baseUrl: string): string {
  const tagline = agent.tagline.trim();
  const suffix = tagline ? ` — ${tagline}` : "";
  return `- [${agent.name}](${listingUrl(agent.slug, baseUrl)})${suffix}`;
}

// ─── renderMarketplaceIndexMarkdown ──────────────────────────────────────────

/**
 * Render the storefront catalog as clean Markdown: an H1, a one-line intro, and
 * a bulleted list of every agent (name — one-line description — link). Featured
 * agents are NOT re-sorted here — the caller passes the catalog already ordered
 * exactly as the storefront grid shows it, so the Markdown twin matches the page.
 *
 * Pure — pass the same StorefrontAgent[] the page renders.
 */
export function renderMarketplaceIndexMarkdown(
  agents: StorefrontAgent[],
  baseUrl: string = MARKETPLACE_BASE_URL,
): string {
  const lines: string[] = [];
  lines.push("# SeldonFrame Agent Marketplace");
  lines.push("");
  lines.push(
    "Vetted AI agents that answer calls, book jobs, chase reviews, and win back customers — built by operators who run businesses like yours. Install one into your own workspace in under a minute, or rent it over MCP.",
  );
  lines.push("");

  if (agents.length === 0) {
    lines.push("_No agents are published yet._");
    lines.push("");
    return lines.join("\n");
  }

  lines.push(`## Agents (${agents.length})`);
  lines.push("");
  for (const agent of agents) {
    lines.push(indexLine(agent, baseUrl));
  }
  lines.push("");
  lines.push(`Browse the full marketplace: ${marketplaceUrl(baseUrl)}`);
  lines.push("");

  return lines.join("\n");
}

// ─── renderListingMarkdown ───────────────────────────────────────────────────

/**
 * Render ONE agent listing as clean Markdown: H1 name, what-it-does, the
 * job/channels, pricing (only when the listing is public, which a storefront
 * entry always is), and the canonical HTML storefront link. Pure — pass the
 * SAME StorefrontAgent the listing page renders.
 */
export function renderListingMarkdown(
  agent: StorefrontAgent,
  baseUrl: string = MARKETPLACE_BASE_URL,
): string {
  const lines: string[] = [];

  lines.push(`# ${agent.name}`);
  lines.push("");

  const tagline = agent.tagline.trim();
  if (tagline) {
    lines.push(`> ${tagline}`);
    lines.push("");
  }

  // What it does — the longer blurb, falling back to the tagline so the section
  // is never empty (the storefront always has one of the two).
  const blurb = agent.blurb.trim() || tagline;
  if (blurb) {
    lines.push("## What it does");
    lines.push("");
    lines.push(blurb);
    lines.push("");
  }

  // Highlights, when the entry carries them (real listings derive four;
  // a publish-preview may have none).
  if (agent.highlights.length > 0) {
    for (const h of agent.highlights) {
      lines.push(`- ${h}`);
    }
    lines.push("");
  }

  // The load-bearing facts as a compact key/value block — what an AI needs to
  // answer "is this the right agent and what does it cost".
  lines.push("## Details");
  lines.push("");
  lines.push(`- **Category:** ${CATEGORY_META[agent.category].label}`);
  lines.push(`- **Channels:** ${channelsLabel(agent)}`);
  lines.push(`- **Pricing:** ${agent.priceLabelOverride?.trim() || priceLabel(agent.priceCents)}`);
  lines.push(`- **Built by:** ${agent.builder}`);
  lines.push(`- **Installs:** ${installsLabel(agent)}`);
  lines.push("");

  lines.push(`Install or learn more: ${listingUrl(agent.slug, baseUrl)}`);
  lines.push("");

  return lines.join("\n");
}
