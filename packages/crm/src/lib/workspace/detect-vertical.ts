// packages/crm/src/lib/workspace/detect-vertical.ts
//
// Pure, sync, client-safe vertical detection. Runs in the browser on form
// submit BEFORE the SSE stream opens — feeds the "Stage A · inferred" copy
// in the build animation so every phase mock is vertical-appropriate from
// the very first frame.
//
// Companion to aesthetic-archetypes.ts (the SERVER-side classifier which
// runs after extraction returns real facts). Both files reference the
// same 7 archetype slugs — the canonical palette/voice for each archetype
// is owned by aesthetic-archetypes.ts. This file owns the URL/paste →
// archetype keyword routing plus the per-vertical mock copy (services,
// booking CTA, intake fields, chatbot opener, publish headline) that the
// animation renders into its 6 phases.
//
// Boundary: NO React, NO browser APIs (no `window`, no `document`), NO
// network. Safe to import from server components for SSR.
//
// Rule order is priority order. First keyword match wins — keep "hvac"
// before "agency" so agency-roofing doesn't get misrouted to
// technical-restrained.

import type { AestheticArchetypeId } from "./aesthetic-archetypes";

export type DetectVerticalInput = {
  kind: "url" | "biz";
  value: string;
};

export type VerticalRule = {
  /** Lowercased keyword fragments. Matched via substring. */
  keywords: readonly string[];
  /** Human-readable vertical label ("HVAC", "Dental practice"). */
  vertical: string;
  /** Canonical archetype slug from aesthetic-archetypes.ts. */
  archetype: AestheticArchetypeId;
  /** One-sentence voice description for the Identity phase. */
  voice: string;
  /** Display string for "Headline font" token chip. */
  headlineFont: string;
  /** Display string for "Hero variant" token chip. */
  heroVariant: string;
  /** Display string for "Sticky CTA" token chip. */
  stickyCta: string;
  /** Services list rendered in Phase 3 Structure. */
  services: readonly string[];
  /** Hours list rendered in Phase 3 Structure. */
  hours: readonly string[];
  /** Caption next to the Service Area icon. */
  serviceAreaLabel: string;
  /** Service area items rendered in Phase 3 Structure. */
  serviceArea: readonly string[];
  /** Phone number rendered in Phase 3 Structure. */
  contact: string;
  /** "Same-day · 60 min response" style kicker on the poster card. */
  posterKicker: string;
  /** Hero name HTML (may contain a <br/>) on the poster card. */
  posterName: string;
  /** Sub-tagline on the poster card. */
  posterTag: string;
  /** CTA copy inside the Booking module mock (Phase 4). */
  bookingCta: string;
  /** Intake field list inside the Intake module mock (Phase 4). */
  intakeFields: string;
  /** Chatbot opener inside the AI module mock (Phase 4). */
  chatBot: string;
  /** Sample user message inside the AI module mock (Phase 4). */
  chatUser: string;
  /** Default subdomain placeholder for the Publish browser (Phase 5). */
  publishDomain: string;
  /** Headline copy inside the Publish preview (Phase 5). */
  publishHead: string;
  /** Subhead/CTA copy inside the Publish preview (Phase 5). */
  publishCta: string;
};

export type DetectVerticalResult = {
  rule: VerticalRule;
  /** Title-cased business name inferred from the input. */
  businessName: string;
  /** Compact display string for chips ("acme-hvac.com"). */
  inputDisplay: string;
};

// ─── Vertical rules ────────────────────────────────────────────────────────
// Ported verbatim from Build Animation v2 HTML. Sort order is priority:
// first matching keyword wins. The seven entries map 1:1 to the seven
// aesthetic archetypes; "consultancy/technical-restrained" doubles as the
// fallback.

