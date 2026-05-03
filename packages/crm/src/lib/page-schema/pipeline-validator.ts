// May 1, 2026 — Soul → Render pipeline contract.
//
// The same bugs keep recurring: phone shows placeholder, services
// show "Service one", about shows template instructions. Every fix
// patches one spot but the next workspace creation breaks something
// else. The root cause is architectural — there's no contract
// guaranteeing Soul data reaches the rendered page.
//
// This module defines that contract. Validators run after each
// stage boundary and ASSERT that critical data was preserved. If
// data is lost, the validator returns errors identifying WHERE in
// the pipeline it was lost.
//
//   create_workspace(args)
//     → organizations.soul                  [validateSoulStorage]
//     → schemaFromSoul()                    [validatePageSchema]
//     → blueprintFromSchema() + render      [validateRenderedHTML]
//
// Wired into seedLandingFromSoul: failures log prominently to
// console.error so they show up in Vercel function logs, but the
// render still proceeds (a page with some placeholder content is
// better than no page).

import type { PageSchema } from "./types";
import type { CRMPersonality } from "@/lib/crm/personality";

/**
 * What the operator put into create_workspace (or submit_soul) — the
 * source-of-truth that the rest of the pipeline must preserve.
 *
 * Field names match the loose-Soul shape that schemaFromSoul reads
 * (business_name, soul_description, etc.) — NOT the strict OrgSoul
 * type. We keep both supported so the validator is defensive
 * against future shape drift.
 */
export interface PipelineInput {
  phone?: string | null;
  services?: Array<{ name: string; description?: string | null }> | null;
  businessName: string;
  businessDescription?: string | null;
  businessType?: string | null;
  tagline?: string | null;
  testimonials?: Array<{
    quote: string;
    name?: string | null;
    role?: string | null;
    company?: string | null;
  }> | null;
  faqs?: Array<{ question: string; answer: string }> | null;
}

export interface ValidationResult {
  /** Stage label so a downstream consumer can route alerts. */
  stage:
    | "soul_storage"
    | "page_schema"
    | "rendered_html"
    | "headline_quality"
    | "above_the_fold"
    | "section_headlines"
    | "layout_coherence"
    | "crm_personality";
  /** True iff the stage's critical assertions all passed. */
  passed: boolean;
  /** Non-fatal: data was missing from input, so we can't assert it. */
  warnings: string[];
  /** Fatal: data was present in input but lost / corrupted in this stage. */
  errors: string[];
}

// ─── Known placeholder strings ────────────────────────────────────────────────
//
// These come from skills/templates/general.json (legacy template). Any of
// them appearing in the rendered HTML of a workspace that has real Soul
// data is a regression — the seedLandingFromSoul → PageSchema pipeline
// either didn't fire or failed silently.

const PLACEHOLDER_PHONES = ["+15555550100", "(555) 555-0100", "555-555-0100"];
const PLACEHOLDER_SERVICE_TITLES = ["Service one", "Service two", "Service three"];
const PLACEHOLDER_DESCRIPTIONS = [
  "Brief description of your first core service",
  "Brief description of your second core service",
  "Brief description of your third core service",
  "Two short sentences max",
];
const TEMPLATE_INSTRUCTION_PHRASES = [
  "Tell your story in 2-3 sentences",
  "What's your background, why did you start",
  "why did you start the business",
  "Brief description of your",
  "Two short sentences max",
];
const PLACEHOLDER_TAGLINES = [
  "Local. Trusted. Fast.",
  "Reliable [service] you can count on",
];

function readSoulField(
  soul: Record<string, unknown> | null | undefined,
  ...names: string[]
): string {
  if (!soul) return "";
  for (const name of names) {
    const value = soul[name];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return "";
}

function isPlaceholderPhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, "");
  return PLACEHOLDER_PHONES.some(
    (p) => p === phone || p.replace(/\D/g, "") === digits
  );
}

