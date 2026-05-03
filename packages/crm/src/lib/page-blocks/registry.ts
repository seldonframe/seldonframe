// ============================================================================
// v1.4.0 — page-block registry (v2 architecture)
// ============================================================================
//
// The runtime catalog of v2 page blocks (hero, services, faq for v1.4).
// Each entry knows:
//   - name + version + section_type (mirrored from the block's SKILL.md frontmatter)
//   - propsSchema: a Zod schema that validates incoming props from the IDE agent
//   - toSection: a pure function that maps validated props to the existing
//     LandingSection shape consumed by renderGeneralServiceV1
//   - validators: deterministic post-generation checks (the validator-as-prompt
//     rules from the SKILL.md frontmatter, restated in code)
//
// Naming note: this module lives at lib/page-blocks/ to avoid collision with
// lib/blocks/ which is the marketplace-block-enablement system from the
// Composable Primitives slice. Different concept entirely.
//
// **Known duplication**: prop schema lives in two places — SKILL.md
// frontmatter (source of truth for the LLM in the IDE agent) AND this file
// (source of truth for runtime validation). v1.5 will eliminate by
// code-generating the Zod schema from the frontmatter at build time. For
// v1.4 the duplication is the cost of shipping the architectural seed in
// one session; commitment is to land code-gen in the next session before
// adding more blocks.
//
// To add a block in v1.4:
//   1. Author packages/crm/src/blocks/<name>/SKILL.md
//   2. Add an entry below
//   3. /api/v1/public/blocks/* + the v2 MCP tools auto-pick it up

import { z } from "zod";
import type { LandingSection } from "@/lib/blueprint/types";

export interface BlockDefinition<TProps = unknown> {
  name: string;
  version: string;
  /** Discriminator from blueprint/types.ts. Tells the renderer which
   *  Section variant to construct. */
  sectionType: "hero" | "services-grid" | "faq";
  /** One-line summary surfaced in list_blocks() and (later) marketplace. */
  description: string;
  /** Zod schema validating the LLM-generated props. Mirrors the SKILL.md
   *  frontmatter `props` field. */
  propsSchema: z.ZodType<TProps>;
  /** Maps validated v2 props onto the existing LandingSection shape so the
   *  v1 renderer (renderGeneralServiceV1) can produce HTML unchanged. */
  toSection: (props: TProps) => LandingSection;
  /** Deterministic post-generation checks the registry runs before
   *  persisting. Mirror the `validators` block in the SKILL.md
   *  frontmatter. Each returns null if the props pass, or an error
   *  message string if not. */
  validators: Array<(props: TProps) => string | null>;
}

// ─── HERO ────────────────────────────────────────────────────────────────────

const HeroPropsSchema = z.object({
  eyebrow: z.string().optional(),
  headline: z.string().min(4),
  subhead: z.string().min(8),
  cta_primary: z.object({
    label: z.string().min(2).max(40),
    href: z.enum(["/book", "/intake"]),
  }),
  cta_secondary: z
    .object({
      label: z.string().min(2).max(40),
      href: z.string().refine(
        (v) => v === "/book" || v === "/intake" || v.startsWith("tel:"),
        { message: "secondary cta_href must be /book, /intake, or tel:..." }
      ),
    })
    .optional(),
  background_image_query: z.string().min(2),
  variant: z
    .enum(["split-image-right", "full-bleed", "founder-portrait"])
    .optional(),
});
type HeroProps = z.infer<typeof HeroPropsSchema>;

const HERO_QUANTIFICATION_RE =
  /\d|%|★|\bfree\b|\bguaranteed\b|\bsame-day\b|\btoday\b|\binstantly\b|\bno-obligation\b|\bjust off\b|\bin [A-Z]/i;

const HERO_THROAT_CLEARING = [
  /^welcome to /i,
  /^your trusted /i,
  /^professional .* services?$/i,
  /^premier /i,
  /^the leading /i,
];

const HERO_SELDONFRAME_LEAKS = [
  /seldonframe/i,
  /\bAI-native\b/i,
  /\bBusiness OS\b/i,
  /Replace 5 Tools/i,
];

const heroBlock: BlockDefinition<HeroProps> = {
  name: "hero",
  version: "1.0.0",
  sectionType: "hero",
  description:
    "Above-the-fold hero with quantified value claim, primary CTA, and supporting visual.",
  propsSchema: HeroPropsSchema,
  toSection: (props) => ({
    type: "hero",
    eyebrow: props.eyebrow,
    headline: props.headline,
    subhead: props.subhead,
    ctaPrimary: { label: props.cta_primary.label, href: props.cta_primary.href },
    ctaSecondary: props.cta_secondary
      ? { label: props.cta_secondary.label, href: props.cta_secondary.href }
      : undefined,
    // imageUrl is resolved later by the persist endpoint via Unsplash before
    // the section reaches the renderer. background_image_query lives on the
    // raw props (block_instances.props) so re-resolves are cheap.
    imageUrl: null,
    variant: props.variant ?? "full-bleed",
  }),
  validators: [
    (p) =>
      HERO_QUANTIFICATION_RE.test(p.headline)
        ? null
        : `headline_quantified: headline "${p.headline}" lacks quantification (number, %, ★, "free", "guaranteed", "same-day", "today", "instantly", or proximity word)`,
    (p) =>
      HERO_THROAT_CLEARING.some((re) => re.test(p.headline))
        ? `no_throat_clearing: headline "${p.headline}" starts with a generic throat-clearing phrase`
        : null,
    (p) => {
      for (const re of HERO_SELDONFRAME_LEAKS) {
        if (
          re.test(p.headline) ||
          re.test(p.subhead) ||
          re.test(p.eyebrow ?? "")
        ) {
          return `no_seldonframe_strings: hero copy contains internal SF marketing language`;
        }
      }
      return null;
    },
    (p) =>
      p.cta_primary.href === "/book" || p.cta_primary.href === "/intake"
        ? null
        : `cta_routes_internal: cta_primary.href must be /book or /intake (got ${p.cta_primary.href})`,
  ],
};

