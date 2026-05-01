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
  stage: "soul_storage" | "page_schema" | "rendered_html";
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
    if (firstService && !html.includes(firstService)) {
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
  if (soulName && !html.includes(soulName)) {
    errors.push(`BUSINESS NAME NOT IN HTML: "${soulName}"`);
  }

  return {
    stage: "rendered_html",
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
