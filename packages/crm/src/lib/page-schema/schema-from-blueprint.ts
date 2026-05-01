// ============================================================================
// schemaFromBlueprint — convert legacy Blueprint JSON to a PageSchema.
// ============================================================================
//
// April 30, 2026 — primitives architecture A5. This is the migration bridge:
// existing workspaces persist a Blueprint object on landing_pages.blueprintJson
// (the input to general-service-v1.ts). New renderers consume a PageSchema.
//
// Goal: a workspace with only a Blueprint can still be rendered by any new
// RendererContract — feed Blueprint → schemaFromBlueprint() → PageSchema →
// renderer.render().
//
// The mapping covers the section types the V1 renderer handles. Anything
// new on the Blueprint side that doesn't have a PageSchema equivalent is
// dropped (the V1 renderer remains as the canonical fallback for unmapped
// blueprints).

import type {
  Blueprint,
  CTA as BlueprintCTA,
  LandingSection,
  SectionAbout,
  SectionFaq as BPFaq,
  SectionFooter as BPFooter,
  SectionHero,
  SectionMidCta,
  SectionServicesGrid,
  SectionTestimonials,
  SectionTrustStrip,
  Testimonial as BPTestimonial,
} from "../blueprint/types";
import type {
  PageAction,
  PageSchema,
  PageSection,
  PageTestimonial,
  PageBusiness,
} from "./types";

/**
 * Convert a legacy Blueprint into a PageSchema. Pure function — no Soul
 * lookups, no env reads, deterministic.
 *
 * The Blueprint's `workspace.industry` is treated as the business type
 * via a small keyword map. Operators on existing workspaces with stale
 * industry values get classified as "professional_service" (the safe
 * default).
 */
export function schemaFromBlueprint(blueprint: Blueprint): PageSchema {
  const business = buildBusinessFromBlueprint(blueprint);

  // Walk landing.sections in order, keeping order (10, 20, 30, …) for
  // determinism with content-pack output.
  const sections: PageSection[] = [];
  const actions: PageAction[] = [];
  let order = 10;

  for (const section of blueprint.landing?.sections ?? []) {
    const mapped = mapBlueprintSection(section, order, actions);
    if (mapped) {
      sections.push(mapped);
      order += 10;
    }
  }

  // Always-present synthetic footer (the V1 renderer renders one regardless
  // of whether the Blueprint had an explicit footer section).
  if (!sections.some((s) => s.intent === "footer")) {
    sections.push({
      id: "footer",
      intent: "footer",
      content: {},
      visible: true,
      order,
    });
  }

  return {
    business,
    sections,
    actions,
    proof: {
      testimonials: extractTestimonialsFromBlueprint(blueprint),
      partners: [],
      trust_badges: extractTrustBadgesFromBlueprint(blueprint),
    },
    media: {
      logo: blueprint.workspace?.theme?.logoUrl ?? undefined,
      hero_image: blueprint.workspace?.theme?.heroImageUrl ?? undefined,
      gallery: [],
    },
  };
}

function buildBusinessFromBlueprint(blueprint: Blueprint): PageBusiness {
  const ws = blueprint.workspace;
  return {
    name: ws.name,
    type: classifyIndustry(ws.industry),
    tagline: ws.tagline ?? "",
    description: "",
    phone: ws.contact?.phone || undefined,
    email: ws.contact?.email || undefined,
    address: ws.contact?.address
      ? formatAddress(ws.contact.address)
      : undefined,
  };
}

function classifyIndustry(industry: string): PageBusiness["type"] {
  const v = (industry || "").toLowerCase();
  if (
    v.includes("software") ||
    v.includes("saas") ||
    v.includes("developer") ||
    v.includes("platform") ||
    v.includes("api")
  ) {
    return "saas";
  }
  if (v.includes("agency") || v.includes("studio")) return "agency";
  if (v.includes("shop") || v.includes("retail") || v.includes("ecommerce")) return "ecommerce";
  if (
    v.includes("hvac") ||
    v.includes("plumbing") ||
    v.includes("electrician") ||
    v.includes("roofing") ||
    v.includes("cleaning") ||
    v.includes("repair") ||
    v.includes("landscaping")
  ) {
    return "local_service";
  }
  return "professional_service";
}

function formatAddress(addr: NonNullable<Blueprint["workspace"]["contact"]>["address"]): string {
  const parts = [addr.street, addr.city, addr.region, addr.postalCode, addr.country].filter(
    (p) => Boolean(p)
  );
  return parts.join(", ");
}

// ─── Section mapping ─────────────────────────────────────────────────────────

