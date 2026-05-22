// landing/fixtures/soft-residential-verdant.ts
//
// Sample LLM payload for archetype "soft-residential".
// Business: Verdant Lawn Care — weekly residential lawn & landscape maintenance.
// Voice: warm, approachable, slightly conversational. Recurring-service framing.

import type { HeroProps } from "../sections/hero";
import type { ServicesGridProps } from "../sections/services-grid";
import type { TestimonialsProps } from "../sections/testimonials";
import type { FaqProps } from "../sections/faq";
import type { FooterProps } from "../sections/footer";

const PHONE = "(919) 555-0148";

export const verdantFixture = {
  archetype: "soft-residential" as const,
  businessName: "Verdant Lawn Care",

  hero: {
    archetype: "soft-residential",
    businessName: "Verdant Lawn Care",
    tagline: "A tidy lawn, every week, without you thinking about it.",
    subhead:
      "Weekly and bi-weekly residential lawn care across Raleigh, Cary, and Apex. " +
      "Family-owned since 2011. Same crew every visit — never a roster of strangers.",
    primaryCTA: { label: "Book a clean", href: "/book" },
    secondaryCTA: { label: "Get a free quote", href: "/quote" },
    trustBadges: [
      { label: "Family-owned since 2011" },
      { label: "Same crew every visit" },
      { label: "Fully insured" },
      { label: "No contracts" },
    ],
    reviewRating: 4.8,
    reviewCount: 184,
    heroImage: {
      src: "https://images.unsplash.com/photo-1558904541-efa843a96f01?w=1200&q=70&auto=format",
      alt: "A neat residential lawn after a Verdant visit",
    },
    heroOverlay: {
      techName: "The Marquez crew",
      techMeta: "Your weekly team — bilingual, in uniform",
    },
  } satisfies HeroProps,

  services: {
    archetype: "soft-residential",
    eyebrow: "What we handle",
    heading: "We look after the outside, you enjoy it.",
    intro:
      "Most clients pick weekly mowing plus a seasonal program. Easy to book online; easier " +
      "to pause when you're out of town.",
    services: [
      { id: "s1", name: "Weekly mowing",
        description: "Mow, edge, trim, blow. Forty-five minutes, same day every week, no contracts to sign." },
      { id: "s2", name: "Seasonal cleanup",
        description: "Spring and fall leaf removal, mulch refresh, and bed clean-out — handled in a single visit." },
      { id: "s3", name: "Lawn treatments",
        description: "Five-step fertilization and weed control program, calibrated for North Carolina cool-season turf." },
      { id: "s4", name: "Hedge & shrub",
        description: "Monthly hedge shaping and seasonal shrub pruning. We bag and haul every clipping." },
    ],
    cta: {
      label: "Get a free quote",
      href: "/quote",
      text: {
        title: "Most quotes back the same day.",
        sub: "Send us your address and we'll pull up the property — no in-person visit needed for a first quote.",
      },
    },
  } satisfies ServicesGridProps,

  testimonials: {
    archetype: "soft-residential",
    eyebrow: "From the neighbourhood",
    heading: "Quietly tidy yards across the Triangle.",
    testimonials: [
      { id: "t1", rating: 5, service: "Weekly mowing",
        quote: "We've used them for four years. The crew knows where our dogs are buried and never lets the gate stay open.",
        name: "The Henderson family", city: "Cary, NC" },
      { id: "t2", rating: 5, service: "Seasonal cleanup",
        quote: "One Saturday morning, every leaf gone. Mulch refreshed and the beds edged. Worth every penny.",
        name: "Lina O.", city: "Apex, NC" },
      { id: "t3", rating: 5, service: "Lawn treatments",
        quote: "Their five-step program took our patchy fescue back to a full lawn in one season. They text before every visit.",
        name: "Bryce W.", city: "Raleigh, NC" },
    ],
    reviewSummary: { rating: 4.8, count: 184, sources: "Google · Nextdoor · Angi" },
  } satisfies TestimonialsProps,

  faq: {
    archetype: "soft-residential",
    eyebrow: "Easy answers",
    heading: "Common questions before booking.",
    items: [
      { id: "f1", question: "Do I need to sign a contract?",
        answer: "No. Cancel anytime with a single text. Most clients stay because the crew is consistent and the lawn looks good." },
      { id: "f2", question: "How do I pay?",
        answer: "Card on file. We charge automatically the morning after each visit and email a receipt. No envelopes, no checks." },
      { id: "f3", question: "What if it rains?",
        answer: "We move you to the next dry day in the route. You'll get a text the night before with the new time." },
      { id: "f4", question: "Do you treat for grubs and fire ants?",
        answer: "Yes — both are part of our standard five-step program. Add-on treatments for fleas and mosquitos available on request." },
    ],
    cta: {
      title: "Still have a question?",
      sub: "Text the office directly — we answer most messages within an hour during business hours.",
      label: "Text the office",
      href: "sms:+19195550148",
    },
  } satisfies FaqProps,

  footer: {
    archetype: "soft-residential",
    businessName: "Verdant Lawn Care",
    tagline:
      "Weekly residential lawn care across the Triangle. Same crew every visit, no contracts, " +
      "card on file. Family-owned since 2011.",
    phone: PHONE,
    email: "hello@verdantlawncare.com",
    address: { line1: "1142 Oberlin Road · Suite B", city: "Raleigh", state: "NC", zip: "27605" },
    serviceAreas: ["Raleigh", "Cary", "Apex", "Holly Springs", "Morrisville", "Garner"],
    weeklyHours: [
      { line: "Mon–Fri · 7am–5pm" },
      { line: "Saturday · 8am–noon" },
      { line: "Text the office anytime — we reply during hours" },
    ],
    license: "NC Pesticide Applicator #L-7821 · Fully insured",
    trustBadges: [
      { label: "Family-owned since 2011" },
      { label: "Same crew" },
      { label: "Fully insured" },
    ],
    serviceLinks: [
      { label: "Weekly mowing", href: "#services" },
      { label: "Seasonal cleanup", href: "#services" },
      { label: "Lawn treatments", href: "#services" },
      { label: "Hedge & shrub", href: "#services" },
    ],
    socials: [
      { kind: "facebook", href: "https://facebook.com/verdantlawncare" },
      { kind: "google", href: "https://g.page/verdantlawncare" },
    ],
  } satisfies FooterProps,
};
