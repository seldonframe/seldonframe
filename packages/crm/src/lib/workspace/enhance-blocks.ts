// ============================================================================
// v1.38.0 — Auto-block-enhancement during create_full_workspace.
// ============================================================================
//
// THE REGRESSION THIS FIXES (root cause analysis, May 8, 2026):
// ---------------------------------------------------------------
// Pre-1.38.0, `create_full_workspace` produced workspaces whose landing page
// rendered via the BLUEPRINT path (lib/page-schema/seed-landing-from-soul →
// renderGeneralServiceV1 → contentHtml/contentCss). That path uses CANNED
// templates from `personality.content_templates.hero_headlines[0]` — generic
// "Welcome to X" copy, no Hormozi quantification, generic personality-bundle
// hero photo. Tirionforge HVAC happened to look great because Claude Code
// followed up with the BLOCK-AS-SKILL flow: get_block_skill({block:"hero"}) →
// agent generates Hormozi-quality JSON per blocks/hero/SKILL.md → persist_block
// writes Hormozi copy + per-business Unsplash. Same atomic create, very
// different output. Operators NEVER see this dance — they just see the page.
//
// v1.38.0 closes the gap by running a SINGLE Claude Opus 4.7 call inside
// createFullWorkspace itself. The MCP server stays a thin shim; the FAT SKILL
// is the SKILL.md files in src/blocks/*/SKILL.md (single source of truth, no
// duplication). One LLM call generates Hormozi-quality content for hero,
// servicesGrid, about, benefits, process, faq, cta — using the exact same
// SKILL.md instructions Claude Code would read via get_block_skill.
//
// SECONDARY EFFECT — motion turns on universally:
//   The route at /l/[orgSlug]/[slug] prefers contentHtml when present,
//   falling through to <PageRenderer sections={...}/> otherwise. PageRenderer
//   wraps every section in <RevealOnScroll> client component for scroll-
//   triggered fade-up. Pre-1.38.0 the contentHtml path always won → static
//   HTML, no motion. v1.38.0 writes sections JSONB and NULLs contentHtml so
//   the route falls through → React component tree → motion baked in.
//
// COST: ~$0.10 per workspace creation (one Opus call, ~6k tokens in /
// ~3k tokens out). Negligible relative to the operator-visible quality
// uplift. BYOK: getAIClient threads the operator's own Anthropic key when
// they've configured one via /settings/integrations; falls back to the
// platform key (ANTHROPIC_API_KEY env). Either way the cost flows to the
// operator who set up the workspace, not SF.
//
// SOFT-FAIL: every step is non-blocking. If Claude returns invalid JSON,
// if the API call 500s, if any section fails validation — we LOG and
// CONTINUE. The workspace stays valid (canned-copy Path A). Worst case the
// operator gets the pre-1.38.0 quality, never a broken workspace.

import Anthropic from "@anthropic-ai/sdk";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings, landingPages, organizations } from "@/db/schema";
import { getAIClient } from "@/lib/ai/client";
import {
  resolveGalleryImages,
  resolveHeroImage,
} from "@/lib/crm/personality-images";
import { searchPexelsVideo } from "@/lib/assets/pexels";
import { loadSkillMd } from "@/lib/page-blocks/skill-loader";
import {
  ARCHETYPES,
  classifyArchetype,
  type AestheticArchetype,
  type AestheticArchetypeId,
} from "./aesthetic-archetypes";
import { getBookingIntakeFieldsForArchetype } from "./booking-intake-fields";
import type { LandingPageSection } from "@/components/landing/sections/types";
import type { OrgTheme } from "@/lib/theme/types";

// ─── Public input + output ──────────────────────────────────────────────────

export interface EnhanceLandingInput {
  /** The just-created workspace's id. */
  orgId: string;
  /** Display name. Surfaced in nav, headlines, footer. */
  business_name: string;
  city: string;
  state: string;
  phone: string;
  /** 5-12 service strings; classifier reads these for vocabulary. */
  services: string[];
  business_description: string;
  /** Maps-extracted proof metrics — power the trust strip + hero proof. */
  review_count?: number | null;
  review_rating?: number | null;
  certifications?: string[] | null;
  trust_signals?: string[] | null;
  emergency_service?: boolean | null;
  same_day?: boolean | null;
  service_area?: string[] | null;
  /** v1.37.0 — Maps-extracted weekly hours, canonical full-name shape. */
  weekly_hours?: Partial<Record<
    "sunday" | "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday",
    { enabled: boolean; start: string; end: string }
  >> | null;
  /** v1.38.3 — operator-supplied testimonials extracted by Claude Code
   *  from a Google Maps paste's review excerpts. We render them
   *  VERBATIM — never let the LLM rewrite quotes. When absent, the
   *  testimonials section is OMITTED from the page rather than
   *  fabricated. */
  testimonials?: Array<{
    quote: string;
    name?: string | null;
    role?: string | null;
    company?: string | null;
    rating?: number | null;
  }> | null;
  /** v1.40.0 — operator-supplied personality vertical (e.g. "roofing",
   *  "dental"). Used for archetype classification. When absent,
   *  classifier falls back to keyword detection over services + description. */
  personality_vertical?: string | null;
}

export type EnhanceLandingResult =
  | { ok: true; sections_count: number; model: string; archetype: AestheticArchetypeId }
  | { ok: false; reason: string; detail?: string };

// ─── Block selection + model defaults ───────────────────────────────────────

// Blocks we ask Claude to generate copy for. Order matters — the prompt
// composes them in this sequence; the on-page section order is set
// independently in payloadToSections() below.
const ENHANCE_BLOCKS = ["hero", "services", "about", "faq", "cta"] as const;

// v1.42.0 — parallel-enhance feature flag.
//
// When true (the new default), enhanceLandingForWorkspace fans out to 8
// per-section Opus calls via Promise.allSettled instead of one monolithic
// call returning a 9-key JSON. Total wall-clock drops ~60-90s → ~10-15s
// because token generation is sequential within a single call; spreading
// the output across 8 short parallel calls beats one long sequential
// call even on the same model.
//
// Same Opus 4.7 used for every parallel call — no model-tier mapping
// (operator BYOK pays, cost isn't ours). To roll back to the monolithic
// path in an emergency: set SF_PARALLEL_ENHANCE=false in env.
//
// Coherence is preserved by shared inputs: every parallel call receives
// the same business context + archetype design brief + section-specific
// SKILL.md. Hormozi-style copy is independent-by-section anyway (FAQ
// doesn't quote hero; services don't reference about), so cross-section
// LLM visibility isn't load-bearing.
function isParallelEnhanceEnabled(): boolean {
  const v = process.env.SF_PARALLEL_ENHANCE?.trim().toLowerCase();
  // Default true. Only explicit "false" / "0" disables.
  return v !== "false" && v !== "0";
}

// Latest Opus snapshot known to the codebase (matches personality-generator.ts
// + puck/generate-with-claude.ts). Override via env for hot-swapping when a
// newer Opus ships without redeploying.
const DEFAULT_PRIMARY_MODEL = "claude-opus-4-7";
const DEFAULT_FALLBACK_MODEL = "claude-sonnet-4-5-20250929";

function primaryModel(): string {
  return process.env.SF_ENHANCE_BLOCKS_MODEL?.trim() || DEFAULT_PRIMARY_MODEL;
}
function fallbackModel(): string {
  return process.env.SF_ENHANCE_BLOCKS_MODEL_FALLBACK?.trim() || DEFAULT_FALLBACK_MODEL;
}

// ─── SKILL.md loading + prompt assembly ─────────────────────────────────────

async function loadAllSkills(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const name of ENHANCE_BLOCKS) {
    const md = await loadSkillMd(name);
    if (md) {
      // Strip YAML frontmatter — the LLM doesn't need the schema, just the
      // instructional body. Frontmatter starts with --- and ends with ---.
      const body = md.replace(/^---\n[\s\S]*?\n---\n+/, "");
      out[name] = body.trim();
    }
  }
  return out;
}

function formatWeeklyHours(
  hours: EnhanceLandingInput["weekly_hours"],
): string | null {
  if (!hours) return null;
  const parts = Object.entries(hours)
    .filter(([, v]) => v && v.enabled)
    .map(([day, v]) => `${day} ${v!.start}-${v!.end}`);
  return parts.length > 0 ? parts.join(", ") : null;
}

