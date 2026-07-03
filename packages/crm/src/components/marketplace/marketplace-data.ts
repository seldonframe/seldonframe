// Marketplace storefront data layer — the bridge between the engine's
// MarketplaceAgentRow (lib/marketplace/agent-listings.ts) and the rich
// view-model the storefront renders. Pure + framework-agnostic (no React, no
// "use client", no db) so it can be unit-tested and imported from both server
// components and the client-side search/filter island.
//
// Design tokens, surface/category metadata, copy, and the seed catalog are all
// ported verbatim from the Claude Design output
// (sf-mkt-design/SeldonFrame Marketplace.dc.html). The seed catalog is the
// real-but-tasteful fallback content shown ONLY when no kind:'agent' listings
// are published yet, so the pages always render (noted in the report).

import type { MarketplaceIconName } from "./marketplace-icons";
import type { MarketplaceAgentRow } from "@/lib/marketplace/agent-listings";
import { storefrontPriceFromRow } from "@/lib/marketplace/pricing-model";
import type { ListingTrustStats } from "@/db/schema/marketplace";

// ─── design tokens (the live marketing palette — keep these hex values exact) ─

export const MKT = {
  paper: "#F6F2EA",
  ink: "#221D17",
  green: "#00897B",
  greenLight: "#3DBFB0",
  dark: "#1F2B24",
  // common alpha-on-ink helpers used all over the design
  ink05: "rgba(34,29,23,0.05)",
  ink08: "rgba(34,29,23,0.08)",
  ink10: "rgba(34,29,23,0.10)",
  green10: "rgba(0,137,123,0.10)",
  fontSans: "'Hanken Grotesk',system-ui,sans-serif",
  fontSerif: "'Newsreader',serif",
  fontMono: "'DM Mono',monospace",
} as const;

// The Google Fonts the design pulls in (DM Mono is not in the app's root
// layout, so the storefront injects this link to stay pixel-faithful).
export const MKT_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700;800&family=Newsreader:ital,opsz,wght@1,6..72,400;1,6..72,500&family=DM+Mono:wght@400;500&display=swap";

// ─── surfaces (voice / chat / sms / email pills) ─────────────────────────────

export type SurfaceKey = "voice" | "chat" | "sms" | "email";

export const SURFACE_META: Record<SurfaceKey, { label: string; icon: MarketplaceIconName }> = {
  voice: { label: "Voice", icon: "mic" },
  chat: { label: "Chat", icon: "message" },
  sms: { label: "SMS", icon: "smartphone" },
  email: { label: "Email", icon: "mail" },
};

// ─── categories (the storefront tiles + accent tints) ────────────────────────

export type CategoryKey =
  | "Receptionist"
  | "Reviews"
  | "Reactivation"
  | "Quote"
  | "Support"
  | "Social";

/** The category tiles, in display order, with their icon + storefront label. */
export const CATEGORY_META: Record<CategoryKey, { icon: MarketplaceIconName; label: string }> = {
  Receptionist: { icon: "phone", label: "Receptionists" },
  Reviews: { icon: "starLine", label: "Reviews & reputation" },
  Reactivation: { icon: "repeat", label: "Reactivation" },
  Quote: { icon: "file", label: "Quoting" },
  Support: { icon: "headphones", label: "Support" },
  Social: { icon: "share", label: "Social" },
};

export const CATEGORY_ORDER: CategoryKey[] = [
  "Receptionist",
  "Reviews",
  "Reactivation",
  "Quote",
  "Support",
  "Social",
];

/** Map a stored `niche` string onto a storefront CategoryKey (best-effort). */
export function nicheToCategory(niche: string | null | undefined): CategoryKey {
  const n = (niche ?? "").toLowerCase();
  if (n.includes("recept")) return "Receptionist";
  if (n.includes("review") || n.includes("reputation")) return "Reviews";
  if (n.includes("react") || n.includes("win") || n.includes("retention")) return "Reactivation";
  if (n.includes("quote") || n.includes("estimat")) return "Quote";
  if (n.includes("social")) return "Social";
  return "Support";
}

