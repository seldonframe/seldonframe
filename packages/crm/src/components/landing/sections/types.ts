// v1.40.5 — Unsplash attribution payload required by API guidelines.
// Every hero / gallery image resolved via the Unsplash API ships with
// this metadata so the rendered page can display the photographer
// credit + link back to their Unsplash profile (with utm_source +
// utm_medium params per Unsplash's spec). Without this, SF can't
// pass production-tier review and stays capped at the 50-req/hour
// demo limit.
export type UnsplashAttribution = {
  /** Photographer's display name as Unsplash returned it. */
  photographer_name: string;
  /** Photographer's Unsplash username (`@username` slug). */
  photographer_username: string;
  /** Photographer's Unsplash profile URL — link target for the credit. */
  photographer_url: string;
  /** Unsplash photo ID, useful for debugging + dedupe. */
  photo_id: string;
};

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
  /** v1.40.0 — layout composition variant chosen by aesthetic archetype.
   *  Centered hero is BANNED per taste-skill (DESIGN_VARIANCE > 4); the
   *  allowed variants force asymmetric / split / editorial compositions
   *  per the design discipline.
   *  - split-screen-50-50: classic 50/50 split, image right, copy left
   *  - left-aligned-asymmetric: copy spans 60%, image floats right with
   *    intentional whitespace; the editorial default
   *  - cinematic-fullbleed: image as full-bleed background, copy
   *    overlaid on a dark gradient
   *  - founder-portrait: copy left, square portrait right with eyebrow
   *    treatment — best for solo-operator / coaching businesses
   *  - cinematic-aura (v1.41.0): looping Pexels MP4 background with
   *    liquid-glass UI, Instrument Serif italic typography, BlurText
   *    headline. The default for agency + cinematic-aspirational
   *    archetypes whenever a hero video is available. */
  variant?:
    | "split-screen-50-50"
    | "left-aligned-asymmetric"
    | "cinematic-fullbleed"
    | "founder-portrait"
    | "cinematic-aura";
  /** v1.40.5 — Unsplash photographer attribution. Renders as a small
   *  "Photo: NAME on Unsplash" pill in the hero composition. Required
   *  by Unsplash API guidelines; absent only when the hero image came
   *  from somewhere other than Unsplash (e.g. operator-uploaded). */
  heroImageAttribution?: UnsplashAttribution;
  /** v1.41.0 — Pexels video attribution. Renders as a small
   *  "Video: NAME on Pexels" pill in the cinematic-aura variant.
   *  Required by Pexels licence; absent only when the hero video came
   *  from somewhere other than Pexels (e.g. operator-uploaded). */
  heroVideoAttribution?: {
    photographer_name: string;
    photographer_url: string;
    /** Pexels video page URL. */
    source_url: string;
    video_id: number;
  };
  /** v1.41.0 — Optional one word inside `headline` that gets the
   *  gradient-shiny treatment in the cinematic-aura variant. Pick the
   *  most emphatic word — the outcome word, the metric, the proper noun
   *  ("Pipeline", "Empire", "Future"). First case-insensitive match is
   *  highlighted. Ignored by non-cinematic variants. */
  shinyWord?: string;
  /** v1.40.0 — Hormozi-style risk-reversal badges rendered as a tight
   *  row under the primary CTA. License #s, "BBB A+ rated", "Bonded &
   *  insured", "Lifetime warranty" — proof underneath the click target
   *  to reduce the perceived risk of converting. Empty array hides
   *  the row entirely. */
  riskReversalBadges?: string[];
  /** v1.40.0 — visual proof tile shown above the CTA. Bundles rating
   *  + count + descriptor in a compact pill row so visitors see the
   *  social proof in the same eyeful as the headline (Hormozi: "your
   *  proof is going to do more selling than any promise"). */
  proofTile?: {
    rating: number;
    count: number;
    label: string;
  };
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

