// ============================================================================
// blueprintFromSchema — convert PageSchema → Blueprint for the V1 renderer.
// ============================================================================
//
// May 1, 2026 — primitives architecture A5/B2. The general-service-v1
// renderer was written before PageSchema existed; it consumes a Blueprint
// with structured section types (SectionHero, SectionFaq, etc.). To run
// the new pipeline (Soul → schemaFromSoul → renderer.render) without
// rewriting 1,672 lines of renderer code, the adapter converts in this
// direction. The Blueprint becomes a transport format the V1 renderer
// understands; PageSchema is the source of truth.
//
// Mapping rules:
//   PageSchema.business → Blueprint.workspace
//   PageSchema.actions (placement: "hero")  → SectionHero.ctaPrimary/Secondary
//   PageSchema.actions (placement: "cta")   → SectionMidCta.ctaPrimary
//   PageSection.intent === "hero"           → SectionHero
//   PageSection.intent === "trust_bar"      → SectionTrustStrip
//   PageSection.intent === "services|features|products" → SectionServicesGrid
//   PageSection.intent === "about"          → SectionAbout
//   PageSection.intent === "testimonials"   → SectionTestimonials
//   PageSection.intent === "faq"            → SectionFaq
//   PageSection.intent === "cta"            → SectionMidCta
//   PageSection.intent === "footer"         → SectionFooter (struct flags
//                                              from content-pack hints)
//
// Sections we don't have a Blueprint equivalent for (pricing, how_it_works,
// portfolio, stats, team) get rendered as a synthetic services-grid so the
// content still appears, even if the layout isn't bespoke.

import type {
  Blueprint,
  CTA,
  Contact,
  LandingSection,
  SectionAbout,
  SectionFaq as BPFaq,
  SectionFooter,
  SectionHero,
  SectionMidCta,
  SectionServicesGrid,
  SectionTestimonials,
  SectionTrustStrip,
  Theme,
  WeeklyHours,
  Workspace,
} from "../../blueprint/types";
import type {
  BusinessType,
  PageAction,
  PageSchema,
  PageSection,
  PageBusiness,
} from "../types";
import type { DesignTokens } from "../design-tokens";

const EMPTY_HOURS: WeeklyHours = {
  mon: null,
  tue: null,
  wed: null,
  thu: null,
  fri: null,
  sat: null,
  sun: null,
};

const DEFAULT_LOCAL_HOURS: WeeklyHours = {
  mon: [9, 17],
  tue: [9, 17],
  wed: [9, 17],
  thu: [9, 17],
  fri: [9, 17],
  sat: null,
  sun: null,
};

interface ConvertContext {
  business: PageBusiness;
  actionsByPlacement: Map<string, PageAction[]>;
  tokens: DesignTokens;
}

/**
 * Build a complete Blueprint from a PageSchema + DesignTokens. Every
 * Blueprint field gets a sensible default (the V1 renderer is allergic
 * to null/undefined in core fields — empty strings or empty arrays
 * keep it happy).
 *
 * The Blueprint produced here is consumed by `renderGeneralServiceV1`
 * exactly the same way as legacy persisted Blueprints. No renderer code
 * changes required; the only renderer-side concession is that
 * `renderNavbar` / `renderFooter` skip the phone CTA when the contact
 * phone is empty (already shipped in the same commit).
 */
export function blueprintFromSchema(
  schema: PageSchema,
  tokens: DesignTokens
): Blueprint {
  const ctx: ConvertContext = {
    business: schema.business,
    actionsByPlacement: groupActionsByPlacement(schema.actions),
    tokens,
  };

  const workspace = buildWorkspace(schema.business, tokens);
  const sections = buildLandingSections(schema, ctx);

  return {
    version: 1,
    workspace,
    landing: { renderer: "general-service-v1", sections },
    booking: stubBookingBlueprint(workspace),
    intake: stubIntakeBlueprint(workspace),
    admin: {
      renderer: "twenty-shell-v1",
      objects: [],
      sidebarOrder: [],
    },
  };
}

// ─── Workspace + theme ───────────────────────────────────────────────────────

function buildWorkspace(business: PageBusiness, tokens: DesignTokens): Workspace {
  return {
    name: business.name,
    tagline: business.tagline || undefined,
    industry: businessTypeToIndustry(business.type),
    theme: themeFromTokens(tokens, business),
    contact: contactFromBusiness(business),
  };
}

