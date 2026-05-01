// ============================================================================
// Content packs — default PageSchema sections + actions + FAQs per business type.
// ============================================================================
//
// April 30, 2026 — primitives architecture B1. Each business type gets a
// curated default page structure that schemaFromSoul() merges with the
// operator's actual Soul (business_name, services, testimonials, etc.).
//
// Goals:
//   1. Zero placeholder copy in the rendered output. If a content pack
//      bullet says "Open source", that's a true claim for SeldonFrame.
//      If it says "Licensed and insured", that's true for HVAC/plumbing.
//      Mismatching the bucket = wrong claims = embarrassing.
//   2. Keep CTAs honest — local services lead with "Get a free quote",
//      professional services with "Book a consultation", SaaS with
//      "Start for $0". The CTA destinations (`/intake`, `/book`) are
//      always real workspace routes.
//   3. Keep navigation coherent — local services show phone in nav, SaaS
//      shows GitHub/Docs/Pricing, agencies show portfolio.
//
// Composition: each pack returns a partial PageSchema. schemaFromSoul()
// fills in the dynamic bits (business name, services from soul.offerings,
// FAQ overrides from soul.faqs) and the renderer does the rest.

import type {
  BusinessType,
  PageAction,
  PageSchema,
  PageSection,
  SectionFaq,
} from "./types";

export interface ContentPack {
  /** Sections seeded for this business type. Operators can add/remove later
   *  via toggle_section / update_page_content. */
  sections: PageSection[];
  /** All CTAs the renderer might place across hero / nav / footer. The
   *  renderer reads `placement` to know where each one belongs. */
  actions: PageAction[];
  /** Default trust-bar bullets — short claims operators are usually willing
   *  to make for their industry. */
  trust_badges: string[];
  /** Default FAQ entries when the Soul doesn't provide any. */
  default_faqs: SectionFaq[];
  /** Footer style hints. */
  footer: {
    /** Render workspace business hours? Local services yes, SaaS no. */
    show_hours: boolean;
    /** Render the workspace phone number in footer? */
    show_phone: boolean;
    /** Extra footer link rows by category. */
    extra_links: Array<{ label: string; href: string }>;
  };
  /** Navigation-bar config. */
  nav: {
    show_phone: boolean;
    extra_links: Array<{ label: string; href: string }>;
  };
}

// ─── Section + action factories ──────────────────────────────────────────────
//
// Re-used across packs so the schema shapes stay consistent. Each factory
// returns a deep-cloneable plain object.

function heroSection(headline: string, subheadline: string): PageSection {
  return {
    id: "hero",
    intent: "hero",
    content: { headline, subheadline },
    visible: true,
    order: 10,
  };
}

function trustBarSection(bullets: string[]): PageSection {
  return {
    id: "trust_bar",
    intent: "trust_bar",
    content: { bullets },
    visible: true,
    order: 20,
  };
}

function servicesSection(
  intent: "services" | "features" | "products",
  headline: string,
  items: Array<{ title: string; description: string; icon?: string }> = []
): PageSection {
  return {
    id: intent,
    intent,
    content: { headline, items },
    visible: true,
    order: 30,
  };
}

function howItWorksSection(): PageSection {
  return {
    id: "how_it_works",
    intent: "how_it_works",
    content: {
      headline: "How it works",
      items: [],
    },
    visible: true,
    order: 35,
  };
}

function aboutSection(): PageSection {
  return {
    id: "about",
    intent: "about",
    content: { headline: "About us", body: "" }, // body filled from soul
    visible: true,
    order: 40,
  };
}

/** Stats section — large-number / label cards. Each pack provides default
 *  numbers; operators override via update_page_content once that MCP tool
 *  ships (A6). Render order 45 sits between services (30) and FAQ (60). */
function statsSection(stats: Array<{ value: string; label: string }>): PageSection {
  return {
    id: "stats",
    intent: "stats",
    content: { headline: "By the numbers", stats },
    visible: true,
    order: 45,
  };
}

/** Partners / tech-stack ribbon. Renders a horizontal "Built on …" row
 *  of company names. Order 25 sits right after the trust bar. The
 *  renderer reads either section.content.items or PageProof.partners. */
function partnersSection(
  eyebrow: string,
  partnerNames: string[]
): PageSection {
  return {
    id: "partners",
    intent: "partners",
    content: {
      headline: eyebrow,
      items: partnerNames.map((name) => ({ title: name, description: "" })),
    },
    visible: true,
    order: 25,
  };
}

function testimonialsSection(): PageSection {
  return {
    id: "testimonials",
    intent: "testimonials",
    content: { headline: "What clients say", items: [] },
    visible: true,
    order: 50,
  };
}

