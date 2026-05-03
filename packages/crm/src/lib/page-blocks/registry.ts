// ============================================================================
// v1.4.0 / v1.5.0 — page-block registry (v2 architecture)
// ============================================================================
//
// The runtime catalog of v2 page blocks (hero, services, about, faq, cta,
// booking, intake). Each entry knows:
//   - name + version + surface + sectionType + description
//     → IMPORTED from each block's __generated__/block.ts file (codegen
//       reads SKILL.md frontmatter; this file does not duplicate it)
//   - propsSchema: the Zod schema validating LLM-generated props
//     → IMPORTED from __generated__/block.ts (single source of truth: SKILL.md)
//   - toSection: pure function mapping validated props onto the existing
//     LandingSection shape consumed by renderGeneralServiceV1
//     → HANDWRITTEN below (it's logic, not schema)
//   - validators: deterministic post-generation copy-quality checks
//     → HANDWRITTEN below (it's logic, not schema)
//
// v1.5.0 — codegen lands. Pre-1.5 the prop schema lived in BOTH SKILL.md
// (LLM-readable YAML) AND this file (runtime Zod) — every change required
// editing both, and divergence was undetectable until a runtime failure.
// The Cinder & Salt booking bug (v1.4.2 hotfix) was one such failure.
// Codegen makes the layer-mismatch class structurally impossible: edit
// SKILL.md → run `pnpm blocks:emit` → __generated__/block.ts updates →
// every consumer sees the new schema. CI lints staleness via
// `pnpm blocks:emit --check`.
//
// Naming note: this module lives at lib/page-blocks/ to avoid collision
// with lib/blocks/ which is the marketplace-block-enablement system from
// the Composable Primitives slice. Different concept entirely.

import { z } from "zod";
import type { LandingSection } from "@/lib/blueprint/types";

// Generated schemas + metadata — one import per block.
import {
  PropsSchema as HeroPropsSchema,
  meta as heroMeta,
  type Props as HeroProps,
} from "@/blocks/hero/__generated__/block";
import {
  PropsSchema as ServicesPropsSchema,
  meta as servicesMeta,
  type Props as ServicesProps,
} from "@/blocks/services/__generated__/block";
import {
  PropsSchema as AboutPropsSchema,
  meta as aboutMeta,
  type Props as AboutProps,
} from "@/blocks/about/__generated__/block";
import {
  PropsSchema as FaqPropsSchema,
  meta as faqMeta,
  type Props as FaqProps,
} from "@/blocks/faq/__generated__/block";
import {
  PropsSchema as CtaPropsSchema,
  meta as ctaMeta,
  type Props as CtaProps,
} from "@/blocks/cta/__generated__/block";
import {
  PropsSchema as BookingPropsSchema,
  meta as bookingMeta,
  type Props as BookingPropsGen,
} from "@/blocks/booking/__generated__/block";
import {
  PropsSchema as IntakePropsSchema,
  meta as intakeMeta,
  type Props as IntakePropsGen,
} from "@/blocks/intake/__generated__/block";

// Re-export the two non-landing-section block prop types so persist.ts
// can narrow validatedProps after registry dispatch.
export type BookingProps = BookingPropsGen;
export type IntakeProps = IntakePropsGen;

/**
 * v1.4.1 — surface kind. Discriminates how persist.ts routes a block.
 * Generated meta carries this as a string literal type.
 */
export type BlockSurface = "landing-section" | "booking" | "intake";

export interface BlockDefinition<TProps = unknown> {
  name: string;
  version: string;
  /** Which workspace surface this block writes to. */
  surface: BlockSurface;
  /** For landing-section blocks: which section type the block renders to.
   *  For booking/intake blocks: arbitrary discriminator. */
  sectionType: string;
  /** One-line summary surfaced in list_blocks() and (later) marketplace. */
  description: string;
  /** Zod schema validating LLM-generated props. Generated from SKILL.md. */
  propsSchema: z.ZodType<TProps>;
  /** For landing-section blocks: maps validated props onto the existing
   *  LandingSection shape. For booking/intake blocks: undefined — those
   *  use surface-specific persist paths that read the props directly. */
  toSection?: (props: TProps) => LandingSection;
  /** Deterministic post-generation checks. Each returns null if props
   *  pass, or an error message string if not. */
  validators: Array<(props: TProps) => string | null>;
}