function themeFromTokens(tokens: DesignTokens, business: PageBusiness): Theme {
  // The Blueprint Theme has a constrained displayFont/bodyFont enum.
  // Map DesignTokens.typography to the closest enum value; renderer
  // falls back to default fonts when unknown.
  const displayFont: Theme["displayFont"] =
    tokens.typography.display.toLowerCase().includes("cal")
      ? "cal-sans"
      : tokens.typography.display.toLowerCase().includes("geist")
        ? "geist"
        : "cal-sans";
  return {
    mode: tokens.mode,
    accent: tokens.palette.accent,
    displayFont,
    bodyFont: "inter",
    radiusScale:
      tokens.density === "compact"
        ? "minimal"
        : tokens.density === "spacious"
          ? "rounded"
          : "default",
    logoUrl: business.email ? null : null, // logo wired from MediaLibrary later
    heroImageUrl: null,
  };
}

function contactFromBusiness(business: PageBusiness): Contact {
  return {
    // Empty string when missing — the renderer's isUsablePhone() guards
    // every site that consumed the phone, so empties just hide that UI.
    phone: business.phone ?? "",
    emergencyPhone: null,
    email: business.email ?? null,
    address: parseAddress(business.address),
    hours: business.type === "local_service" ? DEFAULT_LOCAL_HOURS : EMPTY_HOURS,
    timezone: "UTC",
  };
}

function parseAddress(addr: string | undefined) {
  if (!addr) {
    return { street: "", city: "", region: "", postalCode: "", country: "" };
  }
  // Best-effort: split on commas. The renderer treats empty fields as
  // "skip this line" in the footer block.
  const parts = addr.split(",").map((p) => p.trim());
  const [street = "", city = "", region = "", postalCode = "", country = ""] = parts;
  return { street, city, region, postalCode, country };
}

function businessTypeToIndustry(type: BusinessType): string {
  // Industry strings the legacy renderer recognizes for default copy.
  // Used for Blueprint validation and for legacy code paths that branch
  // on industry. New code branches on PageBusiness.type instead.
  switch (type) {
    case "local_service":
      return "general-service";
    case "professional_service":
      return "professional-service";
    case "saas":
      return "saas";
    case "agency":
      return "agency";
    case "ecommerce":
      return "ecommerce";
    case "other":
    default:
      return "general-service";
  }
}

// ─── Action grouping ─────────────────────────────────────────────────────────

function groupActionsByPlacement(actions: PageAction[]): Map<string, PageAction[]> {
  const map = new Map<string, PageAction[]>();
  for (const action of actions) {
    for (const placement of action.placement) {
      const existing = map.get(placement) ?? [];
      existing.push(action);
      map.set(placement, existing);
    }
  }
  return map;
}

// ─── Section conversion ─────────────────────────────────────────────────────

function buildLandingSections(
  schema: PageSchema,
  ctx: ConvertContext
): LandingSection[] {
  // Use only visible sections, sorted by `order`.
  const visible = schema.sections
    .filter((s) => s.visible)
    .slice()
    .sort((a, b) => a.order - b.order);

  const result: LandingSection[] = [];
  for (const section of visible) {
    const converted = convertSection(section, ctx);
    if (converted) result.push(converted);
  }
  return result;
}

function convertSection(
  section: PageSection,
  ctx: ConvertContext
): LandingSection | null {
  switch (section.intent) {
    case "hero":
      return convertHero(section, ctx);
    case "trust_bar":
      return convertTrustBar(section);
    case "services":
    case "features":
    case "products":
      return convertServicesGrid(section);
    case "about":
      return convertAbout(section);
    case "testimonials":
      return convertTestimonials(section);
    case "faq":
      return convertFaq(section);
    case "cta":
      return convertMidCta(section, ctx);
    case "footer":
      return convertFooter(section, ctx);
    case "how_it_works":
    case "pricing":
    case "stats":
    case "portfolio":
    case "team":
      // No bespoke renderer — fall through as a services-grid so the
      // content still appears. Future renderers can produce dedicated
      // layouts; the V1 renderer is content-shape-tolerant.
      return convertServicesGrid(section);
  }
}