export const VERTICAL_RULES: readonly VerticalRule[] = [
  {
    keywords: [
      "hvac", "plumbing", "plumber", "electric", "electrician", "roofing",
      "roofer", "locksmith", "emergency", "24/7", "restoration", "tow",
    ],
    vertical: "HVAC",
    archetype: "bold-urgency",
    voice:
      "Direct, no-nonsense, action-oriented — like a 911 dispatcher who happens to fix things.",
    headlineFont: "Outfit · 800",
    heroVariant: "Split 50/50",
    stickyCta: "Mobile + desktop",
    services: ["AC repair", "Furnace install", "Duct cleaning", "Indoor air quality"],
    hours: ["Always on call", "Same-day service"],
    serviceAreaLabel: "5 cities",
    serviceArea: ["Stockton", "Lodi", "Tracy"],
    contact: "(209) 555-0144",
    posterKicker: "Same-day · 60 min response",
    posterName: "AC down?<br/>We'll be there in 60 minutes.",
    posterTag: "24/7 emergency HVAC",
    bookingCta: "Schedule Your Free A/C Tune-Up",
    intakeFields: "Name · Phone · Service",
    chatBot: "How can I help with your HVAC today?",
    chatUser: "My AC is out",
    publishDomain: "YOUR-CLIENT.seldonframe.app",
    publishHead: "AC down? We'll be there in 60 minutes.",
    publishCta: "Call now — (209) 555-0144",
  },
  {
    keywords: [
      "dental", "dentist", "smile", "medical", "clinic", "doctor", "vet",
      "veterinary", "orthodont", "optometr", "chiropract",
    ],
    vertical: "Dental practice",
    archetype: "clinical-trust",
    voice:
      "Calm, authoritative, precise — a senior partner explaining a complex matter without condescension.",
    headlineFont: "Cabinet Grotesk · 600",
    heroVariant: "Left-asymmetric",
    stickyCta: "Call + Book",
    services: [
      "Preventive care",
      "Restorative",
      "Cosmetic & implants",
      "Periodontal care",
    ],
    hours: ["Mon–Thu · 7:30am–5pm", "Friday · 7:30am–2pm"],
    serviceAreaLabel: "6 cities",
    serviceArea: ["Auburn", "Loomis", "Rocklin"],
    contact: "(530) 555-0188",
    posterKicker: "In-network · same-week scheduling",
    posterName: "Comprehensive dental care across three generations.",
    posterTag: "Family practice · since 2003",
    bookingCta: "Book Your Cleaning",
    intakeFields: "Name · Phone · Concern",
    chatBot: "Would you like to book a cleaning or talk to the practice?",
    chatUser: "Book a cleaning",
    publishDomain: "YOUR-CLIENT.seldonframe.app",
    publishHead: "Comprehensive dental care.",
    publishCta: "Schedule a consultation",
  },
  {
    keywords: [
      "medspa", "aesthet", "wellness", "spa", "beauty", "skincare", "salon",
      "barber", "laser",
    ],
    vertical: "Medspa",
    archetype: "cinematic-aspirational",
    voice:
      "Cinematic, sensory, confident — as if every word is shot in slow motion.",
    headlineFont: "Cabinet Grotesk · 600 italic",
    heroVariant: "Cinematic aura",
    stickyCta: "Hidden · luxury voice",
    services: [
      "Injectables",
      "Skin & laser",
      "Body contour",
      "Skincare practice",
    ],
    hours: ["Tue–Sat · By appointment", "Closed Sun & Mon"],
    serviceAreaLabel: "5 cities",
    serviceArea: ["Santa Monica", "Brentwood", "Pacific Palisades"],
    contact: "(310) 555-0119",
    posterKicker: "By appointment only",
    posterName: "Restorative aesthetics, quietly extraordinary.",
    posterTag: "Physician-led · Montana Ave.",
    bookingCta: "Reserve Your Consultation",
    intakeFields: "Name · Email · Interest",
    chatBot: "How can we help with your treatment plan?",
    chatUser: "Tell me about laser",
    publishDomain: "YOUR-CLIENT.seldonframe.app",
    publishHead: "Restorative aesthetics, quietly extraordinary.",
    publishCta: "Reserve your visit",
  },
  {
    keywords: [
      "accounting", "consult", "legal", "law", "attorn", "finance", "financ",
      "tax", "b2b", "engineering", "agency",
    ],
    vertical: "Consultancy",
    archetype: "technical-restrained",
    voice:
      "Precise, evidence-led, no fluff — a senior engineer writing a post-mortem.",
    headlineFont: "Geist · 600",
    heroVariant: "Cinematic aura · cool",
    stickyCta: "Hidden · B2B voice",
    services: [
      "Production rescue",
      "Platform migration",
      "Architecture review",
      "Embedded staff aug",
    ],
    hours: ["Mon–Fri · 9am–6pm PT", "Async in engagements"],
    serviceAreaLabel: "Remote",
    serviceArea: ["Remote, US & EU", "On-site by arrangement"],
    contact: "(415) 555-0192",
    posterKicker: "47 engagements shipped",
    posterName:
      "Embedded engineers for teams shipping critical infrastructure.",
    posterTag: "Senior-only · SOC 2 Type II",
    bookingCta: "Book a Discovery Call",
    intakeFields: "Name · Company · Brief",
    chatBot: "What problem are you trying to solve?",
    chatUser: "Migration scoping",
    publishDomain: "YOUR-CLIENT.seldonframe.app",
    publishHead: "Embedded engineers for critical infrastructure.",
    publishCta: "View case studies",
  },
  {
    keywords: [
      "lawn", "landscap", "clean", "janitor", "pest", "pool", "window",
      "grooming",
    ],
    vertical: "Recurring residential",
    archetype: "soft-residential",
    voice:
      "Warm, approachable, slightly conversational — a friendly neighbour who is good at this.",
    headlineFont: "Outfit · 700",
    heroVariant: "Left-asymmetric",
    stickyCta: "Call · Text · Book",
    services: [
      "Weekly mowing",
      "Seasonal cleanup",
      "Lawn treatments",
      "Hedge & shrub",
    ],
    hours: ["Mon–Fri · 7am–5pm", "Saturday · 8am–noon"],
    serviceAreaLabel: "6 cities",
    serviceArea: ["Raleigh", "Cary", "Apex"],
    contact: "(919) 555-0148",
    posterKicker: "Weekly · same crew",
    posterName:
      "A tidy lawn, every week — without you thinking about it.",
    posterTag: "Family-owned · Triangle area",
    bookingCta: "Schedule Your Free Lawn Estimate",
    intakeFields: "Name · Address · Service",
    chatBot: "Would you like weekly or bi-weekly mowing?",
    chatUser: "Weekly please",
    publishDomain: "YOUR-CLIENT.seldonframe.app",
    publishHead: "A tidy lawn, every week, without you thinking about it.",
    publishCta: "Get a free quote",
  },
  {
    keywords: [
      "coffee", "restaurant", "cafe", "bakery", "retail", "heritage",
      "family-owned", "artisan", "craft", "butcher", "farm",
    ],
    vertical: "Local food",
    archetype: "editorial-warm",
    voice:
      "Warm, confident, human — a trusted neighbour who happens to be the best at their craft.",
    headlineFont: "Cabinet Grotesk · 600",
    heroVariant: "Left-asymmetric",
    stickyCta: "Call + Book",
    services: [
      "Pour-over coffee",
      "Pastries",
      "Wholesale beans",
      "Private events",
    ],
    hours: ["Mon–Sun · 7am–6pm"],
    serviceAreaLabel: "Local",
    serviceArea: ["Downtown", "East side", "West side"],
    contact: "(845) 555-0163",
    posterKicker: "Roasted since 1962",
    posterName: "Single-origin coffee, roasted by hand.",
    posterTag: "Hudson Valley · est. 1962",
    bookingCta: "Reserve a Tasting",
    intakeFields: "Name · Phone · Interest",
    chatBot: "Looking for retail beans or a tasting?",
    chatUser: "A tasting",
    publishDomain: "YOUR-CLIENT.seldonframe.app",
    publishHead: "Single-origin coffee, roasted by hand.",
    publishCta: "Schedule a consultation",
  },
  {
    keywords: [
      "studio", "gallery", "design", "art", "creative", "photograph", "field",
    ],
    vertical: "Creative studio",
    archetype: "brutalist",
    voice:
      "Blunt, opinionated, confident — the work speaks for itself.",
    headlineFont: "Cabinet Grotesk · 800",
    heroVariant: "Left-asymmetric · hard edges",
    stickyCta: "Call only",
    services: [
      "Identity systems",
      "Type design",
      "Editorial",
      "Studio collaborations",
    ],
    hours: ["Studio Mon–Thu · 10am–6pm", "Closed Friday"],
    serviceAreaLabel: "NY + intl.",
    serviceArea: ["New York", "Selected international"],
    contact: "(212) 555-0177",
    posterKicker: "Selected work · 2011–present",
    posterName:
      "Identity, type, and editorial systems for cultural institutions.",
    posterTag: "Field/Studio · Brooklyn",
    bookingCta: "Inquire",
    intakeFields: "Name · Company · Brief",
    chatBot: "How can the studio help?",
    chatUser: "Identity project",
    publishDomain: "YOUR-CLIENT.seldonframe.app",
    publishHead: "Identity, type, and editorial systems.",
    publishCta: "Selected work",
  },
];