function buildBusinessContext(input: EnhanceLandingInput): string {
  const lines: string[] = [
    `- Business name: ${input.business_name}`,
    `- Location: ${input.city}, ${input.state}`,
    `- Phone: ${input.phone}`,
    `- Services offered: ${input.services.join(", ")}`,
    `- Description: ${input.business_description}`,
  ];
  if (typeof input.review_count === "number") {
    lines.push(`- Reviews: ${input.review_count.toLocaleString()} reviews on Google`);
  }
  if (typeof input.review_rating === "number") {
    lines.push(`- Average rating: ${input.review_rating.toFixed(1)} stars`);
  }
  if (input.certifications && input.certifications.length > 0) {
    lines.push(`- Certifications: ${input.certifications.join(", ")}`);
  }
  if (input.trust_signals && input.trust_signals.length > 0) {
    lines.push(`- Trust signals: ${input.trust_signals.join(", ")}`);
  }
  if (input.emergency_service) {
    lines.push(`- Emergency service: yes — open 24/7 for urgent calls`);
  }
  if (input.same_day) {
    lines.push(`- Same-day service: yes`);
  }
  if (input.service_area && input.service_area.length > 0) {
    lines.push(`- Service area: ${input.service_area.join(", ")}`);
  }
  const hours = formatWeeklyHours(input.weekly_hours);
  if (hours) lines.push(`- Weekly hours: ${hours}`);
  return lines.join("\n");
}

// v1.40.0 — render the chosen archetype's design constraints as a
// markdown brief the LLM consumes as system context. This is the
// "design.md" Trevor Foyer's Stitch workflow generates manually; we
// generate it server-side from the archetype registry + business
// signals so every section flows from one design system instead of
// drifting to LLM defaults section-by-section.
function renderArchetypeBrief(archetype: AestheticArchetype): string {
  return `# DESIGN BRIEF — Archetype: ${archetype.label}

This workspace is classified as **${archetype.id}**. Every word and
section you generate must conform to this brief.

## Why this archetype
${archetype.fits}

## Voice
- Tone: ${archetype.voice.tone}
- Pace: ${archetype.voice.pace}
- LEAN INTO these phrases / cadences when natural: ${archetype.voice.leanInto.join(", ")}
- AVOID these words/phrases entirely: ${archetype.voice.avoid.join(", ")}

## Visual language (informs your copy choices)
- Primary color: ${archetype.palette.primary}
- Secondary color: ${archetype.palette.secondary}
- Background: ${archetype.palette.background}
- Headline font: ${archetype.fonts.headline}
- Body font: ${archetype.fonts.body}
- Hero variant: ${archetype.heroVariant} (the renderer enforces this layout — do not propose centered hero copy)

## Design dials (1-10)
- DESIGN_VARIANCE: ${archetype.dials.designVariance} (higher = more asymmetric, more whitespace, less symmetrical)
- MOTION_INTENSITY: ${archetype.dials.motionIntensity}
- VISUAL_DENSITY: ${archetype.dials.visualDensity}

## Tokens BANNED for this workspace specifically
${archetype.bannedHere.map((b) => `- ${b}`).join("\n")}

## Universal taste-skill rules (apply to EVERY workspace, not just this one)
- NO Inter font ANYWHERE — use ${archetype.fonts.headline} / ${archetype.fonts.body} only
- NO centered hero (DESIGN_VARIANCE > 4)
- NO "3 equal cards horizontally" feature rows — when generating servicesGrid or benefits, the renderer will use an asymmetric / bento / numbered variant; do NOT propose 3 identical cards
- NO oversized H1s that scream — first heading should be confident, not loud
- NO pure black (#000000) — palette uses near-black like ${archetype.palette.text}
- NO "AI purple/blue" — that aesthetic is banned
- Max 1 accent color, saturation < 80%
- NO generic startup names (Acme, Nexus, SmartFlow), NO fake numbers (99.99%, 10x), NO emojis in code/copy
- Animate only via transform + opacity (renderer enforces; copy doesn't need to know)

## Output discipline
- Headlines convey VALUE STANDALONE — assume body text is never read.
  Bad: "About Us" / "Our Services" / "Why Choose Us"
  Good: "Restored 7,400 Round Rock Roofs Since 2014 — Most Insurance Approved"
- "So that" principle in headlines — chain the dream outcome:
  "Free roof inspection so that you know exactly what State Farm will cover"
- Specific time numbers when soul provides them: "in 5 days", "within 24 hours", "by 6 PM today"
- Effort-reduction subheads with "without/we handle" qualifiers:
  "We handle the insurance paperwork — most clients never speak to their adjuster directly"
`;
}

