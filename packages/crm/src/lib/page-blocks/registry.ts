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

/**
 * v1.4.1 — surface kind. Discriminates how persist.ts routes a block:
 *
 *   - "landing-section": the block is one section in the landing page.
 *     persist.ts mutates Blueprint.landing.sections, re-renders the full
 *     landing via renderGeneralServiceV1, persists to landing_pages.
 *     hero / services / about / faq / cta all live here.
 *
 *   - "booking": the block updates Blueprint.booking + the bookings table
 *     row's metadata + re-renders the booking template via calcom-month-v1.
 *
 *   - "intake": the block updates Blueprint.intake + the intakeForms table
 *     row's name + fields + re-renders the form via formbricks-stack-v1.
 *
 * Blocks declare which surface they target so persist.ts can dispatch
 * without a per-block conditional pyramid.
 */
export type BlockSurface = "landing-section" | "booking" | "intake";

export interface BlockDefinition<TProps = unknown> {
  name: string;
  version: string;
  /** Which workspace surface this block writes to. Determines the
   *  persist path used (see BlockSurface). */
  surface: BlockSurface;
  /** For landing-section blocks: which section type the block renders to.
   *  For booking/intake blocks: arbitrary discriminator (unused by the
   *  renderer, kept for symmetry / debugging). */
  sectionType:
    | "hero"
    | "services-grid"
    | "about"
    | "faq"
    | "mid-cta"
    | "booking"
    | "intake";
  /** One-line summary surfaced in list_blocks() and (later) marketplace. */
  description: string;
  /** Zod schema validating the LLM-generated props. Mirrors the SKILL.md
   *  frontmatter `props` field. */
  propsSchema: z.ZodType<TProps>;
  /** For landing-section blocks: maps validated props onto the existing
   *  LandingSection shape. For booking/intake blocks: undefined — those
   *  use surface-specific persist paths that read the props directly. */
  toSection?: (props: TProps) => LandingSection;
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
  surface: "landing-section",
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
  surface: "landing-section",
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
  surface: "landing-section",
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

// ─── ABOUT ───────────────────────────────────────────────────────────────────

const AboutPropsSchema = z.object({
  headline: z.string().min(2),
  body: z.string().min(30),
  owner_name: z.string().optional(),
  owner_title: z.string().optional(),
  photo_query: z.string().optional(),
});
type AboutProps = z.infer<typeof AboutPropsSchema>;

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
  /\d/, // any digit (year, count)
  /\bsince\b/i,
  /\bcertified\b/i,
  /\blicensed\b/i,
  /\bdon'?t\b/i, // "we don't do X" promise
  /\bonly\b/i, // "the only one in town"
];

const aboutBlock: BlockDefinition<AboutProps> = {
  name: "about",
  version: "1.0.0",
  surface: "landing-section",
  sectionType: "about",
  description:
    "About-the-business section — who they are, why they started, what makes them specific. Trust-building, not corporate.",
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

// ─── CTA ─────────────────────────────────────────────────────────────────────

const CtaPropsSchema = z.object({
  headline: z.string().min(4),
  subhead: z.string().optional(),
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
});
type CtaProps = z.infer<typeof CtaPropsSchema>;

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
  name: "cta",
  version: "1.0.0",
  surface: "landing-section",
  sectionType: "mid-cta",
  description:
    "Mid-page call-to-action — focused conversion moment. Singular outcome, low friction, urgency without pressure.",
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
  ],
};

// ─── BOOKING ─────────────────────────────────────────────────────────────────

const dayHourTuple = z
  .tuple([z.number().min(0).max(24), z.number().min(0).max(24)])
  .nullable();

const BookingPropsSchema = z.object({
  title: z.string().min(2),
  description: z.string().min(12),
  duration_minutes: z.number().int().min(15).max(240),
  location_kind: z.enum([
    "on-site-business",
    "on-site-customer",
    "phone",
    "video",
    "hybrid",
  ]),
  weekly_availability: z.object({
    mon: dayHourTuple,
    tue: dayHourTuple,
    wed: dayHourTuple,
    thu: dayHourTuple,
    fri: dayHourTuple,
    sat: dayHourTuple,
    sun: dayHourTuple,
  }),
  form_fields: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z][a-z0-9_]*$/, "snake_case ids only"),
        label: z.string().min(2),
        type: z.enum(["text", "email", "phone", "textarea", "select"]),
        required: z.boolean().optional(),
        placeholder: z.string().optional(),
        options: z.array(z.string()).optional(),
      }),
    )
    .optional(),
});
export type BookingProps = z.infer<typeof BookingPropsSchema>;

const GENERIC_BOOKING_TITLES = [
  /^free consultation$/i,
  /^30-minute conversation$/i,
  /^discovery call$/i,
  /^schedule a meeting$/i,
  /^book a meeting$/i,
];

const bookingBlock: BlockDefinition<BookingProps> = {
  name: "booking",
  version: "1.0.0",
  surface: "booking",
  sectionType: "booking",
  description:
    "The booking calendar — title, description, slot duration, location kind, weekly hours, and any extra form fields collected at booking time.",
  propsSchema: BookingPropsSchema,
  // No toSection — booking uses a surface-specific persist path that
  // updates Blueprint.booking + the bookings table directly.
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

// ─── INTAKE ──────────────────────────────────────────────────────────────────

const IntakePropsSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  questions: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z][a-z0-9_]*$/, "snake_case ids only"),
        label: z.string().min(2),
        type: z.enum([
          "text",
          "textarea",
          "email",
          "phone",
          "number",
          "select",
          "multi-select",
          "rating",
          "date",
        ]),
        required: z.boolean().optional(),
        helper: z.string().optional(),
        options: z.array(z.string()).optional(),
      }),
    )
    .min(3)
    .max(8),
  completion_headline: z.string().min(2),
  completion_message: z.string().optional(),
});
export type IntakeProps = z.infer<typeof IntakePropsSchema>;

const GENERIC_INTAKE_TITLES = [
  /^tell us about your project$/i,
  /^get in touch$/i,
  /^contact us$/i,
  /^inquiry form$/i,
  /^submit your details$/i,
];

const intakeBlock: BlockDefinition<IntakeProps> = {
  name: "intake",
  version: "1.0.0",
  surface: "intake",
  sectionType: "intake",
  description:
    "The intake / lead-capture form — title, description, questions, and the completion message after submit.",
  propsSchema: IntakePropsSchema,
  // No toSection — intake uses a surface-specific persist path.
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

// `unknown` here lets us hold heterogeneously-typed blocks in one map; each
// dispatch site narrows via the registered schema.parse before calling the
// block's other functions.
//
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
