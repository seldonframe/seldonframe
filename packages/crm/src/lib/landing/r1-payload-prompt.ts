// packages/crm/src/lib/landing/r1-payload-prompt.ts
//
// Purpose-built prompt for the R-framework landing page generator.
// Takes ExtractedBusinessFacts + archetype + voice profile and emits
// a fully-populated JSON payload matching the section prop shapes.
//
// JSON-only output — same hard rules as EXTRACTION_INSTRUCTIONS_MD:
// no prose, no markdown fences, no preamble, one JSON object only.
//
// Provider-agnostic: the caller (r1-payload-generator.ts) wraps
// the Anthropic SDK, but this prompt works unchanged on GPT / Gemini
// / Llama by swapping only the SDK call.

import type { AestheticArchetypeId } from "@/lib/workspace/aesthetic-archetypes";
import { ARCHETYPES, getArchetype } from "@/lib/workspace/aesthetic-archetypes";
import type { ExtractedBusinessFacts } from "@/lib/web-onboarding/extraction-prompt";
import type {
  ServicePage,
  R1NavConfig,
  R1ThemeConfig,
} from "./r1-site-tree";

// ── TypeScript types mirroring the R-framework section props ──────────────────

export type R1CTA = { label: string; href: string };

export type R1TrustBadge = { label: string };

export type R1HeroOverlay = {
  techName: string;
  techMeta: string;
  callout?: string;
};

export type R1HeroSection = {
  archetype: AestheticArchetypeId;
  businessName: string;
  tagline: string;
  subhead: string;
  primaryCTA: R1CTA;
  secondaryCTA?: R1CTA;
  trustBadges: R1TrustBadge[];
  reviewRating?: number;
  reviewCount?: number;
  emergencyService?: boolean;
  heroImage?: { src: string; alt: string };
  heroOverlay?: R1HeroOverlay;
  /** P2: when true (and payload.leadForm.enabled), the hero renders the intake
   *  form in its right column (desktop) / below the text (mobile). */
  leadFormInHero?: boolean;
  /** Media-editing T1: optional full-bleed background image, rendered BEHIND
   *  the existing foreground content (distinct from `heroImage`, which is the
   *  foreground photo panel in HeroSplit/HeroLeftAsymmetric). Optional — grandfathered
   *  payloads without it render byte-identical to today. Video takes precedence
   *  over this when both are set. */
  backgroundImage?: { src: string; alt: string };
  /** Media-editing T1: optional full-bleed background video, rendered BEHIND
   *  the existing foreground content. Takes precedence over `backgroundImage`
   *  when both are set. Autoplays muted/looped — decorative, no audio. */
  backgroundVideo?: { src: string; poster?: string };
};

export type R1Service = {
  id: string;
  name: string;
  description: string;
  /** Optional per-service photo. When set, the services grid renders it instead of the striped placeholder. */
  photo?: { src: string; alt: string };
};

export type R1ServicesSection = {
  archetype: AestheticArchetypeId;
  eyebrow?: string;
  heading: string;
  intro?: string;
  services: R1Service[];
  cta?: {
    label: string;
    href: string;
    text?: { title: string; sub: string };
  };
};

export type R1Testimonial = {
  id: string;
  quote: string;
  name: string;
  city?: string;
  rating?: number;
  service?: string;
};

export type R1TestimonialsSection = {
  archetype: AestheticArchetypeId;
  eyebrow?: string;
  heading: string;
  testimonials: R1Testimonial[];
  reviewSummary?: {
    rating: number;
    count: number;
    sources?: string;
  };
};

export type R1FaqItem = {
  id: string;
  question: string;
  answer: string;
};

export type R1FaqSection = {
  archetype: AestheticArchetypeId;
  eyebrow?: string;
  heading: string;
  intro?: string;
  items: R1FaqItem[];
  cta?: {
    title: string;
    sub: string;
    label: string;
    href: string;
  };
};

export type R1WeeklyHoursLine = {
  line: string;
  emergency?: boolean;
};

