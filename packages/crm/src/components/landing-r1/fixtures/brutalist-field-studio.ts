// landing/fixtures/brutalist-field-studio.ts
//
// Sample LLM payload for archetype "brutalist".
// Business: Field/Studio — concept-driven design agency.
// Voice: blunt, opinionated, confident. Hard edges, accent red used sparingly.

import type { HeroProps } from "../sections/hero";
import type { ServicesGridProps } from "../sections/services-grid";
import type { TestimonialsProps } from "../sections/testimonials";
import type { FaqProps } from "../sections/faq";
import type { FooterProps } from "../sections/footer";
import type { StickyMobileBarProps } from "../chrome/sticky-mobile-bar";

const PHONE = "(212) 555-0177";

export const fieldStudioFixture = {
  archetype: "brutalist" as const,
  businessName: "Field/Studio",

  hero: {
    archetype: "brutalist",
    businessName: "Field/Studio",
    tagline: "Identity, type, and editorial systems for cultural institutions since 2011.",
    subhead:
      "Brand, type design, and editorial systems. We work with museums, publishers, " +
      "and indie labels. Fixed-fee, no retainers, named principals on every project.",
    primaryCTA: { label: "Selected work", href: "/work" },
    secondaryCTA: { label: "Inquire", href: "/inquire" },
    trustBadges: [
      { label: "Founded 2011" },
      { label: "Type Directors Club" },
      { label: "AIGA Member" },
    ],
    // Brutalist intentionally omits review numbers — the work speaks for itself.
  } satisfies HeroProps,

  services: {
    archetype: "brutalist",
    eyebrow: "What we do",
    heading: "Three disciplines. No add-ons.",
    intro:
      "Each engagement is named in the contract, scoped in writing, delivered as " +
      "source files and a written rationale.",
    services: [
      { id: "s1", name: "Identity systems",
        description: "Wordmark, type lock-up, colour, applications. Delivered with a written rationale and a defensible position." },
      { id: "s2", name: "Type design",
        description: "Custom display and text faces for clients who need a voice nobody else can borrow." },
      { id: "s3", name: "Editorial",
        description: "Catalogues, books, and periodicals. We design the grid, set the type, and stay through proofs." },
      { id: "s4", name: "Studio collaborations",
        description: "Selected partnerships with architecture, fashion, and curatorial studios. By invitation." },
    ],
    cta: {
      label: "Inquire",
      href: "/inquire",
      text: {
        title: "We respond to every brief.",
        sub: "Send a paragraph. We reply within ten business days with a candid answer about fit.",
      },
    },
  } satisfies ServicesGridProps,

  testimonials: {
    archetype: "brutalist",
    eyebrow: "Selected clients",
    heading: "Work that has held up.",
    testimonials: [
      { id: "t1", rating: 5, service: "Identity",
        quote: "Field redrew our wordmark in 2014. It has not needed a refresh. That is the whole review.",
        name: "Director", city: "Contemporary art museum, NYC" },
      { id: "t2", rating: 5, service: "Type design",
        quote: "They cut a display face we use across every publication. It is now part of how readers recognise us.",
        name: "Editor-in-chief", city: "Quarterly literary review" },
      { id: "t3", rating: 5, service: "Editorial",
        quote: "Six catalogues over five years. Every grid stricter than the last. Every book the better for it.",
        name: "Head of publications", city: "European biennial" },
    ],
    // No review summary — the testimonials carry the proof.
  } satisfies TestimonialsProps,

  faq: {
    archetype: "brutalist",
    eyebrow: "Working with us",
    heading: "Before you write.",
    items: [
      { id: "f1", question: "Do you take on small projects?",
        answer: "Sometimes. We have no minimum, but we do not run discovery sprints, brand workshops, or stakeholder alignment exercises." },
      { id: "f2", question: "How long does an identity take?",
        answer: "Sixteen weeks for the core system, plus four to twelve weeks of applications. We deliver in two milestones, both with named principals." },
      { id: "f3", question: "Will you sign an NDA?",
        answer: "Yes, mutual NDA only. We do not sign one-way NDAs and we do not pitch on spec." },
      { id: "f4", question: "Are you hiring?",
        answer: "Not currently. We post openings on the Type Directors Club job board when we are." },
    ],
    cta: {
      title: "Write to the studio.",
      sub: "Email is faster than the form. We reply to every paragraph-length brief.",
      label: "studio@fieldstudio.org",
      href: "mailto:studio@fieldstudio.org",
    },
  } satisfies FaqProps,

  footer: {
    archetype: "brutalist",
    businessName: "Field/Studio",
    tagline:
      "Identity, type, and editorial systems for cultural institutions since 2011. Fixed-fee, no retainers, named principals on every project.",
    phone: PHONE,
    email: "studio@fieldstudio.org",
    address: { line1: "144 Plymouth Street · Floor 4", city: "Brooklyn", state: "NY", zip: "11201" },
    serviceAreas: ["New York", "Selected international engagements"],
    weeklyHours: [
      { line: "Studio Mon–Thu · 10am–6pm" },
      { line: "Closed Friday for studio practice" },
    ],
    license: "Field Studio LLC · NYS DOS #5482917",
    trustBadges: [
      { label: "TDC" },
      { label: "AIGA" },
      { label: "Est. 2011" },
    ],
    serviceLinks: [
      { label: "Selected work", href: "/work" },
      { label: "Type design", href: "/type" },
      { label: "Editorial", href: "/editorial" },
      { label: "Press", href: "/press" },
    ],
    socials: [
      { kind: "instagram", href: "https://instagram.com/fieldstudio" },
    ],
  } satisfies FooterProps,

  sticky: {
    archetype: "brutalist",
    phone: PHONE,
  } satisfies StickyMobileBarProps,
};
