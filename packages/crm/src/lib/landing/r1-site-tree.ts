// packages/crm/src/lib/landing/r1-site-tree.ts
//
// Pure, DB-free helpers + types for the multi-page R1 site tree.
//
// Phase 1 adds three OPTIONAL top-level keys to the R1 landing payload:
//   • servicePages?: ServicePage[]   — one page per service (15–20 in P4)
//   • nav?: R1NavConfig              — shared navbar config
//   • theme?: R1ThemeConfig          — { mode?: "light" | "dark" }
//
// All are optional so existing single-page payloads render unchanged. This
// module owns the slugifier, a non-throwing validator, and the safe accessors
// the routes use. Nothing here imports the DB — it runs under node:test + tsx
// with zero mocking.

/** One free-text content block in a service page body. Future block kinds
 *  (process, benefits, list) are added in P3; Phase 1 ships "paragraph". */
export type ServicePageBody =
  | { kind: "paragraph"; text: string }
  | { kind: "heading"; text: string };

/** A single auto-populated service detail page. */
export type ServicePage = {
  /** URL segment, e.g. "kitchen-remodeling". Unique within servicePages. */
  slug: string;
  /** Display name, e.g. "Kitchen Remodeling". */
  name: string;
  /** Optional hero photo for the service page. */
  heroPhoto?: { src: string; alt: string };
  /** One-line summary shown in the hero / meta description. */
  summary: string;
  /** Description + process/benefits content blocks (rendered in order). */
  body: ServicePageBody[];
  /** Mini-gallery (service-tagged subset). Phase 1 carries the data; the
   *  gallery render is P3. Optional, defaults to []. */
  gallery?: { src: string; alt: string; caption?: string }[];
  /** Service-tagged or general testimonials reused by the template. */
  testimonials?: {
    id: string;
    quote: string;
    name: string;
    city?: string;
    rating?: number;
    service?: string;
  }[];
  /** Primary CTA label for this service, e.g. "Get a free estimate". */
  ctaLabel: string;
};

/** Shared navbar configuration (Services dropdown is derived from
 *  servicePages; these are the non-service links + CTA). */
export type R1NavConfig = {
  /** Extra top-level links beyond the Services dropdown. */
  items?: { label: string; href: string }[];
  /** Primary CTA shown at the right of the navbar (optional override). */
  cta?: { label: string; href: string };
};

/** Top-level theme config. Phase 1 only consumes `mode`. */
export type R1ThemeConfig = {
  mode?: "light" | "dark";
};

/**
 * Slugify a service name into a URL segment.
 * Lowercase, non-alphanumerics → single hyphen, no leading/trailing hyphens.
 * Returns "" for empty / non-string input (callers guard against "").
 */
export function serviceSlug(name: string): string {
  if (typeof name !== "string") return "";
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ── Safe accessors ───────────────────────────────────────────────────────────

/** Structural shape we read from the (untyped-at-runtime) payload jsonb. */
type WithSiteTree = {
  servicePages?: unknown;
  nav?: unknown;
  theme?: unknown;
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * Return the servicePages array, or [] when absent/malformed.
 * Entries are NOT validated here — use validateSiteTree for that. This is the
 * tolerant read path the routes use; findServicePage layers the slug guard.
 */
export function getServicePages(payload: unknown): ServicePage[] {
  if (!isObject(payload)) return [];
  const sp = (payload as WithSiteTree).servicePages;
  return Array.isArray(sp) ? (sp as ServicePage[]) : [];
}

/**
 * Find a service page by slug. Returns null when servicePages is absent, the
 * slug is blank, or no entry matches. Entries with a missing/blank slug are
 * skipped so a half-populated payload can't shadow a real match with "".
 */
export function findServicePage(payload: unknown, slug: string): ServicePage | null {
  if (!isNonEmptyString(slug)) return null;
  const target = slug.trim();
  for (const page of getServicePages(payload)) {
    if (isObject(page) && isNonEmptyString(page.slug) && page.slug === target) {
      return page;
    }
  }
  return null;
}

// ── Validator ────────────────────────────────────────────────────────────────

export type SiteTreeValidation = { valid: boolean; errors: string[] };

const REQUIRED_SERVICE_STRINGS: (keyof ServicePage)[] = [
  "slug",
  "name",
  "summary",
  "ctaLabel",
];

/**
 * Validate the OPTIONAL multi-page additions on an R1 payload. Never throws.
 * A legacy single-page payload (no servicePages/nav/theme) is VALID — the new
 * keys are optional. When present, each is checked structurally:
 *   • servicePages: array; each entry has non-empty slug/name/summary/ctaLabel
 *     and a `body` array; slugs are unique.
 *   • theme.mode: when present, must be "light" | "dark".
 *   • nav: when present, must be an object (items/cta are optional).
 */
export function validateSiteTree(payload: unknown): SiteTreeValidation {
  const errors: string[] = [];

  if (!isObject(payload)) {
    return { valid: false, errors: ["payload is not an object"] };
  }

  const tree = payload as WithSiteTree;

  // theme.mode
  if (tree.theme !== undefined) {
    if (!isObject(tree.theme)) {
      errors.push("theme must be an object");
    } else if (
      tree.theme.mode !== undefined &&
      tree.theme.mode !== "light" &&
      tree.theme.mode !== "dark"
    ) {
      errors.push('theme.mode must be "light" or "dark"');
    }
  }

  // nav
  if (tree.nav !== undefined && !isObject(tree.nav)) {
    errors.push("nav must be an object");
  }

  // servicePages
  if (tree.servicePages !== undefined) {
    if (!Array.isArray(tree.servicePages)) {
      errors.push("servicePages must be an array");
    } else {
      const seen = new Set<string>();
      tree.servicePages.forEach((raw, i) => {
        if (!isObject(raw)) {
          errors.push(`servicePages[${i}] is not an object`);
          return;
        }
        for (const key of REQUIRED_SERVICE_STRINGS) {
          if (!isNonEmptyString(raw[key])) {
            errors.push(`servicePages[${i}].${String(key)} must be a non-empty string`);
          }
        }
        if (!Array.isArray(raw.body)) {
          errors.push(`servicePages[${i}].body must be an array`);
        }
        if (isNonEmptyString(raw.slug)) {
          if (seen.has(raw.slug)) {
            errors.push(`servicePages: duplicate slug "${raw.slug}"`);
          }
          seen.add(raw.slug);
        }
      });
    }
  }

  return { valid: errors.length === 0, errors };
}