// ─── HERO validators + toSection ────────────────────────────────────────────

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
  ...heroMeta,
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
    // imageUrl resolved later in persist.ts via Unsplash from
    // background_image_query.
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
    (p) => {
      const sec = p.cta_secondary;
      if (!sec) return null;
      return sec.href === "/book" ||
        sec.href === "/intake" ||
        sec.href.startsWith("tel:")
        ? null
        : `cta_secondary_href: must be /book, /intake, or tel:... (got ${sec.href})`;
    },
  ],
};

// ─── SERVICES validators + toSection ────────────────────────────────────────

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
  ...servicesMeta,
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

// ─── ABOUT validators + toSection ───────────────────────────────────────────

const GENERIC_ABOUT_HEADLINES = [
  /^about us$/i,
  /^about$/i,
  /^our story$/i,
  /^who we are$/i,
  /^meet the team$/i,
];
const ABOUT_CORPORATE_PHRASES = [
  /we pride ourselves/i,
  /industry-leading/i,
  /best-in-class/i,
  /state-of-the-art/i,
  /world-class/i,
  /cutting-edge/i,
  /\bsynergy\b/i,
  /\becosystem\b/i,
];
const ABOUT_SPECIFICITY_SIGNALS = [
  /\d/,
  /\bsince\b/i,
  /\bcertified\b/i,
  /\blicensed\b/i,
  /\bdon'?t\b/i,
  /\bonly\b/i,
];

const aboutBlock: BlockDefinition<AboutProps> = {
  ...aboutMeta,
  propsSchema: AboutPropsSchema,
  toSection: (props) => ({
    type: "about",
    headline: props.headline,
    body: props.body,
    photoUrl: null,
    ownerName: props.owner_name,
    ownerTitle: props.owner_title,
  }),
  validators: [
    (p) =>
      GENERIC_ABOUT_HEADLINES.some((re) => re.test(p.headline))
        ? `headline_not_generic: about headline "${p.headline}" is too generic — restate as something specific to the business`
        : null,
    (p) =>
      ABOUT_SPECIFICITY_SIGNALS.some((re) => re.test(p.body))
        ? null
        : `body_specificity: about body lacks concrete signals (years, numbers, city, credentials, "what we don't do"). Generic bodies erode trust.`,
    (p) => {
      for (const re of ABOUT_CORPORATE_PHRASES) {
        if (re.test(p.body)) {
          return `no_corporate_phrases: about body contains corporate-stock phrasing (matched ${re.source})`;
        }
      }
      return null;
    },
  ],
};

// ─── FAQ validators + toSection ─────────────────────────────────────────────

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
  ...faqMeta,
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

// ─── CTA validators + toSection ─────────────────────────────────────────────

const CTA_URGENCY_RE =
  /\d|%|★|\btoday\b|\bsame-day\b|\bfree\b|\bguaranteed\b|\brisk-free\b|\bthis week\b|\bnow\b|\bavailable\b|\bbefore\b/i;
const CTA_THROAT_CLEARING = [
  /^welcome\b/i,
  /^your trusted /i,
  /^premier /i,
  /^the leading /i,
  /^we are committed/i,
];

const ctaBlock: BlockDefinition<CtaProps> = {
  ...ctaMeta,
  propsSchema: CtaPropsSchema,
  toSection: (props) => ({
    type: "mid-cta",
    headline: props.headline,
    subhead: props.subhead,
    ctaPrimary: { label: props.cta_primary.label, href: props.cta_primary.href },
    ctaSecondary: props.cta_secondary
      ? { label: props.cta_secondary.label, href: props.cta_secondary.href }
      : undefined,
    embedQuoteForm: false,
  }),
  validators: [
    (p) =>
      p.cta_primary.href === "/book" || p.cta_primary.href === "/intake"
        ? null
        : `cta_routes_internal: cta_primary.href must be /book or /intake (got ${p.cta_primary.href})`,
    (p) =>
      CTA_URGENCY_RE.test(p.headline)
        ? null
        : `headline_quantified_or_urgent: cta headline "${p.headline}" lacks quantification or urgency words. Add a number, "today", "free", "guaranteed", or similar.`,
    (p) =>
      CTA_THROAT_CLEARING.some((re) => re.test(p.headline))
        ? `no_throat_clearing: cta headline "${p.headline}" starts with a generic throat-clearing phrase`
        : null,
    (p) => {
      const sec = p.cta_secondary;
      if (!sec) return null;
      return sec.href === "/book" ||
        sec.href === "/intake" ||
        sec.href.startsWith("tel:")
        ? null
        : `cta_secondary_href: must be /book, /intake, or tel:... (got ${sec.href})`;
    },
  ],
};

