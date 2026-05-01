// ============================================================================
// schemaFromSoul — build a PageSchema from a workspace Soul + content pack.
// ============================================================================
//
// April 30, 2026 — primitives architecture A5/B1. The Soul is the workspace's
// memory of business identity (name, mission, services, FAQs, pipeline
// stages). schemaFromSoul() classifies the business type, picks the matching
// content pack, then merges the Soul's specifics (real headline, real
// services, real FAQs) on top of the pack's defaults.
//
// Output is a complete PageSchema — every required field filled, no
// placeholder copy unless the Soul itself was empty (in which case the pack's
// defaults stand in).
//
// The Soul shape is intentionally loose (Record<string, unknown>) because
// different soul-extraction paths write different fields:
//   - The structured Soul V4 (validated via zod, packages/crm/src/lib/soul-compiler/schema.ts)
//   - The looser submitted Soul (packages/crm/src/lib/soul/types.ts) used by
//     the MCP submit_soul flow.
// We accept either and pick whatever is present.

import {
  applyContentPackToSchema,
  getContentPack,
} from "./content-packs";
import { classifyBusinessTypeFromSoul } from "./classify-business";
import type {
  BusinessType,
  PageAction,
  PageSchema,
  PageSection,
  SectionFaq,
  SectionItem,
  PageTestimonial,
  PageBusiness,
} from "./types";

export interface SchemaFromSoulOptions {
  /** Override the auto-classified business type. */
  business_type?: BusinessType;
  /** Inject contact info that doesn't live on the Soul (phone, address). */
  business_overrides?: Partial<PageBusiness>;
}

/**
 * Build a complete PageSchema from a Soul object. Merges the Soul's
 * extracted business info onto the matching content pack defaults.
 *
 * Determinism: same Soul + same overrides → same PageSchema, byte-identical.
 * (Important so re-renders don't churn the persisted page HTML on every
 * webhook fire.)
 */
export function schemaFromSoul(
  soul: Record<string, unknown> | null | undefined,
  options: SchemaFromSoulOptions = {}
): PageSchema {
  const businessType =
    options.business_type ?? classifyBusinessTypeFromSoul(soul);

  const business = buildBusiness(soul, businessType, options.business_overrides);
  const pack = applyContentPackToSchema(businessType, business.name);

  // Merge soul-extracted content onto pack defaults.
  const sections = pack.sections.map((section) =>
    enrichSectionFromSoul(section, soul, business, businessType)
  );

  // Resolve action templates ({github_url}, {docs_url}) against business
  // contact links, drop unresolved ones for SaaS.
  const actions = pack.actions
    .map((action) => resolveActionTemplate(action, business))
    .filter((action): action is PageAction => action !== null);

  // Testimonials + partners from the Soul if present.
  const proof = {
    ...pack.proof,
    testimonials: extractTestimonials(soul),
    partners: extractPartners(soul),
  };

  return {
    business,
    sections,
    actions,
    proof,
    media: emptyMediaLibrary(),
  };
}

// ─── Business identity ───────────────────────────────────────────────────────

function buildBusiness(
  soul: Record<string, unknown> | null | undefined,
  type: BusinessType,
  overrides: Partial<PageBusiness> = {}
): PageBusiness {
  const name = readString(soul?.business_name) || "Your Business";
  const tagline = readString(soul?.tagline) || "";
  const description = readString(soul?.soul_description) || readString(soul?.mission) || "";

  // May 1, 2026 — read contact channels off the Soul. Local-service
  // workspaces (HVAC, plumbing, dental, etc.) need the phone to surface
  // as a nav CTA + footer link. SaaS workspaces typically don't carry
  // a phone — the helper just returns undefined and the renderer's
  // isUsablePhone() guard filters the empty case.
  const phone = readString(soul?.phone);
  const email = readString(soul?.email);
  const address = readString(soul?.address);

  // SaaS-specific links — picked off the Soul if present, otherwise omitted.
  const github_url = readString(soul?.github_url);
  const docs_url = readString(soul?.docs_url);
  const discord_url = readString(soul?.discord_url);

  return {
    name: overrides.name ?? name,
    type,
    tagline: overrides.tagline ?? tagline,
    description: overrides.description ?? description,
    phone: overrides.phone ?? (phone || undefined),
    email: overrides.email ?? (email || undefined),
    address: overrides.address ?? (address || undefined),
    github_url: overrides.github_url ?? (github_url || undefined),
    docs_url: overrides.docs_url ?? (docs_url || undefined),
    discord_url: overrides.discord_url ?? (discord_url || undefined),
  };
}