/** Fallback used when nothing matches — uses the technical-restrained rule. */
export const FALLBACK_RULE: VerticalRule =
  VERTICAL_RULES.find((r) => r.archetype === "technical-restrained") ??
  VERTICAL_RULES[0]!;

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Match a single keyword against a corpus. Short keywords (≤4 chars) are
 * matched as whole-word tokens so we don't accidentally route "lawn" to
 * the consultancy rule (which keys on "law") or "tower" to the bold-
 * urgency rule (which keys on "tow"). Longer keywords stay as plain
 * substring matches — they're already specific enough.
 *
 * "Whole word" here = surrounded by non-letter chars on both sides, OR at
 * string boundaries. Allows hyphens/digits/spaces ("24/7", "law-firm") to
 * count as word boundaries.
 */
function keywordMatches(keyword: string, corpus: string): boolean {
  if (keyword.length > 4) return corpus.includes(keyword);
  // Escape regex metacharacters in the keyword (e.g. the "/" in "24/7").
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, "i");
  return re.test(corpus);
}

/**
 * Detect the vertical (and inferred business name) from a URL or business
 * description string. Pure, sync, no side-effects.
 *
 * Algorithm:
 *   1. Lowercase input. For URLs, strip protocol + path before keyword
 *      matching so "https://acme-hvac.com/services" matches on "hvac".
 *   2. First-match wins on VERTICAL_RULES. Rule order is priority order.
 *      Short keywords (≤4 chars) use word-boundary matching to avoid
 *      false positives like "lawn" matching the consultancy rule's "law".
 *   3. Infer the business name:
 *      - URL  → title-cased hostname (minus protocol/www/TLD)
 *      - biz  → first capitalized phrase OR first 2–4 words
 *   4. Fall back to FALLBACK_RULE (technical-restrained) when nothing matches.
 */