/**
 * v1.3.5 — substring search that's resilient to HTML-entity escaping.
 *
 * The renderer escapes special chars when emitting business names /
 * service titles into HTML: `&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`,
 * `"` → `&quot;`, `'` → `&#39;` (or `&apos;`). A literal `html.includes`
 * check on the source value misses these cases — the strings ARE in
 * the rendered HTML, just in their entity-encoded form.
 *
 * Pre-1.3.5 the Iron & Oak Barbershop test logged `BUSINESS NAME NOT IN
 * HTML: "Iron & Oak Barbershop"` even though `Iron &amp; Oak Barbershop`
 * appeared all over the rendered page. The validator was wrong, not the
 * rendering pipeline.
 *
 * Strategy: try the literal needle first (cheap, covers the 95% case),
 * then try its HTML-escaped form, then try a "decoded haystack" form
 * where we replace common entities back to their literal characters in
 * a copy of the HTML and re-check. Returns true on any hit.
 */
function htmlContainsText(html: string, needle: string): boolean {
  if (!needle) return true;
  if (html.includes(needle)) return true;
  const escaped = needle
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
  if (escaped !== needle && html.includes(escaped)) return true;
  // Also try the &apos; variant for single quotes (some encoders use it).
  const escapedApos = needle
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
  if (escapedApos !== escaped && html.includes(escapedApos)) return true;
  return false;
}

// ─── Stage 1: Soul storage ────────────────────────────────────────────────────

/**
 * Validate that the Soul stored in `organizations.soul` contains all
 * the data passed into create_workspace. Catches bugs where the API
 * route accepts a field but forgets to write it to the column.
 */
export function validateSoulStorage(
  input: PipelineInput,
  soul: Record<string, unknown> | null | undefined
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!soul) {
    errors.push("SOUL MISSING: organizations.soul is null/undefined after create_workspace");
    return { stage: "soul_storage", passed: false, warnings, errors };
  }

  const soulPhone = readSoulField(soul, "phone");
  const soulName = readSoulField(soul, "business_name", "businessName", "company_name");
  const soulOfferings = Array.isArray(soul.offerings)
    ? soul.offerings
    : Array.isArray((soul as { services?: unknown }).services)
      ? ((soul as { services: unknown[] }).services)
      : [];

  if (input.phone && !soulPhone) {
    errors.push(
      `PHONE LOST: input had "${input.phone}" but soul.phone is empty`
    );
  } else if (input.phone && soulPhone && soulPhone !== input.phone) {
    errors.push(
      `PHONE CORRUPTED: input had "${input.phone}" but soul.phone is "${soulPhone}"`
    );
  }

  if (input.services?.length && soulOfferings.length === 0) {
    errors.push(
      `SERVICES LOST: input had ${input.services.length} services but soul.offerings is empty`
    );
  }

  if (input.businessName && soulName && soulName !== input.businessName) {
    errors.push(
      `NAME CORRUPTED: input had "${input.businessName}" but soul.business_name is "${soulName}"`
    );
  } else if (input.businessName && !soulName) {
    warnings.push(
      `business_name not stored on soul (workspace.name will be used as fallback)`
    );
  }

  if (input.businessDescription) {
    const stored = readSoulField(soul, "soul_description", "description", "mission");
    if (!stored) {
      warnings.push(
        `DESCRIPTION not stored in soul.soul_description / soul.description`
      );
    }
  }

  return {
    stage: "soul_storage",
    passed: errors.length === 0,
    warnings,
    errors,
  };
}

// ─── Stage 2: PageSchema ──────────────────────────────────────────────────────

/**
 * Validate that schemaFromSoul produced a PageSchema containing all
 * critical Soul data. Catches bugs where the schema builder ignores
 * a Soul field, or where a content pack injects placeholder content
 * that overrides real data.
 */