function buildPrompt(
  skills: Record<string, string>,
  input: EnhanceLandingInput,
  archetype: AestheticArchetype,
): string {
  return `You are generating landing-page block content for a real small-business website. The output goes DIRECTLY to a published landing page — there is no human editor between you and the visitor. Treat every word as production copy.

OUTPUT: ONE JSON object, no prose, no markdown fences. The exact shape is below; every key required unless marked optional.

${renderArchetypeBrief(archetype)}

# HORMOZI VALUE EQUATION (the conversion framework you must apply throughout)

Every section you generate must serve one or more of these:

1. **Dream outcome** — say what the customer GETS, not what you do. Use "so that" chaining.
2. **Perceived likelihood of success** — proof, ratings, license #s, real testimonials, specific local numbers.
3. **Time delay** — minimize: "in 5 days", "by 6 PM", "same-day estimates", "first quote in 24 hours".
4. **Effort & sacrifice** — minimize: "we handle the paperwork", "without insurance hassles", "no obligation".

The first section above the fold (hero) carries 80-90% of conversion weight. Pour your best copy there. The headline alone, with no other context, must convey THE dream outcome + the time component. Below-the-fold sections support and expand; they don't have to do all the work.

# Business Context

${buildBusinessContext(input)}

# Required output shape

\`\`\`json
{
  "hero": {
    "kicker": "<2-5 word eyebrow above the headline; OPTIONAL — omit by setting to empty string if no genuine angle>",
    "headline": "<the single most important sentence on the page; 4-12 words; MUST contain quantification (number / star rating / 'free' / 'guaranteed' / 'same-day' / 'today' / 'instantly' / proximity word)>",
    "subheadline": "<8-30 words; one sentence; MUST mention the business name OR the city/neighborhood; supporting proof>",
    "ctaText": "<2-4 words, action verb (e.g. 'Get Service Today', 'Book Appointment', 'Schedule a Visit')>",
    "ctaLink": "/book",
    "secondaryCta": { "text": "<optional verb action>", "link": "/intake or tel:<phone digits>" },
    "heroImage_query": "<3-6 word Unsplash query for the HERO photo. ARCHETYPE-AWARE — see archetype hints in the design brief above. UNIVERSAL RULES: MUST contain a concrete physical noun matching the archetype (a tool, a setting, a worker, a treatment, a material — NEVER just a vertical name); MUST NOT lead with a city name (city returns scenery); SHOULD include a composition hint ('close-up', 'on', 'detail of', 'interior', 'hands'). PER-ARCHETYPE GOOD EXAMPLES: bold-urgency (trades) → 'asphalt shingle roof close-up', 'roofer installing metal standing seam', 'plumber repairing copper pipes', 'hvac technician outdoor unit residential'. cinematic-aspirational (medspa/wellness/luxury) → 'minimalist spa treatment room interior', 'dermatology consultation room calm', 'serene aesthetic clinic marble', 'skincare products marble flatlay', 'modern medspa interior soft light'. clinical-trust (legal/dental/medical) → 'modern dental clinic interior bright', 'attorney consultation room', 'professional office handshake', 'medical exam room minimalist'. editorial-warm (craft/family) → 'craftsman hands wood detail', 'family business storefront', 'workshop natural light tools', 'restoration project before after'. soft-residential (cleaning/landscape) → 'tidy living room natural light', 'manicured residential lawn', 'home interior clean kitchen', 'gardener residential garden tools'. technical-restrained (B2B/agency) → 'modern office workspace minimalist', 'designer at desk monochrome', 'product strategy whiteboard'. brutalist (creative studios) → 'concrete loft natural light', 'design studio raw interior', 'industrial warehouse skylight'. AVOID 'austin roofing', 'phoenix hvac', 'houston medspa' — these return city scenery>",
    "heroVideo_query": "<v1.41.0 — OPTIONAL 2-5 word Pexels VIDEO search query used ONLY when the archetype is cinematic-aspirational or technical-restrained (which renders the cinematic-aura hero variant — a looping background MP4). Pick motion-rich, niche-matched footage that conveys the operator's outcome, NOT a literal vertical photo. cinematic-aspirational examples: 'sunset beach running' for a fitness coach, 'phone scrolling social media' for an X-growth coach, 'spa water reflection slow' for a medspa, 'yoga sunrise studio' for a wellness studio. technical-restrained (agency) examples: 'abstract design motion graphics', 'team office collaboration cinematic', 'macbook typing close up', 'neon city night drive'. Omit this field for other archetypes; the cinematic-aura variant is not used there.>",
    "shinyWord": "<v1.41.0 — OPTIONAL single word from the headline that gets the gradient-shiny italic treatment in the cinematic-aura variant. Pick the emphatic outcome word: the noun the visitor wants ('Pipeline', 'Empire', 'Future', 'Sold', 'Booked', 'Income', 'Calls', 'Leads'). Must appear verbatim in the headline (case-insensitive). Omit for non-cinematic archetypes.>"
  },
  "servicesGrid": {
    "headline": "<value-driven headline for services section; speak to outcome not features>",
    "subheadline": "<optional 1-line subhead; can be empty string>",
    "services": [
      { "name": "<service name verbatim from input>", "description": "<1 sentence — what the customer gets, not what we do>", "price": "<'from $X' or specific dollar; if unknown say 'Quote on request'>", "duration": "<optional 'X min' / '1-2 hours'>", "icon": "<one lucide icon name OR alias that fits THIS specific service — see icon hints below>", "ctaText": "Book", "ctaLink": "/book" }
    ]
  },
  "projectGallery": {
    "headline": "<headline for the gallery — e.g. 'Recent work', 'Jobs done right', 'See our craftsmanship'>",
    "subheadline": "<optional 1-line subhead about the work shown>",
    "queries": ["<2-5 word Unsplash query for service 1, vertical-specific>", "<query for service 2>", "<query 3>", "<query 4>", "<query 5>", "<query 6>"]
  },
  "about": {
    "headline": "<personal headline about THIS business — not a generic 'About Us'>",
    "body": "<2-3 sentences. Who you are, what you stand for, why customers choose you. NEVER lead with 'Welcome' or 'Founded in'. Lead with a concrete fact or claim.>"
  },
  "benefits": {
    "headline": "<headline for differentiators section>",
    "benefits": [
      { "icon": "<lucide name OR vertical-alias picked to fit the SPECIFIC benefit; see icon hints further down — required, must be DISTINCT across the 3 benefits>", "title": "<3-5 words>", "description": "<1 sentence>" }
    ]
  },
  "process": {
    "headline": "<headline for the 3-step process>",
    "steps": [
      { "number": 1, "title": "<verb-led step name e.g. 'Book Online'>", "description": "<1 sentence>" },
      { "number": 2, "title": "<step name>", "description": "<1 sentence>" },
      { "number": 3, "title": "<step name>", "description": "<1 sentence>" }
    ]
  },
  "faq": {
    "headline": "<FAQ headline; can be 'Frequently Asked Questions' OR something more specific>",
    "faqs": [
      { "question": "<a real customer concern; not a softball>", "answer": "<honest, specific, helpful answer>" }
    ]
  },
  "cta": {
    "headline": "<final convert-now headline; create urgency without lying>",
    "body": "<one supporting sentence — what happens when they click>",
    "ctaText": "<verb action>",
    "ctaLink": "/book"
  }
}
\`\`\`

# Block-specific instructions (read these carefully — they encode our quality bar)

## hero

${skills.hero ?? "(skill missing — use the JSON shape above with quantified, business-specific copy)"}

## services / servicesGrid

${skills.services ?? "(skill missing — use the JSON shape above with one entry per service from the business context)"}

## about

${skills.about ?? "(skill missing — write a personal, factual 2-3 sentence about section)"}

## faq

${skills.faq ?? "(skill missing — generate 4-6 questions a real customer would ask)"}

## cta

${skills.cta ?? "(skill missing — write one urgent-but-honest final CTA)"}

# Voice rules (non-negotiable)

1. Write for THIS business, not the vertical. "Plumbing services" is generic; "Family-owned plumbing in Arlington since 2009" is for a specific shop.
2. Lead with quantification when possible — numbers, ratings, timeframes, "free", "guaranteed", "same-day". If you have NO numbers, anchor on proximity or tenure.
3. Skip throat-clearing. Never start with "Welcome to", "Premier", "The leading", "Your trusted", "Professional X services". These are filler.
4. Match the vertical's natural voice: HVAC = urgent + reliable, legal = calm authority, coaching = outcome-driven, dental = warm + clean, plumbing = no-nonsense + reassuring.
5. CTAs are verbs: "Book Service", "Get a Quote", "Schedule a Visit". Never "Learn More", "Click Here", "Get Started".
6. NEVER include the strings "SeldonFrame", "AI-native", "Business OS", "Replace 5 Tools" or any internal-platform marketing.

# Service count

Generate exactly ${Math.min(input.services.length, 6)} services in servicesGrid.services — one per service in the business context, in the order given. Do NOT invent services that aren't in the input.

# Per-service icons (NEW v1.38.5 — required field)

Each service MUST have a distinct \`icon\` value. Pick the lucide name OR vertical-alias that BEST matches that specific service — DO NOT use the same icon twice in the same workspace. Available names:
- General: shield, shield-check, badge-check, clock, star, award, sparkles, thumbs-up, heart, zap, hammer, wrench, hard-hat, droplets, wind, cloud-rain, cloud-rain-wind, cloud-snow, leaf, home, house-plug, scissors, stethoscope, truck, phone, map-pin, dollar-sign
- Roofing aliases: storm → cloud-rain-wind, shingle → home, metal → shield, gutter → droplets, tarp → shield, inspection → shield-check, hail → cloud-rain-wind
- Plumbing aliases: drain → droplets, leak → droplets, heater → zap, pipe → wrench
- HVAC aliases: cooling → wind, heating → zap, ductwork → home, thermostat → home
- General trades aliases: emergency → zap, repair → wrench, install → hammer, installation → hammer, warranty → badge-check, estimate → dollar-sign, quote → dollar-sign, free → dollar-sign, sameday → clock
- Service categories: cleaning → sparkles, treatment → leaf, dental → stethoscope

Pick whatever READS most concretely as that service. "Storm damage repair" → "cloud-rain-wind" or "storm". "Shingle replacement" → "home" or "shingle". "Gutter repair" → "droplets" or "gutter". "Free roof inspection" → "shield-check" or "inspection". The renderer normalizes and resolves.

# Gallery queries (CRITICAL — read all rules)

Generate 6 Unsplash search queries in projectGallery.queries. Each query becomes one square photo in a 6-photo masonry grid showing "Recent Work". RULES:

1. EACH query MUST contain a craft-specific physical noun (shingle / roof / pipe / drain / hvac unit / shingle replacement / etc.) — NOT just a vertical name.
2. NO city names in queries — they make Unsplash return scenery instead of work photos.
3. Bias for VARIETY — the 6 queries should each return visibly different photos (a roof close-up, a worker on a job, a tool detail, a finished install, etc.). DO NOT repeat the same noun across all 6.
4. INCLUDE "residential" if the business is residential-focused (most local-service businesses are). It dramatically improves photo quality vs commercial/stock.
5. Each query 3-6 words.

GOOD examples (roofing, residential):
["asphalt shingle roof close-up", "roofer installing shingles residential", "metal standing seam roof house", "seamless gutter installation residential", "skylight on residential roof", "storm-damaged shingles close-up"]

BAD examples (return scenery / random objects):
["austin roofing"] (city name → city scenery)
["roofing"] (too generic, returns logos/clip art)
["roof"] (could return random roof types — barns, churches)
["storm"] (returns weather photos, not roofing work)

GOOD examples (plumbing, residential):
["plumber repairing kitchen sink", "copper pipes installation residential", "drain cleaning equipment basement", "water heater install residential", "leaking pipe under sink close-up", "plumber working on toilet residential"]

GOOD examples (HVAC, residential):
["hvac technician on outdoor unit", "residential air conditioner install", "ductwork in residential attic", "thermostat installation hand close-up", "furnace residential basement", "hvac service van residential driveway"]

# FAQ count

Generate 4-6 FAQ entries in faq.faqs. Cover the top customer concerns: pricing/quotes, availability/timing, qualifications/licensing, what to expect on the visit, payment.

# Benefits count

Generate exactly 3 benefit entries in benefits.benefits. Each MUST have a DISTINCT \`icon\` value (do not repeat across the 3 cards). Pick whichever lucide name OR alias from the per-service hints above best matches that specific benefit. Common benefit-flavored picks: trust → shield-check, licensed → badge-check, insured → shield, family-owned → heart, local → map-pin, experienced → award, fast/same-day → clock or zap, free-estimates → dollar-sign, warranty → badge-check, 5-star → star.

# Output

Respond with ONLY the JSON object — no prose before or after, no markdown fences. Start with \`{\` and end with \`}\`.`;
}

