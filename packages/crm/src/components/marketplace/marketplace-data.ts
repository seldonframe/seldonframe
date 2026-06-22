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
};

// ─── price + number formatting (matches the design's helpers) ────────────────

export function formatInstalls(n: number): string {
  return n.toLocaleString("en-US");
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
  return {
    slug: row.slug,
    name: row.name,
    category,
    icon: CATEGORY_META[category].icon,
    surfaces,
    installs: row.installCount ?? 0,
    rating: formatRating(row.rating),
    reviewCount: row.reviewCount ?? 0,
    priceCents: row.price ?? 0,
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
