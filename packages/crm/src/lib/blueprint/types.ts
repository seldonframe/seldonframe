/**
 * TypeScript shapes for the workspace blueprint system.
 *
 * Mirrors `skills/templates/schema.json` (Phase 2). Hand-written rather
 * than generated from the schema because:
 *   1. The schema's $defs use `oneOf` discriminators on `type` strings,
 *      which generators (json-schema-to-typescript, quicktype) emit as
 *      awkward unions. Hand-written discriminated unions are cleaner.
 *   2. The shape is small (~200 lines) and stable enough that a
 *      one-time port + manual sync at schema bumps is cheaper than a
 *      build step.
 *
 * If the schema changes, update this file. The C1 validator
 * (pnpm template:validate) is the source of truth for runtime
 * correctness — these types are a developer-experience layer.
 */

// ─── Primitives ─────────────────────────────────────────────────────────

export type HexColor = string; // ^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$
export type PhoneE164 = string; // ^\+[1-9]\d{1,14}$
export type IANATimezone = string;
export type DayHourRange = [number, number] | null;

export interface WeeklyHours {
  mon: DayHourRange;
  tue: DayHourRange;
  wed: DayHourRange;
  thu: DayHourRange;
  fri: DayHourRange;
  sat: DayHourRange;
  sun: DayHourRange;
}

export interface Address {
  street: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
}

// ─── Workspace ──────────────────────────────────────────────────────────

export interface Theme {
  mode: "light" | "dark";
  accent: HexColor;
  displayFont?: "cal-sans" | "geist";
  bodyFont?: "inter";
  radiusScale?: "default" | "minimal" | "rounded";
  logoUrl?: string | null;
  heroImageUrl?: string | null;
}

export interface Contact {
  phone: PhoneE164;
  emergencyPhone?: PhoneE164 | null;
  email?: string | null;
  address: Address;
  hours: WeeklyHours;
  timezone: IANATimezone;
  serviceArea?: string;
}

export interface Workspace {
  name: string;
  slug?: string;
  tagline?: string;
  industry: string;
  theme: Theme;
  contact: Contact;
}

// ─── Landing ────────────────────────────────────────────────────────────

export interface CTA {
  label: string;
  href?: string;
  kind?: "primary" | "secondary" | "ghost" | "tel";
}

export type LandingSection =
  | SectionEmergencyStrip
  | SectionHero
  | SectionTrustStrip
  | SectionServicesGrid
  | SectionAbout
  | SectionMidCta
  | SectionTestimonials
  | SectionServiceArea
  | SectionFaq
  | SectionFooter;

export interface SectionEmergencyStrip {
  type: "emergency-strip";
  label: string;
  phoneLabel?: string;
}

export interface SectionHero {
  type: "hero";
  eyebrow?: string;
  headline: string;
  subhead?: string;
  ctaPrimary: CTA;
  ctaSecondary?: CTA;
  imageUrl?: string | null;
  variant?: "split-image-right" | "full-bleed" | "founder-portrait";
}

export interface SectionTrustStrip {
  type: "trust-strip";
  items: Array<{ icon?: string; label: string }>;
}

export interface SectionServicesGrid {
  type: "services-grid";
  headline?: string;
  subhead?: string;
  /** May 1, 2026 — `stats` layout produces large-number / label cards
   *  instead of icon-led service cards. Used for "by the numbers"
   *  sections. The renderer reads layout to switch markup + assigns
   *  id="sf-stats" instead of id="sf-services". */
  layout?: "grid-3" | "grid-4" | "tabs" | "stats";
  items: Array<{
    icon?: string;
    title: string;
    description: string;
    priceFrom?: string;
    category?: string;
    learnMoreUrl?: string | null;
  }>;
}

export interface SectionAbout {
  type: "about";
  headline: string;
  body: string;
  photoUrl?: string | null;
  ownerName?: string;
  ownerTitle?: string;
}

export interface SectionMidCta {
  type: "mid-cta";
  headline: string;
  subhead?: string;
  ctaPrimary?: CTA;
  ctaSecondary?: CTA;
  embedQuoteForm?: boolean;
}