function mapBlueprintSection(
  section: LandingSection,
  order: number,
  actionsOut: PageAction[]
): PageSection | null {
  switch (section.type) {
    case "hero":
      return mapHero(section, order, actionsOut);
    case "trust-strip":
      return mapTrustStrip(section, order);
    case "services-grid":
      return mapServicesGrid(section, order);
    case "about":
      return mapAbout(section, order);
    case "mid-cta":
      return mapMidCta(section, order, actionsOut);
    case "testimonials":
      return mapTestimonials(section, order);
    case "faq":
      return mapFaq(section, order);
    case "footer":
      return mapFooter(section, order);
    case "emergency-strip":
    case "service-area":
    case "partners":
      // No direct PageSchema equivalent on the reverse path; renderer-
      // specific or content-pack-only. Skip — the legacy renderer still
      // handles these natively when a Blueprint is rendered directly.
      return null;
  }
}

function mapHero(
  section: SectionHero,
  order: number,
  actionsOut: PageAction[]
): PageSection {
  // Pull CTAs into actions[] with placement: ["hero"].
  if (section.ctaPrimary) {
    actionsOut.push(ctaToAction(section.ctaPrimary, "hero_primary", "primary", ["hero"]));
  }
  if (section.ctaSecondary) {
    actionsOut.push(ctaToAction(section.ctaSecondary, "hero_secondary", "secondary", ["hero"]));
  }
  return {
    id: "hero",
    intent: "hero",
    content: {
      headline: section.headline,
      subheadline: section.subhead ?? "",
    },
    visible: true,
    order,
  };
}

function mapTrustStrip(section: SectionTrustStrip, order: number): PageSection {
  return {
    id: "trust_bar",
    intent: "trust_bar",
    content: { bullets: section.items.map((item) => item.label) },
    visible: true,
    order,
  };
}

function mapServicesGrid(section: SectionServicesGrid, order: number): PageSection {
  return {
    id: "services",
    intent: "services",
    content: {
      headline: section.headline,
      subheadline: section.subhead,
      items: section.items.map((item) => ({
        title: item.title,
        description: item.description,
        icon: item.icon,
        href: item.learnMoreUrl ?? undefined,
      })),
    },
    visible: true,
    order,
  };
}

function mapAbout(section: SectionAbout, order: number): PageSection {
  return {
    id: "about",
    intent: "about",
    content: { headline: section.headline, body: section.body },
    visible: true,
    order,
  };
}

function mapMidCta(
  section: SectionMidCta,
  order: number,
  actionsOut: PageAction[]
): PageSection {
  if (section.ctaPrimary) {
    actionsOut.push(ctaToAction(section.ctaPrimary, "cta_primary", "primary", ["cta"]));
  }
  return {
    id: "cta",
    intent: "cta",
    content: { headline: section.headline, subheadline: section.subhead },
    visible: true,
    order,
  };
}

function mapTestimonials(section: SectionTestimonials, order: number): PageSection {
  return {
    id: "testimonials",
    intent: "testimonials",
    content: {
      headline: section.headline,
      items: section.items.map((t) => ({
        title: t.authorName,
        description: t.quote,
        image: t.avatarUrl ?? undefined,
      })),
    },
    visible: true,
    order,
  };
}

function mapFaq(section: BPFaq, order: number): PageSection {
  return {
    id: "faq",
    intent: "faq",
    content: {
      headline: section.headline,
      faqs: section.items.map((q) => ({ question: q.question, answer: q.answer })),
    },
    visible: true,
    order,
  };
}

function mapFooter(_section: BPFooter, order: number): PageSection {
  return {
    id: "footer",
    intent: "footer",
    content: {},
    visible: true,
    order,
  };
}

function ctaToAction(
  cta: BlueprintCTA,
  id: string,
  style: PageAction["style"],
  placement: string[]
): PageAction {
  return {
    id,
    text: cta.label,
    href: cta.href ?? "#",
    style,
    placement,
  };
}

// ─── Proof extractors ────────────────────────────────────────────────────────

function extractTestimonialsFromBlueprint(blueprint: Blueprint): PageTestimonial[] {
  const sections = blueprint.landing?.sections ?? [];
  const testimonialSection = sections.find((s) => s.type === "testimonials") as
    | SectionTestimonials
    | undefined;
  if (!testimonialSection) return [];
  const all: BPTestimonial[] = testimonialSection.items.slice();
  if (testimonialSection.featured) all.unshift(testimonialSection.featured);
  return all.map((t) => ({
    quote: t.quote,
    name: t.authorName,
    role: t.authorRole ?? "",
    company: "",
    avatar: t.avatarUrl ?? undefined,
  }));
}

function extractTrustBadgesFromBlueprint(blueprint: Blueprint): string[] {
  const sections = blueprint.landing?.sections ?? [];
  const trust = sections.find((s) => s.type === "trust-strip") as SectionTrustStrip | undefined;
  return trust ? trust.items.map((item) => item.label) : [];
}