export type R1FooterSection = {
  archetype: AestheticArchetypeId;
  businessName: string;
  tagline?: string;
  phone: string;
  email?: string;
  address?: {
    line1: string;
    city: string;
    state: string;
    zip: string;
  };
  serviceAreas?: string[];
  weeklyHours?: R1WeeklyHoursLine[];
  license?: string;
  trustBadges?: R1TrustBadge[];
  serviceLinks?: { label: string; href: string }[];
  socials?: { kind: "facebook" | "google" | "yelp" | "instagram"; href: string }[];
};

export type R1EmergencySection = {
  archetype: AestheticArchetypeId;
  message: string;
  phone: string;
  show?: boolean;
};

export type R1StickySection = {
  archetype: AestheticArchetypeId;
  phone: string;
  smsHref?: string;
  bookHref?: string;
};

/**
 * Speed-to-Lead bottom section. Optional + top-level. When `enabled`,
 * the two public R1 pages render <LeadFormSection> after <Faq>. All copy
 * fields are optional — the component supplies sensible defaults. Enabled
 * per workspace by setting blueprint_json.payload.leadForm in the DB; it
 * round-trips through loadLandingPayload's raw passthrough (no loader change).
 */
export type R1LeadFormSection = {
  enabled: boolean;
  /** Section heading. Default: "Get a fast callback". */
  heading?: string;
  /** Sub-line under the heading. Default: "Tell us what you need — we'll text you a time in minutes." */
  subheading?: string;
  /** Label for the third field. Default: "What do you need?". */
  needLabel?: string;
  /** When non-empty, the need field renders as a <select> of these options; otherwise a short text input. */
  needOptions?: string[];
  /** TCPA / consent line shown under the submit button. Default supplied by the component. */
  consentText?: string;
};

/** Full R1 landing payload — union of all section prop shapes.
 *
 * Phase-1 multi-page additions are all OPTIONAL so existing single-page
 * payloads render unchanged:
 *   • servicePages — one ServicePage per service (the /w/[slug]/services/[x]
 *     route renders these). NOTE: distinct from `services` above, which is the
 *     home services GRID (R1ServicesSection). See the plan's Spec↔Code section.
 *   • nav          — shared navbar config (extra links + CTA override).
 *   • theme        — { mode?: "light" | "dark" }; threaded through SiteShell.
 */
export type R1LandingPayload = {
  hero: R1HeroSection;
  services: R1ServicesSection;
  testimonials: R1TestimonialsSection;
  faq: R1FaqSection;
  footer: R1FooterSection;
  /** The client's own logo, captured from their site during URL onboarding
   *  (html-image-harvester). Optional — absent on paste/manual builds.
   *  Rendered in the nav brand slot in place of the text wordmark. */
  logo?: string;
  emergency?: R1EmergencySection;
  sticky?: R1StickySection;
  /** Speed-to-Lead bottom section (optional). */
  leadForm?: R1LeadFormSection;
  /** Multi-page: per-service detail pages (Phase 1+). Optional. */
  servicePages?: ServicePage[];
  /** Multi-page: shared navbar config. Optional. */
  nav?: R1NavConfig;
  /** Multi-page: site theme (light/dark mode). Optional. */
  theme?: R1ThemeConfig;
};

// Re-export the site-tree types so existing importers of this module can reach
// them without a second import path.
export type { ServicePage, R1NavConfig, R1ThemeConfig } from "./r1-site-tree";

// ── Prompt builder ────────────────────────────────────────────────────────────

/**
 * Builds the user message that instructs the LLM to emit the R1 payload JSON.
 * The caller passes this as the entire user-message content to the Anthropic
 * messages.create call. No system prompt needed beyond the JSON-only directive.
 */