export function validatePageSchema(
  soul: Record<string, unknown> | null | undefined,
  schema: PageSchema
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const soulPhone = readSoulField(soul, "phone");
  const soulName = readSoulField(soul, "business_name", "businessName", "company_name");
  const soulTagline = readSoulField(soul, "tagline");
  const soulOfferings = soul && Array.isArray(soul.offerings)
    ? (soul.offerings as Array<Record<string, unknown>>)
    : [];
  const soulFaqs = soul && Array.isArray(soul.faqs)
    ? (soul.faqs as Array<Record<string, unknown>>)
    : [];
  const soulTestimonials = soul && Array.isArray(soul.testimonials)
    ? (soul.testimonials as Array<Record<string, unknown>>)
    : [];

  // ── Phone ──
  if (soulPhone && !isPlaceholderPhone(soulPhone)) {
    const schemaPhone = schema.business.phone ?? "";
    if (!schemaPhone) {
      errors.push(
        `PHONE LOST at schema: soul.phone="${soulPhone}" but schema.business.phone is empty`
      );
    } else if (isPlaceholderPhone(schemaPhone)) {
      errors.push(
        `PHONE PLACEHOLDER at schema: soul.phone="${soulPhone}" but schema.business.phone is the placeholder "${schemaPhone}"`
      );
    } else if (schemaPhone !== soulPhone) {
      warnings.push(
        `PHONE REFORMATTED at schema: soul="${soulPhone}" schema="${schemaPhone}" (acceptable if intentional normalization)`
      );
    }
  }

  // ── Services / offerings ──
  if (soulOfferings.length > 0) {
    const servicesSection = schema.sections.find(
      (s) => s.intent === "services" || s.intent === "features" || s.intent === "products"
    );
    const items = servicesSection?.content.items ?? [];
    if (!servicesSection || items.length === 0) {
      errors.push(
        `SERVICES LOST at schema: soul has ${soulOfferings.length} offerings but no services/features/products section has items`
      );
    } else {
      const hasPlaceholder = items.some(
        (item) =>
          PLACEHOLDER_SERVICE_TITLES.includes(item.title) ||
          (item.description &&
            PLACEHOLDER_DESCRIPTIONS.some((p) => item.description!.includes(p)))
      );
      if (hasPlaceholder) {
        errors.push(
          `SERVICES ARE PLACEHOLDERS at schema: soul has real offerings but schema still has "Service one/two/three" or template descriptions`
        );
      }
    }
  }

  // ── Business name ──
  if (soulName && schema.business.name && schema.business.name !== soulName) {
    warnings.push(
      `NAME MISMATCH at schema: soul="${soulName}" schema="${schema.business.name}" (acceptable if workspace.name took precedence)`
    );
  }

  // ── Tagline ──
  if (soulTagline) {
    if (PLACEHOLDER_TAGLINES.includes(schema.business.tagline ?? "")) {
      errors.push(
        `TAGLINE IS PLACEHOLDER at schema: soul has "${soulTagline}" but schema kept the pack default "${schema.business.tagline}"`
      );
    }
  }

  // ── About section: must not contain template instructions ──
  const aboutSection = schema.sections.find((s) => s.intent === "about");
  if (aboutSection?.content.body) {
    for (const phrase of TEMPLATE_INSTRUCTION_PHRASES) {
      if (aboutSection.content.body.includes(phrase)) {
        errors.push(
          `ABOUT SECTION HAS INSTRUCTIONS at schema: "${phrase}" found in body — should use soul.soul_description or hide section`
        );
      }
    }
  }

  // ── Any section's items: must not have placeholder descriptions ──
  for (const section of schema.sections) {
    const items = section.content.items ?? [];
    for (const item of items) {
      if (item.description) {
        for (const phrase of PLACEHOLDER_DESCRIPTIONS) {
          if (item.description.includes(phrase)) {
            errors.push(
              `PLACEHOLDER DESCRIPTION at schema in section "${section.intent}", item "${item.title}": "${item.description}"`
            );
          }
        }
      }
    }
  }

  // ── FAQs ──
  if (soulFaqs.length > 0) {
    const faqSection = schema.sections.find((s) => s.intent === "faq");
    const faqs = faqSection?.content.faqs ?? [];
    if (!faqSection || faqs.length === 0) {
      errors.push(
        `FAQS LOST at schema: soul has ${soulFaqs.length} FAQs but schema's faq section is empty`
      );
    }
  }

  // ── Testimonials ──
  if (soulTestimonials.length > 0) {
    const testimSection = schema.sections.find((s) => s.intent === "testimonials");
    const items = testimSection?.content.items ?? [];
    const proofTestimonials = schema.proof.testimonials ?? [];
    if (
      (!testimSection || items.length === 0) &&
      proofTestimonials.length === 0
    ) {
      errors.push(
        `TESTIMONIALS LOST at schema: soul has ${soulTestimonials.length} testimonials but schema has no testimonials section items AND no proof.testimonials`
      );
    }
  }

  return {
    stage: "page_schema",
    passed: errors.length === 0,
    warnings,
    errors,
  };
}

