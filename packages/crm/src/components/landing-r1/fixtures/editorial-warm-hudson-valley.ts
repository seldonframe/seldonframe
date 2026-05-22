// landing/fixtures/editorial-warm-hudson-valley.ts
//
// Sample LLM payload for archetype "editorial-warm".
// Business: Hudson Valley Restoration — heritage roofing & restoration.
// Voice: warm, confident, human. Story-led. No emergency framing.

import type { HeroProps } from "../sections/hero";
import type { ServicesGridProps } from "../sections/services-grid";
import type { TestimonialsProps } from "../sections/testimonials";
import type { FaqProps } from "../sections/faq";
import type { FooterProps } from "../sections/footer";
import type { StickyMobileBarProps } from "../chrome/sticky-mobile-bar";

const PHONE = "(845) 555-0163";

export const hudsonValleyFixture = {
  archetype: "editorial-warm" as const,
  businessName: "Hudson Valley Restoration",

  hero: {
    archetype: "editorial-warm",
    businessName: "Hudson Valley Restoration",
    tagline: "Slate, copper, and cedar — restored by hand since 1962.",
    subhead:
      "Three generations of master roofers restoring landmark homes across the Hudson Valley. " +
      "Every detail matched to the original, every project documented in our portfolio.",
    primaryCTA: { label: "Schedule a consultation", href: "/consult" },
    secondaryCTA: { label: "View our work", href: "/portfolio" },
    trustBadges: [
      { label: "Family-owned since 1962" },
      { label: "Master craftsman certified" },
      { label: "180+ heritage homes restored" },
      { label: "Featured in This Old House" },
    ],
    reviewRating: 4.9,
    reviewCount: 87,
    heroImage: {
      src: "https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=1200&q=70&auto=format",
      alt: "Master craftsman replacing slate on a Hudson Valley estate",
    },
    heroOverlay: {
      techName: "Tom Maloney — 3rd generation",
      techMeta: "Slate Roofing Contractors Assn.",
    },
  } satisfies HeroProps,

  services: {
    archetype: "editorial-warm",
    eyebrow: "Our craft",
    heading: "Restoration, every detail by hand.",
    intro:
      "We work in slate, copper, cedar, and standing-seam — the materials your home was built " +
      "with. Every job earns its keep with a written 50-year warranty.",
    services: [
      { id: "s1", name: "Slate roofing",
        description: "Buckingham, Vermont, and Welsh slate sourced direct from the quarry. Hand-cut to your home's original spec." },
      { id: "s2", name: "Copper & metal work",
        description: "Standing-seam, flat-lock, and ornamental copper. Patinated in-place to match neighbouring buildings." },
      { id: "s3", name: "Cedar shingles & shakes",
        description: "Eastern white cedar and Western red. Pressure-treated to the historic-preservation standard." },
      { id: "s4", name: "Historic preservation",
        description: "Landmark commission filings, paint-color matching, gutter and downspout restoration." },
    ],
    cta: {
      label: "Schedule a consultation",
      href: "/consult",
      text: {
        title: "Not sure where to start?",
        sub: "Bring us a photo. We'll tell you what we see and what your options are — no obligation.",
      },
    },
  } satisfies ServicesGridProps,

  testimonials: {
    archetype: "editorial-warm",
    eyebrow: "Earned the trust",
    heading: "Stewards, not contractors.",
    testimonials: [
      { id: "t1", rating: 5, service: "Slate restoration",
        quote: "They sourced Buckingham slate to match the 1894 original. It looks like it was always there. Worth every penny.",
        name: "Margaret W.", city: "Rhinebeck, NY" },
      { id: "t2", rating: 5, service: "Copper work",
        quote: "Tom drew our cornice from scratch when the original drawings were lost. The work is museum-quality.",
        name: "David and Eleanor L.", city: "Cold Spring, NY" },
      { id: "t3", rating: 5, service: "Cedar shingles",
        quote: "Six months of careful work. Every shingle hand-tapered. The neighbors keep asking who did it.",
        name: "The Whitmore Estate", city: "Hudson, NY" },
    ],
    reviewSummary: { rating: 4.9, count: 87, sources: "Houzz · Google · NARI" },
  } satisfies TestimonialsProps,

  faq: {
    archetype: "editorial-warm",
    eyebrow: "Questions we get often",
    heading: "What it's like to work with us.",
    items: [
      { id: "f1", question: "How long does a typical restoration take?",
        answer: "Slate roofs run 6–14 weeks depending on pitch, complexity, and weather. We give you a written schedule before any work starts and update it every Friday." },
      { id: "f2", question: "Do you handle historic preservation filings?",
        answer: "Yes. We've filed with local landmark commissions across the Hudson Valley for thirty years and have working relationships with the preservation officers in eleven townships." },
      { id: "f3", question: "What's your warranty?",
        answer: "Fifty years on materials and workmanship for slate, copper, and cedar. Transferable to a new owner once, no questions asked." },
      { id: "f4", question: "Can I see work in progress?",
        answer: "Always. We host open-house Saturdays at active job sites for clients and architects. Reach out for the next one." },
    ],
    cta: {
      title: "Want to talk about your home?",
      sub: "Site visits are free for homes inside our 60-mile service radius. We bring the slate samples.",
      label: "Schedule a consultation",
      href: "/consult",
    },
  } satisfies FaqProps,

  footer: {
    archetype: "editorial-warm",
    businessName: "Hudson Valley Restoration",
    tagline:
      "Three generations of master roofers. Hand-cut slate, hand-formed copper, hand-tapered cedar. " +
      "Restoring landmark homes across the Hudson Valley since 1962.",
    phone: PHONE,
    email: "studio@hvrestoration.com",
    address: { line1: "27 Mill Hill Road", city: "Rhinebeck", state: "NY", zip: "12572" },
    serviceAreas: ["Hudson", "Rhinebeck", "Hyde Park", "Cold Spring", "Beacon", "Catskill"],
    weeklyHours: [
      { line: "Studio Mon–Fri · 8am–5pm" },
      { line: "Site visits by appointment" },
    ],
    license: "NY HIC #H-1264937 · Member, Slate Roofing Contractors Assn.",
    trustBadges: [
      { label: "Family-owned since 1962" },
      { label: "Master craftsman certified" },
      { label: "180+ heritage homes" },
    ],
    serviceLinks: [
      { label: "Slate roofing", href: "#services" },
      { label: "Copper & metal", href: "#services" },
      { label: "Cedar shingles", href: "#services" },
      { label: "Historic preservation", href: "#services" },
      { label: "Portfolio", href: "/portfolio" },
    ],
    socials: [
      { kind: "instagram", href: "https://instagram.com/hvrestoration" },
      { kind: "google", href: "https://g.page/hvrestoration" },
    ],
  } satisfies FooterProps,

  sticky: {
    archetype: "editorial-warm",
    phone: PHONE,
    bookHref: "/consult",
  } satisfies StickyMobileBarProps,
};
