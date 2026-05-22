// landing/fixtures/bold-urgency-stockton.ts
//
// Sample LLM slot-filler payload — Phase R.1 fixture. Mirrors the JSON the
// language model produces per workspace. Use this to render the preview page
// and to seed tests.

import type { HeroProps } from "../sections/hero";
import type { ServicesGridProps } from "../sections/services-grid";
import type { TestimonialsProps } from "../sections/testimonials";
import type { FaqProps } from "../sections/faq";
import type { FooterProps } from "../sections/footer";
import type { EmergencyStripProps } from "../chrome/emergency-strip";
import type { StickyMobileBarProps } from "../chrome/sticky-mobile-bar";

const PHONE = "(209) 555-0144";

export const stocktonFixture = {
  archetype: "bold-urgency" as const,
  businessName: "Stockton Heating & Cooling",

  hero: {
    archetype: "bold-urgency",
    businessName: "Stockton Heating & Cooling",
    tagline: "AC down? We'll be there in 60 minutes.",
    subhead:
      "24/7 emergency HVAC service across Stockton and the East Bay. Family-owned since 1998. " +
      "Licensed, bonded, insured — and we answer the phone on the first ring.",
    primaryCTA: { label: `Call now — ${PHONE}`, href: `tel:+12095550144` },
    secondaryCTA: { label: "Book online", href: "/book" },
    trustBadges: [
      { label: "Licensed C-20 #897432" },
      { label: "Bonded · Insured" },
      { label: "Family-owned since 1998" },
      { label: "BBB A+" },
    ],
    reviewRating: 4.8,
    reviewCount: 412,
    emergencyService: true,
    heroImage: {
      src: "https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=1200&q=70&auto=format",
      alt: "Stockton Heating technician arriving at a service call",
    },
    heroOverlay: {
      techName: "Diego R. — Lead tech",
      techMeta: "12 yrs · NATE-certified",
      callout: "$89 diagnostic · waived w/ repair",
    },
  } satisfies HeroProps,

  services: {
    archetype: "bold-urgency",
    eyebrow: "What we fix",
    heading: "Same-day HVAC, no surprise charges.",
    intro:
      "Upfront pricing, written warranty, and a written quote before any work starts. " +
      "We service every major brand — Carrier, Lennox, Trane, Goodman.",
    services: [
      {
        id: "s1",
        name: "AC repair",
        description:
          "Same-day diagnostic, upfront pricing, no surprise charges. We carry the most-common parts " +
          "on every truck so most repairs finish the same day we arrive.",
      },
      {
        id: "s2",
        name: "Furnace install",
        description:
          "High-efficiency systems from Carrier, Lennox, Trane. Same-day installs on most models. " +
          "Financing available — 0% APR for 18 months.",
      },
      {
        id: "s3",
        name: "Duct cleaning",
        description: "EPA-certified cleaning crew, before/after photos delivered after every job.",
      },
      {
        id: "s4",
        name: "Indoor air quality",
        description: "HEPA filtration, UV sanitization, and smart thermostats — installed and configured.",
      },
    ],
    cta: {
      label: `Call ${PHONE}`,
      href: `tel:+12095550144`,
      text: {
        title: "Not sure what you need?",
        sub: "Tell us what's wrong over the phone and we'll dispatch the right tech with the right parts.",
      },
    },
  } satisfies ServicesGridProps,

  testimonials: {
    archetype: "bold-urgency",
    eyebrow: "What neighbors say",
    heading: "412 reviews. 4.8 stars. No drama.",
    testimonials: [
      {
        id: "t1", rating: 5, service: "AC repair",
        quote: "Called at 11 PM on a Friday — they were here by midnight. AC running by 1 AM. Heroes.",
        name: "Diane M.", city: "Stockton, CA",
      },
      {
        id: "t2", rating: 5, service: "Furnace install",
        quote: "Quoted me half what the big chains wanted. New system in one day, no mess.",
        name: "Marcus V.", city: "Lodi, CA",
      },
      {
        id: "t3", rating: 5, service: "AC repair",
        quote: "Tech showed up in uniform, in a marked truck, explained everything. Felt safe.",
        name: "Hartmann Family", city: "Tracy, CA",
      },
    ],
    reviewSummary: { rating: 4.8, count: 412, sources: "Google · Yelp · BBB" },
  } satisfies TestimonialsProps,

  faq: {
    archetype: "bold-urgency",
    eyebrow: "Quick answers",
    heading: "Frequently asked questions",
    intro: "If you don't see your question, call us — most calls answered in under 2 rings.",
    items: [
      {
        id: "f1",
        question: "How fast can you be here for an emergency?",
        answer:
          "We answer the phone 24/7 and reach most of Stockton and Lodi within 60 minutes. " +
          "Outlying areas average 90 minutes.",
      },
      {
        id: "f2",
        question: "Do you charge extra for nights and weekends?",
        answer: "No surprise charges. Service-call fee is flat $89, 24/7, waived if you book the repair with us.",
      },
      {
        id: "f3",
        question: "Are you licensed and insured?",
        answer:
          "Yes. California C-20 HVAC license #897432, fully bonded and insured up to $2M general " +
          "liability and workers’ comp.",
      },
      {
        id: "f4",
        question: "Do you finance major repairs or installs?",
        answer:
          "Yes — 0% APR for 18 months on installs through our financing partner. Instant approval at your kitchen table.",
      },
    ],
    cta: {
      title: "Still have questions?",
      sub: "We pick up 24/7. Most calls answered in under 2 rings.",
      label: `Call ${PHONE}`,
      href: `tel:+12095550144`,
    },
  } satisfies FaqProps,

  footer: {
    archetype: "bold-urgency",
    businessName: "Stockton Heating & Cooling",
    tagline:
      "Family-owned and locally operated since 1998. Licensed master technicians ready 24/7 for emergencies. " +
      "No call-out fees on weekends or holidays.",
    phone: PHONE,
    email: "service@stocktonheating.com",
    address: { line1: "1407 W Lane", city: "Stockton", state: "CA", zip: "95203" },
    serviceAreas: ["Stockton", "Lodi", "Tracy", "Manteca", "Modesto"],
    weeklyHours: [
      { line: "24/7 emergency · always on call", emergency: true },
      { line: "Office Mon–Fri · 7am–7pm" },
      { line: "Saturday · 8am–4pm" },
    ],
    license: "California C-20 HVAC #897432",
    trustBadges: [
      { label: "Licensed C-20 #897432" },
      { label: "Bonded" },
      { label: "Insured" },
      { label: "BBB A+" },
    ],
    serviceLinks: [
      { label: "AC repair", href: "#services" },
      { label: "Furnace install", href: "#services" },
      { label: "Duct cleaning", href: "#services" },
      { label: "Indoor air quality", href: "#services" },
      { label: "Maintenance plans", href: "#services" },
    ],
    socials: [
      { kind: "facebook", href: "https://facebook.com/stocktonheating" },
      { kind: "google", href: "https://g.page/stocktonheating" },
      { kind: "yelp", href: "https://yelp.com/biz/stocktonheating" },
    ],
  } satisfies FooterProps,

  emergency: {
    archetype: "bold-urgency",
    message: "24/7 emergency HVAC — we come out tonight",
    phone: PHONE,
    show: true,
  } satisfies EmergencyStripProps,

  sticky: {
    archetype: "bold-urgency",
    phone: PHONE,
    smsHref: "sms:+12095550144",
    bookHref: "/book",
  } satisfies StickyMobileBarProps,
};