function portfolioSection(): PageSection {
  return {
    id: "portfolio",
    intent: "portfolio",
    content: { headline: "Selected work", items: [] },
    visible: true,
    order: 50,
  };
}

function pricingSection(): PageSection {
  return {
    id: "pricing",
    intent: "pricing",
    content: { headline: "Simple pricing", items: [] }, // items from soul.offerings
    visible: true,
    order: 55,
  };
}

function faqSection(faqs: SectionFaq[]): PageSection {
  return {
    id: "faq",
    intent: "faq",
    content: { headline: "Frequently asked questions", faqs },
    visible: true,
    order: 60,
  };
}

function ctaSection(headline: string, subheadline?: string): PageSection {
  return {
    id: "cta",
    intent: "cta",
    content: { headline, subheadline },
    visible: true,
    order: 70,
  };
}

function footerSection(): PageSection {
  return {
    id: "footer",
    intent: "footer",
    content: {},
    visible: true,
    order: 100,
  };
}

// ─── Action factories ────────────────────────────────────────────────────────

function action(
  id: string,
  text: string,
  href: string,
  style: PageAction["style"],
  placement: string[]
): PageAction {
  return { id, text, href, style, placement };
}

// ─── Content packs by business type ──────────────────────────────────────────

const LOCAL_SERVICE_PACK: ContentPack = {
  sections: [
    heroSection("Local. Trusted. Fast.", "Quality service from your neighborhood pros."),
    trustBarSection([
      "5-star rated by local customers",
      "Licensed and insured",
      "Same-day service available",
    ]),
    servicesSection("services", "Services we offer"),
    aboutSection(),
    statsSection([
      { value: "500+", label: "Jobs Completed" },
      { value: "4.8★", label: "Google Rating" },
      { value: "24hr", label: "Response Time" },
    ]),
    faqSection([]), // filled from default_faqs at apply-time
    ctaSection("Ready to get started?", "Get a free quote in minutes."),
    footerSection(),
  ],
  actions: [
    action("hero_primary", "Get a free quote →", "/intake", "primary", ["hero", "cta"]),
    action("hero_secondary", "Call us", "tel:", "secondary", ["hero", "nav"]),
    action("nav_book", "Book", "/book", "ghost", ["nav"]),
    action("footer_intake", "Contact", "/intake", "ghost", ["footer"]),
  ],
  trust_badges: ["Licensed & insured", "Free quotes", "Same-day service"],
  default_faqs: [
    {
      question: "How quickly can you come out?",
      answer:
        "We offer same-day service for most jobs and can usually be on-site within 24 hours.",
    },
    {
      question: "Do you charge for estimates?",
      answer:
        "Free estimates on most jobs. We'll give you a clear, upfront price before any work starts.",
    },
    {
      question: "What payment methods do you accept?",
      answer:
        "Cash, credit card, debit card, and digital wallets. Invoicing is available for commercial accounts.",
    },
  ],
  footer: { show_hours: true, show_phone: true, extra_links: [] },
  nav: { show_phone: true, extra_links: [] },
};

const PROFESSIONAL_SERVICE_PACK: ContentPack = {
  sections: [
    heroSection(
      "Practical advice. Real results.",
      "Personalized engagements built around your goals."
    ),
    trustBarSection([
      "Trusted by 100+ clients",
      "Personalized approach",
      "Certified professional",
    ]),
    servicesSection("services", "How I work with clients"),
    aboutSection(),
    statsSection([
      { value: "100+", label: "Clients Served" },
      { value: "5+", label: "Years Experience" },
      { value: "4.9", label: "Average Rating" },
    ]),
    testimonialsSection(),
    faqSection([]),
    ctaSection("Ready to talk?", "Book a free consultation."),
    footerSection(),
  ],
  actions: [
    action("hero_primary", "Book a free consultation →", "/book", "primary", ["hero", "cta"]),
    action("hero_secondary", "Tell us about your needs →", "/intake", "secondary", ["hero"]),
    action("nav_book", "Book", "/book", "ghost", ["nav"]),
    action("nav_intake", "Contact", "/intake", "ghost", ["nav"]),
    action("footer_intake", "Get in touch", "/intake", "ghost", ["footer"]),
  ],
  trust_badges: ["100+ clients", "Personalized approach", "Certified"],
  default_faqs: [
    {
      question: "What's your approach?",
      answer:
        "Every engagement starts with a free consultation so we can understand your goals before recommending anything.",
    },
    {
      question: "How long is a typical engagement?",
      answer:
        "Engagements range from a single session to multi-month programs. We'll tailor the timeline to your situation on the consult.",
    },
    {
      question: "What are your qualifications?",
      answer:
        "Certified, licensed, and have worked with clients across multiple industries. Happy to share references on request.",
    },
  ],
  footer: { show_hours: false, show_phone: false, extra_links: [] },
  nav: { show_phone: false, extra_links: [] },
};

