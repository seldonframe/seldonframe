// ============================================================================
// Business-type classifier — deterministic keyword matching.
// ============================================================================
//
// April 30, 2026 — Soul + create_workspace previously seeded every page with
// local-service content ("Licensed and insured", "(555) 555-0100", "Same-day
// service available"). Operators in other industries had to manually delete
// it. Classify the soul-extracted business description into one of six
// types up-front, then schemaFromSoul() picks the matching content pack.
//
// Classifier is intentionally dumb + deterministic — keyword buckets, no
// LLM call. Trade-offs:
//   + Zero token cost
//   + Reproducible — same soul description, same classification, every time
//   + Easy to extend: add a keyword to the right bucket
//   - Brittle on edge cases (e.g. a "real estate brokerage" might land in
//     `professional_service` when it'd fit better as a custom vertical pack —
//     the operator can override via update_design_tokens or set_business_type)
//
// The soul.business_type field is also persisted so classify is run once at
// workspace creation; subsequent reads use the stored value.

import type { BusinessType } from "./types";

interface ClassifierRule {
  type: BusinessType;
  /** Lowercased keyword tokens. Match logic: any single keyword present in
   *  the lowercased description triggers the type. Earlier rules win. */
  keywords: string[];
}

// Order matters — first match wins. Industry-marker nouns (agency, studio)
// take precedence over market-segment qualifiers (saas, b2b). Otherwise
// "creative design agency for SaaS clients" gets classified as SaaS because
// "saas" appears in the haystack. The cleanest signal: if the operator
// describes themselves as an agency/studio, that's their business type
// regardless of who they sell to.
const RULES: ClassifierRule[] = [
  {
    type: "agency",
    keywords: [
      "agency",
      "studio",
      "creative agency",
      "marketing agency",
      "design agency",
      "dev agency",
      "branding agency",
      "growth agency",
      "production studio",
      "design studio",
      "boutique agency",
      "freelance collective",
    ],
  },
  {
    type: "saas",
    keywords: [
      "software",
      "saas",
      "platform",
      "developer tools",
      "developer tool",
      "open source",
      "open-source",
      "api",
      "framework",
      "library",
      "sdk",
      "cli",
      "ide",
      "mcp",
      "infrastructure",
      "developer-first",
      "indie hackers",
      "yc",
    ],
  },
  {
    type: "ecommerce",
    keywords: [
      "shop",
      "store",
      "ecommerce",
      "e-commerce",
      "products for sale",
      "shipping",
      "retail",
      "boutique",
      "merchandise",
      "shopify",
      "online shop",
      "online store",
      "sell physical",
      "free shipping",
    ],
  },
  {
    type: "professional_service",
    keywords: [
      "coaching",
      "coach",
      "consulting",
      "consultant",
      "consultancy",
      "therapy",
      "therapist",
      "counseling",
      "legal",
      "lawyer",
      "attorney",
      "advisory",
      "advisor",
      "accountant",
      "accounting",
      "tax preparer",
      "wealth management",
      "real estate agent",
      "broker",
      "financial planner",
      "personal trainer",
      "nutritionist",
    ],
  },
  {
    type: "local_service",
    keywords: [
      // HVAC / cooling / heating — May 2, 2026 broadened so business
      // names like "Pacific Coast Heating & Air" match without
      // requiring the operator to say "HVAC" verbatim. Was leaking
      // workspaces into the professional_service bucket → coaching
      // personality → wrong pipeline stages.
      "hvac",
      "heating",
      "cooling",
      "air conditioning",
      "air conditioner",
      "ac repair",
      "ac install",
      "furnace",
      "boiler",
      "heat pump",
      "mini-split",
      "mini split",
      "duct cleaning",
      "indoor air quality",
      // Plumbing / electrical
      "plumbing",
      "plumber",
      "electrician",
      "electrical",
      // Cleaning / property maintenance
      "cleaning service",
      "house cleaning",
      "carpet cleaning",
      "window cleaning",
      "landscaping",
      "lawn care",
      "roofing",
      "roofer",
      // Construction / contracting
      "construction",
      "contractor",
      "general contractor",
      "remodel",
      "renovation",
      "repair",
      "installation",
      "appliance repair",
      "auto repair",
      "auto detailing",
      // Other home services
      "pest control",
      "moving company",
      "junk removal",
      "tree service",
      "snow removal",
      "pool service",
      "garage door",
      "handyman",
      "locksmith",
    ],
  },
];