// ─── BOOKING validators (no toSection — surface=booking persist path) ───────

const GENERIC_BOOKING_TITLES = [
  /^free consultation$/i,
  /^30-minute conversation$/i,
  /^discovery call$/i,
  /^schedule a meeting$/i,
  /^book a meeting$/i,
];

const bookingBlock: BlockDefinition<BookingProps> = {
  ...bookingMeta,
  propsSchema: BookingPropsSchema,
  validators: [
    (p) =>
      GENERIC_BOOKING_TITLES.some((re) => re.test(p.title))
        ? `title_not_generic: booking title "${p.title}" matches a v1 template default. Restate as the vertical's actual primary appointment.`
        : null,
    (p) => {
      const days = Object.values(p.weekly_availability);
      const open = days.filter((d) => d !== null);
      return open.length > 0
        ? null
        : `at_least_one_open_day: weekly_availability has zero open days; booking page would have no slots`;
    },
    (p) => {
      const offenders: string[] = [];
      for (const [day, hours] of Object.entries(p.weekly_availability)) {
        if (hours === null) continue;
        const [open, close] = hours;
        if (open >= close) offenders.push(`${day} ${open}-${close} (open >= close)`);
        if (close - open < 1) offenders.push(`${day} ${open}-${close} (window < 1h)`);
      }
      return offenders.length > 0
        ? `hours_sane: invalid availability windows: ${offenders.join(", ")}`
        : null;
    },
    (p) => {
      if (!p.form_fields) return null;
      const ids = p.form_fields.map((f) => f.id);
      return new Set(ids).size === ids.length
        ? null
        : `form_field_ids_unique: form_fields have duplicate ids (${ids.join(", ")})`;
    },
  ],
};

// ─── INTAKE validators (no toSection — surface=intake persist path) ─────────

const GENERIC_INTAKE_TITLES = [
  /^tell us about your project$/i,
  /^get in touch$/i,
  /^contact us$/i,
  /^inquiry form$/i,
  /^submit your details$/i,
];

const intakeBlock: BlockDefinition<IntakeProps> = {
  ...intakeMeta,
  propsSchema: IntakePropsSchema,
  validators: [
    (p) =>
      GENERIC_INTAKE_TITLES.some((re) => re.test(p.title))
        ? `title_not_generic: intake title "${p.title}" matches a v1 template default. Restate as something specific to this business.`
        : null,
    (p) =>
      p.questions.some((q) => q.type === "email")
        ? null
        : `has_email_field: at least one intake question must have type="email" — operators need email to follow up`,
    (p) => {
      const ids = p.questions.map((q) => q.id);
      return new Set(ids).size === ids.length
        ? null
        : `question_ids_unique: intake questions have duplicate ids (${ids.join(", ")})`;
    },
    (p) => {
      const broken = p.questions
        .filter((q) => q.type === "select" || q.type === "multi-select")
        .filter((q) => !q.options || q.options.length < 2)
        .map((q) => q.id);
      return broken.length > 0
        ? `select_options_present: select / multi-select questions need ≥2 options (broken: ${broken.join(", ")})`
        : null;
    },
  ],
};

// ─── REGISTRY ────────────────────────────────────────────────────────────────

// Order matters: this is the order create_workspace_v2's recommended_blocks
// returns to the IDE agent. Hero first (most operator-visible), services
// second, about third (trust), faq fourth (objections), cta fifth
// (re-conversion), booking sixth (the actual conversion surface), intake
// seventh (the lower-intent capture path).
export const BLOCK_REGISTRY: Record<string, BlockDefinition<unknown>> = {
  hero: heroBlock as unknown as BlockDefinition<unknown>,
  services: servicesBlock as unknown as BlockDefinition<unknown>,
  about: aboutBlock as unknown as BlockDefinition<unknown>,
  faq: faqBlock as unknown as BlockDefinition<unknown>,
  cta: ctaBlock as unknown as BlockDefinition<unknown>,
  booking: bookingBlock as unknown as BlockDefinition<unknown>,
  intake: intakeBlock as unknown as BlockDefinition<unknown>,
};

export function listBlockNames(): string[] {
  return Object.keys(BLOCK_REGISTRY);
}

export function getBlock(name: string): BlockDefinition<unknown> | null {
  return BLOCK_REGISTRY[name] ?? null;
}