// ─── v1.42.0 — Parallel per-section orchestration ───────────────────────────

// The 8 sections we fan out to LLM calls. Mechanical sections (navbar,
// footer, emergencyStrip, serviceArea, testimonials, stickyMobileCTA) are
// composed from input in payloadToSections() and need no LLM call.
const SECTIONS_TO_GENERATE = [
  "hero",
  "servicesGrid",
  "projectGallery",
  "about",
  "benefits",
  "process",
  "faq",
  "cta",
] as const;
type SectionName = (typeof SECTIONS_TO_GENERATE)[number];

// SKILL.md key per section. Some sections (projectGallery, benefits,
// process) have no SKILL.md — their rules are inlined into the section
// spec. The orchestrator handles missing skills gracefully.
const SECTION_SKILL_KEY: Record<SectionName, string | null> = {
  hero: "hero",
  servicesGrid: "services",
  projectGallery: null,
  about: "about",
  benefits: null,
  process: null,
  faq: "faq",
  cta: "cta",
};

// Static boilerplate shared across every section call. Same bytes for
// every workspace + every section → fully cacheable via Anthropic's
// prompt cache (ephemeral, 5-min TTL). The variable parts (archetype
// brief, section spec, business context) live in separate cache blocks
// or in the uncached user message.
const STATIC_PREAMBLE = `You are generating landing-page block content for a real small-business website. The output goes DIRECTLY to a published landing page — there is no human editor between you and the visitor. Treat every word as production copy.

OUTPUT: ONE JSON object, no prose, no markdown fences. Start with \`{\` and end with \`}\`.

# HORMOZI VALUE EQUATION (the conversion framework you must apply throughout)

Every section you generate must serve one or more of these:

1. **Dream outcome** — say what the customer GETS, not what you do. Use "so that" chaining.
2. **Perceived likelihood of success** — proof, ratings, license #s, real testimonials, specific local numbers.
3. **Time delay** — minimize: "in 5 days", "by 6 PM", "same-day estimates", "first quote in 24 hours".
4. **Effort & sacrifice** — minimize: "we handle the paperwork", "without insurance hassles", "no obligation".

The first section above the fold (hero) carries 80-90% of conversion weight. Pour your best copy there. The headline alone, with no other context, must convey THE dream outcome + the time component. Below-the-fold sections support and expand; they don't have to do all the work.

# Voice rules (non-negotiable)

1. Write for THIS business, not the vertical. "Plumbing services" is generic; "Family-owned plumbing in Arlington since 2009" is for a specific shop.
2. Lead with quantification when possible — numbers, ratings, timeframes, "free", "guaranteed", "same-day". If you have NO numbers, anchor on proximity or tenure.
3. Skip throat-clearing. Never start with "Welcome to", "Premier", "The leading", "Your trusted", "Professional X services". These are filler.
4. Match the vertical's natural voice: HVAC = urgent + reliable, legal = calm authority, coaching = outcome-driven, dental = warm + clean, plumbing = no-nonsense + reassuring.
5. CTAs are verbs: "Book Service", "Get a Quote", "Schedule a Visit". Never "Learn More", "Click Here", "Get Started".
6. NEVER include the strings "SeldonFrame", "AI-native", "Business OS", "Replace 5 Tools" or any internal-platform marketing.

# Lucide icon names available (use whichever fits best for any \`icon\` field)

shield, shield-check, badge-check, clock, star, award, sparkles, thumbs-up, heart, zap, hammer, wrench, hard-hat, droplets, wind, cloud-rain, cloud-rain-wind, cloud-snow, leaf, home, house-plug, scissors, stethoscope, truck, phone, map-pin, dollar-sign

Vertical aliases that map to lucide names:
- Roofing: storm → cloud-rain-wind, shingle → home, metal → shield, gutter → droplets, tarp → shield, inspection → shield-check, hail → cloud-rain-wind
- Plumbing: drain → droplets, leak → droplets, heater → zap, pipe → wrench
- HVAC: cooling → wind, heating → zap, ductwork → home, thermostat → home
- General trades: emergency → zap, repair → wrench, install → hammer, warranty → badge-check, estimate → dollar-sign, quote → dollar-sign, free → dollar-sign, sameday → clock
- Service categories: cleaning → sparkles, treatment → leaf, dental → stethoscope`;