const SAAS_PACK: ContentPack = {
  sections: [
    heroSection("Build faster.", "Open-source platform for builders who ship."),
    trustBarSection([
      "Open source",
      "Free to start",
      "Deploy in 2 minutes",
    ]),
    partnersSection("Built on", [
      "Anthropic",
      "Vercel",
      "Neon",
      "Stripe",
      "Resend",
    ]),
    // May 1, 2026 — features section gets real product capabilities,
    // not pricing tiers. Pricing tiers live on /settings/billing and
    // shouldn't crowd the landing page's feature grid. enrichOfferings
    // sees these pre-populated items and skips overwriting from
    // soul.offerings.
    servicesSection("features", "Features", [
      {
        title: "Landing Pages",
        description:
          "Professional, conversion-optimized pages generated from your business description. Dark or light mode, editorial typography.",
        icon: "globe",
      },
      {
        title: "Booking System",
        description:
          "Cal.com-quality booking with timezone detection, interactive calendar, and automatic CRM integration.",
        icon: "calendar",
      },
      {
        title: "CRM + Pipeline",
        description:
          "Contact management with kanban pipeline, deal tracking, record detail pages, and activity timeline.",
        icon: "users",
      },
      {
        title: "AI Agents",
        description:
          "Pre-built agent archetypes that follow up with leads, send reminders, and qualify prospects — with approval gates.",
        icon: "bot",
      },
      {
        title: "75 MCP Tools",
        description:
          "Every surface is programmable. Customize landing pages, forms, CRM fields, agents, and pipelines from Claude Code via natural language.",
        icon: "code",
      },
      {
        title: "Brain Layer",
        description:
          "Cross-workspace intelligence that learns what works. Better defaults, smarter agents, higher conversion — automatically.",
        icon: "sparkles",
      },
    ]),
    howItWorksSection(),
    // May 1, 2026 — pricing section dropped from default SaaS pack.
    // It rendered as a second services-grid pulling from soul.offerings,
    // duplicating the features section above. Re-enable via toggle_section
    // once A6 MCP tools land.
    statsSection([
      { value: "75+", label: "MCP Tools" },
      { value: "2,100+", label: "Tests Passing" },
      { value: "6", label: "Agent Archetypes" },
      { value: "2 min", label: "Deploy Time" },
    ]),
    faqSection([]),
    ctaSection("Ready to build?", "Start for $0. Upgrade when you grow."),
    footerSection(),
  ],
  actions: [
    action("hero_primary", "Start for $0 →", "/intake", "primary", ["hero", "cta"]),
    action("hero_secondary", "See a demo →", "/book", "secondary", ["hero"]),
    action("nav_pricing", "Pricing", "#pricing", "ghost", ["nav"]),
    action("nav_docs", "Docs", "{docs_url}", "ghost", ["nav"]),
    action("nav_github", "GitHub", "{github_url}", "ghost", ["nav"]),
    action("footer_github", "GitHub", "{github_url}", "ghost", ["footer"]),
    action("footer_discord", "Discord", "{discord_url}", "ghost", ["footer"]),
    action("footer_docs", "Docs", "{docs_url}", "ghost", ["footer"]),
  ],
  trust_badges: ["Open source", "Free to start", "MIT licensed"],
  default_faqs: [
    {
      question: "Is it really free?",
      answer:
        "Yes. The Free tier is free forever — no trial, no credit card. Upgrade only when you outgrow it.",
    },
    {
      question: "Can I self-host?",
      answer:
        "Yes. Self-hosting is MIT-licensed and free forever. Bring your own keys for Stripe, Resend, Twilio, and your LLM provider.",
    },
    {
      question: "How does pricing work?",
      answer:
        "Flat monthly base + metered usage. No per-workspace charge — Growth includes 3 workspaces, Scale is unlimited.",
    },
    {
      question: "What integrations do you support?",
      answer:
        "MCP-native, so any MCP server works out of the box. First-class integrations for Stripe, Resend, Twilio, Google Calendar, and more via the marketplace.",
    },
  ],
  footer: { show_hours: false, show_phone: false, extra_links: [] },
  nav: { show_phone: false, extra_links: [] },
};