// ─── SERVICES ────────────────────────────────────────────────────────────────

const ServicesPropsSchema = z.object({
  headline: z.string().min(2),
  subhead: z.string().optional(),
  layout: z.enum(["grid-3", "grid-4", "tabs", "stats"]).optional(),
  items: z
    .array(
      z.object({
        icon: z.string().min(2),
        title: z.string().min(2),
        description: z.string().min(8),
        price_from: z.string().optional(),
        category: z.string().optional(),
      })
    )
    .min(3)
    .max(8),
});
type ServicesProps = z.infer<typeof ServicesPropsSchema>;

const GENERIC_SERVICES_HEADLINES = [
  /^our services$/i,
  /^services$/i,
  /^what we do$/i,
  /^our offerings$/i,
];

const CORPORATE_PHRASES = [
  /our professional .* services/i,
  /industry-leading/i,
  /best-in-class/i,
  /state-of-the-art/i,
  /we pride ourselves/i,
];

const servicesBlock: BlockDefinition<ServicesProps> = {
  name: "services",
  version: "1.0.0",
  sectionType: "services-grid",
  description:
    "Services grid with one card per service, distinct icon per card, customer-language descriptions.",
  propsSchema: ServicesPropsSchema,
  toSection: (props) => ({
    type: "services-grid",
    headline: props.headline,
    subhead: props.subhead,
    layout: props.layout ?? "grid-3",
    items: props.items.map((item) => ({
      icon: item.icon,
      title: item.title,
      description: item.description,
      priceFrom: item.price_from,
      category: item.category,
    })),
  }),
  validators: [
    (p) => {
      const icons = p.items.map((i) => i.icon);
      const unique = new Set(icons);
      return icons.length === unique.size
        ? null
        : `distinct_icons: services items reuse icons (${icons.join(", ")}); each card must pick a different icon from the allowlist`;
    },
    (p) =>
      GENERIC_SERVICES_HEADLINES.some((re) => re.test(p.headline))
        ? `headline_not_generic: services headline "${p.headline}" is too generic — restate as benefit or vertical-specific phrasing`
        : null,
    (p) => {
      const offenders: string[] = [];
      for (const item of p.items) {
        for (const re of CORPORATE_PHRASES) {
          if (re.test(item.description)) {
            offenders.push(`"${item.title}"`);
            break;
          }
        }
      }
      return offenders.length > 0
        ? `descriptions_customer_language: corporate-stock phrases in ${offenders.join(", ")}`
        : null;
    },
  ],
};

// ─── FAQ ─────────────────────────────────────────────────────────────────────

const FaqPropsSchema = z.object({
  headline: z.string().min(2),
  items: z
    .array(
      z.object({
        question: z.string().min(3),
        answer: z.string().min(15),
      })
    )
    .min(4)
    .max(8),
});
type FaqProps = z.infer<typeof FaqPropsSchema>;

const COACHING_FAQ_LEAKS = [
  /How long is a typical engagement/i,
  /What's your approach/i,
  /What are your qualifications/i,
];

const GENERIC_FAQ_HEADLINES = [
  /^frequently asked questions$/i,
  /^faq$/i,
  /^faqs$/i,
  /^common questions$/i,
];

const faqBlock: BlockDefinition<FaqProps> = {
  name: "faq",
  version: "1.0.0",
  sectionType: "faq",
  description:
    "FAQ addressing real friction points (pricing, scheduling, scope, refunds) — not sales-pitch Q&A.",
  propsSchema: FaqPropsSchema,
  toSection: (props) => ({
    type: "faq",
    headline: props.headline,
    items: props.items,
  }),
  validators: [
    (p) => {
      for (const item of p.items) {
        for (const re of COACHING_FAQ_LEAKS) {
          if (re.test(item.question)) {
            return `no_coaching_leak: question "${item.question}" matches the coaching-template default that leaked into v1 workspaces`;
          }
        }
      }
      return null;
    },
    (p) =>
      GENERIC_FAQ_HEADLINES.some((re) => re.test(p.headline))
        ? `headline_specific: faq headline "${p.headline}" is generic — restate as something specific to the business`
        : null,
  ],
};

// ─── REGISTRY ────────────────────────────────────────────────────────────────

// `unknown` here lets us hold heterogeneously-typed blocks in one map; each
// dispatch site narrows via the registered schema.parse before calling the
// block's other functions.
export const BLOCK_REGISTRY: Record<string, BlockDefinition<unknown>> = {
  hero: heroBlock as unknown as BlockDefinition<unknown>,
  services: servicesBlock as unknown as BlockDefinition<unknown>,
  faq: faqBlock as unknown as BlockDefinition<unknown>,
};

export function listBlockNames(): string[] {
  return Object.keys(BLOCK_REGISTRY);
}

export function getBlock(name: string): BlockDefinition<unknown> | null {
  return BLOCK_REGISTRY[name] ?? null;
}