// Per-section JSON output specs. These are the lifted-out slices of the
// monolithic prompt's "Required output shape" — each section call asks
// Opus for just ONE key, so we send just the matching spec.
function getSectionSpec(name: SectionName, input: EnhanceLandingInput): string {
  switch (name) {
    case "hero":
      return `# Section: hero

Return ONE JSON object matching this exact shape:

\`\`\`json
{
  "kicker": "<2-5 word eyebrow above the headline; OPTIONAL — empty string if no genuine angle>",
  "headline": "<the single most important sentence on the page; 4-12 words; MUST contain quantification (number / star rating / 'free' / 'guaranteed' / 'same-day' / 'today' / 'instantly' / proximity word)>",
  "subheadline": "<8-30 words; one sentence; MUST mention the business name OR the city/neighborhood; supporting proof>",
  "ctaText": "<2-4 words, action verb (e.g. 'Get Service Today', 'Book Appointment', 'Schedule a Visit')>",
  "ctaLink": "/book",
  "secondaryCta": { "text": "<optional verb action>", "link": "/intake or tel:<phone digits>" },
  "heroImage_query": "<3-6 word Unsplash query for the HERO photo. ARCHETYPE-AWARE — see archetype hints in the design brief above. UNIVERSAL RULES: MUST contain a concrete physical noun (a tool, a setting, a worker, a treatment, a material — NEVER just a vertical name); MUST NOT lead with a city name; SHOULD include a composition hint ('close-up', 'on', 'detail of', 'interior', 'hands'). Examples by archetype — bold-urgency: 'roofer installing metal standing seam' / 'hvac technician outdoor unit residential'. cinematic-aspirational: 'minimalist spa treatment room interior' / 'modern medspa interior soft light'. clinical-trust: 'modern dental clinic interior bright' / 'attorney consultation room'. editorial-warm: 'craftsman hands wood detail' / 'workshop natural light tools'. soft-residential: 'tidy living room natural light' / 'manicured residential lawn'. technical-restrained: 'modern office workspace minimalist' / 'designer at desk monochrome'. brutalist: 'concrete loft natural light'. AVOID 'austin roofing', 'phoenix hvac' — city names return scenery.>",
  "heroVideo_query": "<2-5 word Pexels VIDEO search query — REQUIRED when template is cinematic-aura, velorah-editorial, or securify-bold (those templates render a looping background MP4). Pick motion-rich, niche-matched footage that conveys the operator's outcome, NOT a literal vertical photo. Examples: 'sunset beach running' for a fitness coach, 'phone scrolling social media' for an X-growth coach, 'spa water reflection slow' for a medspa, 'abstract design motion graphics' for an agency, 'code on screen close up' for a dev tool, 'data center server racks' for security infra. Omit for light templates (viktor-light, nexora-light, stellar-tabs-white) — they don't render a background video.>",
  "shinyWord": "<v1.41.0 — OPTIONAL single word from the headline that gets template-specific emphasis. cinematic-aura: cyan-gradient shimmer. viktor-light / velorah-editorial / nexora-light: serif italic in a muted color. stellar-tabs-white: split point for the dark-to-gray gradient on line 2. securify-bold: ignored. Pick the emphatic word — outcome noun ('Pipeline', 'Empire', 'Sold'), differentiator adjective ('Smarter', 'Quieter'), or verb ('Closes', 'Earns'). Must appear verbatim in the headline (case-insensitive).>",
  "template": "<v1.43.0 — REQUIRED — pick ONE template id from the catalog below based on archetype + business signals. The template controls the entire visual look of the hero. Picking the right template matters more than perfect copy.>"
}
\`\`\`

# TEMPLATE CATALOG — pick ONE for the \`template\` field

- **cinematic-aura** — DARK + looping Pexels video + Instrument Serif italic + cyan-gradient shimmery word. For: luxe coaching, medspa, wellness, fitness, premium salons, lifestyle. Sensory + aspirational.
- **velorah-editorial** — DARK + looping Pexels video + deep-navy wash + serif italic emphasis (softer than cinematic-aura, no gradient). For: luxe service businesses, premium coaches, creative studios that want cinematic motion without SaaS-shiny treatment.
- **viktor-light** — WHITE + Instrument Serif italic accents + narrow centered column + NO video. For: solo coaches, indie founders, freelance creatives, boutique agencies. Light editorial restraint.
- **nexora-light** — WHITE + Instrument Serif italic emphasis + custom CRM+booking dashboard mockup embedded below CTA. For: B2B SaaS founders, productivity tools, agencies that run client back-office. NO background video. The dashboard mockup IS the visual.
- **securify-bold** — PURE BLACK + looping Pexels video + HUGE staggered typography (3 chunks at corners-and-center) + stat blocks in corners. For: dev tools, data security, AI infra, hard-tech SaaS. Confidence + scale + no warmth.
- **stellar-tabs-white** — WHITE + dark-to-gray gradient on headline line 2 + 4-tab cycling product preview (Intake/Schedule/Convert/Deliver). For: AI workspace platforms, multi-feature SaaS, productivity suites. NO background video.

## Archetype → template guidance (LLM has final say)

- cinematic-aspirational → cinematic-aura (default) OR velorah-editorial (if editorial > sensory)
- technical-restrained → viktor-light (default for coach/agency) OR nexora-light (if SaaS founder) OR stellar-tabs-white (if multi-feature AI tool) OR securify-bold (if dev/security tools)
- editorial-warm → viktor-light
- clinical-trust → nexora-light
- soft-residential → viktor-light
- bold-urgency → set template to empty string "" — tradesmen use the legacy split-screen-50-50 variant; no template fits them yet
- brutalist → securify-bold

**Tie-break rule:** when unsure between two templates, pick LIGHTER for B2B/agency/coach workspaces and DARKER for lifestyle/luxe.`;

    case "servicesGrid": {
      const n = Math.min(input.services.length, 6);
      return `# Section: servicesGrid

Return ONE JSON object with exactly ${n} services — one per service in the business context, IN THE ORDER GIVEN. Do NOT invent services that aren't in the input.

\`\`\`json
{
  "headline": "<value-driven headline for services section; speak to outcome not features>",
  "subheadline": "<optional 1-line subhead; can be empty string>",
  "services": [
    {
      "name": "<service name verbatim from business context>",
      "description": "<1 sentence — what the customer GETS, not what we do>",
      "price": "<'from $X' or specific dollar; if unknown say 'Quote on request'>",
      "duration": "<optional 'X min' / '1-2 hours'; empty string if unknown>",
      "icon": "<one lucide icon name OR vertical-alias picked to fit THIS specific service — must be DISTINCT across all services>",
      "ctaText": "Book",
      "ctaLink": "/book"
    }
  ]
}
\`\`\`

Icon picking — examples for inspiration: "Storm damage repair" → "cloud-rain-wind", "Shingle replacement" → "home", "Gutter repair" → "droplets", "Free roof inspection" → "shield-check", "Water heater install" → "zap", "Same-day service" → "clock". Pick whatever READS most concretely as that service.`;
    }

    case "projectGallery":
      return `# Section: projectGallery

Return ONE JSON object with EXACTLY 6 Unsplash search queries. Each query becomes one square photo in a 6-photo masonry grid showing "Recent Work".

\`\`\`json
{
  "headline": "<headline e.g. 'Recent work', 'Jobs done right', 'See our craftsmanship'>",
  "subheadline": "<optional 1-line subhead; can be empty string>",
  "queries": ["<query 1>", "<query 2>", "<query 3>", "<query 4>", "<query 5>", "<query 6>"]
}
\`\`\`

# Gallery query rules (CRITICAL — read all)

1. EACH query MUST contain a craft-specific physical noun (shingle / roof / pipe / drain / hvac unit / shingle replacement / etc.) — NOT just a vertical name.
2. NO city names in queries — they make Unsplash return scenery instead of work photos.
3. Bias for VARIETY — the 6 queries should each return visibly different photos (a roof close-up, a worker on a job, a tool detail, a finished install, etc.). DO NOT repeat the same noun across all 6.
4. INCLUDE "residential" if the business is residential-focused (most local-service businesses are). It dramatically improves photo quality vs commercial/stock.
5. Each query 3-6 words.

GOOD (roofing, residential): ["asphalt shingle roof close-up", "roofer installing shingles residential", "metal standing seam roof house", "seamless gutter installation residential", "skylight on residential roof", "storm-damaged shingles close-up"]
GOOD (plumbing): ["plumber repairing kitchen sink", "copper pipes installation residential", "drain cleaning equipment basement", "water heater install residential", "leaking pipe under sink close-up", "plumber working on toilet residential"]
GOOD (HVAC): ["hvac technician on outdoor unit", "residential air conditioner install", "ductwork in residential attic", "thermostat installation hand close-up", "furnace residential basement", "hvac service van residential driveway"]
BAD: ["austin roofing"] (city → scenery), ["roofing"] (too generic), ["storm"] (returns weather).`;

    case "about":
      return `# Section: about

Return ONE JSON object:

\`\`\`json
{
  "headline": "<personal headline about THIS business — NOT a generic 'About Us'>",
  "body": "<2-3 sentences. Who you are, what you stand for, why customers choose you. NEVER lead with 'Welcome' or 'Founded in'. Lead with a concrete fact or claim.>"
}
\`\`\``;

    case "benefits":
      return `# Section: benefits

Return ONE JSON object with EXACTLY 3 differentiator entries, each with a DISTINCT \`icon\` (do not repeat across the 3 cards).

\`\`\`json
{
  "headline": "<headline for differentiators section>",
  "benefits": [
    { "icon": "<lucide name OR alias picked to fit the SPECIFIC benefit — distinct across all 3>", "title": "<3-5 words>", "description": "<1 sentence>" }
  ]
}
\`\`\`

Common benefit-flavored icon picks: trust → shield-check, licensed → badge-check, insured → shield, family-owned → heart, local → map-pin, experienced → award, fast/same-day → clock or zap, free-estimates → dollar-sign, warranty → badge-check, 5-star → star.`;

    case "process":
      return `# Section: process

Return ONE JSON object with EXACTLY 3 sequential steps showing what happens after the customer books:

\`\`\`json
{
  "headline": "<headline for the 3-step process>",
  "steps": [
    { "number": 1, "title": "<verb-led step name e.g. 'Book Online'>", "description": "<1 sentence>" },
    { "number": 2, "title": "<verb-led step name>", "description": "<1 sentence>" },
    { "number": 3, "title": "<verb-led step name>", "description": "<1 sentence>" }
  ]
}
\`\`\``;

    case "faq":
      return `# Section: faq

Return ONE JSON object with 4-6 honest FAQ entries. Cover the top customer concerns: pricing/quotes, availability/timing, qualifications/licensing, what to expect on the visit, payment.

\`\`\`json
{
  "headline": "<FAQ headline; can be 'Frequently Asked Questions' OR something more specific>",
  "faqs": [
    { "question": "<a real customer concern; not a softball>", "answer": "<honest, specific, helpful answer>" }
  ]
}
\`\`\``;

    case "cta":
      return `# Section: cta

Return ONE JSON object for the final convert-now block at the bottom of the page:

\`\`\`json
{
  "headline": "<final convert-now headline; create urgency without lying>",
  "body": "<one supporting sentence — what happens when they click>",
  "ctaText": "<verb action>",
  "ctaLink": "/book"
}
\`\`\``;
  }
}

// Build the per-section system instructions. Combined with the static
// preamble and archetype brief in three cache_control breakpoints, the
// per-section block is the smallest cacheable piece that varies.
function buildSectionInstructions(
  name: SectionName,
  skillMd: string | null,
  input: EnhanceLandingInput,
): string {
  const spec = getSectionSpec(name, input);
  if (skillMd) {
    return `${spec}\n\n# Section-specific rules (read carefully — they encode our quality bar)\n\n${skillMd}`;
  }
  return spec;
}

