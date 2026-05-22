// landing/_shared/types.ts
//
// Barrel re-export of section prop types so consumers can import from one
// place. Each section also exports its own prop type next to the component
// (for tree-shaking + co-location with the implementation).

export type { AestheticArchetypeId, Archetype, HeroVariant, MotionPreset } from "../archetypes";
export type { HeroProps, CTA } from "../sections/hero";
export type { ServicesGridProps, Service } from "../sections/services-grid";
export type { TestimonialsProps, Testimonial } from "../sections/testimonials";
export type { FaqProps, FaqItem } from "../sections/faq";
export type { FooterProps } from "../sections/footer";
export type { TrustBadgeProps } from "./trust-badge";