// ─── Stage 3: Rendered HTML ───────────────────────────────────────────────────

/**
 * Validate that the final rendered HTML contains the critical Soul
 * data. This is the ultimate check — if data reaches the HTML, it's
 * visible to end-users.
 */
export function validateRenderedHTML(
  soul: Record<string, unknown> | null | undefined,
  html: string
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const soulPhone = readSoulField(soul, "phone");
  const soulName = readSoulField(soul, "business_name", "businessName", "company_name");
  const soulOfferings = soul && Array.isArray(soul.offerings)
    ? (soul.offerings as Array<Record<string, unknown>>)
    : [];

  // ── Phone ──
  if (soulPhone && !isPlaceholderPhone(soulPhone)) {
    const digits = soulPhone.replace(/\D/g, "");
    if (digits.length >= 10 && !html.includes(digits) && !html.includes(soulPhone)) {
      // Try the dash- and paren-formatted variants the renderer may
      // use (e.g. (555) 123-4567 ↔ 555-123-4567).
      const dashed = digits.length === 11
        ? `${digits.slice(0, 1)}-${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`
        : `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
      const parened = digits.length === 11
        ? `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
        : `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
      if (!html.includes(dashed) && !html.includes(parened)) {
        errors.push(
          `PHONE NOT IN HTML: soul.phone="${soulPhone}" not found in rendered output`
        );
      }
    }
  }

  // ── Placeholder phone must NEVER appear ──
  for (const placeholder of PLACEHOLDER_PHONES) {
    if (html.includes(placeholder)) {
      errors.push(
        `PLACEHOLDER PHONE IN HTML: "${placeholder}" found — should ${soulPhone ? `show "${soulPhone}"` : "be hidden"}`
      );
    }
  }

  // ── Services: placeholder titles must NEVER appear ──
  for (const placeholder of PLACEHOLDER_SERVICE_TITLES) {
    if (html.includes(placeholder)) {
      errors.push(
        `PLACEHOLDER SERVICES IN HTML: "${placeholder}" found — should ${soulOfferings.length > 0 ? "show real offerings" : "be hidden"}`
      );
    }
  }

  // ── Services: at least one real offering should appear when soul has them ──
  if (soulOfferings.length > 0) {
    const firstService = readSoulField(soulOfferings[0], "name", "title");
    if (firstService && !htmlContainsText(html, firstService)) {
      warnings.push(
        `First offering "${firstService}" not found in HTML — may be paraphrased or hidden`
      );
    }
  }

  // ── Template instructions must NEVER appear ──
  for (const phrase of TEMPLATE_INSTRUCTION_PHRASES) {
    if (html.includes(phrase)) {
      errors.push(`TEMPLATE INSTRUCTIONS IN HTML: "${phrase}"`);
    }
  }

  // ── Business name should appear ──
  // v1.3.5 — use htmlContainsText so business names with HTML-special
  // characters ("Iron & Oak Barbershop", "Joe's Plumbing", "<3 Salon")
  // match against their entity-encoded form in the rendered HTML
  // ("Iron &amp; Oak Barbershop", "Joe&#39;s Plumbing", "&lt;3 Salon").
  // Pre-1.3.5 the strict substring check failed for every business with
  // an ampersand in the name, even though the name WAS rendered.
  if (soulName && !htmlContainsText(html, soulName)) {
    errors.push(`BUSINESS NAME NOT IN HTML: "${soulName}"`);
  }

  return {
    stage: "rendered_html",
    passed: errors.length === 0,
    warnings,
    errors,
  };
}

// ─── Hormozi-style content quality checks ────────────────────────────────────
//
// Per the Hormozi Value Equation (Dream Outcome × Perceived Likelihood ÷
// Time × Effort), every headline must lead with a quantified benefit.
// "Phoenix's Most Trusted HVAC Team" is a description, not a value claim.
// "Same-Day AC Repair. 4.8★ from 2,300+ Dallas Homeowners." is.
//
// These checks are conservative (warn, not error) for most rules so a
// pack default that lacks quantification doesn't block the render —
// the goal is to surface the quality regression to operators in the
// log box so we can iterate the packs over time.

const GENERIC_HEADLINE_PATTERNS = [
  /^professional .* services?$/i,
  /^welcome to /i,
  /^your trusted /i,
  /^your reliable /i,
  /^your premier /i,
  /^the .* (platform|solution|system)$/i,
  /^reliable .* you can count on$/i,
];

const QUANTIFICATION_KEYWORDS = [
  // Numbers / percentages / time / star ratings
  "%",
  "★",
  "free",
  "guarantee",
  "guaranteed",
  "minute",
  "hour",
  "day",
  "week",
  "month",
  "same-day",
  "today",
  "instantly",
  "no credit card",
  "no obligation",
  "risk-free",
  "money-back",
  "lifetime",
];

const GENERIC_SECTION_HEADLINES = new Set([
  "services",
  "our services",
  "features",
  "how it works",
  "about",
  "about us",
  "testimonials",
  "what our customers say",
  "what clients say",
  "why us",
  "why choose us",
  "faq",
  "frequently asked questions",
  "pricing",
  "contact us",
]);

function hasQuantification(text: string): boolean {
  const lower = text.toLowerCase();
  // Any digit run of 1+ counts (5, 24, 2300, $99, 4.8) — quick proxy
  // for "this headline carries a number."
  if (/\d/.test(lower)) return true;
  return QUANTIFICATION_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Check 3 — Hormozi headline quality. Catches generic, descriptive
 * headlines that don't convert.
 */
export function validateHeadlineQuality(
  schema: PageSchema,
  soul: Record<string, unknown> | null | undefined
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const hero = schema.sections.find((s) => s.intent === "hero" && s.visible);
  if (!hero) {
    return {
      stage: "headline_quality",
      passed: true,
      warnings: ["No visible hero — skipped"],
      errors: [],
    };
  }

  const headline = (hero.content.headline ?? "").trim();
  const subhead = (hero.content.subheadline ?? "").trim();
  const businessName = schema.business.name?.trim() ?? "";
  const soulName = readSoulField(soul, "business_name", "businessName", "company_name");

  // ── Hard error: headline equals company name ──
  if (
    headline.length > 0 &&
    (headline === businessName || (soulName && headline === soulName))
  ) {
    errors.push(
      `HEADLINE IS COMPANY NAME: "${headline}" — replace with a benefit-driven value claim ("Same-Day AC Repair. 4.8★ from 2,300+ Dallas Homeowners.")`
    );
  }

  // ── Warn: matches generic descriptive patterns ──
  for (const pattern of GENERIC_HEADLINE_PATTERNS) {
    if (pattern.test(headline)) {
      warnings.push(
        `HEADLINE IS GENERIC: "${headline}" matches pattern ${pattern} — lead with a quantified outcome instead`
      );
      break;
    }
  }

  // ── Warn: no quantified element (number, timeframe, proof metric, risk reversal) ──
  if (headline.length > 0 && !hasQuantification(headline)) {
    warnings.push(
      `HEADLINE NOT QUANTIFIED: "${headline}" — add a number, timeframe, star rating, or risk-reversal word ("free", "guaranteed", "same-day")`
    );
  }

  // ── Warn: subhead repeats headline ──
  if (subhead.length > 0 && headline.length > 0 && subhead === headline) {
    warnings.push(`SUBHEAD REPEATS HEADLINE: "${subhead}"`);
  }

  // ── Warn: subhead too long ──
  if (subhead.length > 200) {
    warnings.push(
      `SUBHEAD TOO LONG: ${subhead.length} chars — keep under 200; use " · " separators for proof points`
    );
  }

  return {
    stage: "headline_quality",
    passed: errors.length === 0,
    warnings,
    errors,
  };
}

/**
 * Check 4 — above-the-fold completeness. The first paint must have
 * everything that converts: hero, headline, at least one CTA with a
 * working href, and (for local services) a trust bar.
 */
export function validateAboveTheFold(schema: PageSchema): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const hero = schema.sections.find((s) => s.intent === "hero" && s.visible);
  if (!hero) {
    errors.push("ABOVE-THE-FOLD MISSING HERO: no visible hero section");
  } else if (!hero.content.headline?.trim()) {
    errors.push("ABOVE-THE-FOLD HERO HAS NO HEADLINE");
  }

  // Hero placement actions = primary + (ideally) secondary CTA
  const heroActions = schema.actions.filter((a) =>
    a.placement.includes("hero")
  );
  const heroActionsWithHref = heroActions.filter(
    (a) => a.href && a.href.trim() !== "" && a.href.trim() !== "#"
  );
  if (heroActionsWithHref.length === 0) {
    errors.push(
      "ABOVE-THE-FOLD MISSING CTA: no hero-placement actions with a working href"
    );
  } else if (heroActionsWithHref.length === 1) {
    warnings.push(
      "ABOVE-THE-FOLD HAS ONLY 1 CTA: best practice is two — high-intent primary + lower-commitment secondary"
    );
  }

  // Local-service pages need a trust bar above the fold.
  if (schema.business.type === "local_service") {
    const trustBar = schema.sections.find(
      (s) => s.intent === "trust_bar" && s.visible
    );
    const bullets = trustBar?.content.bullets ?? [];
    if (!trustBar || bullets.length === 0) {
      errors.push(
        "LOCAL_SERVICE MISSING TRUST BAR: page needs a trust strip with at least one bullet (Licensed, Insured, Free Estimates, …)"
      );
    }
  }

  return {
    stage: "above_the_fold",
    passed: errors.length === 0,
    warnings,
    errors,
  };
}

/**
 * Check 5 — section headlines must state benefits, never generic
 * labels. Also ensures no template-instruction text leaked into
 * any section body.
 */
export function validateSectionHeadlines(schema: PageSchema): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const section of schema.sections) {
    if (!section.visible) continue;

    const headline = (section.content.headline ?? "").trim().toLowerCase();
    if (headline && GENERIC_SECTION_HEADLINES.has(headline)) {
      warnings.push(
        `GENERIC SECTION HEADLINE: section "${section.intent}" uses "${section.content.headline}" — restate as a benefit ("8 Ways We Keep Dallas Cool — All Year Round")`
      );
    }

    const body = section.content.body ?? "";
    for (const phrase of TEMPLATE_INSTRUCTION_PHRASES) {
      if (body.includes(phrase)) {
        errors.push(
          `TEMPLATE INSTRUCTIONS in section "${section.intent}" body: "${phrase}"`
        );
      }
    }
  }

  return {
    stage: "section_headlines",
    passed: errors.length === 0,
    warnings,
    errors,
  };
}

/**
 * Check 6 — layout coherence. Catches visual / structural problems
 * the other checks don't: orphan service cards (count % 3 === 1
 * looks bad on a 3-column grid), missing phone for local_service,
 * SaaS pages showing business hours, broken hrefs, duplicate nav
 * link text.
 */
export function validateLayoutCoherence(
  schema: PageSchema,
  soul: Record<string, unknown> | null | undefined,
  html: string
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // ── Orphan service card warning ──
  const servicesSection = schema.sections.find(
    (s) =>
      (s.intent === "services" ||
        s.intent === "features" ||
        s.intent === "products") &&
      s.visible
  );
  const itemCount = servicesSection?.content.items?.length ?? 0;
  if (itemCount > 1 && itemCount % 3 === 1) {
    warnings.push(
      `ORPHAN SERVICE CARD: services grid has ${itemCount} items — that's a 3-row layout with one orphan; aim for multiples of 3 (or 4 for a 2x2 / 4-col grid)`
    );
  }

  // ── Local service must have a phone ──
  if (schema.business.type === "local_service") {
    const phone = (schema.business.phone ?? "").trim();
    const soulPhone = readSoulField(soul, "phone");
    if (!phone && soulPhone) {
      errors.push(
        `LOCAL_SERVICE MISSING PHONE in schema: soul has "${soulPhone}" but schema.business.phone is empty`
      );
    } else if (!phone && !soulPhone) {
      warnings.push(
        "LOCAL_SERVICE MISSING PHONE: no phone in schema or soul — local-service pages convert better with a visible phone CTA"
      );
    }
  }

  // ── SaaS pages should not show business hours ──
  if (schema.business.type === "saas" || schema.business.type === "agency") {
    if (
      html.includes("Mon-Fri") ||
      html.includes("Monday – Friday") ||
      html.includes("business hours")
    ) {
      warnings.push(
        `${schema.business.type.toUpperCase()} HAS BUSINESS HOURS in HTML — SaaS / agency pages typically shouldn't show hours; check footer`
      );
    }
  }

  // ── Action hrefs must be real ──
  let hashCount = 0;
  for (const action of schema.actions) {
    if (action.href === "" || action.href.trim() === "") {
      errors.push(`ACTION "${action.id}" HAS EMPTY HREF`);
    } else if (action.href.trim() === "#") {
      hashCount += 1;
    }
  }
  if (hashCount > 2) {
    warnings.push(
      `${hashCount} actions point to bare "#" — anchor without a target. Replace with real routes.`
    );
  }

  // ── Nav must not have duplicate link text ──
  const navActions = schema.actions.filter((a) => a.placement.includes("nav"));
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const action of navActions) {
    const key = action.text.trim().toLowerCase();
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  if (duplicates.size > 0) {
    errors.push(
      `NAV HAS DUPLICATE LINK TEXT: ${Array.from(duplicates).join(", ")}`
    );
  }

  return {
    stage: "layout_coherence",
    passed: errors.length === 0,
    warnings,
    errors,
  };
}

