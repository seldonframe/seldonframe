// landing/fixtures/cinematic-aspirational-solace.ts
//
// Sample LLM payload for archetype "cinematic-aspirational".
// Business: Solace Aesthetics — high-end medspa.
// Voice: cinematic, sensory, confident. Never "Call now". Whitespace-led.

import type { HeroProps } from "../sections/hero";
import type { ServicesGridProps } from "../sections/services-grid";
import type { TestimonialsProps } from "../sections/testimonials";
import type { FaqProps } from "../sections/faq";
import type { FooterProps } from "../sections/footer";

const PHONE = "(310) 555-0119";

export const solaceFixture = {
  archetype: "cinematic-aspirational" as const,
  businessName: "Solace Aesthetics",

  hero: {
    archetype: "cinematic-aspirational",
    businessName: "Solace Aesthetics",
    tagline: "Restorative aesthetics, quietly extraordinary.",
    subhead:
      "A signature private practice on Montana Avenue. Discreet treatment rooms, " +
      "physician-led care, and intentional outcomes — no rushed consultations, no upsell.",
    primaryCTA: { label: "Reserve your visit", href: "/reserve" },
    secondaryCTA: { label: "Book your consultation", href: "/consult" },
    trustBadges: [
      { label: "Physician-led" },
      { label: "AAD Fellow · Dr. Halpern" },
      { label: "By appointment only" },
    ],
    reviewRating: 4.9,
    reviewCount: 156,
    heroImage: {
      // Treatment-room interior — calm, sensory.
      src: "https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=1600&q=70&auto=format",
      alt: "A treatment suite at Solace Aesthetics",
    },
  } satisfies HeroProps,

  services: {
    archetype: "cinematic-aspirational",
    eyebrow: "Signature treatments",
    heading: "Considered work, never excessive.",
    intro:
      "Every treatment plan begins with a one-hour consultation and ends with results " +
      "you'd be comfortable explaining over dinner.",
    services: [
      { id: "s1", name: "Injectables",
        description: "Hand-tuned neuromodulator and filler placement. Outcomes that look like rest, not work." },
      { id: "s2", name: "Skin & laser",
        description: "Resurfacing, IPL, and microneedling with PRP — calibrated for our latitudes and lifestyles." },
      { id: "s3", name: "Body contour",
        description: "EMSculpt, CoolSculpting, and lymphatic therapies for considered, gradual outcomes." },
      { id: "s4", name: "Skincare practice",
        description: "A bespoke at-home regimen, formulated and dispensed in-house. Reformulated each season." },
    ],
    cta: {
      label: "Reserve your visit",
      href: "/reserve",
      text: {
        title: "First visits begin with a conversation.",
        sub: "Tell us about your goals. We'll draft a treatment plan you can sit with — no pressure, no obligation.",
      },
    },
  } satisfies ServicesGridProps,

  testimonials: {
    archetype: "cinematic-aspirational",
    eyebrow: "From our clients",
    heading: "Discreetly, year after year.",
    testimonials: [
      { id: "t1", rating: 5, service: "Injectables",
        quote: "I left looking like a more rested version of myself. Nothing more, nothing less — which is the entire point.",
        name: "Anna L.", city: "Santa Monica, CA" },
      { id: "t2", rating: 5, service: "Skin & laser",
        quote: "The consultation was an hour. Not five minutes. Dr. Halpern noticed things about my skin I'd been carrying for years.",
        name: "James P.", city: "Brentwood, CA" },
      { id: "t3", rating: 5, service: "Body contour",
        quote: "Six sessions, gradual, never rushed. They photographed every visit. I trust the process now.",
        name: "Rebecca M.", city: "Pacific Palisades, CA" },
    ],
    reviewSummary: { rating: 4.9, count: 156, sources: "Google · RealSelf · Vogue 100" },
  } satisfies TestimonialsProps,

  faq: {
    archetype: "cinematic-aspirational",
    eyebrow: "Considered answers",
    heading: "Before your first visit.",
    items: [
      { id: "f1", question: "How does a first visit work?",
        answer: "Sixty minutes with Dr. Halpern. We discuss your goals, examine your skin in natural and clinical light, and draft a treatment plan you can take home and sit with." },
      { id: "f2", question: "Do you take walk-ins?",
        answer: "We see clients by appointment only. This is how we keep visits unhurried and our schedule honest." },
      { id: "f3", question: "How do you price treatments?",
        answer: "All pricing is itemised in writing before any treatment begins. We do not bundle, upsell, or commission our team on sales." },
      { id: "f4", question: "Will I look 'done'?",
        answer: "Our practice is built on restraint. We routinely turn down requests we believe will not age well, and we welcome the conversation about why." },
    ],
    cta: {
      title: "Have a question first?",
      sub: "Our concierge replies personally within one business day.",
      label: "Write to the practice",
      href: "mailto:concierge@solaceaesthetics.com",
    },
  } satisfies FaqProps,

  footer: {
    archetype: "cinematic-aspirational",
    businessName: "Solace Aesthetics",
    tagline:
      "A signature practice on Montana Avenue. By appointment only. Physician-led, intentionally small.",
    phone: PHONE,
    email: "concierge@solaceaesthetics.com",
    address: { line1: "1320 Montana Avenue · Suite 3", city: "Santa Monica", state: "CA", zip: "90403" },
    serviceAreas: ["Santa Monica", "Brentwood", "Pacific Palisades", "Beverly Hills", "Malibu"],
    weeklyHours: [
      { line: "Tue–Sat · By appointment" },
      { line: "Closed Sunday & Monday" },
    ],
    license: "California Medical License #G-184022 · Solace Aesthetics, P.C.",
    trustBadges: [
      { label: "AAD Fellow" },
      { label: "Physician-led" },
      { label: "By appointment only" },
    ],
    serviceLinks: [
      { label: "Injectables", href: "#services" },
      { label: "Skin & laser", href: "#services" },
      { label: "Body contour", href: "#services" },
      { label: "Skincare", href: "#services" },
      { label: "Our practice", href: "/about" },
    ],
    socials: [
      { kind: "instagram", href: "https://instagram.com/solaceaesthetics" },
    ],
  } satisfies FooterProps,
};