// Single per-section Opus call. Three cache_control breakpoints:
//   1. STATIC_PREAMBLE (boilerplate, workspace-agnostic)
//   2. renderArchetypeBrief (changes per archetype but stable for ~5 min)
//   3. section instructions (SKILL.md + JSON spec, stable forever per section)
// Business context goes in the uncached user message.
async function enhanceSection(
  client: Anthropic,
  name: SectionName,
  input: EnhanceLandingInput,
  archetype: AestheticArchetype,
  skillMd: string | null,
  model: string,
): Promise<{ name: SectionName; payload: Record<string, unknown> | null }> {
  try {
    const response = await client.messages.create({
      model,
      max_tokens: 2048,
      system: [
        {
          type: "text",
          text: STATIC_PREAMBLE,
          cache_control: { type: "ephemeral" },
        },
        {
          type: "text",
          text: renderArchetypeBrief(archetype),
          cache_control: { type: "ephemeral" },
        },
        {
          type: "text",
          text: buildSectionInstructions(name, skillMd, input),
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `# Business Context\n\n${buildBusinessContext(input)}\n\nGenerate the JSON for the **${name}** section now. Return ONLY the JSON object — no prose, no markdown fences. Start with \`{\` and end with \`}\`.`,
        },
      ],
    });
    const text = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");
    const startIdx = text.indexOf("{");
    const endIdx = text.lastIndexOf("}");
    if (startIdx === -1 || endIdx === -1) {
      console.warn(
        JSON.stringify({ event: "enhance_section_no_json", section: name }),
      );
      return { name, payload: null };
    }
    try {
      const parsed = JSON.parse(text.slice(startIdx, endIdx + 1));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return { name, payload: parsed as Record<string, unknown> };
      }
      return { name, payload: null };
    } catch (err) {
      console.warn(
        JSON.stringify({
          event: "enhance_section_parse_failed",
          section: name,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
      return { name, payload: null };
    }
  } catch (err) {
    console.warn(
      JSON.stringify({
        event: "enhance_section_call_failed",
        section: name,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return { name, payload: null };
  }
}

// Fan out the 8 section calls in parallel. Promise.allSettled means one
// section's failure doesn't kill the others — strictly better failure
// mode than the monolithic call where any single bad section invalidates
// the whole JSON.
async function callClaudeParallel(
  client: Anthropic,
  input: EnhanceLandingInput,
  archetype: AestheticArchetype,
  skills: Record<string, string>,
): Promise<
  | { ok: true; payload: Record<string, unknown>; model: string }
  | { ok: false; reason: string; detail: string }
> {
  const model = primaryModel();
  const results = await Promise.allSettled(
    SECTIONS_TO_GENERATE.map((name) => {
      const skillKey = SECTION_SKILL_KEY[name];
      const skillMd = skillKey ? skills[skillKey] ?? null : null;
      return enhanceSection(client, name, input, archetype, skillMd, model);
    }),
  );

  const payload: Record<string, unknown> = {};
  let successCount = 0;
  for (const r of results) {
    if (r.status === "fulfilled" && r.value.payload) {
      payload[r.value.name] = r.value.payload;
      successCount++;
    }
  }
  if (successCount === 0) {
    return {
      ok: false,
      reason: "all_sections_failed",
      detail: `0 of ${SECTIONS_TO_GENERATE.length} section calls returned valid JSON`,
    };
  }
  return { ok: true, payload, model };
}

// ─── Claude call with model fallback ────────────────────────────────────────

async function callClaude(
  client: Anthropic,
  prompt: string,
): Promise<
  | { ok: true; payload: Record<string, unknown>; model: string }
  | { ok: false; reason: string; detail: string }
> {
  const models = [primaryModel(), fallbackModel()];
  let lastError = "";
  for (const model of models) {
    try {
      const response = await client.messages.create({
        model,
        max_tokens: 8192,
        messages: [{ role: "user", content: prompt }],
      });
      const text = response.content
        .map((b) => (b.type === "text" ? b.text : ""))
        .join("");
      const startIdx = text.indexOf("{");
      const endIdx = text.lastIndexOf("}");
      if (startIdx === -1 || endIdx === -1) {
        lastError = `model ${model} returned no JSON object`;
        continue;
      }
      const json = text.slice(startIdx, endIdx + 1);
      try {
        const parsed = JSON.parse(json);
        if (parsed && typeof parsed === "object") {
          return { ok: true, payload: parsed as Record<string, unknown>, model };
        }
        lastError = `model ${model} returned non-object JSON`;
      } catch (err) {
        lastError = `model ${model} JSON.parse failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    } catch (err) {
      const e = err as { status?: number; statusCode?: number; message?: string };
      const status = e.status ?? e.statusCode;
      const message = e.message ?? String(err);
      // 404 = model not found; try the next one. Anything else = bail.
      if (status === 404) {
        lastError = `model ${model} not found`;
        continue;
      }
      return { ok: false, reason: "anthropic_error", detail: message };
    }
  }
  return { ok: false, reason: "all_models_failed", detail: lastError };
}

// ─── Payload → LandingPageSection[] conversion ──────────────────────────────

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : fallback;
}

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function asArray<T = unknown>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

async function payloadToSections(
  payload: Record<string, unknown>,
  input: EnhanceLandingInput,
  archetype: AestheticArchetype,
): Promise<LandingPageSection[]> {
  const sections: LandingPageSection[] = [];
  let order = 0;

  // v1.42.0 — pre-resolve all external assets in parallel. Pre-1.42.0
  // each was awaited inline at the moment of section push: hero image
  // (Unsplash) → cinematic hero video (Pexels) → 6× gallery images
  // (Unsplash, sequential for dedup). That serialized ~10-15s of HTTP
  // work behind the LLM call. Now the three asset classes (hero image,
  // hero video, gallery) fire in one Promise.allSettled — the gallery's
  // internal sequential dedup loop is preserved, the savings come from
  // overlapping the three classes.
  const heroPayload = asObject(payload.hero);
  const galleryPayload = asObject(payload.projectGallery);

  const heroImageQuery = heroPayload ? asString(heroPayload.heroImage_query) : "";
  const heroVideoQueryRaw = heroPayload ? asString(heroPayload.heroVideo_query) : "";
  const heroVideoQuery = heroVideoQueryRaw || heroImageQuery;
  const wantsCinematicVideo = archetype.heroVariant === "cinematic-aura";
  const galleryQueries = galleryPayload
    ? asArray<unknown>(galleryPayload.queries)
        .map((q) => (typeof q === "string" ? q.trim() : ""))
        .filter((q) => q.length > 0)
        .slice(0, 8)
    : [];

  const [heroImageSettled, heroVideoSettled, gallerySettled] = await Promise.allSettled([
    heroImageQuery ? resolveHeroImage(heroImageQuery) : Promise.resolve(null),
    wantsCinematicVideo && heroVideoQuery
      ? searchPexelsVideo(heroVideoQuery, { orientation: "landscape", size: "medium" })
      : Promise.resolve(null),
    galleryQueries.length > 0
      ? resolveGalleryImages(galleryQueries)
      : Promise.resolve([] as Awaited<ReturnType<typeof resolveGalleryImages>>),
  ]);
  const resolvedHeroImage =
    heroImageSettled.status === "fulfilled" ? heroImageSettled.value : null;
  const resolvedHeroVideo =
    heroVideoSettled.status === "fulfilled" ? heroVideoSettled.value : null;
  const resolvedGallery =
    gallerySettled.status === "fulfilled" ? gallerySettled.value : [];

  // Navbar — always render. Composed from input, not from LLM, since the
  // shape is mechanical (logo + business name + nav + book CTA).
  sections.push({
    type: "navbar",
    order: order++,
    content: {
      businessName: input.business_name,
      navLinks: [
        { label: "Services", href: "#services" },
        { label: "About", href: "#about" },
        { label: "FAQ", href: "#faq" },
      ],
      ctaText: "Book Now",
      ctaLink: "/book",
    },
  });

  // v1.40.0 — hero now includes archetype-driven `variant` so the
  // renderer picks the right composition (split-screen, asymmetric,
  // cinematic, founder-portrait). Centered hero is BANNED per
  // taste-skill discipline. Also passes through `riskReversalBadges`
  // pulled from input.trust_signals + input.certifications so the
  // hero's CTA carries Hormozi-style risk-reversal proof underneath.
  const hero = heroPayload;
  if (hero) {
    // v1.42.0 — assets were pre-resolved in parallel at the top of this
    // function. Just consume the results here; no more inline awaits.
    const heroImage = resolvedHeroImage?.url ?? "";
    const heroImageAttribution = resolvedHeroImage?.attribution;
    const heroVideo = resolvedHeroVideo?.url ?? "";
    const heroVideoAttribution = resolvedHeroVideo
      ? {
          photographer_name: resolvedHeroVideo.attribution.photographer_name,
          photographer_url: resolvedHeroVideo.attribution.photographer_url,
          source_url: resolvedHeroVideo.attribution.source_url,
          video_id: resolvedHeroVideo.attribution.video_id,
        }
      : undefined;
    const secondaryCtaRaw = asObject(hero.secondaryCta);
    const secondaryCta = secondaryCtaRaw
      ? {
          text: asString(secondaryCtaRaw.text, "Call Now"),
          link: asString(secondaryCtaRaw.link, `tel:${input.phone.replace(/[^\d+]/g, "")}`),
        }
      : undefined;

    // Build risk-reversal badges from operator-supplied signals.
    // Hormozi's "30% lift in conversions when risk-reversal under CTA"
    // pattern. Filter out anything that's not a single-clause claim.
    const riskReversalBadges = [
      ...(input.trust_signals ?? []),
      ...(input.certifications ?? []),
    ]
      .filter((b): b is string => typeof b === "string" && b.trim().length > 0 && b.length < 60)
      .slice(0, 5);

    // v1.40.0 — proof tile: review_count + review_rating cluster.
    // Renders as a compact pill row above the CTA so visitors see
    // social proof in the same eyeful as the headline.
    const proofTile =
      typeof input.review_rating === "number" && typeof input.review_count === "number"
        ? {
            rating: input.review_rating,
            count: input.review_count,
            label: `from ${input.review_count.toLocaleString()} ${input.city} customers`,
          }
        : undefined;

    // v1.43.0 — template picker. The LLM picks a template id from the
    // catalog in the hero section spec; we validate it against the
    // registry's known IDs and fall back to the archetype's default
    // template if the LLM picked something unknown or omitted the field.
    const llmPickedTemplate = asString(hero.template);
    const knownTemplates = new Set([
      "cinematic-aura",
      "viktor-light",
      "velorah-editorial",
      "nexora-light",
      "securify-bold",
      "stellar-tabs-white",
    ]);
    const template =
      knownTemplates.has(llmPickedTemplate)
        ? llmPickedTemplate
        : archetype.defaultTemplate;

    sections.push({
      type: "hero",
      order: order++,
      content: {
        kicker: asString(hero.kicker),
        headline: asString(hero.headline, input.business_name),
        subheadline: asString(hero.subheadline, input.business_description),
        ctaText: asString(hero.ctaText, "Book Now"),
        ctaLink: asString(hero.ctaLink, "/book"),
        secondaryCta,
        heroImage,
        // v1.40.5 — Unsplash photographer attribution (required for
        // production-tier compliance). Renderer shows it as a small
        // "Photo: NAME on Unsplash" credit.
        heroImageAttribution,
        // v1.41.0 — Pexels video + attribution. Used by cinematic-aura,
        // velorah-editorial, securify-bold. Empty string + undefined
        // when no video was resolved; renderers fall back to branded
        // gradients gracefully.
        heroVideo,
        heroVideoAttribution,
        // v1.41.0 — optional emphatic word that gets template-specific
        // emphasis treatment (gradient shimmer in cinematic-aura, serif
        // italic in light templates, split point in stellar-tabs).
        shinyWord: asString(hero.shinyWord) || undefined,
        // v1.43.0 — full hero template id. When present, the renderer
        // dispatches to that template's component; absent → legacy
        // variant dispatch.
        template,
        // v1.40.0 — archetype-driven layout variant. Kept as the
        // fallback path for legacy renders + tradesmen archetypes that
        // don't have a template yet.
        variant: archetype.heroVariant,
        // v1.40.0 — Hormozi-style risk-reversal badges under CTA.
        riskReversalBadges,
        // v1.40.0 — visual proof tile above CTA.
        proofTile,
      },
    });
  }

  // Emergency strip — opt-in based on emergency_service flag. High-value
  // for trades; skipped for verticals without 24/7 ops.
  if (input.emergency_service) {
    sections.push({
      type: "emergencyStrip",
      order: order++,
      content: {
        headline: "Emergency? Don't wait — call now.",
        phone: input.phone,
        phoneLink: `tel:${input.phone.replace(/[^\d+]/g, "")}`,
        hours: input.same_day
          ? "24/7 emergency response — same-day service available"
          : "24/7 emergency response",
      },
    });
  }

  // Services grid — per-service cards with prices + Book CTA.
  const services = asObject(payload.servicesGrid);
  if (services) {
    const items = asArray<Record<string, unknown>>(services.services);
    sections.push({
      type: "servicesGrid",
      order: order++,
      content: {
        headline: asString(services.headline, "What we do"),
        subheadline: asString(services.subheadline),
        services: items.map((item) => ({
          name: asString(item.name, "Service"),
          description: asString(item.description),
          price: asString(item.price, "Quote on request"),
          duration: asString(item.duration),
          // v1.38.5 — propagate per-service icon. v1.38.4's
          // services-grid.tsx has the dynamic resolver, but pre-1.38.5
          // the prompt didn't ask for icons + payloadToSections didn't
          // pass them through, so all cards rendered <Sparkles>.
          icon: asString(item.icon),
          ctaText: asString(item.ctaText, "Book"),
          ctaLink: asString(item.ctaLink, "/book"),
        })),
      },
    });
  }

  // About — short, factual, anchors trust.
  const about = asObject(payload.about);
  if (about) {
    sections.push({
      type: "features", // v1.38 reuses 'features' shape for a simple about-style section
      order: order++,
      content: {
        headline: asString(about.headline, `About ${input.business_name}`),
        features: [asString(about.body, input.business_description)],
      },
    });
  }

  // Benefits — 3 differentiators.
  const benefits = asObject(payload.benefits);
  if (benefits) {
    const items = asArray<Record<string, unknown>>(benefits.benefits);
    if (items.length > 0) {
      sections.push({
        type: "benefits",
        order: order++,
        content: {
          headline: asString(benefits.headline, "Why customers pick us"),
          benefits: items.slice(0, 3).map((item) => ({
            icon: asString(item.icon, "badge-check"),
            title: asString(item.title, ""),
            description: asString(item.description, ""),
          })),
        },
      });
    }
  }

  // Process — 3 steps showing what happens after booking.
  const process = asObject(payload.process);
  if (process) {
    const steps = asArray<Record<string, unknown>>(process.steps);
    if (steps.length > 0) {
      sections.push({
        type: "process",
        order: order++,
        content: {
          headline: asString(process.headline, "How it works"),
          steps: steps.slice(0, 3).map((step, idx) => ({
            number: typeof step.number === "number" ? step.number : idx + 1,
            title: asString(step.title, `Step ${idx + 1}`),
            description: asString(step.description, ""),
          })),
        },
      });
    }
  }

  // v1.38.1 — projectGallery. 6-photo masonry from per-service Unsplash
  // queries the LLM generated. Closes the "feels populated" gap that's
  // the single biggest visible difference between a fresh SF workspace
  // and a real-business landing page. Soft-fails — if Unsplash is down
  // we just skip the gallery (better than rendering broken-image icons).
  //
  // v1.42.0 — gallery images were pre-resolved in parallel at the top
  // of this function (in resolvedGallery). The order may differ from
  // `galleryQueries` since failed slots are skipped, so the alt/caption
  // mapping uses the index of items that successfully resolved.
  const gallery = galleryPayload;
  if (gallery && resolvedGallery.length > 0) {
    sections.push({
      type: "projectGallery",
      order: order++,
      content: {
        headline: asString(gallery.headline, "Recent work"),
        subheadline: asString(gallery.subheadline),
        items: resolvedGallery.map((image, idx) => ({
          image: image.url,
          alt: galleryQueries[idx] ?? "Recent project",
          caption: galleryQueries[idx] ?? "",
          attribution: image.attribution,
        })),
        ctaText: "Book your job",
        ctaLink: "/book",
      },
    });
  }

  // Service area — chip cloud of cities served. Only when paste/operator
  // gave us cities; we don't invent them.
  if (input.service_area && input.service_area.length > 0) {
    sections.push({
      type: "serviceArea",
      order: order++,
      content: {
        headline: "Where we serve",
        primaryLocation: `${input.city}, ${input.state}`,
        areas: input.service_area,
      },
    });
  }

  // v1.38.3 — testimonials. We emit this section ONLY when the operator
  // (typically via Claude Code parsing a Google Maps paste) supplied real
  // review excerpts. NEVER fabricated — better empty than fake. Quotes
  // are passed through verbatim; the LLM does not get to rewrite them.
  if (input.testimonials && input.testimonials.length > 0) {
    sections.push({
      type: "testimonials",
      order: order++,
      content: {
        headline: "What customers are saying",
        testimonials: input.testimonials.map((t) => ({
          quote: t.quote,
          author: t.name ?? "Verified customer",
          role: t.role ?? (t.company ?? ""),
          rating: typeof t.rating === "number" ? t.rating : 5,
          // No avatar — we don't have face photos and don't fake them.
          // The TestimonialsSection component falls back to letter-
          // avatar / no-avatar gracefully.
        })),
      },
    });
  }

  // FAQ — 4-6 honest questions.
  const faq = asObject(payload.faq);
  if (faq) {
    const items = asArray<Record<string, unknown>>(faq.faqs);
    if (items.length > 0) {
      sections.push({
        type: "faq",
        order: order++,
        content: {
          headline: asString(faq.headline, "Frequently asked questions"),
          faqs: items.map((item) => ({
            question: asString(item.question, ""),
            answer: asString(item.answer, ""),
          })),
        },
      });
    }
  }

  // Final CTA — convert-now block.
  const cta = asObject(payload.cta);
  if (cta) {
    sections.push({
      type: "cta",
      order: order++,
      content: {
        headline: asString(cta.headline, "Ready to book?"),
        body: asString(cta.body, ""),
        ctaText: asString(cta.ctaText, "Book Now"),
        ctaLink: asString(cta.ctaLink, "/book"),
      },
    });
  }

  // Footer — mechanical from input.
  sections.push({
    type: "footer",
    order: order++,
    content: {
      businessName: input.business_name,
      description: input.business_description,
      links: [
        { label: "Book", href: "/book" },
        { label: "Contact", href: "/intake" },
      ],
    },
  });

  // v1.38.2 — sticky mobile CTA bar. Always last in the sections array
  // (position:fixed pulls it out of flow at runtime, so visual order
  // doesn't matter). Renders ONLY on mobile via the component's own
  // `md:hidden` class. Industry standard for trades sites; ~2-3x
  // mobile booking lift. Skipped when no phone — without a callable
  // number the bar would be a single "Book" button which the navbar
  // already provides.
  if (input.phone) {
    sections.push({
      type: "stickyMobileCTA",
      order: order++,
      content: {
        phone: input.phone,
        phoneLink: `tel:${input.phone.replace(/[^\d+]/g, "")}`,
        bookLink: "/book",
        callText: "Call",
        bookText: "Book",
      },
    });
  }

  return sections;
}

// ─── Public entry point ─────────────────────────────────────────────────────

/**
 * Generate Hormozi-quality block content for a freshly-created workspace's
 * landing page, using SKILL.md files as the LLM's instruction set. Writes
 * the result to landingPages.sections (LandingPageSection[] format) and
 * NULLs contentHtml/contentCss so the route falls through to <PageRenderer>
 * (which automatically wraps below-fold sections in <RevealOnScroll> for
 * scroll-triggered motion).
 *
 * Soft-fails on every error path: a workspace will always end up valid
 * (canned-copy Path A intact) even if Claude is unreachable.
 */
export async function enhanceLandingForWorkspace(
  input: EnhanceLandingInput,
): Promise<EnhanceLandingResult> {
  // 1. Resolve an Anthropic client. BYOK first, platform key second.
  const resolution = await getAIClient({ orgId: input.orgId });
  if (!resolution.client) {
    return { ok: false, reason: "no_ai_client" };
  }

  // 2. Load all SKILL.md files. If none load, bail — we'd be flying blind.
  const skills = await loadAllSkills();
  if (Object.keys(skills).length === 0) {
    return { ok: false, reason: "no_skills_loaded" };
  }

  // v1.40.0 — 2.5. Pick aesthetic archetype for this workspace.
  // Drives every downstream design decision: palette, fonts, hero
  // variant, voice, banned tokens. Trevor Foyer's manual workflow
  // calls this "design intent injection"; we automate it from the
  // soul + business signals.
  const archetypeId: AestheticArchetypeId = classifyArchetype({
    vertical: input.personality_vertical ?? "",
    emergencyService: input.emergency_service,
    sameDay: input.same_day,
    reviewRating: input.review_rating,
    reviewCount: input.review_count,
    businessDescription: input.business_description,
  });
  const archetype = ARCHETYPES[archetypeId];

  // v1.40.0 — 2.6. Apply archetype theme tokens to org.theme so the
  // PublicThemeProvider cascades the right palette + font on every
  // public surface (landing, booking, intake). Soft-fail if the
  // update errors; the page still renders with default theme.
  try {
    const newTheme: OrgTheme = {
      primaryColor: archetype.palette.primary,
      accentColor: archetype.palette.secondary,
      fontFamily: archetype.fonts.headline as OrgTheme["fontFamily"],
      mode: "light",
      borderRadius: "rounded",
      logoUrl: null,
      motionPreset: archetype.motionPreset,
    };
    await db
      .update(organizations)
      .set({ theme: newTheme, updatedAt: new Date() })
      .where(eq(organizations.id, input.orgId));
  } catch (err) {
    console.warn(
      JSON.stringify({
        event: "archetype_theme_apply_failed",
        workspace_id: input.orgId,
        archetype: archetypeId,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }

  // v1.40.1 — 2.7. Apply archetype-specific booking intake fields to
  // every booking template the workspace owns. PublicBookingForm reads
  // these and renders dynamic inputs after name+email so the operator
  // gets actionable lead data (address+issue+urgency for trades,
  // skin-concern+previous-treatments for medspa, company+budget for
  // B2B) on first booking — no follow-up call needed.
  //
  // Soft-fail. Worst case the booking form falls back to legacy
  // name+email+notes; workspace stays valid.
  try {
    const intakeFields = getBookingIntakeFieldsForArchetype(archetypeId);
    const templates = await db
      .select({ id: bookings.id, metadata: bookings.metadata })
      .from(bookings)
      .where(
        and(eq(bookings.orgId, input.orgId), eq(bookings.status, "template")),
      );

    for (const tpl of templates) {
      const meta = (tpl.metadata as Record<string, unknown> | null) ?? {};
      const nextMeta = { ...meta, intakeFields };
      await db
        .update(bookings)
        .set({ metadata: nextMeta, updatedAt: new Date() })
        .where(eq(bookings.id, tpl.id));
    }

    console.log(
      JSON.stringify({
        event: "intake_fields_applied",
        workspace_id: input.orgId,
        archetype: archetypeId,
        template_count: templates.length,
        field_count: intakeFields.length,
      }),
    );
  } catch (err) {
    console.warn(
      JSON.stringify({
        event: "intake_fields_apply_failed",
        workspace_id: input.orgId,
        archetype: archetypeId,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }

  // 3. Call Claude. v1.42.0 — by default, fan out to 8 parallel
  //    per-section Opus calls via Promise.allSettled (much lower
  //    wall-clock than one monolithic call returning a 9-key JSON).
  //    Emergency rollback: SF_PARALLEL_ENHANCE=false in env.
  const result = isParallelEnhanceEnabled()
    ? await callClaudeParallel(resolution.client, input, archetype, skills)
    : await callClaude(resolution.client, buildPrompt(skills, input, archetype));
  if (!result.ok) {
    return { ok: false, reason: result.reason, detail: result.detail };
  }

  // 4. Convert payload → LandingPageSection[]. Now archetype-aware:
  //    drives hero variant + RiskReversalStrip emission + VisualProofTile.
  let sections: LandingPageSection[];
  try {
    sections = await payloadToSections(result.payload, input, archetype);
  } catch (err) {
    return {
      ok: false,
      reason: "payload_conversion_failed",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  if (sections.length === 0) {
    return { ok: false, reason: "no_sections_generated" };
  }

  // 5. Find the org's home landing row. Created earlier in the pipeline by
  //    createAnonymousWorkspace; we never insert here.
  const [page] = await db
    .select({ id: landingPages.id })
    .from(landingPages)
    .where(and(eq(landingPages.orgId, input.orgId), eq(landingPages.slug, "home")))
    .limit(1);

  if (!page) {
    return { ok: false, reason: "no_home_landing_page" };
  }

  // 6. Persist sections + null out contentHtml/Css so the route falls
  //    through to <PageRenderer> (motion enabled). blueprintJson stays —
  //    it's the source of truth for downstream tools that re-render on
  //    update; we just don't read it for the public render anymore.
  await db
    .update(landingPages)
    .set({
      sections: sections as unknown as Record<string, unknown>[],
      contentHtml: null,
      contentCss: null,
      updatedAt: new Date(),
    })
    .where(eq(landingPages.id, page.id));

  console.log(
    JSON.stringify({
      event: "enhance_blocks_succeeded",
      workspace_id: input.orgId,
      archetype: archetypeId,
      sections_count: sections.length,
      model: result.model,
      ai_mode: resolution.mode,
    }),
  );

  return { ok: true, sections_count: sections.length, model: result.model, archetype: archetypeId };
}
