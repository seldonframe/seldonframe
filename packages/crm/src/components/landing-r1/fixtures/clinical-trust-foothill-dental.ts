// landing/fixtures/clinical-trust-foothill-dental.ts
//
// Sample LLM payload for archetype "clinical-trust".
// Business: Foothill Family Dental — multi-doctor general dental practice.
// Voice: calm, authoritative, precise. No emergency framing.

import type { HeroProps } from "../sections/hero";
import type { ServicesGridProps } from "../sections/services-grid";
import type { TestimonialsProps } from "../sections/testimonials";
import type { FaqProps } from "../sections/faq";
import type { FooterProps } from "../sections/footer";
import type { StickyMobileBarProps } from "../chrome/sticky-mobile-bar";

const PHONE = "(530) 555-0188";

export const foothillDentalFixture = {
  archetype: "clinical-trust" as const,
  businessName: "Foothill Family Dental",

  hero: {
    archetype: "clinical-trust",
    businessName: "Foothill Family Dental",
    tagline: "Comprehensive dental care across three generations of Auburn families.",
    subhead:
      "Two board-certified general dentists and a periodontist serving Placer County since 2003. " +
      "In-network with 28 PPO carriers and same-week scheduling for new patients.",
    primaryCTA: { label: "Schedule a consultation", href: "/consult" },
    secondaryCTA: { label: "Request an appointment", href: "/book" },
    trustBadges: [
      { label: "Board-certified since 2003" },
      { label: "Patients served: 14,000+" },
      { label: "In-network with 28 PPO carriers" },
      { label: "ADA / CDA member" },
    ],
    reviewRating: 4.9,
    reviewCount: 248,
    heroImage: {
      src: "https://images.unsplash.com/photo-1606811971618-4486d14f3f99?w=1200&q=70&auto=format",
      alt: "Foothill Family Dental treatment room",
    },
    heroOverlay: {
      techName: "Dr. Anjali Rao, DDS",
      techMeta: "UC San Francisco · 18 years practising",
    },
  } satisfies HeroProps,

  services: {
    archetype: "clinical-trust",
    eyebrow: "Areas of practice",
    heading: "Comprehensive care from one familiar team.",
    intro:
      "Same-day exams for active discomfort. Most preventive, restorative, and cosmetic work " +
      "is completed in-house — no second clinic, no third opinion.",
    services: [
      { id: "s1", name: "Preventive care",
        description: "Twice-yearly exams, hygiene, fluoride and sealant programs for children and adults." },
      { id: "s2", name: "Restorative dentistry",
        description: "Tooth-coloured fillings, crowns, bridges, and full-arch restorations. Same-day CEREC available." },
      { id: "s3", name: "Cosmetic & implants",
        description: "Veneers, professional whitening, and single- or multi-tooth implants placed and restored in-house." },
      { id: "s4", name: "Periodontal care",
        description: "Dr. Reyes is a board-certified periodontist — gum disease management and grafting under one roof." },
    ],
    cta: {
      label: "Request an appointment",
      href: "/book",
      text: {
        title: "Most new patients seen within seven days.",
        sub: "Send us your insurance card and a brief description of your concern. We'll confirm benefits before your visit.",
      },
    },
  } satisfies ServicesGridProps,

  testimonials: {
    archetype: "clinical-trust",
    eyebrow: "Trusted by",
    heading: "Patients of all ages, treated with the same care.",
    testimonials: [
      { id: "t1", rating: 5, service: "Restorative",
        quote: "Dr. Rao explained every option, every cost, every trade-off — twice. I left understanding my own mouth for the first time.",
        name: "Catherine S.", city: "Auburn, CA" },
      { id: "t2", rating: 5, service: "Implants",
        quote: "Full upper restoration over four months. The team rehearsed every appointment. I never felt like an experiment.",
        name: "Daniel P.", city: "Loomis, CA" },
      { id: "t3", rating: 5, service: "Family preventive",
        quote: "Three of my kids are patients here. The hygienists remember which of them is shy about the suction.",
        name: "The Rivera Family", city: "Newcastle, CA" },
    ],
    reviewSummary: { rating: 4.9, count: 248, sources: "Google · Healthgrades · ZocDoc" },
  } satisfies TestimonialsProps,

  faq: {
    archetype: "clinical-trust",
    eyebrow: "Before your visit",
    heading: "Frequently asked questions.",
    items: [
      { id: "f1", question: "Are you accepting new patients?",
        answer: "Yes. Most new patients are seen within seven business days, and within 48 hours for active discomfort." },
      { id: "f2", question: "What insurance plans do you accept?",
        answer: "We are in-network with 28 PPO carriers including Delta Dental, Cigna, Aetna, and MetLife. We also file claims directly for out-of-network PPO plans." },
      { id: "f3", question: "Do you offer payment plans?",
        answer: "Yes. We offer interest-free 12-month financing in-house, and 0% APR for 24 months on treatments over $2,000 through CareCredit." },
      { id: "f4", question: "What about emergencies after hours?",
        answer: "An on-call dentist is reachable through our answering service for established patients. We reserve same-day slots for active pain, swelling, or trauma." },
    ],
    cta: {
      title: "Have a question we didn't answer?",
      sub: "Email the practice directly — we respond within one business day.",
      label: "Contact the practice",
      href: "mailto:hello@foothilldental.com",
    },
  } satisfies FaqProps,

  footer: {
    archetype: "clinical-trust",
    businessName: "Foothill Family Dental",
    tagline:
      "Two board-certified general dentists and a periodontist serving Placer County since 2003. " +
      "Comprehensive care under one roof.",
    phone: PHONE,
    email: "hello@foothilldental.com",
    address: { line1: "1620 Lincoln Way · Suite 200", city: "Auburn", state: "CA", zip: "95603" },
    serviceAreas: ["Auburn", "Loomis", "Newcastle", "Rocklin", "Lincoln", "Penryn"],
    weeklyHours: [
      { line: "Mon–Thu · 7:30am–5pm" },
      { line: "Friday · 7:30am–2pm" },
      { line: "Closed Saturday & Sunday" },
    ],
    license: "California DDS #54122 · #67801 · #71430 · NPI 1093846252",
    trustBadges: [
      { label: "ADA member" },
      { label: "Board-certified since 2003" },
      { label: "28 PPO carriers in-network" },
    ],
    serviceLinks: [
      { label: "Preventive care", href: "#services" },
      { label: "Restorative", href: "#services" },
      { label: "Cosmetic & implants", href: "#services" },
      { label: "Periodontal", href: "#services" },
      { label: "Patient forms", href: "/forms" },
    ],
    socials: [
      { kind: "google", href: "https://g.page/foothilldental" },
      { kind: "facebook", href: "https://facebook.com/foothilldental" },
    ],
  } satisfies FooterProps,

  sticky: {
    archetype: "clinical-trust",
    phone: PHONE,
    bookHref: "/book",
  } satisfies StickyMobileBarProps,
};