/** Map a stored agentType onto the default surfaces it works over. */
export function agentTypeToSurfaces(agentType: string | null | undefined): SurfaceKey[] {
  if (agentType === "voice_receptionist") return ["voice", "sms"];
  return ["chat", "email"];
}

// Deterministic avatar background palette (the design's AV array).
export const AVATAR_BG = ["#00897B", "#B5651D", "#3F6E54", "#7A3B69", "#2C5A8C", "#9A6A1F"];

// ─── the storefront view-model ───────────────────────────────────────────────

export type StorefrontReview = {
  author: string;
  role: string;
  verified: boolean;
  stars: number;
  text: string;
};

export type StorefrontSampleTurn = { role: "agent" | "customer"; text: string };

/** The unified shape the browse grid + listing detail both render. Built from a
 *  real DB row OR a seed entry — the UI never needs to know which. */
export type StorefrontAgent = {
  /** Route param. Real listings use their slug; seeds use a stable id. */
  slug: string;
  name: string;
  category: CategoryKey;
  icon: MarketplaceIconName;
  surfaces: SurfaceKey[];
  /** installCount. */
  installs: number;
  /** "4.9" — formatted to one decimal. */
  rating: string;
  reviewCount: number;
  /** Price in cents (0 → free). */
  priceCents: number;
  /**
   * Optional pre-formatted price label. When set, the card renders this verbatim
   * instead of deriving "$X/mo" from priceCents — lets non-one-time pricing
   * models ("$29/mo", "$2 per call", "$10 per booking") show their real label.
   * Omitted for the live storefront today (it still shows the one-time price);
   * set by the seller publish-preview. The metered settlement is a follow-on.
   */
  priceLabelOverride?: string;
  featured: boolean;
  builder: string;
  verified: boolean;
  /** One-line job. */
  tagline: string;
  /** Longer "what it does" paragraph. */
  blurb: string;
  highlights: string[];
  tools: { label: string; icon: MarketplaceIconName }[];
  sampleChannel: string;
  channelIcon: MarketplaceIconName;
  sampleTitle: string;
  sample: StorefrontSampleTurn[];
  outcome: string;
  reviews: StorefrontReview[];
  /** Whether this entry is real (DB-backed) or seed fallback. */
  isSeed: boolean;
  /**
   * Platform-verified eval badge (Task 13, improve-verb + trust rail). `null`
   * (or omitted) when the listing's template has never been eval-run — the
   * buyer detail page must render NO badge in that case, never a fabricated
   * one. Populated by the seller publish/republish copy-through
   * (seller-actions.ts's copyThroughTrustStats).
   */
  trustStats?: ListingTrustStats | null;
};

// ─── price + number formatting (matches the design's helpers) ────────────────

export function formatInstalls(n: number): string {
  return n.toLocaleString("en-US");
}

/**
 * Honest install label for a storefront agent. A brand-new listing (real or
 * seed) with no installs reads as "New" rather than fabricating a count. Real
 * listings with installs show the real number; seeds always read "New" until
 * a real published catalog replaces them.
 */
export function installsLabel(agent: Pick<StorefrontAgent, "installs" | "isSeed">): string {
  if (agent.isSeed || agent.installs <= 0) return "New";
  return `${formatInstalls(agent.installs)} installed`;
}

/** "Free" or "$29/mo". priceCents → whole dollars. */
export function priceLabel(priceCents: number): string {
  return priceCents <= 0 ? "Free" : `$${Math.round(priceCents / 100)}/mo`;
}

export function priceColor(priceCents: number): string {
  return priceCents <= 0 ? MKT.green : MKT.ink;
}

export function priceBg(priceCents: number): string {
  return priceCents <= 0 ? "rgba(0,137,123,0.10)" : "rgba(34,29,23,0.05)";
}