// ─── Full pipeline ────────────────────────────────────────────────────────────

export interface FullPipelineValidationResult {
  /** True iff every stage's `passed` flag is true. */
  allPassed: boolean;
  /** Per-stage results in order. */
  results: ValidationResult[];
}

/**
 * Run the full pipeline validation. Call from seedLandingFromSoul
 * AFTER rendering and BEFORE persisting. If any stage fails, log
 * each error prominently to console.error so the failure surfaces
 * in Vercel function logs and can drive alerts. Never throws — the
 * caller must inspect `allPassed` and decide whether to roll back
 * (we currently do not — partial render > no render).
 */
export function validateFullPipeline(
  input: PipelineInput,
  soul: Record<string, unknown> | null | undefined,
  schema: PageSchema,
  html: string,
  options: { orgId?: string } = {}
): FullPipelineValidationResult {
  const results: ValidationResult[] = [
    validateSoulStorage(input, soul),
    validatePageSchema(soul, schema),
    validateHeadlineQuality(schema, soul),
    validateAboveTheFold(schema),
    validateSectionHeadlines(schema),
    validateLayoutCoherence(schema, soul, html),
    validateRenderedHTML(soul, html),
  ];

  const allPassed = results.every((r) => r.passed);

  if (!allPassed) {
    const orgTag = options.orgId ? ` org=${options.orgId}` : "";
    console.error("╔══════════════════════════════════════════════╗");
    console.error(`║  PIPELINE VALIDATION FAILED${orgTag.padEnd(18, " ")}║`);
    console.error("╚══════════════════════════════════════════════╝");
    for (const result of results) {
      if (!result.passed) {
        console.error(`\n❌ Stage: ${result.stage}`);
        for (const error of result.errors) {
          console.error(`   → ${error}`);
        }
      }
      if (result.warnings.length > 0) {
        console.error(`\n⚠  Stage: ${result.stage} (warnings)`);
        for (const warning of result.warnings) {
          console.error(`   → ${warning}`);
        }
      }
    }
    console.error("");
  }

  return { allPassed, results };
}