export function detectVertical(input: DetectVerticalInput): DetectVerticalResult {
  const raw = input.value ?? "";
  const v = raw.toLowerCase();
  const stripped = v.replace(/^https?:\/\//, "").replace(/\/.*$/, "");

  let rule: VerticalRule = FALLBACK_RULE;
  for (const r of VERTICAL_RULES) {
    if (
      r.keywords.some(
        (k) => keywordMatches(k, stripped) || keywordMatches(k, v),
      )
    ) {
      rule = r;
      break;
    }
  }

  return {
    rule,
    businessName: inferBusinessName(input),
    inputDisplay: inferInputDisplay(input),
  };
}

/**
 * Infer a title-cased business name from the input.
 *
 *   URL  → strip protocol/path → strip 'www.' and TLD → title-case the dash
 *          or underscore segments → join with spaces.
 *   biz  → first capitalized phrase (regex). Fallback to first 3 words.
 */
export function inferBusinessName(input: DetectVerticalInput): string {
  const raw = input.value ?? "";
  if (input.kind === "url") {
    const host = raw.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    const root =
      host
        .replace(/^www\./, "")
        .split(".")
        .slice(0, -1)
        .join(".") || host;
    return root
      .split(/[-_.]/)
      .map((p) => (p.length === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1)))
      .join(" ")
      .trim();
  }
  // biz paste — first capitalized phrase, or first 2-4 words.
  const firstSentence = raw.split(/[.\n]/)[0]?.trim() ?? "";
  const capMatch = firstSentence.match(
    /^([A-Z][a-zA-Z'&-]+(?:\s+[A-Z][a-zA-Z'&-]+){0,3})/,
  );
  if (capMatch && capMatch[1]) return capMatch[1];
  return firstSentence.split(/\s+/).slice(0, 3).join(" ");
}

/**
 * Compact display string for the input — used in chips/tickers where the
 * full URL or paragraph would be too long.
 */
export function inferInputDisplay(input: DetectVerticalInput): string {
  const raw = input.value ?? "";
  if (input.kind === "url") {
    return raw.replace(/^https?:\/\//, "").replace(/\/$/, "");
  }
  const words = raw.trim().split(/\s+/);
  const head = words.slice(0, 6).join(" ");
  return head + (words.length > 6 ? "…" : "");
}

/**
 * Derive the .seldonframe.app subdomain from the input. Used by the Phase 5
 * publish browser preview. Animation-only — the real subdomain is decided
 * server-side and arrives in the `done` SSE event.
 */
export function inferPublishSubdomain(input: DetectVerticalInput): string {
  const raw = input.value ?? "";
  if (input.kind === "url") {
    const host = raw.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    const slug = host.replace(/^www\./, "").split(".")[0] ?? "client";
    return `${slug || "client"}.seldonframe.app`;
  }
  const slug = inferBusinessName(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug || "client"}.seldonframe.app`;
}

// ─── Archetype label helper ────────────────────────────────────────────────
// The README's "Archetype" chip displays a friendly label (not the slug).
// Owned here because it's an animation-display concern; aesthetic-
// archetypes.ts already has an operator-facing .label string but those are
// longer ("Editorial — warm, craft-focused") than the chip allows.

export const ARCHETYPE_LABELS: Record<AestheticArchetypeId, string> = {
  "bold-urgency": "Bold urgency",
  "clinical-trust": "Clinical trust",
  "cinematic-aspirational": "Cinematic aspirational",
  "technical-restrained": "Technical restrained",
  "soft-residential": "Soft residential",
  "editorial-warm": "Editorial warm",
  brutalist: "Brutalist",
  "midnight-craft": "Midnight craft",
};