/**
 * Classify a free-text description into a BusinessType. Defaults to
 * "professional_service" if no keyword matches (the safest fallback —
 * generic, no industry-specific copy that would feel wrong).
 *
 * Inputs are normalized: trimmed, lowercased, punctuation collapsed to
 * spaces. The classifier intentionally over-matches on ambiguous words
 * (e.g. "service" alone doesn't trigger anything — only specific
 * compound terms do).
 */
export function classifyBusinessType(description: string): BusinessType {
  if (!description) return "professional_service";

  const haystack = normalizeDescription(description);
  if (!haystack) return "professional_service";

  for (const rule of RULES) {
    if (rule.keywords.some((keyword) => haystack.includes(keyword))) {
      return rule.type;
    }
  }

  return "professional_service";
}

/**
 * Build a haystack string from raw input. Lowercase, replace punctuation
 * with spaces, collapse whitespace. This catches keywords across
 * punctuation boundaries ("software-platform", "agency.studio") while
 * still keeping multi-word keywords ("open source") matchable.
 */
function normalizeDescription(input: string): string {
  return input
    .toLowerCase()
    .replace(/[.,;:!?()\[\]{}<>"'`/\\|]/g, " ")
    .replace(/[-_]+/g, "-") // preserve hyphens (open-source, e-commerce)
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Classify directly from a Soul object. Pulls from the most likely fields
 * in priority order: explicit `business_type` if set, then `industry`,
 * `soul_description`, `mission`, and finally `business_name`. Returns
 * "professional_service" if nothing useful is present.
 *
 * The Soul shape is loose (different soul-extraction pipelines write
 * different fields), so we accept `Record<string, unknown>` and pick
 * what we find.
 */
export function classifyBusinessTypeFromSoul(
  soul: Record<string, unknown> | null | undefined
): BusinessType {
  if (!soul) return "professional_service";

  // 1. Explicit override — if a previous classification ran or the operator
  //    set this manually, trust it.
  const explicit = readString(soul.business_type);
  if (explicit && isBusinessType(explicit)) return explicit;

  // 2. Industry-style soul fields. We treat these as equivalent inputs to
  //    the description: the keyword classifier walks them.
  const industry = readString(soul.industry);
  if (industry) {
    const fromIndustry = classifyBusinessType(industry);
    if (fromIndustry !== "professional_service" || matchesIndustry(industry, "professional_service")) {
      return fromIndustry;
    }
  }

  // 3. Free-text descriptions. soul_description usually carries the most
  //    useful signal (a paragraph the operator typed).
  const description = readString(soul.soul_description) || readString(soul.description);
  if (description) {
    return classifyBusinessType(description);
  }

  // 4. Mission / business name as last-resort signal.
  const mission = readString(soul.mission) || readString(soul.business_name);
  if (mission) {
    return classifyBusinessType(mission);
  }

  return "professional_service";
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isBusinessType(value: string): value is BusinessType {
  return (
    value === "local_service" ||
    value === "professional_service" ||
    value === "saas" ||
    value === "agency" ||
    value === "ecommerce" ||
    value === "other"
  );
}

/** True if `industry` matches the keyword bucket for `type`. Used to
 *  distinguish "industry classified as professional_service" from
 *  "industry didn't match anything" (both return professional_service from
 *  classifyBusinessType, but only the former should win over later signals). */
function matchesIndustry(industry: string, type: BusinessType): boolean {
  const haystack = normalizeDescription(industry);
  const rule = RULES.find((r) => r.type === type);
  if (!rule) return false;
  return rule.keywords.some((keyword) => haystack.includes(keyword));
}