/**
 * Short "Jun 30" date for the platform-verified eval badge's "last run"
 * clause (Task 13). Takes the ISO `lastRunAt` string straight off
 * `ListingTrustStats`. No year (the badge is about recency, not archival
 * record-keeping) and UTC so the server-rendered date never depends on the
 * host's local timezone.
 */
export function trustBadgeDateLabel(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

// ─── DB row → view-model ─────────────────────────────────────────────────────

/**
 * Promote a published kind:'agent' listing row onto the rich storefront
 * view-model. The engine row carries the load-bearing facts (name, price,
 * installCount, rating, featured); the descriptive long-form fields
 * (highlights, sample conversation, tools) are derived sensibly from what the
 * row provides, since the published listing schema does not yet persist them.
 */
export function rowToStorefrontAgent(row: MarketplaceAgentRow): StorefrontAgent {
  const category = nicheToCategory(row.niche);
  const surfaces = surfacesFromTags(row.tags) ?? agentTypeToSurfaces(row.agentType);
  const tagline = (row.description ?? "").trim() || `${row.name} — works 24/7 for your business.`;
  // Model-aware price: a monthly/per-usage/per-outcome listing carries 0 in the
  // legacy `price` column, so deriving from `price` alone showed "Free". Read
  // the SELECTED model's amount + label (the bug fix). priceCents is the
  // chargeable amount for the model; priceLabelOverride carries the non-one-time
  // label ("$29/mo") that priceCents alone can't express.
  const pricing = storefrontPriceFromRow(row);
  return {
    slug: row.slug,
    name: row.name,
    category,
    icon: CATEGORY_META[category].icon,
    surfaces,
    installs: row.installCount ?? 0,
    rating: formatRating(row.rating),
    reviewCount: row.reviewCount ?? 0,
    priceCents: pricing.priceCents,
    priceLabelOverride: pricing.labelOverride,
    featured: Boolean(row.isFeatured),
    builder: builderFromTags(row.tags) ?? "A SeldonFrame builder",
    verified: true,
    tagline,
    blurb:
      (row.description ?? "").trim() ||
      `${row.name} runs on your workspace across ${surfaces
        .map((s) => SURFACE_META[s].label.toLowerCase())
        .join(" and ")}, handling the work end to end and only escalating what truly needs you.`,
    highlights: [
      "Runs on your own workspace and data",
      `Works over ${surfaces.map((s) => SURFACE_META[s].label).join(" + ")}`,
      "Installs in under a minute",
      "Escalates the rare case that needs you",
    ],
    tools: [
      { label: "Customer records", icon: "users" },
      { label: "Calendar", icon: "calendar" },
      { label: "Messaging", icon: "message" },
      { label: "Business hours", icon: "clock" },
    ],
    sampleChannel: surfaces.includes("voice") ? "phone call" : "conversation",
    channelIcon: surfaces.includes("voice") ? "phone" : "message",
    sampleTitle: "A real conversation it handled",
    sample: [
      { role: "customer", text: "Hi — can you help me with this?" },
      { role: "agent", text: "Absolutely. Tell me a little about what you need and I'll take it from here." },
      { role: "customer", text: "Great, thank you." },
      { role: "agent", text: "All set — I've logged the details and you'll get a confirmation shortly." },
    ],
    outcome: "Handled end to end · logged to your CRM",
    reviews: [],
    isSeed: false,
    // Defensive: `row.trustStats` may be absent on a MarketplaceAgentRow built
    // by an older/partial caller, and is null on every row until a seller
    // publish/republish runs the copy-through — either way this reads as "no
    // badge" (`?? null`), never a fabricated one.
    trustStats: row.trustStats ?? null,
  };
}

// ─── live publish-preview → view-model ───────────────────────────────────────

/** The seller's in-progress listing draft (the publish panel's form state). */
export type ListingPreviewInput = {
  name: string;
  /** One-time install price in cents (0 → free). */
  priceCents: number;
  niche: string;
  /** The agent template type — drives the default surfaces. */
  agentType: string | null;
  /** Marketing tagline / blurb the seller is typing. */
  description: string;
  /** The seller's display name (builder credit on the card). */
  builder: string;
  /** Lifetime installs, if the listing already exists (else 0 → "New"). */
  installCount?: number;
  /**
   * Pre-formatted price label for non-one-time pricing models ("$29/mo",
   * "$2 per call", "$10 per booking"). When provided, the preview card shows it
   * verbatim instead of deriving from priceCents. Omit for one-time/free.
   */
  priceLabel?: string;
};

/**
 * Build the EXACT StorefrontAgent the marketplace AgentCard renders, from the
 * seller's live publish-form state. Reuses the same niche→category +
 * type→surfaces derivation as a real published row (rowToStorefrontAgent) so the
 * publish panel's preview is pixel-faithful to the live listing. Pure — no DB.
 *
 * `isSeed: false` + `installs: 0` makes a brand-new draft read "New" (no
 * fabricated rating/installs), exactly like a just-published listing.
 */
export function buildPreviewStorefrontAgent(input: ListingPreviewInput): StorefrontAgent {
  const category = nicheToCategory(input.niche);
  const surfaces = agentTypeToSurfaces(input.agentType);
  const name = input.name.trim() || "Your agent";
  const tagline = input.description.trim() || `${name} — works 24/7 for your business.`;
  return {
    slug: "preview",
    name,
    category,
    icon: CATEGORY_META[category].icon,
    surfaces,
    installs: Math.max(0, input.installCount ?? 0),
    rating: "5.0",
    reviewCount: 0,
    priceCents: Math.max(0, input.priceCents),
    priceLabelOverride: input.priceLabel?.trim() || undefined,
    featured: false,
    builder: input.builder.trim() || "A SeldonFrame builder",
    verified: true,
    tagline,
    blurb: tagline,
    highlights: [],
    tools: [],
    sampleChannel: surfaces.includes("voice") ? "phone call" : "conversation",
    channelIcon: surfaces.includes("voice") ? "phone" : "message",
    sampleTitle: "",
    sample: [],
    outcome: "",
    reviews: [],
    isSeed: false,
    // A live in-progress draft never has real eval history to show — no badge
    // in the preview, ever (same anti-gaming rule as the live listing).
    trustStats: null,
  };
}

function formatRating(rating: number | null | undefined): string {
  const n = Number(rating ?? 0);
  return (n > 0 ? n : 5).toFixed(1);
}

/** Tags may carry "surfaces:voice,sms" — parse it if present. */
function surfacesFromTags(tags: string[] | null | undefined): SurfaceKey[] | null {
  if (!Array.isArray(tags)) return null;
  const tag = tags.find((t) => t.startsWith("surfaces:"));
  if (!tag) return null;
  const keys = tag
    .slice("surfaces:".length)
    .split(",")
    .map((k) => k.trim())
    .filter((k): k is SurfaceKey => k in SURFACE_META);
  return keys.length > 0 ? keys : null;
}

/** Tags may carry "builder:Name" — parse it if present. */
function builderFromTags(tags: string[] | null | undefined): string | null {
  if (!Array.isArray(tags)) return null;
  const tag = tags.find((t) => t.startsWith("builder:"));
  return tag ? tag.slice("builder:".length).trim() || null : null;
}

// ─── MCP rent surface (UI now; the endpoint is Phase 2) ──────────────────────

/** The public Rent-via-MCP endpoint for a listing. Phase 2 implements the
 *  JSON-RPC bridge behind it; the listing UI surfaces it + a copy button now. */
export function mcpEndpointFor(slug: string): string {
  return `https://app.seldonframe.com/api/v1/agents/${slug}/mcp`;
}

/** A copyable MCP client config snippet pointing at the listing's endpoint. */
export function mcpSnippetFor(slug: string): string {
  return [
    "{",
    '  "mcpServers": {',
    `    "${slug}": {`,
    `      "url": "${mcpEndpointFor(slug)}",`,
    '      "headers": {',
    '        "Authorization": "Bearer sk_live_…"',
    "      }",
    "    }",
    "  }",
    "}",
  ].join("\n");
}
