// The CRM Pricing Index — pure data-transform module. Turns the verified
// competitor-pricing registry (lib/seo/competitor-pricing.ts) into chart
// series for /charts/crm-pricing-index, given a business-size input
// ({ contacts, seats }). No React, no DOM — unit-testable in isolation, and
// re-run every time the registry is re-verified (monthly loop), so the chart
// never drifts from the sourced numbers.
//
// Never-lies rule for this module specifically: every dollar figure this
// file emits must trace to either (a) a `plans[]`/`stacks[]` entry in
// competitor-pricing.ts, or (b) the SF_TIER_MAP price constants below (which
// mirror lib/billing/plans.ts's live $29/$49/$99/$199/$299 ladder). Nothing
// here invents a number — quote-gated vendors get `quoteGated: true` and a
// null estimate instead of a guess.

import { PRICING, getCompetitorPricing, type CompetitorPricing } from "./competitor-pricing";

// ─── business-size input ────────────────────────────────────────────────────

export type BusinessSize = {
  /** CRM/marketing contact count — drives contact-tiered vendors. */
  contacts: number;
  /** Seats/users — drives per-seat vendors (Zoho, Salesforce, ActiveCampaign
   *  seat add-ons, agency-tool "clients"/sub-accounts). */
  seats: number;
};

/** The 4 stepped contact presets the chart's slider snaps to. */
export const CONTACT_PRESETS = [500, 2_000, 10_000, 50_000] as const;
/** The 3 stepped seat presets the chart's slider snaps to. */
export const SEAT_PRESETS = [1, 3, 10] as const;

// ─── the SF fairness rule ───────────────────────────────────────────────────
//
// Max's explicit instruction: SeldonFrame's line must use the tier CLOSEST to
// what each comparison implies. Solo/DIY vendors compare against Builder
// ($29); vendors that require SF's own managed-runtime story compare against
// Managed ($49); multi-client/agency vendors (GHL, Vendasta, Stammer AI,
// Podium) compare against the Agency ladder ($99/$199/$299) keyed to their
// own sub-account/location count. These four numbers are the live prices in
// lib/billing/plans.ts (PLANS[].price) — duplicated here as read-only
// constants (not imported) so this SEO-facing pure module has zero runtime
// dependency on the billing package; keep them in sync by hand when the
// ladder changes (same convention pricing-page.tsx already uses for its own
// "$29/mo flat" copy).
export const SF_TIER_PRICES = {
  builder: 29,
  managed: 49,
  agency_starter: 99,
  agency_growth: 199,
  agency_scale: 299,
} as const;

export type SfTierId = keyof typeof SF_TIER_PRICES;

/** The SF-tier mapping table — one row per competitor slug, documenting
 *  (and driving) which SF tier(s) that vendor is fairly compared against.
 *  `band` is [minTier, maxTier]: solo tools map to a single tier (min===max);
 *  vendors with their own multi-tier ladder (e.g. GoHighLevel Starter →
 *  Unlimited → Agency Pro) map to a band that widens with business size. */
