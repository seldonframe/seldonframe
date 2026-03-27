export type LandingSectionType =
  | "hero"
  | "social_proof"
  | "features"
  | "benefits"
  | "testimonials"
  | "pricing"
  | "faq"
  | "cta"
  | "form"
  | "booking"
  | "custom_html";

export type LandingSection = {
  id: string;
  type: LandingSectionType;
  title?: string;
  subtitle?: string;
  body?: string;
  items?: string[];
  ctaLabel?: string;
  ctaHref?: string;
  formSlug?: string;
  bookingSlug?: string;
  html?: string;
};

export function defaultLandingSections(): LandingSection[] {
  return [
    {
      id: "hero-1",
      type: "hero",
      title: "Transform your workflow",
      subtitle: "Book a strategy call and start scaling faster.",
      ctaLabel: "Get Started",
      ctaHref: "#cta",
    },
    {
      id: "social-proof-1",
      type: "social_proof",
      title: "Trusted by teams",
      items: ["500+ customers", "98% retention", "10x faster onboarding"],
    },
    {
      id: "features-1",
      type: "features",
      title: "What you get",
      items: ["Automated workflows", "Smart follow-up", "Unified timeline"],
    },
    {
      id: "benefits-1",
      type: "benefits",
      title: "Why it works",
      items: ["Less admin work", "Better conversion", "Happier clients"],
    },
    {
      id: "testimonials-1",
      type: "testimonials",
      title: "Loved by operators",
      items: ["\"Best CRM foundation we’ve used.\"", "\"Setup took one afternoon.\""],
    },
    {
      id: "pricing-1",
      type: "pricing",
      title: "Simple pricing",
      items: ["Starter — $49/mo", "Growth — $149/mo", "Scale — $399/mo"],
    },
    {
      id: "faq-1",
      type: "faq",
      title: "FAQs",
      items: ["Can I migrate data? Yes.", "Can I remove branding? Yes."],
    },
    {
      id: "form-1",
      type: "form",
      title: "Get in touch",
      subtitle: "Leave your details and we will reach out.",
      formSlug: "default-intake",
    },
    {
      id: "booking-1",
      type: "booking",
      title: "Book a call",
      subtitle: "Pick a slot instantly.",
      bookingSlug: "default",
    },
    {
      id: "cta-1",
      type: "cta",
      title: "Ready to move faster?",
      ctaLabel: "Book now",
      ctaHref: "#book",
    },
  ];
}
