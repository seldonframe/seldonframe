// Reusable multi-page fixture: a complete R1LandingPayload with 3 servicePages,
// a nav config, and theme.mode. Imported by r1-site-tree.spec.ts (and available
// to later phases). NOT a *.spec file — the runner ignores it as an entry
// point, but tsx still type-checks it through the importing spec.

import type { R1LandingPayload } from "../../../src/lib/landing/r1-payload-prompt";

export const multiPagePayload: R1LandingPayload = {
  hero: {
    archetype: "editorial-warm",
    businessName: "Greenwood Remodeling Group",
    tagline: "Craftsman remodels, built to last",
    subhead:
      "Family-owned remodelers serving the Hudson Valley since 1998 — kitchens, baths, additions, and whole-home renovations done by hand.",
    primaryCTA: { label: "Get a free estimate", href: "/book" },
    trustBadges: [{ label: "Family-owned since 1998" }],
  },
  services: {
    archetype: "editorial-warm",
    eyebrow: "Our craft",
    heading: "What we build",
    services: [
      { id: "s1", name: "Kitchen Remodeling", description: "Custom kitchens, designed and built by hand." },
      { id: "s2", name: "Bath Remodeling", description: "Spa-quality baths with lasting materials." },
      { id: "s3", name: "Home Additions", description: "Seamless additions that match your home." },
    ],
    cta: { label: "Call (845) 555-0177", href: "tel:+18455550177" },
  },
  testimonials: {
    archetype: "editorial-warm",
    eyebrow: "What clients say",
    heading: "Trusted across the valley",
    testimonials: [
      { id: "t1", quote: "They rebuilt our kitchen and it's flawless.", name: "Diane M.", city: "Beacon", rating: 5, service: "Kitchen Remodeling" },
    ],
  },
  faq: {
    archetype: "editorial-warm",
    heading: "Frequently asked questions",
    items: [
      { id: "f1", question: "Do you offer free estimates?", answer: "Yes — every project starts with one." },
    ],
  },
  footer: {
    archetype: "editorial-warm",
    businessName: "Greenwood Remodeling Group",
    phone: "(845) 555-0177",
    serviceAreas: ["Beacon", "Newburgh", "Poughkeepsie"],
  },
  theme: { mode: "light" },
  nav: {
    items: [{ label: "Gallery", href: "/gallery" }],
    cta: { label: "Get a free estimate", href: "/book" },
  },
  servicePages: [
    {
      slug: "kitchen-remodeling",
      name: "Kitchen Remodeling",
      heroPhoto: { src: "https://images.example.com/kitchen.jpg", alt: "Finished custom kitchen" },
      summary: "Custom kitchens designed and built by hand for the way you cook and gather.",
      body: [
        { kind: "heading", text: "Designed around your daily life" },
        { kind: "paragraph", text: "We start with how you actually use your kitchen, then design cabinetry, counters, and flow to match." },
        { kind: "paragraph", text: "Every install is done by our own crew — no subs, no surprises." },
      ],
      gallery: [{ src: "https://images.example.com/kitchen-1.jpg", alt: "Kitchen detail" }],
      testimonials: [
        { id: "t1", quote: "They rebuilt our kitchen and it's flawless.", name: "Diane M.", city: "Beacon", rating: 5, service: "Kitchen Remodeling" },
      ],
      ctaLabel: "Get a free kitchen estimate",
    },
    {
      slug: "bath-remodeling",
      name: "Bath Remodeling",
      summary: "Spa-quality bathrooms built with materials that last a lifetime.",
      body: [
        { kind: "paragraph", text: "From walk-in showers to full gut renovations, we handle the whole project end to end." },
      ],
      ctaLabel: "Get a free bath estimate",
    },
    {
      slug: "home-additions",
      name: "Home Additions",
      summary: "Seamless additions that look like they were always part of your home.",
      body: [
        { kind: "paragraph", text: "We match rooflines, siding, and trim so your addition blends in perfectly." },
      ],
      ctaLabel: "Plan your addition",
    },
  ],
};