export function buildR1PayloadPrompt(
  facts: ExtractedBusinessFacts,
  archetypeId: AestheticArchetypeId,
): string {
  const archetype = getArchetype(archetypeId);

  // Pick the first fallback image query from the archetype registry.
  // This produces a deterministic high-quality Unsplash search URL.
  // Only used when facts.photos is absent or empty.
  const imageQuery = archetype.fallbackImageQueries[0] ?? "professional worker";
  const unsplashSrc = `https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=1200&q=70&auto=format&fit=crop&q=${encodeURIComponent(imageQuery)}`;

  // Phase U enrichment: build optional context blocks for the prompt.
  const hasPhotos =
    Array.isArray(facts.photos) && facts.photos.length > 0;
  const hasFaq =
    Array.isArray(facts.faq) && facts.faq.length > 0;
  const hasServicesDetailed =
    Array.isArray(facts.services_detailed) && facts.services_detailed.length > 0;

  // Phone-first archetypes get a sticky bar.
  const PHONE_FIRST_ARCHETYPES: AestheticArchetypeId[] = [
    "bold-urgency",
    "editorial-warm",
    "clinical-trust",
    "soft-residential",
    "brutalist",
  ];
  const includeSticky = PHONE_FIRST_ARCHETYPES.includes(archetypeId);

  // Emergency strip: bold-urgency always; others only when emergency_service is true and desktopStickyCTA is true.
  const includeEmergency =
    archetypeId === "bold-urgency" ||
    (facts.emergency_service === true && archetype.desktopStickyCTA === true);

  // Derive a tel: href from the phone number.
  const phoneDigits = facts.phone.replace(/[^\d]/g, "");
  const telHref =
    phoneDigits.length === 10
      ? `tel:+1${phoneDigits}`
      : phoneDigits.length === 11 && phoneDigits.startsWith("1")
        ? `tel:+${phoneDigits}`
        : `tel:${phoneDigits}`;

  // Build the archetype context block for the prompt.
  const archetypeBlock = `Archetype: ${archetype.id}
Label: ${archetype.label}
Fits: ${archetype.fits}
Voice tone: ${archetype.voice.tone}
Voice pace: ${archetype.voice.pace}
Lean into: ${archetype.voice.leanInto.join(", ")}
AVOID: ${archetype.voice.avoid.join(", ")}`;

  const factsBlock = JSON.stringify(facts, null, 2);

  return `You are a JSON-only landing page copy generator for local service businesses.
Your output is consumed by a parser. Return EXACTLY ONE JSON object with no preamble, no markdown fences, no commentary.

ARCHETYPE:
${archetypeBlock}

EXTRACTED BUSINESS FACTS:
${factsBlock}

SECTION SPECIFICATIONS:

hero:
  archetype: "${archetypeId}" (hardcode this exact string)
  businessName: from facts.business_name
  tagline: 10-15 words. For bold-urgency, split into two clauses: "Problem? Solution in X." — the component renders the second clause in accent color. For other archetypes, a confident declarative headline.
  subhead: 25-40 words that reinforce the value proposition using facts (city, emergency service, certifications, years in business from trust_signals, service area).
  primaryCTA: { label, href } — href = "/book" (literal string — the renderer rewrites this to the workspace booking URL at runtime), label reflects the archetype voice. For bold-urgency: "Get a free estimate". For clinical-trust: "Book a consultation". For editorial-warm: "Get a free estimate". Always actionable.
  secondaryCTA: { label: "Call ${facts.phone}", href: "${telHref}" } — always include; keeps the phone number prominent in the hero.
  trustBadges: array of { label } — derive from certifications + trust_signals. Add "Family-owned since X" if trust_signals mentions it. Max 4 badges. Min 1.
  reviewRating: from facts.review_rating (number) or null if absent.
  reviewCount: from facts.review_count (number) or null if absent.
  emergencyService: from facts.emergency_service (boolean) or false.
  heroImage: ${hasPhotos ? `Use the hero photo from ENRICHMENT_PHOTOS below (section==="hero"). If none has section==="hero", use the first photo in the array. Set alt to "{businessName} professional at work" unless the extracted alt is more descriptive. NEVER use an Unsplash URL when ENRICHMENT_PHOTOS is provided.` : `{ src: "${unsplashSrc}", alt: "{businessName} professional at work" }`}
  heroOverlay (optional, include for trade verticals): { techName: "Lead tech name or role", techMeta: "X yrs · certification if known", callout: "price or guarantee" }

services:
  archetype: "${archetypeId}"
  eyebrow: short (1-3 words). Bold-urgency: "What we fix". Soft-residential: "What we do". Clinical-trust: "Our services". Editorial-warm: "Our craft".
  heading: 6-10 words reflecting archetype voice.
  intro: 1-2 sentences in the archetype's voice about WHY they're good at this, not WHAT they do (save that for cards).
  services: expand each entry in facts.services into { id: "s{n}", name, description }. ${hasServicesDetailed ? `ENRICHMENT_SERVICES_DETAILED is provided below — use each matching entry's description verbatim (paraphrasing lightly for archetype voice is fine, but preserve the factual content). For any service not in ENRICHMENT_SERVICES_DETAILED, synthesize a 1-2 sentence description in the archetype's voice.` : `Description = 1-2 sentences in the archetype's voice, emphasizing a specific benefit or differentiator.`} Use at least 3, max 8.
  cta: { label: "Call {phone}", href: "${telHref}", text: { title: short urgency hook, sub: 1 sentence reinforcer } } — always include.

testimonials:
  archetype: "${archetypeId}"
  eyebrow: match archetype voice. Bold-urgency: "What neighbors say". Editorial-warm: "What clients say". Clinical-trust: "Patient reviews". Soft-residential: "What homeowners say".
  heading: if review data exists use "{count} reviews. {rating} stars." + voice-appropriate ending. If no data, "What our customers say."
  testimonials: prefer facts.testimonials[] (map each to { id: "t{n}", quote, name, city, rating, service }). If facts.testimonials is null/empty, SYNTHESIZE 3 plausible local-flavor testimonials with realistic first + last initial names from the service area (e.g., "Diane M.", "Marcus V."), one per top service, each 1-2 sentences, rating 5.
  reviewSummary (only if facts.review_rating exists): { rating: {review_rating}, count: {review_count}, sources: "Google · Yelp" }

faq:
  archetype: "${archetypeId}"
  eyebrow: "Quick answers" or equivalent.
  heading: "Frequently asked questions"
  intro (optional): 1 short sentence in the archetype's voice.
  items: ${hasFaq ? `ENRICHMENT_FAQ is provided below — use the operator's actual FAQ verbatim in faq.items. Reword questions for clarity if needed, but preserve the answer content faithfully. Only synthesize new questions if the source has fewer than 4 FAQ items — add 1-2 conversion-focused ones to fill (pricing, response time, areas served). Assign sequential ids starting from f1.` : `Generate 4-6 FAQ items { id: "f{n}", question, answer } based on the business type. Mandatory questions if applicable:
    - If emergency_service is true: "How fast can you be here for an emergency?"
    - If certifications exist: "Are you licensed and insured?"
    - If same_day is true: "Do you offer same-day service?"
    - Always include: a question about hours, a question about service area or cities served, a question about pricing/quotes.
    Answers must reflect the extracted facts (hours from weekly_hours, cities from service_area, etc.). Do NOT invent facts that aren't in the extracted data.`}
  cta (optional, include for urgency archetypes): { title: "Still have questions?", sub: "We pick up {X}/7.", label: "Call {phone}", href: "${telHref}" }

footer:
  archetype: "${archetypeId}"
  businessName: from facts.business_name
  tagline: 1-2 sentences summarizing the business's core value + how long they've been operating (if known from trust_signals).
  phone: "${facts.phone}"
  email: from facts.email (string) or omit if null.
  address: from facts.address — parse into { line1, city, state, zip } if possible. Omit if facts.address is null.
  serviceAreas: from facts.service_area (string[]) or [facts.city].
  weeklyHours: derive from facts.weekly_hours or synthesize from trust_signals. Format: [{ line: "Mon–Fri · 9am–5pm" }, { line: "24/7 emergency · always on call", emergency: true }]. Max 3 lines.
  license: first certification from facts.certifications if it looks like a license number (e.g. "C-20 #12345"). Otherwise omit.
  trustBadges: same as hero trustBadges (copy the array).
  serviceLinks: map top 4 services to { label, href: "#services" }.
  socials: omit (no social data in facts).

${includeEmergency ? `emergency:
  archetype: "${archetypeId}"
  message: "24/7 emergency service — we're on call now" (adapt to the specific trade if obvious from services)
  phone: "${facts.phone}"
  show: true` : ""}

${includeSticky ? `sticky:
  archetype: "${archetypeId}"
  phone: "${facts.phone}"
  smsHref: "sms:${phoneDigits.length === 10 ? `+1${phoneDigits}` : `+${phoneDigits}`}"
  bookHref: "/book"` : ""}

${hasPhotos ? `ENRICHMENT_PHOTOS (real images scraped from the operator's site — prefer these over Unsplash):
${JSON.stringify(facts.photos, null, 2)}

Photo usage rules:
- hero.heroImage: prefer the entry with section==="hero". If none, use the first entry.
- services tiles: if services has 4+ items, assign photos with section==="services" to service tiles (one per tile, in order) — write each as \`photo: { src, alt }\` on the matching service object (use the key name "photo", NOT "image"). Skip if fewer than 4 photos have section==="services".
- testimonials: use photos with section==="testimonial" for testimonial avatars if needed.
- NEVER invent an image URL. Only use URLs from ENRICHMENT_PHOTOS or the Unsplash fallback when no ENRICHMENT_PHOTOS are provided.
` : ""}
${hasServicesDetailed ? `ENRICHMENT_SERVICES_DETAILED (real service descriptions scraped from the operator's site):
${JSON.stringify(facts.services_detailed, null, 2)}
` : ""}
${hasFaq ? `ENRICHMENT_FAQ (real FAQ items from the operator's site — use verbatim, preserve answer content):
${JSON.stringify(facts.faq, null, 2)}
` : ""}
HARD RULES:
1. Output EXACTLY ONE JSON object. Nothing before the opening {, nothing after the closing }.
2. No markdown code fences. No triple-backticks. Raw JSON only.
3. Every CTA label, heading, and body copy MUST follow the archetype voice. NEVER use phrases from the "AVOID" list above.
4. NEVER invent business facts not present in the extracted data (phone, address, certifications, hours, services, etc.).
5. If you cannot confidently fill a required section, output a placeholder (e.g., empty testimonials array) rather than inventing data.
6. If you cannot proceed at all, output {"_error": "generation_failed"} and nothing else.
7. The JSON must be valid — no trailing commas, no comments, proper string escaping.
8. id fields (s1, s2, t1, t2, f1, f2, etc.) must be sequential strings starting from 1.`;
}

/**
 * Infers a rough vertical keyword from services + description.
 * Passed to classifyArchetype as the `vertical` parameter.
 * Simple keyword extraction — no external deps, no LLM call.
 */
export function inferVertical(
  services: string[],
  businessDescription: string,
): string {
  const combined = [...services, businessDescription].join(" ").toLowerCase();

  // Match against common verticals in order of specificity.
  const VERTICALS: [RegExp, string][] = [
    [/hvac|heating|cooling|air.?condition|furnace|ac\b/i, "hvac"],
    [/plumb|drain|pipe|sewer|water.?heater/i, "plumbing"],
    [/electric|wiring|panel|outlet/i, "electrician"],
    [/locksmith|lock|key|deadbolt/i, "locksmith"],
    [/roof|shingle|gutter|metal.?roof/i, "roofing"],
    [/dental|dentist|orthodont|endodont/i, "dental"],
    [/legal|attorney|law|lawyer/i, "legal"],
    [/medical|doctor|physician|clinic/i, "medical"],
    [/medspa|med.?spa|aesthetic|botox|filler/i, "medspa"],
    [/spa|wellness|massage|yoga|fitness|gym/i, "wellness"],
    [/clean|janitorial|maid|housekeep/i, "cleaning"],
    [/landscap|lawn|mow|irrigation|garden/i, "landscaping"],
    [/pest.?control|termite|exterminator/i, "pest control"],
    [/paint|painter|painting/i, "painting"],
    [/carpet|flooring|hardwood|tile/i, "flooring"],
    [/tow|roadside|vehicle|auto/i, "towing"],
    [/water.?damage|restoration|mold/i, "restoration"],
    [/agenc|marketing|seo|digital|brand/i, "agency"],
    [/consult|strateg|fractional|b2b/i, "consulting"],
    [/pet|dog|cat|groom|walk/i, "pet services"],
  ];

  for (const [pattern, vertical] of VERTICALS) {
    if (pattern.test(combined)) return vertical;
  }

  return "general service"; // safe fallback — classifyArchetype handles it
}

/** Re-export archetype data needed by the generator. */
export { ARCHETYPES };