// ─── Section enrichment — fold soul data onto pack defaults ──────────────────

function enrichSectionFromSoul(
  section: PageSection,
  soul: Record<string, unknown> | null | undefined,
  business: PageBusiness,
  type: BusinessType
): PageSection {
  switch (section.intent) {
    case "hero":
      return enrichHero(section, soul, business);
    case "services":
    case "features":
    case "products":
      return enrichOfferings(section, soul, type);
    case "about":
      return enrichAbout(section, soul, business);
    case "faq":
      return enrichFaq(section, soul);
    case "pricing":
      return enrichPricing(section, soul);
    case "how_it_works":
      return enrichHowItWorks(section, soul);
    case "cta":
      return enrichCta(section, soul, business);
    default:
      return section;
  }
}

function enrichHero(
  section: PageSection,
  soul: Record<string, unknown> | null | undefined,
  business: PageBusiness
): PageSection {
  // Prefer the Soul's tagline + description over pack defaults — operators
  // typed those words; pack defaults are placeholders.
  const headline =
    readString(soul?.hero_headline) ||
    readString(soul?.tagline) ||
    section.content.headline ||
    `Welcome to ${business.name}`;
  const subheadline =
    readString(soul?.hero_subheadline) ||
    readString(soul?.soul_description) ||
    readString(soul?.mission) ||
    section.content.subheadline ||
    "";

  return {
    ...section,
    content: { ...section.content, headline, subheadline },
  };
}

function enrichOfferings(
  section: PageSection,
  soul: Record<string, unknown> | null | undefined,
  type: BusinessType
): PageSection {
  // May 1, 2026 — if the content pack pre-populated items (e.g. SaaS pack
  // hardcodes Landing Pages / Booking / CRM / AI Agents), don't overwrite
  // them with soul.offerings (which on SaaS workspaces is the pricing-tier
  // list — wrong for a features grid). Operators can still customize the
  // pre-populated items via update_page_content (A6 MCP tool).
  const packHasItems = (section.content.items?.length ?? 0) > 0;
  if (packHasItems) {
    return section;
  }

  // soul.offerings is the canonical field; older soul shapes used "services".
  const rawOfferings = readArray(soul?.offerings) ?? readArray(soul?.services) ?? [];

  const items: SectionItem[] = rawOfferings
    .map((entry) => normalizeOffering(entry))
    .filter((item): item is SectionItem => item !== null);

  // Pick a per-type intent label. SaaS calls them Features, ecommerce
  // calls them Products, everyone else calls them Services.
  const headline =
    section.content.headline ??
    (type === "saas"
      ? "Features"
      : type === "ecommerce"
        ? "Our products"
        : "What we do");

  return {
    ...section,
    content: {
      ...section.content,
      headline,
      items: items.length > 0 ? items : section.content.items ?? [],
    },
  };
}

function normalizeOffering(entry: unknown): SectionItem | null {
  if (!entry || typeof entry !== "object") return null;
  const obj = entry as Record<string, unknown>;
  const title = readString(obj.name) || readString(obj.title);
  if (!title) return null;
  const description = readString(obj.description) || readString(obj.body);
  return {
    title,
    description,
    icon: readString(obj.icon) || undefined,
    image: readString(obj.image) || undefined,
    href: readString(obj.href) || undefined,
  };
}

function enrichAbout(
  section: PageSection,
  soul: Record<string, unknown> | null | undefined,
  business: PageBusiness
): PageSection {
  const body =
    readString(soul?.about_body) ||
    readString(soul?.mission) ||
    business.description ||
    section.content.body ||
    "";
  const headline = readString(soul?.about_headline) || section.content.headline || `About ${business.name}`;
  return {
    ...section,
    content: { ...section.content, headline, body },
  };
}

function enrichFaq(
  section: PageSection,
  soul: Record<string, unknown> | null | undefined
): PageSection {
  const faqs = extractFaqs(soul);
  if (faqs.length === 0) {
    // Pack defaults already populated by applyContentPackToSchema; leave them.
    return section;
  }
  return {
    ...section,
    content: { ...section.content, faqs },
  };
}

