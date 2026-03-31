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
    | "footer";
  content: Record<string, unknown>;
  order: number;
};