export interface Testimonial {
  quote: string;
  authorName: string;
  authorRole?: string;
  avatarUrl?: string | null;
  rating?: 1 | 2 | 3 | 4 | 5;
  source?: "google" | "yelp" | "facebook" | "direct" | "verified";
}

export interface SectionTestimonials {
  type: "testimonials";
  headline?: string;
  featured?: Testimonial;
  items: Testimonial[];
}

export interface SectionServiceArea {
  type: "service-area";
  headline?: string;
  description: string;
  mapEmbedUrl?: string | null;
  cities?: string[];
}

export interface SectionFaq {
  type: "faq";
  headline?: string;
  items: Array<{ question: string; answer: string }>;
}

export interface SectionFooter {
  type: "footer";
  showHours?: boolean;
  showAddress?: boolean;
  showServiceArea?: boolean;
  social?: Array<{
    network: "facebook" | "instagram" | "x" | "linkedin" | "youtube" | "tiktok" | "google";
    url: string;
  }>;
  legal?: Array<{ label: string; href: string }>;
}

export interface Landing {
  renderer: "general-service-v1";
  sections: LandingSection[];
}

// ─── Booking / Intake / Admin (typed for completeness — used by C4/C5/C7) ───

export interface BookingFormField {
  id: string;
  label: string;
  type: "text" | "email" | "phone" | "textarea" | "select";
  required?: boolean;
  placeholder?: string;
  options?: string[];
}

export interface Booking {
  renderer: "calcom-month-v1";
  eventType: {
    title: string;
    description?: string;
    durationMinutes: number;
    location?: {
      kind: "on-site-customer" | "on-site-business" | "phone" | "video" | "hybrid";
      videoProvider?: "zoom" | "google-meet" | "microsoft-teams" | "manual";
    };
    bufferMinutes?: number;
  };
  availability: {
    weekly: WeeklyHours;
    blackoutDates?: string[];
    leadTimeHours?: number;
    advanceWindowDays?: number;
  };
  formFields: BookingFormField[];
  confirmation: {
    headline?: string;
    message?: string;
    successRedirectUrl?: string | null;
  };
}

export interface IntakeQuestion {
  id: string;
  type: "text" | "textarea" | "email" | "phone" | "number" | "select" | "multi-select" | "rating" | "date";
  label: string;
  helper?: string;
  required?: boolean;
  options?: string[];
  ratingScale?: "number-1-5" | "number-1-10" | "stars-1-5";
  validation?: {
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    pattern?: string;
  };
  showIf?: {
    questionId: string;
    operator: "equals" | "not-equals" | "contains" | "greater-than" | "less-than";
    value: unknown;
  };
}

export interface Intake {
  renderer: "formbricks-stack-v1";
  title: string;
  description?: string;
  questions: IntakeQuestion[];
  completion: {
    headline?: string;
    message?: string;
    cta?: CTA;
  };
}

export interface AdminField {
  id: string;
  label: string;
  type:
    | "text"
    | "longtext"
    | "email"
    | "phone"
    | "url"
    | "number"
    | "currency"
    | "date"
    | "datetime"
    | "boolean"
    | "select"
    | "multi-select"
    | "relation";
  required?: boolean;
  options?: string[];
  relationTo?: string;
  showInSidebar?: boolean;
}

export interface AdminView {
  id: string;
  label: string;
  kind: "table" | "kanban" | "calendar";
  isDefault?: boolean;
  table?: {
    columns?: string[];
    sortBy?: { field: string; direction: "asc" | "desc" };
    groupBy?: string;
  };
  kanban?: {
    stageField: string;
    stages: string[];
    cardFields?: string[];
    aggregate?: { field: string; kind: "count" | "sum" | "avg" | "min" | "max" };
  };
}

export interface AdminObject {
  id: string;
  label: string;
  icon: string;
  fields: AdminField[];
  views: AdminView[];
}

export interface Admin {
  renderer: "twenty-shell-v1";
  objects: AdminObject[];
  sidebarOrder: string[];
}

// ─── Top-level blueprint ────────────────────────────────────────────────

export interface Blueprint {
  $schema?: string;
  version: 1;
  workspace: Workspace;
  landing: Landing;
  booking: Booking;
  intake: Intake;
  admin: Admin;
}