function enrichPricing(
  section: PageSection,
  soul: Record<string, unknown> | null | undefined
): PageSection {
  const rawOfferings = readArray(soul?.offerings) ?? [];
  const items = rawOfferings
    .map((entry) => normalizeOffering(entry))
    .filter((item): item is SectionItem => item !== null);
  if (items.length === 0) return section;
  return {
    ...section,
    content: { ...section.content, items },
  };
}

function enrichHowItWorks(
  section: PageSection,
  soul: Record<string, unknown> | null | undefined
): PageSection {
  // soul.how_it_works (if present) is an array of {title, description}
  const items = readArray(soul?.how_it_works)
    ?.map((entry) => normalizeOffering(entry))
    .filter((item): item is SectionItem => item !== null);
  if (!items || items.length === 0) return section;
  return {
    ...section,
    content: { ...section.content, items },
  };
}

function enrichCta(
  section: PageSection,
  soul: Record<string, unknown> | null | undefined,
  business: PageBusiness
): PageSection {
  // CTAs lean on the Soul's tagline if present; otherwise pack defaults stand.
  const headline =
    readString(soul?.cta_headline) ||
    section.content.headline ||
    `Ready to work with ${business.name}?`;
  return {
    ...section,
    content: { ...section.content, headline },
  };
}

// ─── Soul extractors ─────────────────────────────────────────────────────────

function extractFaqs(soul: Record<string, unknown> | null | undefined): SectionFaq[] {
  const raw = readArray(soul?.faqs);
  if (!raw) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const obj = entry as Record<string, unknown>;
      const question = readString(obj.q) || readString(obj.question);
      const answer = readString(obj.a) || readString(obj.answer);
      if (!question || !answer) return null;
      return { question, answer };
    })
    .filter((item): item is SectionFaq => item !== null);
}

function extractTestimonials(
  soul: Record<string, unknown> | null | undefined
): PageTestimonial[] {
  const raw = readArray(soul?.testimonials);
  if (!raw) return [];
  const out: PageTestimonial[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const obj = entry as Record<string, unknown>;
    const quote = readString(obj.quote) || readString(obj.body);
    if (!quote) continue;
    const item: PageTestimonial = {
      quote,
      name: readString(obj.name),
      role: readString(obj.role) || readString(obj.title),
      company: readString(obj.company) || readString(obj.org),
    };
    const avatar = readString(obj.avatar);
    if (avatar) item.avatar = avatar;
    out.push(item);
  }
  return out;
}

function extractPartners(soul: Record<string, unknown> | null | undefined): string[] {
  const raw = readArray(soul?.partners);
  if (!raw) return [];
  return raw
    .map((entry) => (typeof entry === "string" ? entry : readString((entry as Record<string, unknown>)?.name)))
    .filter((name): name is string => Boolean(name));
}

// ─── Action template resolution ──────────────────────────────────────────────
//
// SaaS pack actions reference `{github_url}` / `{docs_url}` / `{discord_url}`.
// Resolve those against the business's actual links. If a link is missing,
// drop the action so we don't render a button to an empty href.

function resolveActionTemplate(action: PageAction, business: PageBusiness): PageAction | null {
  // May 1, 2026 — handle the bare `tel:` href used by local-service
  // packs ("Call us" secondary CTA). When the workspace has a phone,
  // expand to a full tel: URI; when it doesn't, drop the action so we
  // don't render a broken link.
  if (action.href === "tel:" || action.href === "tel:{phone}") {
    if (!business.phone) return null;
    return { ...action, href: `tel:${business.phone.replace(/[^+0-9]/g, "")}` };
  }

  if (!action.href.includes("{")) return action;

  let resolved = action.href;
  if (resolved.includes("{github_url}")) {
    if (!business.github_url) return null;
    resolved = resolved.replace("{github_url}", business.github_url);
  }
  if (resolved.includes("{docs_url}")) {
    if (!business.docs_url) return null;
    resolved = resolved.replace("{docs_url}", business.docs_url);
  }
  if (resolved.includes("{discord_url}")) {
    if (!business.discord_url) return null;
    resolved = resolved.replace("{discord_url}", business.discord_url);
  }
  return { ...action, href: resolved };
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function emptyMediaLibrary() {
  return {
    gallery: [] as Array<{ url: string; alt: string; tags: string[] }>,
  };
}