const AGENCY_PACK: ContentPack = {
  sections: [
    heroSection("Strategy meets execution.", "Branded growth systems for ambitious teams."),
    trustBarSection([
      "50+ projects delivered",
      "Global clients",
      "Full-service team",
    ]),
    servicesSection("services", "What we do"),
    portfolioSection(),
    aboutSection(),
    testimonialsSection(),
    faqSection([]),
    ctaSection("Ready to start a project?", "Tell us about your goals."),
    footerSection(),
  ],
  actions: [
    action("hero_primary", "Start a project →", "/intake", "primary", ["hero", "cta"]),
    action("hero_secondary", "Book a strategy call →", "/book", "secondary", ["hero"]),
    action("nav_portfolio", "Work", "#portfolio", "ghost", ["nav"]),
    action("nav_book", "Book", "/book", "ghost", ["nav"]),
    action("nav_intake", "Start a project", "/intake", "ghost", ["nav"]),
    action("footer_intake", "Start a project", "/intake", "ghost", ["footer"]),
  ],
  trust_badges: ["50+ projects", "Global clients", "Full-service"],
  default_faqs: [
    {
      question: "What's your process?",
      answer:
        "Discovery → strategy → design + build → launch → optimize. Every project starts with a free strategy call.",
    },
    {
      question: "How do you price projects?",
      answer:
        "Fixed-fee for scoped engagements; monthly retainers for ongoing work. We'll quote on the strategy call.",
    },
    {
      question: "What's the typical timeline?",
      answer:
        "Most projects ship in 4–12 weeks depending on scope. Strategy calls book within the week.",
    },
  ],
  footer: { show_hours: false, show_phone: false, extra_links: [] },
  nav: { show_phone: false, extra_links: [] },
};

const ECOMMERCE_PACK: ContentPack = {
  sections: [
    heroSection("Made to last.", "Goods that look great and ship fast."),
    trustBarSection([
      "Free shipping on orders over $50",
      "Easy 30-day returns",
      "Secure checkout",
    ]),
    servicesSection("products", "Our products"),
    aboutSection(),
    testimonialsSection(),
    faqSection([]),
    ctaSection("Ready to shop?", "Free shipping on orders over $50."),
    footerSection(),
  ],
  actions: [
    action("hero_primary", "Shop now →", "/intake", "primary", ["hero", "cta"]),
    action("hero_secondary", "Learn more", "#about", "secondary", ["hero"]),
    action("nav_shop", "Shop", "/intake", "ghost", ["nav"]),
    action("nav_about", "About", "#about", "ghost", ["nav"]),
    action("footer_intake", "Contact", "/intake", "ghost", ["footer"]),
  ],
  trust_badges: ["Free shipping $50+", "30-day returns", "Secure checkout"],
  default_faqs: [
    {
      question: "What's your return policy?",
      answer:
        "30-day returns on unworn / unused items. Email us with your order number and we'll send a prepaid label.",
    },
    {
      question: "How long does shipping take?",
      answer:
        "Standard shipping arrives in 3–5 business days. Expedited shipping available at checkout.",
    },
    {
      question: "Do you ship internationally?",
      answer:
        "Yes — international shipping rates calculated at checkout. Customs fees may apply.",
    },
  ],
  footer: { show_hours: false, show_phone: false, extra_links: [] },
  nav: { show_phone: false, extra_links: [] },
};

// ─── Public API ──────────────────────────────────────────────────────────────

const PACK_BY_TYPE: Record<BusinessType, ContentPack> = {
  local_service: LOCAL_SERVICE_PACK,
  professional_service: PROFESSIONAL_SERVICE_PACK,
  saas: SAAS_PACK,
  agency: AGENCY_PACK,
  ecommerce: ECOMMERCE_PACK,
  // "other" falls back to professional_service — generic, safe.
  other: PROFESSIONAL_SERVICE_PACK,
};

/** Look up the content pack for a business type. Returns a deep-cloned
 *  copy so callers can mutate sections / actions safely without affecting
 *  the canonical defaults. */
export function getContentPack(type: BusinessType): ContentPack {
  const pack = PACK_BY_TYPE[type];
  return deepClone(pack);
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Produce a fresh PageSchema scaffold for a business type, with the
 *  pack's default sections + actions, and the FAQ section pre-populated
 *  with the pack's default FAQs (the operator's Soul-extracted FAQs
 *  override these in schemaFromSoul). */
export function applyContentPackToSchema(
  type: BusinessType,
  baseBusinessName: string
): Pick<PageSchema, "sections" | "actions" | "proof"> {
  const pack = getContentPack(type);

  // Default-FAQ injection: if the pack's FAQ section has no faqs yet, use
  // the pack's default_faqs.
  const sections = pack.sections.map((section) => {
    if (section.intent === "faq" && (!section.content.faqs || section.content.faqs.length === 0)) {
      return {
        ...section,
        content: { ...section.content, faqs: pack.default_faqs.slice() },
      };
    }
    return section;
  });

  return {
    sections,
    actions: pack.actions.slice(),
    proof: {
      testimonials: [],
      partners: [],
      trust_badges: pack.trust_badges.slice(),
    },
  };
}

// Re-exported so consumers can read structural metadata (footer + nav
// hints) without re-walking the pack.
export { PACK_BY_TYPE };
export type { ContentPack as ContentPackType };