// ─── CRM Personality validation ──────────────────────────────────────────────
//
// Catches personalities that would render an unusable admin UI: too few
// pipeline stages to express a real funnel, missing terminology (sidebar
// labels would fall back to "Contact"/"Deal"), or an intake form that
// can't capture a contact (no fields, or no required email channel).

export function validateCRMPersonality(
  personality: CRMPersonality | null | undefined,
  businessType?: string | null
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!personality) {
    errors.push("PERSONALITY MISSING: no CRMPersonality available");
    return { stage: "crm_personality", passed: false, warnings, errors };
  }

  const businessTag = businessType ? ` (business_type=${businessType})` : "";

  if (!personality.pipeline?.stages || personality.pipeline.stages.length < 4) {
    errors.push(
      `PIPELINE TOO SHORT${businessTag}: vertical "${personality.vertical}" has ${personality.pipeline?.stages?.length ?? 0} stages — need at least 4 to express a real funnel`
    );
  }

  const term = personality.terminology;
  if (
    !term ||
    !term.contact?.singular ||
    !term.contact?.plural ||
    !term.deal?.singular ||
    !term.deal?.plural ||
    !term.activity?.singular ||
    !term.activity?.plural
  ) {
    errors.push(
      `TERMINOLOGY INCOMPLETE${businessTag}: vertical "${personality.vertical}" missing singular/plural for one of contact/deal/activity`
    );
  }

  if (!Array.isArray(personality.intakeFields) || personality.intakeFields.length === 0) {
    errors.push(
      `INTAKE FIELDS EMPTY${businessTag}: vertical "${personality.vertical}" has no intake fields — public form would render no inputs`
    );
  } else {
    const hasRequiredEmail = personality.intakeFields.some(
      (f) => f.type === "email" && f.required
    );
    if (!hasRequiredEmail) {
      errors.push(
        `INTAKE MISSING REQUIRED EMAIL${businessTag}: vertical "${personality.vertical}" intake form has no required email field — submissions can't be tied back to a contact`
      );
    }
  }

  if (!Array.isArray(personality.contactFields?.industrySpecific)) {
    warnings.push(
      `CONTACT FIELDS UNDEFINED${businessTag}: vertical "${personality.vertical}" has no industry-specific contact fields — aside will fall back to standard fields only`
    );
  }

  return {
    stage: "crm_personality",
    passed: errors.length === 0,
    warnings,
    errors,
  };
}