export const SF_TIER_MAP: Record<string, { band: [SfTierId, SfTierId]; rationale: string }> = {
  gohighlevel: { band: ["agency_starter", "agency_scale"], rationale: "Agency/sub-account tool — GHL's own ladder ($97/$297/$497) is priced for reselling to clients, same shape as SF's Agency tiers." },
  vendasta: { band: ["agency_starter", "agency_scale"], rationale: "Agency reseller platform — minimum spend commitments scoped to running client sub-accounts." },
  "stammer-ai": { band: ["agency_starter", "agency_scale"], rationale: "Whitelabel-to-clients platform (Agency $197 / Full SaaS $497) — directly agency-shaped." },
  podium: { band: ["agency_starter", "agency_growth"], rationale: "Multi-location SMB rollups are the practical use case; compares against SF's mid agency tiers, not solo Builder." },
  sharpspring: { band: ["agency_starter", "agency_starter"], rationale: "Historically agency-book-of-business pricing; single-tier estimate." },
  activecampaign: { band: ["builder", "managed"], rationale: "Solo/SMB marketing-automation tool — Builder for DIY-key users, Managed for a single no-setup workspace." },
  hubspot: { band: ["builder", "agency_scale"], rationale: "Spans solo (Free/Starter) to enterprise team (Pro/Enterprise) — band widens with contacts/seats." },
  clickfunnels: { band: ["builder", "managed"], rationale: "Solo funnel-builder tool." },
  keap: { band: ["builder", "managed"], rationale: "SMB CRM+automation, 2 seats included — solo/small-team shaped." },
  linktree: { band: ["builder", "builder"], rationale: "Link-in-bio, not a CRM — cheapest possible comparison tier." },
  kartra: { band: ["builder", "managed"], rationale: "Solo/small-team funnel + CRM suite." },
  klaviyo: { band: ["builder", "managed"], rationale: "Single-store ecommerce email/SMS tool." },
  zoho: { band: ["builder", "agency_starter"], rationale: "Per-seat CRM — small team maps to Builder/Managed, 10-seat team crosses into Agency Starter territory." },
  salesforce: { band: ["managed", "agency_scale"], rationale: "Per-seat enterprise CRM — even Starter Suite is priced for a small team, not solo; scales into Agency territory at 10 seats." },
  vapi: { band: ["builder", "builder"], rationale: "Usage-based voice API, not a full front office — cheapest comparison tier." },
  "retell-ai": { band: ["builder", "builder"], rationale: "Usage-based voice API." },
  synthflow: { band: ["agency_scale", "agency_scale"], rationale: "Public pricing is now enterprise-only (~$30k/yr) — compares against SF's top tier as the closest available band." },
  chatbase: { band: ["builder", "managed"], rationale: "Solo/small-team chatbot builder." },
  botpress: { band: ["builder", "managed"], rationale: "Solo/small-team bot builder." },
  "goodcall": { band: ["builder", "managed"], rationale: "Per-agent AI receptionist, single-location shaped." },
  voiceflow: { band: ["builder", "managed"], rationale: "Per-seat agent builder, small team shaped." },
  lindy: { band: ["builder", "managed"], rationale: "Individual/power-user automation assistant." },
  durable: { band: ["builder", "builder"], rationale: "Solo AI website + mini-CRM — cheapest comparison tier." },
  "my-ai-front-desk": { band: ["builder", "managed"], rationale: "Single-location AI receptionist." },
  "smith-ai": { band: ["managed", "agency_starter"], rationale: "Per-call receptionist service scales with call volume/locations, small-agency shaped at the high end." },
};

// ─── chart series types ─────────────────────────────────────────────────────

export type ChartPoint = {
  contacts: number;
  seats: number;
  /** Estimated monthly cost in USD. Null when quote-gated (no invented number). */
  costMonthly: number | null;
  /** True when this point is a dashed/open "quote-gated" marker. */
  quoteGated: boolean;
  /** Free-text assumption disclosed in the tooltip, e.g. "est. at 3 seats". */
  assumption: string;
  /** "as listed <date>" — traces to CompetitorPricing.verified. */
  verified: string;
  /** Source URL for the tooltip link. */
  sourceUrl: string;
};

export type VendorSeries = {
  slug: string;
  name: string;
  /** True for the handful of vendors visible by default on the chart. */
  defaultVisible: boolean;
  points: ChartPoint[];
};

export type SfBandPoint = {
  contacts: number;
  seats: number;
  low: number;
  high: number;
  tierLow: SfTierId;
  tierHigh: SfTierId;
};

const DEFAULT_VISIBLE_SLUGS = new Set(["hubspot", "gohighlevel", "salesforce", "keap", "activecampaign"]);
// pipedrive is named in the brief but has no competitor-pricing registry
// entry (25-entry registry doesn't include it) — omitted rather than
// fabricated; see the build report for the honest reason.

/** Parse a lead numeric MONTHLY dollar amount out of a plan price string,
 *  e.g. "$97/mo" -> 97, "listed at ~$49/mo (annual, 1,000 contacts)" -> 49,
 *  "starts at $800/mo (3 core seats)" -> 800, "$5,997/yr (annual only)" ->
 *  500 (normalized to monthly). Returns null when the string has no
 *  extractable monthly figure — including "Custom", "talk to sales",
 *  "quote-gated", or a bare "custom-scoped" contract estimate (e.g.
 *  Synthflow's "~$30,000/yr, custom-scoped"): those are reported ballpark
 *  contract figures, not a self-serve plan price, so treating them as a real
 *  chartable number would be a fabrication under the never-lies rule —
 *  they're routed to the quote-gated marker instead. */
function parseLeadDollar(price: string): number | null {
  const lower = price.toLowerCase();
  if (lower.includes("custom") || lower.includes("talk to sales") || lower.includes("contact sales") || lower.includes("quote-gated")) {
    return null;
  }
  const m = price.match(/\$([\d,]+(?:\.\d+)?)/);
  if (!m) return null;
  const dollars = Number(m[1].replace(/,/g, ""));
  // Normalize an annual figure to a monthly one when the string says "/yr".
  if (/\/\s*yr\b/.test(lower)) return Math.round(dollars / 12);
  return dollars;
}

/** Pick the plan whose parsed price is the best fit for a given contact/seat
 *  size, biased toward the plan whose `limits`/name suggests it covers the
 *  requested count — falls back to a simple size-ordered pick since the
 *  registry doesn't carry structured limit numbers. Returns null (⇒
 *  quote-gated marker) when every plan in range is quote-gated/unparseable. */
