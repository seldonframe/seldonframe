// landing/fixtures/technical-restrained-northwind.ts
//
// Sample LLM payload for archetype "technical-restrained".
// Business: Northwind Engineering — B2B engineering consultancy.
// Voice: precise, evidence-led, no fluff.

import type { HeroProps } from "../sections/hero";
import type { ServicesGridProps } from "../sections/services-grid";
import type { TestimonialsProps } from "../sections/testimonials";
import type { FaqProps } from "../sections/faq";
import type { FooterProps } from "../sections/footer";

const PHONE = "(415) 555-0192";

export const northwindFixture = {
  archetype: "technical-restrained" as const,
  businessName: "Northwind Engineering",

  hero: {
    archetype: "technical-restrained",
    businessName: "Northwind Engineering",
    tagline: "Embedded engineers for teams shipping critical infrastructure.",
    subhead:
      "A senior-only consultancy. We embed for 8–16 weeks, ship to production, and leave behind " +
      "a measurable improvement — not slide decks.",
    primaryCTA: { label: "View case studies", href: "/cases" },
    secondaryCTA: { label: "Book a consult", href: "/consult" },
    trustBadges: [
      { label: "47 engagements shipped" },
      { label: "Senior engineers only" },
      { label: "SOC 2 Type II" },
    ],
    reviewRating: 4.9,
    reviewCount: 31,
    heroImage: {
      src: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=1600&q=70&auto=format",
      alt: "Engineering workspace",
    },
  } satisfies HeroProps,

  services: {
    archetype: "technical-restrained",
    eyebrow: "Engagements",
    heading: "Four ways we engage.",
    intro:
      "Each engagement is fixed-scope, fixed-team, and ends with a measurable outcome you can " +
      "point to in the next post-mortem.",
    services: [
      { id: "s1", name: "Production rescue",
        description: "Two senior engineers, eight-week embed. Triage, fix the bleeding, hand back a system the on-call team trusts." },
      { id: "s2", name: "Platform migration",
        description: "Postgres, Kafka, Kubernetes, or a custom data plane — moved to a target architecture with measurable cost and latency wins." },
      { id: "s3", name: "Architecture review",
        description: "Two-week deep read of your stack. Written report, ranked recommendations, full team Q&A. No upsell." },
      { id: "s4", name: "Embedded staff aug",
        description: "Senior engineers added to your team on a quarterly cadence. Same standup, same code review, same on-call." },
    ],
    cta: {
      label: "Book a consult",
      href: "/consult",
      text: {
        title: "Most engagements scoped within one call.",
        sub: "Send us a one-paragraph brief. We'll respond with a candid read on whether we're the right fit — usually within 48 hours.",
      },
    },
  } satisfies ServicesGridProps,

  testimonials: {
    archetype: "technical-restrained",
    eyebrow: "Selected outcomes",
    heading: "Shipped, measured, handed back.",
    testimonials: [
      { id: "t1", rating: 5, service: "Production rescue",
        quote: "p99 latency was 4.2s. Six weeks later we were holding 220ms with the same on-call rotation. They documented every fix.",
        name: "Engineering lead", city: "Series-C fintech" },
      { id: "t2", rating: 5, service: "Platform migration",
        quote: "Moved 280TB from RDS to Aurora with zero downtime over a weekend. The runbook is still in our repo, still works.",
        name: "VP Engineering", city: "Public marketplace" },
      { id: "t3", rating: 5, service: "Architecture review",
        quote: "The report was 14 pages. Three findings paid for the whole engagement within a quarter. No theatre, no slides.",
        name: "CTO", city: "Series-B logistics" },
    ],
    reviewSummary: { rating: 4.9, count: 31, sources: "Direct references on request" },
  } satisfies TestimonialsProps,

  faq: {
    archetype: "technical-restrained",
    eyebrow: "Working with us",
    heading: "What you should know before the first call.",
    items: [
      { id: "f1", question: "What's a typical engagement length?",
        answer: "Eight to sixteen weeks. Anything shorter rarely moves the needle; anything longer is staff aug, which we do separately." },
      { id: "f2", question: "Do you sign NDAs and DPAs?",
        answer: "Yes. We are SOC 2 Type II audited and carry a mutual NDA, DPA, and BAA template ready to send before the first technical call." },
      { id: "f3", question: "Who actually works on the engagement?",
        answer: "Named engineers, senior-only. No subcontracting, no rotation. The proposal includes everyone's GitHub handle and recent shipped work." },
      { id: "f4", question: "How is pricing structured?",
        answer: "Fixed-fee per phase. We do not bill hourly. If we miss the agreed milestone, the next phase is on us." },
    ],
    cta: {
      title: "Have a defined problem?",
      sub: "Send the one-paragraph brief. We respond within two business days with a candid read.",
      label: "Email engineering",
      href: "mailto:hello@northwindeng.com",
    },
  } satisfies FaqProps,

  footer: {
    archetype: "technical-restrained",
    businessName: "Northwind Engineering",
    tagline:
      "Senior-only consultancy. Fixed-scope engagements. Shipped to production and handed back, every time.",
    phone: PHONE,
    email: "hello@northwindeng.com",
    address: { line1: "548 Market Street · #38291", city: "San Francisco", state: "CA", zip: "94104" },
    serviceAreas: ["Remote, US & EU", "On-site by arrangement"],
    weeklyHours: [
      { line: "Mon–Fri · 9am–6pm PT" },
      { line: "Async via shared channel during engagements" },
    ],
    license: "Northwind Engineering, LLC — registered Delaware",
    trustBadges: [
      { label: "SOC 2 Type II" },
      { label: "Senior engineers only" },
      { label: "47 engagements" },
    ],
    serviceLinks: [
      { label: "Production rescue", href: "#services" },
      { label: "Platform migration", href: "#services" },
      { label: "Architecture review", href: "#services" },
      { label: "Case studies", href: "/cases" },
    ],
    socials: [],
  } satisfies FooterProps,
};