// v1.36.0 — services-grid block. The single most-impactful section
// for a local-service-business landing page. Each card has price,
// duration, and a "Book" CTA. The chatbot pulls pricing from the
// same Soul fact source so the price quoted in chat matches the
// price on the page.
export type ServicesGridSectionContent = {
  headline: string;
  subheadline?: string;
  services: Array<{
    name: string;
    description: string;
    price: string;
    duration?: string;
    ctaText?: string;
    ctaLink?: string;
    icon?: string;
  }>;
};

// v1.36.0 — emergency-strip block. High-prominence "if this is an
// emergency, call X now" banner. Critical for trades businesses
// (plumbing, HVAC, locksmith, towing, etc.) where after-hours
// emergencies are the highest-LTV customer segment.
export type EmergencyStripSectionContent = {
  /** Short headline e.g. "Pipe burst? Roof leaking? Don't wait." */
  headline: string;
  /** Phone number, formatted for display. */
  phone: string;
  /** Tel: link target — defaults to phone with non-digits stripped. */
  phoneLink?: string;
  /** Right-side text e.g. "24/7 emergency response — we answer the phone." */
  hours?: string;
};

// v1.36.0 — service-area block. List of cities/neighborhoods served,
// rendered as a tasteful chip cloud. Tells visitors "we cover you"
// without forcing a map integration.
export type ServiceAreaSectionContent = {
  headline: string;
  subheadline?: string;
  /** Anchor location, displayed prominently. */
  primaryLocation?: string;
  /** Cities / neighborhoods served. */
  areas: string[];
};

// v1.38.1 — project-gallery block. Stock-photo masonry grid that
// makes a trades-business landing page feel populated rather than
// text-only. Auto-fetched per-service via Unsplash inside
// enhanceLandingForWorkspace (one image per service, plus optional
// extras keyed off vertical scenery — e.g. for HVAC: a thermostat,
// outdoor unit, residential setting). Operators can replace any
// image post-launch via update_landing_section.
//
// Why no LLM call to generate the gallery: Claude already produces
// a `gallery_image_query` per service inside the v1.38.0 prompt;
// the orchestrator just resolves each query to a real Unsplash URL
// and renders. Captions are optional — usually the service name is
// enough context.
export type ProjectGallerySectionContent = {
  headline: string;
  subheadline?: string;
  items: Array<{
    image: string;
    alt: string;
    caption?: string;
    /** v1.40.5 — Unsplash photographer attribution per tile. Required
     *  by Unsplash API guidelines; rendered as part of the caption
     *  hover overlay. */
    attribution?: UnsplashAttribution;
  }>;
  /** Optional bottom CTA. Typically "See more work" → /book. */
  ctaText?: string;
  ctaLink?: string;
};

// v1.38.2 — sticky-mobile-cta block. Fixed bottom-of-screen bar that
// renders ONLY on mobile (≤md breakpoint) with two large taps:
// "Call now" (tel:) and "Book now" (/book). Industry consensus from
// Cal.com, Calendly, and every conversion-tuned trades site is that
// a sticky mobile CTA bar lifts mobile bookings by 2-3x. The bar
// hides on desktop where the navbar's fixed CTAs are already
// reachable.
//
// Rendered as a section in the LandingPageSection[] array but
// position:fixed pulls it out of the document flow at runtime.
// PageRenderer's RevealOnScroll wrapper still renders fine — the
// motion never fires since the bar is always visible from page load.
export type StickyMobileCTASectionContent = {
  /** Phone number, formatted for display ("(555) 123-4567"). */
  phone: string;
  /** tel: link target — defaults to digits-only of phone. */
  phoneLink?: string;
  /** Booking link — defaults to "/book". */
  bookLink?: string;
  /** Override the call CTA text. Defaults to "Call". */
  callText?: string;
  /** Override the book CTA text. Defaults to "Book". */
  bookText?: string;
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
    | "footer"
    | "servicesGrid"
    | "emergencyStrip"
    | "serviceArea"
    | "projectGallery"
    | "stickyMobileCTA";
  content: Record<string, unknown>;
  order: number;
};