function pickPlanForSize(pricing: CompetitorPricing, size: BusinessSize): { price: number | null; assumption: string; planName: string } {
  const parsed = pricing.plans.map((p) => ({ plan: p, dollars: parseLeadDollar(p.price) }));
  const withPrice = parsed.filter((p): p is { plan: (typeof parsed)[number]["plan"]; dollars: number } => p.dollars !== null);

  if (withPrice.length === 0) {
    return { price: null, assumption: "quote-gated — no public number", planName: pricing.plans[0]?.name ?? "Custom" };
  }

  // Business-size proxy: bigger contacts/seats -> pick a higher-index plan
  // (registry plans are ordered cheapest-to-priciest by convention across
  // this file). Scale the pick by where `size` falls in the preset range.
  const sizeScore = Math.max(size.contacts / 50_000, size.seats / 10, 0);
  const idx = Math.min(withPrice.length - 1, Math.round(sizeScore * (withPrice.length - 1)));
  const chosen = withPrice[idx];

  const assumption =
    size.seats > 1
      ? `est. at ${size.seats} seat${size.seats === 1 ? "" : "s"}, ${chosen.plan.name} plan`
      : `est. on ${chosen.plan.name} plan at ${size.contacts.toLocaleString()} contacts`;

  return { price: chosen.dollars, assumption, planName: chosen.plan.name };
}

/** Build the full chart series (one per registry vendor) for a given
 *  business size. Pure function — same input always produces the same
 *  output, so it's directly unit-testable and safe to call at render time. */
export function buildVendorSeries(size: BusinessSize): VendorSeries[] {
  return PRICING.map((pricing) => {
    const picked = pickPlanForSize(pricing, size);
    const point: ChartPoint = {
      contacts: size.contacts,
      seats: size.seats,
      costMonthly: pricing.quoteGated && picked.price === null ? null : picked.price,
      quoteGated: picked.price === null,
      assumption: picked.assumption,
      verified: `as listed ${pricing.verified}`,
      sourceUrl: pricing.pricingUrl,
    };
    return {
      slug: pricing.slug,
      name: vendorDisplayName(pricing.slug),
      defaultVisible: DEFAULT_VISIBLE_SLUGS.has(pricing.slug),
      points: [point],
    };
  });
}

/** Compute the SeldonFrame comparison band for one vendor at a given size —
 *  the stepped low/high straight from SF_TIER_PRICES via SF_TIER_MAP. Throws
 *  for a slug with no mapping (fail loud rather than silently draw nothing —
 *  every registry vendor must have a mapping, enforced by the spec test). */
export function sfBandForVendor(slug: string, size: BusinessSize): SfBandPoint {
  const mapping = SF_TIER_MAP[slug];
  if (!mapping) throw new Error(`No SF_TIER_MAP entry for competitor-pricing slug: ${slug}`);
  const [tierLow, tierHigh] = mapping.band;
  return {
    contacts: size.contacts,
    seats: size.seats,
    low: SF_TIER_PRICES[tierLow],
    high: SF_TIER_PRICES[tierHigh],
    tierLow,
    tierHigh,
  };
}

function vendorDisplayName(slug: string): string {
  // getCompetitorPricing throws on unknown slugs — reuse it just to prove
  // the slug is real (fail loud), then format from the slug itself since
  // CompetitorPricing has no separate `name` field (alternative-pages.ts
  // owns display names, out of scope for this pure module per the brief).
  getCompetitorPricing(slug);
  const overrides: Record<string, string> = {
    gohighlevel: "GoHighLevel",
    hubspot: "HubSpot",
    activecampaign: "ActiveCampaign",
    clickfunnels: "ClickFunnels",
    keap: "Keap",
    linktree: "Linktree",
    kartra: "Kartra",
    sharpspring: "SharpSpring",
    klaviyo: "Klaviyo",
    zoho: "Zoho",
    salesforce: "Salesforce",
    vapi: "Vapi",
    "retell-ai": "Retell AI",
    synthflow: "Synthflow",
    chatbase: "Chatbase",
    botpress: "Botpress",
    "stammer-ai": "Stammer AI",
    podium: "Podium",
    vendasta: "Vendasta",
    goodcall: "Goodcall",
    voiceflow: "Voiceflow",
    lindy: "Lindy",
    durable: "Durable",
    "my-ai-front-desk": "My AI Front Desk",
    "smith-ai": "Smith.ai",
  };
  return overrides[slug] ?? slug;
}

/** All slugs the chart draws — every registry entry that also has an
 *  SF_TIER_MAP row (enforced 1:1 by the spec). */
export function allChartSlugs(): string[] {
  return PRICING.map((p) => p.slug);
}
