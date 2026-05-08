export type NavbarSectionContent = {
  businessName: string;
  logoUrl?: string;
  navLinks?: Array<{ label: string; href: string }>;
  ctaText?: string;
  ctaLink?: string;
};

export type HeroSectionContent = {
  kicker?: string;
  headline: string;
  subheadline: string;
  ctaText: string;
  ctaLink: string;
  secondaryCta?: { text: string; link: string };
  heroImage?: string;
  heroVideo?: string;
};

export type BenefitsSectionContent = {
  headline: string;
  benefits: Array<{ icon?: string; title: string; description: string }>;
};

export type WhoItsForSectionContent = {
  headline: string;
  personas: Array<{ name: string; description: string; avatar?: string }>;
};

export type FeaturesSectionContent = {
  headline: string;
  features: string[];
  image?: string;
};

export type ProcessSectionContent = {
  headline: string;
  steps: Array<{ number: number; title: string; description: string }>;
};

export type TestimonialsSectionContent = {
  headline: string;
  testimonials: Array<{ quote: string; author: string; role: string; rating?: number; avatar?: string }>;
};

export type PricingSectionContent = {
  headline: string;
  tiers: Array<{
    name: string;
    price: string;
    period?: string;
    features: string[];
    ctaText: string;
    ctaLink: string;
    popular?: boolean;
  }>;
};

export type FAQSectionContent = {
  headline: string;
  faqs: Array<{ question: string; answer: string }>;
};

export type CTASectionContent = {
  headline: string;
  body: string;
  ctaText: string;
  ctaLink: string;
};

export type FooterSectionContent = {
  businessName: string;
  description?: string;
  links?: Array<{ label: string; href: string }>;
  socials?: Array<{ label: string; href: string }>;
};

// v1.36.0 — services-grid block. The single most-impactful section
// for a local-service-business landing page. Each card has price,
// duration, and a "Book" CTA. The chatbot pulls pricing from the
// same Soul fact source so the price quoted in chat matches the
// price on the page.
export type ServicesGridSectionContent = {
  headline: string;
  subheadline?: string;
  services: Array<{
    name: string;
    description: string;
    price: string;
    duration?: string;
    ctaText?: string;
    ctaLink?: string;
    icon?: string;
  }>;
};

// v1.36.0 — emergency-strip block. High-prominence "if this is an
// emergency, call X now" banner. Critical for trades businesses
// (plumbing, HVAC, locksmith, towing, etc.) where after-hours
// emergencies are the highest-LTV customer segment.
export type EmergencyStripSectionContent = {
  /** Short headline e.g. "Pipe burst? Roof leaking? Don't wait." */
  headline: string;
  /** Phone number, formatted for display. */
  phone: string;
  /** Tel: link target — defaults to phone with non-digits stripped. */
  phoneLink?: string;
  /** Right-side text e.g. "24/7 emergency response — we answer the phone." */
  hours?: string;
};

// v1.36.0 — service-area block. List of cities/neighborhoods served,
// rendered as a tasteful chip cloud. Tells visitors "we cover you"
// without forcing a map integration.
export type ServiceAreaSectionContent = {
  headline: string;
  subheadline?: string;
  /** Anchor location, displayed prominently. */
  primaryLocation?: string;
  /** Cities / neighborhoods served. */
  areas: string[];
};

export type LandingPageSection = {
  type:
    | "navbar"
    | "hero"
    | "benefits"
    | "whoitsfor"
    | "features"
    | "process"
    | "testimonials"
    | "pricing"
    | "faq"
    | "cta"
    | "footer"
    | "servicesGrid"
    | "emergencyStrip"
    | "serviceArea";
  content: Record<string, unknown>;
  order: number;
};
