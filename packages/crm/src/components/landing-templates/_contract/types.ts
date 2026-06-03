// SeldonFrame · shared data contract (matches EXAMPLE_SOULS.ts §3).
// Treat every field except `business_name` as possibly missing.

export type Soul = {
  business_name: string;
  tagline?: string;
  soul_description?: string;
  phone?: string;
  email?: string;
  address?: string;
  service_area?: string[];
  hours?: { day: string; open: string; close: string }[];
  review_rating?: number;
  review_count?: number;
  trust_signals?: string[];
  certifications?: string[];
  emergency_service?: boolean;
  same_day?: boolean;
  offerings?: {
    name: string;
    description?: string;
    price?: number;
    currency?: string;
    duration_minutes?: number;
  }[];
  faqs?: { q: string; a: string }[];
  testimonials?: { name: string; text: string }[];
  photos?: { url: string; alt?: string; role?: "hero" | "service" | "about" | "gallery" }[];
};

export type CTAs = {
  bookUrl: string;
  callHref?: string;
  intakeUrl?: string;
};

// The archetype theme — injected per business. Every template reads exactly
// these tokens; the values are surfaced to CSS as --sf-* custom properties.
export type SfTheme = {
  primary?: string;
  secondary?: string;
  bg?: string;
  text?: string;
  border?: string;
  fontHeadline?: string;
  fontBody?: string;
};

// Standard entry signature shared by ALL five templates (drop-in interchangeable).
export type TemplateProps = { data: Soul; ctas: CTAs; theme?: SfTheme };