function convertHero(section: PageSection, ctx: ConvertContext): SectionHero {
  const heroActions = ctx.actionsByPlacement.get("hero") ?? [];
  // Deduplicate by id since one PageAction can list multiple placements.
  const seen = new Set<string>();
  const dedup = heroActions.filter((a) => {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });

  const primary = dedup.find((a) => a.style === "primary") ?? dedup[0];
  const secondary = dedup.find((a) => a !== primary && a.style !== "primary");

  return {
    type: "hero",
    headline: section.content.headline ?? `Welcome to ${ctx.business.name}`,
    subhead: section.content.subheadline,
    ctaPrimary: actionToCta(primary, "primary"),
    ctaSecondary: secondary ? actionToCta(secondary, "secondary") : undefined,
  };
}

function convertTrustBar(section: PageSection): SectionTrustStrip {
  return {
    type: "trust-strip",
    items: (section.content.bullets ?? []).map((label) => ({ label })),
  };
}

function convertServicesGrid(section: PageSection): SectionServicesGrid {
  return {
    type: "services-grid",
    headline: section.content.headline,
    subhead: section.content.subheadline,
    layout: "grid-3",
    items: (section.content.items ?? []).map((item) => ({
      title: item.title,
      description: item.description,
      icon: item.icon,
      learnMoreUrl: item.href ?? null,
    })),
  };
}

function convertAbout(section: PageSection): SectionAbout {
  return {
    type: "about",
    headline: section.content.headline ?? "About",
    body: section.content.body ?? "",
  };
}

function convertTestimonials(section: PageSection): SectionTestimonials {
  return {
    type: "testimonials",
    headline: section.content.headline,
    items: (section.content.items ?? []).map((item) => ({
      quote: item.description ?? "",
      authorName: item.title ?? "",
      avatarUrl: item.image ?? null,
    })),
  };
}

function convertFaq(section: PageSection): BPFaq {
  return {
    type: "faq",
    headline: section.content.headline,
    items: (section.content.faqs ?? []).map((faq) => ({
      question: faq.question,
      answer: faq.answer,
    })),
  };
}

function convertMidCta(section: PageSection, ctx: ConvertContext): SectionMidCta {
  const ctaActions = ctx.actionsByPlacement.get("cta") ?? [];
  const seen = new Set<string>();
  const dedup = ctaActions.filter((a) => {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });
  const primary = dedup.find((a) => a.style === "primary") ?? dedup[0];

  return {
    type: "mid-cta",
    headline: section.content.headline ?? "Ready to get started?",
    subhead: section.content.subheadline,
    ctaPrimary: primary ? actionToCta(primary, "primary") : undefined,
  };
}

function convertFooter(_section: PageSection, _ctx: ConvertContext): SectionFooter {
  return {
    type: "footer",
    showHours: false, // V1 renderer reads hours conditionally; pack hints unused
    showAddress: false,
    showServiceArea: false,
  };
}

// ─── Stub blocks for booking / intake (Blueprint requires them present) ─────

function stubBookingBlueprint(workspace: Workspace): Blueprint["booking"] {
  return {
    renderer: "calcom-month-v1",
    eventType: {
      title: `Book a call with ${workspace.name}`,
      durationMinutes: 30,
    },
    availability: { weekly: workspace.contact.hours },
    formFields: [],
    confirmation: {},
  };
}

function stubIntakeBlueprint(workspace: Workspace): Blueprint["intake"] {
  return {
    renderer: "formbricks-stack-v1",
    title: `Tell us about your project`,
    questions: [],
    completion: {
      headline: "Thanks!",
      message: `${workspace.name} will be in touch soon.`,
    },
  };
}

// ─── CTA conversion ─────────────────────────────────────────────────────────

function actionToCta(
  action: PageAction | undefined,
  fallbackKind: "primary" | "secondary"
): CTA {
  if (!action) return { label: "Get in touch", href: "/intake", kind: fallbackKind };
  // Tel-style hrefs get kind="tel" so the existing renderer styles them
  // as phone CTAs (icon, dial colors).
  const kind: CTA["kind"] = action.href.startsWith("tel:") ? "tel" : action.style;
  return {
    label: action.text,
    href: action.href,
    kind,
  };
}
