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
import { landingPages } from "@/db/schema";
import { getAIClient } from "@/lib/ai/client";
import {
  resolveGalleryImageUrlsForQueries,
  resolveHeroImageUrlForQuery,
} from "@/lib/crm/personality-images";
import { loadSkillMd } from "@/lib/page-blocks/skill-loader";
import type { LandingPageSection } from "@/components/landing/sections/types";

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
}

export type EnhanceLandingResult =
  | { ok: true; sections_count: number; model: string }
  | { ok: false; reason: string; detail?: string };

// ─── Block selection + model defaults ───────────────────────────────────────

// Blocks we ask Claude to generate copy for. Order matters — the prompt
// composes them in this sequence; the on-page section order is set
// independently in payloadToSections() below.
const ENHANCE_BLOCKS = ["hero", "services", "about", "faq", "cta"] as const;

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

function buildPrompt(skills: Record<string, string>, input: EnhanceLandingInput): string {
  return `You are generating landing-page block content for a real small-business website. The output goes DIRECTLY to a published landing page — there is no human editor between you and the visitor. Treat every word as production copy.

OUTPUT: ONE JSON object, no prose, no markdown fences. The exact shape is below; every key required unless marked optional.

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
    "heroImage_query": "<2-5 word Unsplash search query matching this specific business; e.g. 'hvac technician outdoor unit phoenix' or 'plumber sink repair' — be specific to vertical + setting>"
  },
  "servicesGrid": {
    "headline": "<value-driven headline for services section; speak to outcome not features>",
    "subheadline": "<optional 1-line subhead; can be empty string>",
    "services": [
      { "name": "<service name verbatim from input>", "description": "<1 sentence — what the customer gets, not what we do>", "price": "<'from $X' or specific dollar; if unknown say 'Quote on request'>", "duration": "<optional 'X min' / '1-2 hours'>", "ctaText": "Book", "ctaLink": "/book" }
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
      { "icon": "<one of: clock, shield, star, badge-check, wrench, phone, map-pin, dollar-sign, thumbs-up, award, zap, heart>", "title": "<3-5 words>", "description": "<1 sentence>" }
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

# Gallery queries

Generate 6 Unsplash search queries in projectGallery.queries — vertical-specific, 2-5 words each, that produce real-looking job-site or business-context photos. Bias toward queries that return DIFFERENT photos (avoid all 6 being "plumber"). Each query becomes one square photo in a 6-photo masonry grid. Examples for HVAC: ["hvac technician outdoor unit", "ductwork installation", "thermostat residential", "air filter replacement", "rooftop commercial unit", "service van technician"]. For plumbing: ["plumber sink repair", "drain cleaning kitchen", "water heater install basement", "bathroom renovation", "pipe inspection camera", "emergency plumbing service van"].

# FAQ count

Generate 4-6 FAQ entries in faq.faqs. Cover the top customer concerns: pricing/quotes, availability/timing, qualifications/licensing, what to expect on the visit, payment.

# Benefits count

Generate exactly 3 benefit entries in benefits.benefits.

# Output

Respond with ONLY the JSON object — no prose before or after, no markdown fences. Start with \`{\` and end with \`}\`.`;
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
): Promise<LandingPageSection[]> {
  const sections: LandingPageSection[] = [];
  let order = 0;

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

  // Hero — Hormozi-quality copy + Unsplash photo from heroImage_query.
  const hero = asObject(payload.hero);
  if (hero) {
    let heroImage = "";
    const heroQuery = asString(hero.heroImage_query);
    if (heroQuery) {
      try {
        heroImage = await resolveHeroImageUrlForQuery(heroQuery);
      } catch {
        // Soft-fail: empty heroImage triggers the v1.36.0 branded-gradient
        // empty state, which still looks intentional.
      }
    }
    const secondaryCtaRaw = asObject(hero.secondaryCta);
    const secondaryCta = secondaryCtaRaw
      ? {
          text: asString(secondaryCtaRaw.text, "Call Now"),
          link: asString(secondaryCtaRaw.link, `tel:${input.phone.replace(/[^\d+]/g, "")}`),
        }
      : undefined;
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
  const gallery = asObject(payload.projectGallery);
  if (gallery) {
    const queries = asArray<unknown>(gallery.queries)
      .map((q) => (typeof q === "string" ? q.trim() : ""))
      .filter((q) => q.length > 0)
      .slice(0, 8);
    if (queries.length > 0) {
      try {
        const urls = await resolveGalleryImageUrlsForQueries(queries);
        if (urls.length > 0) {
          sections.push({
            type: "projectGallery",
            order: order++,
            content: {
              headline: asString(gallery.headline, "Recent work"),
              subheadline: asString(gallery.subheadline),
              items: urls.map((url, idx) => ({
                image: url,
                alt: queries[idx] ?? "Recent project",
                caption: queries[idx] ?? "",
              })),
              ctaText: "Book your job",
              ctaLink: "/book",
            },
          });
        }
      } catch (err) {
        console.warn(
          `[enhance-blocks] gallery resolution failed:`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }
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

  // 3. Build prompt + call Claude.
  const prompt = buildPrompt(skills, input);
  const result = await callClaude(resolution.client, prompt);
  if (!result.ok) {
    return { ok: false, reason: result.reason, detail: result.detail };
  }

  // 4. Convert payload → LandingPageSection[].
  let sections: LandingPageSection[];
  try {
    sections = await payloadToSections(result.payload, input);
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
      sections_count: sections.length,
      model: result.model,
      ai_mode: resolution.mode,
    }),
  );

  return { ok: true, sections_count: sections.length, model: result.model };
}
