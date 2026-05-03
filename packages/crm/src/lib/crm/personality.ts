// CRMPersonality — vertical-specific terminology, pipeline shape, fields,
// and dashboard layout. Same role for the admin UI that DesignTokens play
// for the marketing site: one primitive that swaps the vocabulary and
// shape of every surface a builder sees.
//
// Stored on `organizations.settings.crmPersonality`. Selected once at
// workspace creation from (businessType, industry) and immutable from
// then on unless the operator updates settings.

export type PersonalityVertical =
  | "general"
  | "hvac"
  | "legal"
  | "dental"
  | "coaching"
  | "agency"
  | "medspa";

export interface PersonalityLabel {
  singular: string;
  plural: string;
}

export interface PersonalityTerminology {
  contact: PersonalityLabel;
  deal: PersonalityLabel;
  activity: PersonalityLabel;
}

export interface PersonalityPipelineStage {
  name: string;
  color: string;
  probability: number;
}

export interface PersonalityPipeline {
  name: string;
  stages: PersonalityPipelineStage[];
}

export type PersonalityFieldType =
  | "text"
  | "textarea"
  | "email"
  | "tel"
  | "date"
  | "number"
  | "select"
  | "checkbox";

export interface PersonalityField {
  key: string;
  label: string;
  type: PersonalityFieldType;
  options?: string[];
}

export interface PersonalityContactFields {
  industrySpecific: PersonalityField[];
}

export interface PersonalityIntakeField {
  key: string;
  label: string;
  type: PersonalityFieldType;
  required: boolean;
  options?: string[];
}

export type PersonalityMetricTone =
  | "primary"
  | "positive"
  | "caution"
  | "negative"
  | "neutral";

export interface PersonalityDashboardMetric {
  key: string;
  label: string;
  /** Lucide icon name — resolved at render time by the dashboard component. */
  icon: string;
  tone: PersonalityMetricTone;
}

export type PersonalityUrgencySeverity = "info" | "warning" | "danger";

export interface PersonalityUrgencyIndicator {
  key: string;
  label: string;
  severity: PersonalityUrgencySeverity;
}

export interface PersonalityDashboard {
  primaryMetrics: PersonalityDashboardMetric[];
  urgencyIndicators: PersonalityUrgencyIndicator[];
}

// ─── Landing-page content templates ──────────────────────────────────────────
// May 2, 2026 — every personality drives industry-appropriate landing-page
// copy via these templates. Strings can include {placeholders} that are
// substituted at render time from the workspace input (city, rating,
// review_count, phone, services_list, service_area, certifications).
//
// Without this layer, dental/legal/etc workspaces fell back to the
// professional_service content pack — which was coaching-flavored
// ("Book a free consultation", "How long is a typical engagement?").

export interface PersonalityContentFaq {
  question: string;
  answer_template: string;
}

export interface PersonalityContentTemplates {
  /** Pick the first one; future A/B testing uses the others. */
  hero_headlines: string[];
  hero_subheadline: string;
  /** Exactly 4 — render as the trust strip under the hero. */
  trust_badges: string[];
  /** Section heading above the services grid (e.g. "Practice Areas"
   *  for legal, "Our Services" for dental, "What We Do" generic). */
  services_heading: string;
  /** 5 questions/answers, both with substitution. */
  faqs: PersonalityContentFaq[];
  /** Hero CTA buttons. Primary points at /book, secondary at /intake. */
  cta_button_primary: string;
  cta_button_secondary: string;
  /** Bottom-of-page CTA section. */
  bottom_cta_heading: string;
  /** Three short trust points shown under the bottom CTA button. */
  bottom_cta_trust_points: string[];
}

/**
 * v1.1.9 — explicit intake-form metadata. The `intakeFields` array
 * (kept for backward compat) only declares the field schema; intake
 * forms also need a personality-specific title + lead-in description
 * so the public form doesn't ship with the generic "Get in touch"
 * heading. Optional — personalities without `intake` fall back to
 * the workspace name + a neutral default.
 */
export interface PersonalityIntakeMeta {
  /** Form heading shown at the top of the public intake page.
   *  e.g. "Request a Treatment Consultation" (medspa),
   *       "Tell us about your project" (agency). */
  title: string;
  /** One-sentence lead-in below the title. */
  description?: string;
}

/**
 * v1.3.2 — per-personality renderer mode hint. Drives whether the
 * landing page renders with the cinematic (dark + glass +
 * Instrument-Serif italic headers) or clean (light + Inter +
 * neutral) PagePersonality. Light is the right default for trades,
 * tutoring, dental, retailers, and most niches; dark/cinematic
 * fits luxury / premium verticals (medspa, design agency, fashion).
 *
 * Optional — if absent, defaults to light unless the BusinessType
 * classifier says otherwise (saas/agency historically → cinematic).
 */
export type PersonalityThemeMode = "light" | "dark";

export interface PersonalityTheme {
  mode: PersonalityThemeMode;
}

/**
 * v1.3.4 — booking-event metadata generated by the LLM personality
 * generator. The booking page's calendar header (event title +
 * description + duration) was reading from the JSON template
 * (general.json: "Free consultation / 30-minute conversation to
 * understand your needs and provide a quote") for any vertical not
 * in the personalityBookingDefaults map. LLM niches like "barbershop"
 * or "tutoring" therefore shipped with that generic copy regardless
 * of how good the rest of the personality was.
 *
 * Optional — when absent, falls back to personalityBookingDefaults
 * (covers 7 seed verticals) then to the JSON template. Required for
 * any LLM-generated personality so the calendar reads in the
 * vertical's voice.
 */
export interface PersonalityBooking {
  /** Event title shown in the booking page header.
   *  e.g. "Book Your Haircut" / "Schedule a Tutoring Session" */
  title: string;
  /** 1-2 sentence description shown under the title. Customer-facing. */
  description: string;
  /** Default appointment length. */
  duration_minutes: number;
  /** Where the appointment happens. Drives the location pill on the
   *  booking page. Mirrors the blueprint's eventType.location.kind
   *  enum so we can apply it 1:1 in createAnonymousWorkspace without
   *  a translation layer.
   *
   *  - on-site-business: customer comes to the business (barbershop,
   *    dental office, salon, gym, restaurant, retail).
   *  - on-site-customer: provider goes to the customer (HVAC, plumber,
   *    landscaping, in-home tutor).
   *  - phone: voice-only consultation (legal intake, coaching).
   *  - video: zoom/meet/etc (agency, coaching, telehealth).
   *  - hybrid: mix of the above (consult-then-visit).
   */
  location_kind:
    | "on-site-business"
    | "on-site-customer"
    | "phone"
    | "video"
    | "hybrid";
}

/**
 * v1.3.4 — Unsplash image search queries generated by the LLM. The
 * pipeline uses these to fetch a real per-niche photo via the
 * Unsplash API (when UNSPLASH_ACCESS_KEY is set) or a deterministic
 * fallback URL. Without this, every workspace not in the curated
 * IMAGES map falls back to GENERAL_IMAGES which has hand-picked
 * contractor photos — irrelevant for nail salons, tutoring, etc.
 *
 * Optional. When absent the pipeline uses the existing
 * getPersonalityImages bundle.
 */
export interface PersonalityImages {
  /** Free-text Unsplash search query, e.g. "barbershop interior",
   *  "math tutoring student", "nail salon manicure". */
  hero_query: string;
  /** Optional secondary query for the about-section image. */
  about_query?: string;
}

/**
 * v1.3.3 — per-service enrichment generated by the LLM personality
 * generator. The operator passes raw service names (strings); the LLM
 * is prompted to write a customer-facing 1-2 sentence description AND
 * pick a Lucide icon name for EACH service. The pipeline applies
 * these as overrides on soul.offerings before schemaFromSoul runs, so
 * the rendered service cards show description + distinct icon per
 * service instead of the operator's bare service-name string.
 *
 * Optional — when absent, falls back to the keyword-based icon
 * classifier (iconForTitle) and renders cards without descriptions.
 */
export interface PersonalityServiceEnrichment {
  /** Operator's service name verbatim (case-sensitive match against
   *  input.services). */
  service_name: string;
  /** 1-2 sentence customer-facing description. Used as the body
   *  copy on the service card. */
  description: string;
  /** Lucide icon name (snake_case — see lucide-icons.ts IconName).
   *  When absent, falls back to iconForTitle keyword matching. */
  icon?: string;
}

export interface CRMPersonality {
  vertical: PersonalityVertical;
  terminology: PersonalityTerminology;
  pipeline: PersonalityPipeline;
  contactFields: PersonalityContactFields;
  intakeFields: PersonalityIntakeField[];
  /** v1.1.9 — optional intake-form metadata. */
  intake?: PersonalityIntakeMeta;
  /** v1.3.2 — optional renderer theme hint. Defaults to light for
   *  most verticals; medspa + agency override to dark. */
  theme?: PersonalityTheme;
  /** v1.3.3 — per-service enrichment (descriptions + icons) generated
   *  by the LLM. Optional; when absent the renderer falls back to
   *  bare service names + iconForTitle keyword classifier. */
  services_enrichment?: PersonalityServiceEnrichment[];
  /** v1.3.4 — booking-event metadata (LLM-generated). When set,
   *  overrides personalityBookingDefaults + JSON-template defaults
   *  in createAnonymousWorkspace. */
  booking?: PersonalityBooking;
  /** v1.3.4 — Unsplash search queries (LLM-generated). When set,
   *  the pipeline fetches a real per-niche image instead of falling
   *  back to GENERAL_IMAGES's curated contractor photos. */
  images?: PersonalityImages;
  dashboard: PersonalityDashboard;
  /** May 2, 2026 — landing-page content templates. Optional for
   *  backward compat; personalities without templates fall back to
   *  the BusinessType-keyed content pack defaults. */
  content_templates?: PersonalityContentTemplates;
}

// ─── Pipeline color palette ────────────────────────────────────────────────
// Reused across personalities so the kanban looks coherent regardless of
// which vertical the operator picked. Colors mirror the existing default
// pipeline (DEFAULT_PIPELINE_STAGES in lib/deals/pipeline-defaults.ts).

const STAGE_COLORS = {
  start: "#0284c7",     // blue   — new lead / inquiry
  qualifying: "#9333ea", // purple — qualifying / discovery
  proposal: "#d97706",   // amber  — proposal / estimate
  active: "#ea580c",     // orange — in progress / active
  delivered: "#16a34a",  // green  — completed / won
  lost: "#71717a",       // gray   — lost / did not retain
  recall: "#0ea5e9",     // cyan   — recall / renewal
} as const;

// ─── GENERAL ───────────────────────────────────────────────────────────────
// v1.2.0 — true generic personality. The DEFAULT_PERSONALITY for any
// workspace whose business doesn't keyword-match a specialized
// vertical. Previously this was COACHING, which gave roofing /
// landscaping / random trade workspaces a coaching pipeline ("Applied
// → Discovery Booked → Enrolled") and coaching-flavored CTAs ("Book
// a free discovery call"). GENERAL is voiced for any small-business
// service operator: trade contractors, retailers, neighborhood
// professionals, niche service providers.

const GENERAL_PERSONALITY: CRMPersonality = {
  vertical: "general",
  terminology: {
    contact: { singular: "Customer", plural: "Customers" },
    deal: { singular: "Job", plural: "Jobs" },
    activity: { singular: "Activity", plural: "Activities" },
  },
  pipeline: {
    name: "Sales pipeline",
    stages: [
      { name: "New Lead", color: STAGE_COLORS.start, probability: 10 },
      { name: "Quoted", color: STAGE_COLORS.qualifying, probability: 25 },
      { name: "Approved", color: STAGE_COLORS.proposal, probability: 60 },
      { name: "Scheduled", color: "#0ea5e9", probability: 80 },
      { name: "In Progress", color: STAGE_COLORS.active, probability: 90 },
      { name: "Completed", color: STAGE_COLORS.delivered, probability: 100 },
      { name: "Lost", color: STAGE_COLORS.lost, probability: 0 },
    ],
  },
  contactFields: {
    industrySpecific: [
      { key: "address", label: "Address", type: "text" },
      { key: "referral_source", label: "Referral Source", type: "text" },
      { key: "preferred_contact", label: "Preferred Contact", type: "select", options: ["Email", "Phone", "Text"] },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
  },
  intakeFields: [
    { key: "fullName", label: "Full name", type: "text", required: true },
    { key: "email", label: "Email", type: "email", required: true },
    { key: "phone", label: "Phone", type: "tel", required: true },
    { key: "address", label: "Address", type: "text", required: false },
    { key: "details", label: "Tell us what you need", type: "textarea", required: true },
  ],
  intake: {
    title: "Get in Touch",
    description: "Tell us a little about what you need and we'll get back to you with a quote.",
  },
  theme: { mode: "light" },
  dashboard: {
    primaryMetrics: [
      { key: "open_jobs", label: "Open Jobs", icon: "Briefcase", tone: "primary" },
      { key: "revenue_this_month", label: "Revenue This Month", icon: "DollarSign", tone: "positive" },
      { key: "avg_job_value", label: "Avg Job Value", icon: "TrendingUp", tone: "neutral" },
      { key: "win_rate", label: "Quote → Won", icon: "Target", tone: "caution" },
    ],
    urgencyIndicators: [
      { key: "unanswered_24h", label: "Unanswered > 24h", severity: "danger" },
      { key: "quote_stale_7d", label: "Stale quotes > 7d", severity: "warning" },
      { key: "completed_no_review", label: "Completed jobs without review", severity: "info" },
    ],
  },
  content_templates: {
    hero_headlines: [
      "Trusted Local Service[ — {rating}★ from {review_count}+ Customers]",
      "[{city}'s ]Trusted {business_name} — Free Quotes",
      "Quality Work, Honest Pricing.[ {review_count}+ Happy Customers.]",
    ],
    hero_subheadline:
      "Free estimates · Licensed and insured · Local team that shows up on time.[ Serving {service_area}.]",
    trust_badges: [
      "[{rating}★ from {review_count}+ customers]",
      "Licensed & insured",
      "Free quotes",
      "Local team",
    ],
    services_heading: "Our Services",
    faqs: [
      {
        question: "How does the free quote work?",
        answer_template:
          "Tell us about your project and we'll come out (or send pricing remotely if it's simple) within 24-48 hours. No commitment, no pressure.",
      },
      {
        question: "Are you licensed and insured?",
        answer_template:
          "Yes. We're fully licensed and carry liability insurance for every job we take on.[ {certifications_sentence}]",
      },
      {
        question: "What areas do you serve?",
        answer_template:
          "[We serve {service_area}. ]Call[ {phone}] if you're not sure whether you're in our service area.",
      },
      {
        question: "How do you handle pricing?",
        answer_template:
          "Upfront, written quotes before any work starts. No surprise charges. We'll walk you through every line before you sign.",
      },
      {
        question: "How do I get started?",
        answer_template:
          "Book a free quote above[ or call us at {phone}]. We'll take it from there.",
      },
    ],
    cta_button_primary: "Book a free quote →",
    cta_button_secondary: "Get in touch →",
    bottom_cta_heading: "Ready to get started?",
    bottom_cta_trust_points: [
      "Free quote",
      "No obligation",
      "Local team",
    ],
  },
};

// ─── HVAC ──────────────────────────────────────────────────────────────────

const HVAC_PERSONALITY: CRMPersonality = {
  vertical: "hvac",
  terminology: {
    contact: { singular: "Customer", plural: "Customers" },
    deal: { singular: "Job", plural: "Jobs" },
    activity: { singular: "Service Call", plural: "Service Calls" },
  },
  pipeline: {
    name: "HVAC pipeline",
    stages: [
      { name: "New Lead", color: STAGE_COLORS.start, probability: 10 },
      { name: "Estimate Scheduled", color: STAGE_COLORS.qualifying, probability: 25 },
      { name: "Estimate Given", color: STAGE_COLORS.proposal, probability: 50 },
      { name: "Approved", color: "#22c55e", probability: 75 },
      { name: "Scheduled", color: "#0ea5e9", probability: 85 },
      { name: "In Progress", color: STAGE_COLORS.active, probability: 90 },
      { name: "Completed", color: STAGE_COLORS.delivered, probability: 100 },
      { name: "Lost", color: STAGE_COLORS.lost, probability: 0 },
    ],
  },
  contactFields: {
    industrySpecific: [
      { key: "property_type", label: "Property Type", type: "select", options: ["Residential", "Commercial", "Multi-family"] },
      { key: "system_type", label: "System Type", type: "select", options: ["Central AC", "Heat Pump", "Furnace", "Mini-split", "Boiler"] },
      { key: "system_age", label: "System Age (years)", type: "number" },
      { key: "maintenance_plan", label: "On Maintenance Plan", type: "checkbox" },
      { key: "last_service_date", label: "Last Service Date", type: "date" },
      { key: "referral_source", label: "Referral Source", type: "text" },
    ],
  },
  intakeFields: [
    { key: "fullName", label: "Full name", type: "text", required: true },
    { key: "email", label: "Email", type: "email", required: true },
    { key: "phone", label: "Phone", type: "tel", required: true },
    { key: "address", label: "Service address", type: "text", required: true },
    { key: "property_type", label: "Property type", type: "select", required: true, options: ["Residential", "Commercial", "Multi-family"] },
    { key: "system_type", label: "System type", type: "select", required: false, options: ["Central AC", "Heat Pump", "Furnace", "Mini-split", "Boiler", "Not sure"] },
    { key: "issue", label: "What's going on?", type: "textarea", required: true },
  ],
  intake: {
    title: "Request Service",
    description: "Tell us what's going on and we'll get back to you with a quote.",
  },
  theme: { mode: "light" },
  dashboard: {
    primaryMetrics: [
      { key: "open_jobs", label: "Open Jobs", icon: "Wrench", tone: "primary" },
      { key: "revenue_this_month", label: "Revenue This Month", icon: "DollarSign", tone: "positive" },
      { key: "avg_job_value", label: "Avg Job Value", icon: "TrendingUp", tone: "neutral" },
      { key: "maintenance_plans", label: "Maintenance Plans", icon: "Shield", tone: "caution" },
    ],
    urgencyIndicators: [
      { key: "unanswered_24h", label: "Unanswered > 24h", severity: "danger" },
      { key: "estimate_stale_48h", label: "Stale estimates > 48h", severity: "warning" },
      { key: "completed_no_review", label: "Completed jobs without review", severity: "info" },
    ],
  },
  content_templates: {
    hero_headlines: [
      "Same-Day Service[ in {city}].[ {rating}★ from {review_count}+ Local Customers.]",
      "[{city}'s ]Trusted HVAC Pros — Same-Day Service, Honest Pricing.",
      "[{rating}★ on Google.][ {review_count}+ Jobs.] Licensed & Insured.",
    ],
    hero_subheadline:
      "Licensed & insured · Free estimates · We show up when we say we will.[ Serving {service_area}.]",
    trust_badges: [
      "[{rating}★ on Google]",
      "Licensed & insured",
      "Same-day service",
      "Free estimates",
    ],
    services_heading: "Everything we fix — fast",
    faqs: [
      {
        question: "How quickly can you come out?",
        answer_template:
          "We offer same-day service for most jobs[ in {city} and surrounding areas], and can usually be on-site within 24 hours.",
      },
      {
        question: "Do you charge for estimates?",
        answer_template:
          "Free estimates on most jobs. We'll give you a clear, upfront price before any work starts — no hidden fees.",
      },
      {
        question: "Are you licensed and insured?",
        answer_template:
          "Yes. We're fully licensed, bonded, and insured.[ {certifications_sentence}]",
      },
      {
        question: "What areas do you serve?",
        answer_template:
          "[We serve {service_area}. ]Call[ {phone}] if you're not sure whether you're in our service area.",
      },
      {
        question: "What payment methods do you accept?",
        answer_template:
          "Cash, credit card, debit card, and digital wallets. Financing available on larger jobs.",
      },
    ],
    cta_button_primary: "Get a free quote →",
    cta_button_secondary: "Schedule service →",
    bottom_cta_heading: "Get a free quote in 60 seconds",
    bottom_cta_trust_points: [
      "No obligation",
      "Same-day callbacks",
      "Licensed & insured",
    ],
  },
};

// ─── LEGAL ─────────────────────────────────────────────────────────────────

const LEGAL_PERSONALITY: CRMPersonality = {
  vertical: "legal",
  terminology: {
    contact: { singular: "Client", plural: "Clients" },
    deal: { singular: "Case", plural: "Cases" },
    activity: { singular: "Consultation", plural: "Consultations" },
  },
  pipeline: {
    name: "Case pipeline",
    stages: [
      { name: "Inquiry", color: STAGE_COLORS.start, probability: 10 },
      { name: "Consultation Scheduled", color: STAGE_COLORS.qualifying, probability: 25 },
      { name: "Consultation Done", color: "#7c3aed", probability: 40 },
      { name: "Conflict Check", color: "#f59e0b", probability: 55 },
      { name: "Engagement Sent", color: STAGE_COLORS.proposal, probability: 70 },
      { name: "Retained", color: STAGE_COLORS.active, probability: 90 },
      { name: "Case Closed", color: STAGE_COLORS.delivered, probability: 100 },
      { name: "Did Not Retain", color: STAGE_COLORS.lost, probability: 0 },
    ],
  },
  contactFields: {
    industrySpecific: [
      { key: "practice_area", label: "Practice Area", type: "select", options: ["Family", "Criminal", "Estate", "Corporate", "Personal Injury", "Real Estate", "Immigration", "Other"] },
      { key: "case_type", label: "Case Type", type: "text" },
      { key: "conflict_cleared", label: "Conflict Check Cleared", type: "checkbox" },
      { key: "statute_of_limitations", label: "Statute of Limitations", type: "date" },
      { key: "opposing_party", label: "Opposing Party", type: "text" },
      { key: "retainer_amount", label: "Retainer Amount ($)", type: "number" },
    ],
  },
  intakeFields: [
    { key: "fullName", label: "Full name", type: "text", required: true },
    { key: "email", label: "Email", type: "email", required: true },
    { key: "phone", label: "Phone", type: "tel", required: true },
    { key: "practice_area", label: "Practice area", type: "select", required: true, options: ["Family", "Criminal", "Estate", "Corporate", "Personal Injury", "Real Estate", "Immigration", "Other"] },
    { key: "opposing_party", label: "Opposing party (for conflict check)", type: "text", required: false },
    { key: "summary", label: "Brief summary of your situation", type: "textarea", required: true },
  ],
  intake: {
    title: "Request a Free Consultation",
    description: "Confidential, no commitment. We'll listen first and only recommend retaining us if we genuinely think we can help.",
  },
  theme: { mode: "light" },
  dashboard: {
    primaryMetrics: [
      { key: "active_cases", label: "Active Cases", icon: "Briefcase", tone: "primary" },
      { key: "retainer_revenue", label: "Retainer Revenue", icon: "DollarSign", tone: "positive" },
      { key: "consultations_this_week", label: "Consultations This Week", icon: "Calendar", tone: "neutral" },
      { key: "conversion_rate", label: "Inquiry → Retained", icon: "TrendingUp", tone: "caution" },
    ],
    urgencyIndicators: [
      { key: "conflict_check_pending", label: "Conflict checks pending", severity: "danger" },
      { key: "statute_within_30d", label: "Statute within 30 days", severity: "danger" },
      { key: "engagement_not_signed_7d", label: "Engagement letters > 7d unsigned", severity: "warning" },
    ],
  },
  content_templates: {
    hero_headlines: [
      "Trusted Counsel[ in {city}].[ {rating}★ from {review_count}+ Clients.]",
      "[{city} ]Attorneys — Free Consultation, Confidential Advice.",
      "Real Outcomes.[ {review_count}+ Cases.][ {rating}★ Reviewed.]",
    ],
    hero_subheadline:
      "Free initial consultation · Confidential · No commitment until you're ready to retain.",
    trust_badges: [
      "[{rating}★ from {review_count}+ clients]",
      "Free initial consultation",
      "Confidential",
      "No retainer until you decide",
    ],
    services_heading: "Practice Areas",
    faqs: [
      {
        question: "Is the initial consultation really free?",
        answer_template:
          "Yes. The first consultation is free and confidential. We'll listen, give you our honest take, and only recommend retaining us if we genuinely think we can help.",
      },
      {
        question: "How do you charge?",
        answer_template:
          "Most matters are billed hourly with a retainer; some are flat-fee or contingency. We'll quote you clearly during the consultation — no surprises.",
      },
      {
        question: "Will my conversation stay confidential?",
        answer_template:
          "Absolutely. Everything you share — even before you officially retain us — is protected by attorney-client privilege.",
      },
      {
        question: "How long will my case take?",
        answer_template:
          "It depends on the matter. We'll give you an honest timeline at your consultation and keep you updated as things progress.",
      },
      {
        question: "Where are you located?",
        answer_template:
          "[We're based in {city}. ]Reach us[ at {phone}] or book a consultation online.",
      },
    ],
    cta_button_primary: "Book a free consultation →",
    cta_button_secondary: "Tell us about your situation →",
    bottom_cta_heading: "Get clarity on your situation — for free",
    bottom_cta_trust_points: [
      "30-minute consult",
      "Confidential",
      "No commitment",
    ],
  },
};

// ─── DENTAL ────────────────────────────────────────────────────────────────

const DENTAL_PERSONALITY: CRMPersonality = {
  vertical: "dental",
  terminology: {
    contact: { singular: "Patient", plural: "Patients" },
    deal: { singular: "Treatment Plan", plural: "Treatment Plans" },
    activity: { singular: "Appointment", plural: "Appointments" },
  },
  pipeline: {
    name: "Treatment pipeline",
    stages: [
      { name: "Inquiry", color: STAGE_COLORS.start, probability: 10 },
      { name: "Booked", color: STAGE_COLORS.qualifying, probability: 25 },
      { name: "First Visit", color: "#7c3aed", probability: 40 },
      { name: "Treatment Planned", color: STAGE_COLORS.proposal, probability: 55 },
      { name: "Accepted", color: "#22c55e", probability: 75 },
      { name: "In Progress", color: STAGE_COLORS.active, probability: 90 },
      { name: "Completed", color: STAGE_COLORS.delivered, probability: 100 },
      { name: "Recall Due", color: STAGE_COLORS.recall, probability: 50 },
    ],
  },
  contactFields: {
    industrySpecific: [
      { key: "date_of_birth", label: "Date of Birth", type: "date" },
      { key: "insurance_provider", label: "Insurance Provider", type: "text" },
      { key: "insurance_id", label: "Insurance ID", type: "text" },
      { key: "last_visit", label: "Last Visit", type: "date" },
      { key: "next_recall", label: "Next Recall", type: "date" },
      { key: "primary_concern", label: "Primary Concern", type: "text" },
      { key: "medical_alerts", label: "Medical Alerts", type: "textarea" },
    ],
  },
  intakeFields: [
    { key: "fullName", label: "Full name", type: "text", required: true },
    { key: "email", label: "Email", type: "email", required: true },
    { key: "phone", label: "Phone", type: "tel", required: true },
    { key: "date_of_birth", label: "Date of birth", type: "date", required: true },
    { key: "insurance_provider", label: "Insurance provider", type: "text", required: false },
    { key: "primary_concern", label: "What brings you in?", type: "textarea", required: true },
  ],
  intake: {
    title: "Request an Appointment",
    description: "New patients welcome. We'll confirm your appointment and verify your insurance ahead of your visit.",
  },
  theme: { mode: "light" },
  dashboard: {
    primaryMetrics: [
      { key: "active_patients", label: "Active Patients", icon: "Users", tone: "primary" },
      { key: "production_this_month", label: "Production This Month", icon: "DollarSign", tone: "positive" },
      { key: "treatment_acceptance", label: "Treatment Acceptance", icon: "CheckCircle2", tone: "neutral" },
      { key: "recalls_due", label: "Recalls Due", icon: "Calendar", tone: "caution" },
    ],
    urgencyIndicators: [
      { key: "overdue_recalls", label: "Overdue recalls", severity: "warning" },
      { key: "unconfirmed_tomorrow", label: "Unconfirmed for tomorrow", severity: "danger" },
      { key: "treatment_pending_acceptance_14d", label: "Plans pending > 14d", severity: "info" },
    ],
  },
  content_templates: {
    hero_headlines: [
      "Healthy Smiles for the Whole Family[ — {rating}★ from {review_count}+ Patients]",
      "[{city}'s ]Family Dentist — Now Accepting New Patients",
      "Your Smile Deserves the Best.[ {review_count}+ Happy Patients][ in {city}].",
    ],
    hero_subheadline:
      "Now accepting new patients · In-network with most PPO plans · Same-day emergency appointments available.",
    trust_badges: [
      "[{rating}★ on Google ({review_count}+ reviews)]",
      "Accepting new patients",
      "In-network PPO",
      "Same-day emergency",
    ],
    services_heading: "Our Services",
    faqs: [
      {
        question: "Are you accepting new patients?",
        answer_template:
          "Yes! We're currently accepting new patients[ in {city}] and surrounding areas. Book a first visit online[ or call {phone}].",
      },
      {
        question: "Do you take my insurance?",
        answer_template:
          "We're in-network with most major PPO plans. We'll verify your coverage before your first visit so there are no surprises.",
      },
      {
        question: "What if I have a dental emergency?",
        answer_template:
          "[Call us at {phone} — we ]hold same-day emergency slots open for current and new patients.",
      },
      {
        question: "What should I expect at my first visit?",
        answer_template:
          "A comprehensive exam, X-rays if needed, and a chance to talk through any concerns. No pressure — just an honest plan for your smile.",
      },
      {
        question: "Where are you located?",
        answer_template:
          "[We're in {city}. ]Free parking on-site.[ Reach us at {phone} for directions.]",
      },
    ],
    cta_button_primary: "Book your first visit →",
    cta_button_secondary: "Ask us a question →",
    bottom_cta_heading: "Book your first visit today",
    bottom_cta_trust_points: [
      "Accepting new patients",
      "Most insurance accepted",
      "Friendly, modern office",
    ],
  },
};

// ─── COACHING ──────────────────────────────────────────────────────────────

const COACHING_PERSONALITY: CRMPersonality = {
  vertical: "coaching",
  terminology: {
    contact: { singular: "Client", plural: "Clients" },
    deal: { singular: "Engagement", plural: "Engagements" },
    activity: { singular: "Session", plural: "Sessions" },
  },
  pipeline: {
    name: "Coaching pipeline",
    stages: [
      { name: "Applied", color: STAGE_COLORS.start, probability: 10 },
      { name: "Discovery Booked", color: STAGE_COLORS.qualifying, probability: 25 },
      { name: "Discovery Done", color: "#7c3aed", probability: 40 },
      { name: "Proposal Sent", color: STAGE_COLORS.proposal, probability: 60 },
      { name: "Enrolled", color: "#22c55e", probability: 85 },
      { name: "Active", color: STAGE_COLORS.active, probability: 95 },
      { name: "Completed", color: STAGE_COLORS.delivered, probability: 100 },
      { name: "Renewal", color: STAGE_COLORS.recall, probability: 70 },
    ],
  },
  contactFields: {
    industrySpecific: [
      { key: "company", label: "Company", type: "text" },
      { key: "role", label: "Role", type: "text" },
      { key: "goals", label: "Goals", type: "textarea" },
      { key: "engagement_type", label: "Engagement Type", type: "select", options: ["1:1", "Group", "VIP", "Cohort"] },
      { key: "sessions_remaining", label: "Sessions Remaining", type: "number" },
      { key: "next_session", label: "Next Session", type: "date" },
    ],
  },
  intakeFields: [
    { key: "fullName", label: "Full name", type: "text", required: true },
    { key: "email", label: "Email", type: "email", required: true },
    { key: "phone", label: "Phone (optional)", type: "tel", required: false },
    { key: "company", label: "Company / role", type: "text", required: false },
    { key: "goals", label: "What do you want to work on?", type: "textarea", required: true },
  ],
  intake: {
    title: "Apply to Work With Us",
    description: "Tell us about your goals. We'll be in touch within 2 business days to set up a discovery call.",
  },
  theme: { mode: "light" },
  dashboard: {
    primaryMetrics: [
      { key: "active_clients", label: "Active Clients", icon: "Users", tone: "primary" },
      { key: "mrr", label: "Recurring Revenue", icon: "DollarSign", tone: "positive" },
      { key: "sessions_this_week", label: "Sessions This Week", icon: "Calendar", tone: "neutral" },
      { key: "renewal_pipeline", label: "Renewal Pipeline", icon: "TrendingUp", tone: "caution" },
    ],
    urgencyIndicators: [
      { key: "discovery_no_followup_3d", label: "Discovery calls without follow-up > 3d", severity: "warning" },
      { key: "proposals_open_14d", label: "Proposals open > 14d", severity: "warning" },
      { key: "ending_engagements_30d", label: "Engagements ending in 30d (renewal)", severity: "info" },
    ],
  },
  content_templates: {
    hero_headlines: [
      "Real Results in 90 Days[ — {rating}★ from {review_count}+ Clients]",
      "[{city}'s ]Coaching for High-Performers — Free Discovery Call",
      "Get Unstuck. Book a free discovery call.[ {review_count}+ clients ][served].",
    ],
    hero_subheadline:
      "Personalized 1:1 coaching · Certified · No commitment until you're ready to enroll.",
    trust_badges: [
      "[{rating}★ from {review_count}+ clients]",
      "Free discovery call",
      "Certified coach",
      "No long-term lock-in",
    ],
    services_heading: "How I help clients move forward",
    faqs: [
      {
        question: "What's your approach?",
        answer_template:
          "Every engagement starts with a free discovery call so we can understand your goals before recommending anything. Sessions are personalized — no rigid frameworks.",
      },
      {
        question: "How long is a typical engagement?",
        answer_template:
          "Engagements range from a single intensive to multi-month programs. We'll tailor the timeline at your discovery call based on what you actually need.",
      },
      {
        question: "What are your qualifications?",
        answer_template:
          "Certified, with experience working with executives, founders, and operators across multiple industries. Happy to share references on request.",
      },
      {
        question: "How does pricing work?",
        answer_template:
          "Quoted per engagement, not per session. We'll talk numbers on the discovery call once we understand your scope.",
      },
      {
        question: "How do I book?",
        answer_template:
          "Hit the discovery-call button above[ or reach me at {phone}].",
      },
    ],
    cta_button_primary: "Book a free discovery call →",
    cta_button_secondary: "Tell us about your goals →",
    bottom_cta_heading: "Book your free discovery call",
    bottom_cta_trust_points: [
      "30-minute call",
      "No commitment",
      "Honest assessment",
    ],
  },
};

// ─── AGENCY ────────────────────────────────────────────────────────────────

const AGENCY_PERSONALITY: CRMPersonality = {
  vertical: "agency",
  terminology: {
    contact: { singular: "Client", plural: "Clients" },
    deal: { singular: "Project", plural: "Projects" },
    activity: { singular: "Strategy Call", plural: "Strategy Calls" },
  },
  pipeline: {
    name: "Project pipeline",
    stages: [
      { name: "Inquiry", color: STAGE_COLORS.start, probability: 10 },
      { name: "Discovery Call", color: STAGE_COLORS.qualifying, probability: 25 },
      { name: "Proposal Sent", color: STAGE_COLORS.proposal, probability: 50 },
      { name: "Negotiation", color: "#f59e0b", probability: 70 },
      { name: "Signed", color: "#22c55e", probability: 90 },
      { name: "In Progress", color: STAGE_COLORS.active, probability: 95 },
      { name: "Delivered", color: STAGE_COLORS.delivered, probability: 100 },
      { name: "Retainer", color: STAGE_COLORS.recall, probability: 100 },
    ],
  },
  contactFields: {
    industrySpecific: [
      { key: "company", label: "Company", type: "text" },
      { key: "website", label: "Website", type: "text" },
      { key: "industry", label: "Industry", type: "text" },
      { key: "project_type", label: "Project Type", type: "select", options: ["Branding", "Website", "Campaign", "Retainer", "Strategy", "Other"] },
      { key: "budget_range", label: "Budget Range", type: "select", options: ["< $10k", "$10k–$25k", "$25k–$50k", "$50k–$100k", "$100k+"] },
      { key: "decision_maker", label: "Decision Maker", type: "text" },
    ],
  },
  intakeFields: [
    { key: "fullName", label: "Full name", type: "text", required: true },
    { key: "email", label: "Work email", type: "email", required: true },
    { key: "company", label: "Company", type: "text", required: true },
    { key: "website", label: "Website", type: "text", required: false },
    { key: "project_type", label: "Project type", type: "select", required: true, options: ["Branding", "Website", "Campaign", "Retainer", "Strategy", "Other"] },
    { key: "budget_range", label: "Budget range", type: "select", required: true, options: ["< $10k", "$10k–$25k", "$25k–$50k", "$50k–$100k", "$100k+"] },
    { key: "brief", label: "Project brief", type: "textarea", required: true },
  ],
  intake: {
    title: "Tell Us About Your Project",
    description: "Share the brief, budget, and timeline. We'll come back with a proposal tailored to your goals.",
  },
  theme: { mode: "dark" },
  dashboard: {
    primaryMetrics: [
      { key: "active_projects", label: "Active Projects", icon: "Briefcase", tone: "primary" },
      { key: "pipeline_value", label: "Pipeline Value", icon: "DollarSign", tone: "positive" },
      { key: "retainer_mrr", label: "Retainer MRR", icon: "TrendingUp", tone: "neutral" },
      { key: "win_rate", label: "Win Rate", icon: "Target", tone: "caution" },
    ],
    urgencyIndicators: [
      { key: "proposals_open_10d", label: "Proposals open > 10d", severity: "warning" },
      { key: "projects_overdue", label: "Projects overdue", severity: "danger" },
      { key: "retainers_renewal_30d", label: "Retainers up for renewal in 30d", severity: "info" },
    ],
  },
  content_templates: {
    hero_headlines: [
      "Brands That Convert[ — {rating}★ from {review_count}+ Clients]",
      "[{city}'s ]Creative Studio — Brand, Web, Campaigns",
      "Strategy Meets Craft.[ {review_count}+ Projects Shipped.]",
    ],
    hero_subheadline:
      "Brand-led, performance-minded · Senior team, no juniors · Project + retainer engagements.",
    trust_badges: [
      "[{rating}★ from {review_count}+ clients]",
      "Senior team",
      "Strategy + craft",
      "Performance-minded",
    ],
    services_heading: "Selected work",
    faqs: [
      {
        question: "How do you scope a project?",
        answer_template:
          "Every engagement starts with a free strategy call. We share rough effort + budget bands at the call, then send a tailored proposal within 48 hours.",
      },
      {
        question: "What's your typical engagement size?",
        answer_template:
          "Sprints from $10k–$25k, full brand or website builds from $25k–$75k, retainers from $5k/mo. We'll quote you specifically based on scope.",
      },
      {
        question: "Who works on my project?",
        answer_template:
          "Senior team only — no juniors. The strategist + designer who pitched stay on through delivery.",
      },
      {
        question: "How long does a project take?",
        answer_template:
          "Brand sprints: 2–4 weeks. Websites: 4–8 weeks. Campaigns: depends on scope. We'll set timeline at scoping.",
      },
      {
        question: "Do you take on retainers?",
        answer_template:
          "Yes, after a successful project together. Retainers cover ongoing creative + strategy at a discounted rate vs project work.",
      },
    ],
    cta_button_primary: "Book a strategy call →",
    cta_button_secondary: "Tell us about your project →",
    bottom_cta_heading: "Let's build something worth talking about",
    bottom_cta_trust_points: [
      "Senior team",
      "Strategy + craft",
      "Free first call",
    ],
  },
};

// ─── MEDSPA ────────────────────────────────────────────────────────────────
// v1.1.7 — added after the Elevated Med Spa demo classified as "saas"
// (because "platform" was in the saas keyword bank) and fell back to
// coaching personality (Applied → Discovery Booked → Enrolled). Med
// spa is a distinct vertical with its own pipeline (Inquiry →
// Consultation → Treatment Plan → Accepted → Scheduled → Completed →
// Follow-up), terminology (Client / Treatment), and branding (luxury
// dark + gold).

const MEDSPA_PERSONALITY: CRMPersonality = {
  vertical: "medspa",
  terminology: {
    contact: { singular: "Client", plural: "Clients" },
    deal: { singular: "Treatment", plural: "Treatments" },
    activity: { singular: "Appointment", plural: "Appointments" },
  },
  pipeline: {
    name: "Treatment Pipeline",
    stages: [
      { name: "Inquiry", color: STAGE_COLORS.start, probability: 10 },
      { name: "Consultation Booked", color: STAGE_COLORS.qualifying, probability: 25 },
      { name: "Consultation Done", color: "#7c3aed", probability: 40 },
      { name: "Treatment Plan Sent", color: STAGE_COLORS.proposal, probability: 55 },
      { name: "Accepted", color: "#22c55e", probability: 75 },
      { name: "Treatment Scheduled", color: "#0ea5e9", probability: 85 },
      { name: "Completed", color: STAGE_COLORS.delivered, probability: 100 },
      { name: "Follow-up", color: STAGE_COLORS.recall, probability: 60 },
    ],
  },
  contactFields: {
    industrySpecific: [
      { key: "date_of_birth", label: "Date of Birth", type: "date" },
      { key: "skin_type", label: "Skin Type", type: "select", options: ["I — Always burns", "II — Usually burns", "III — Sometimes burns", "IV — Rarely burns", "V — Very rarely burns", "VI — Never burns"] },
      { key: "medical_alerts", label: "Medical Alerts / Allergies", type: "textarea" },
      { key: "current_medications", label: "Current Medications", type: "textarea" },
      { key: "areas_of_interest", label: "Areas of Interest", type: "text" },
      { key: "last_treatment_date", label: "Last Treatment", type: "date" },
      { key: "next_followup", label: "Next Follow-up", type: "date" },
      { key: "membership_status", label: "Membership", type: "select", options: ["None", "Glow", "Elevate", "VIP"] },
    ],
  },
  intakeFields: [
    { key: "fullName", label: "Full name", type: "text", required: true },
    { key: "email", label: "Email", type: "email", required: true },
    { key: "phone", label: "Phone", type: "tel", required: true },
    { key: "date_of_birth", label: "Date of birth", type: "date", required: true },
    { key: "areas_of_interest", label: "What treatments are you interested in?", type: "textarea", required: true },
    { key: "medical_alerts", label: "Any allergies or medical conditions we should know about?", type: "textarea", required: false },
  ],
  intake: {
    title: "Request a Treatment Consultation",
    description: "Complimentary, no commitment. We'll assess your goals and walk you through a personalized treatment plan.",
  },
  theme: { mode: "dark" },
  dashboard: {
    primaryMetrics: [
      { key: "active_clients", label: "Active Clients", icon: "Users", tone: "primary" },
      { key: "revenue_this_month", label: "Revenue This Month", icon: "DollarSign", tone: "positive" },
      { key: "treatment_acceptance", label: "Treatment Acceptance", icon: "CheckCircle2", tone: "neutral" },
      { key: "memberships", label: "Active Memberships", icon: "Star", tone: "caution" },
    ],
    urgencyIndicators: [
      { key: "consults_no_followup_3d", label: "Consults without follow-up > 3d", severity: "warning" },
      { key: "plans_pending_acceptance_14d", label: "Treatment plans pending > 14d", severity: "info" },
      { key: "missed_followups", label: "Missed follow-ups", severity: "danger" },
    ],
  },
  content_templates: {
    hero_headlines: [
      "Look and Feel Your Best[ — {rating}★ from {review_count}+ Clients]",
      "[{city}'s ]Aesthetics & Wellness Studio — Complimentary Consultation",
      "Elevate Your Beauty Routine.[ {review_count}+ Happy Clients][ in {city}].",
    ],
    hero_subheadline:
      "Medical-grade aesthetics · Board-certified providers · Personalized treatment plans.[ Now booking complimentary consultations.]",
    trust_badges: [
      "[{rating}★ on Google ({review_count}+ reviews)]",
      "Medical director on-site",
      "FDA-approved treatments",
      "Complimentary consultations",
    ],
    services_heading: "Our Treatments",
    faqs: [
      {
        question: "How does the consultation work?",
        answer_template:
          "Your complimentary consultation is a 30-minute in-person visit. We'll discuss your goals, assess your skin, and walk you through a personalized treatment plan — no pressure to book anything that day.",
      },
      {
        question: "Are your providers licensed?",
        answer_template:
          "Yes. All treatments are performed or supervised by our board-certified medical director and licensed practitioners.",
      },
      {
        question: "How long do results last?",
        answer_template:
          "It depends on the treatment. We'll set realistic expectations during your consultation and recommend a maintenance cadence so your results stay consistent.",
      },
      {
        question: "Do you offer membership pricing?",
        answer_template:
          "Yes — our members get monthly treatment credits, exclusive pricing, and priority booking.[ Visit us in {city}] or ask about our Glow / Elevate / VIP tiers at your consultation.",
      },
      {
        question: "Where are you located?",
        answer_template:
          "[We're in {city}. ]On-site parking and easy access from the main avenues.[ Reach us at {phone}.]",
      },
    ],
    cta_button_primary: "Book your consultation →",
    cta_button_secondary: "Ask us a question →",
    bottom_cta_heading: "Ready to elevate your beauty routine?",
    bottom_cta_trust_points: [
      "Complimentary consultation",
      "Board-certified providers",
      "Personalized treatment plan",
    ],
  },
};

// ─── Registry + selection ──────────────────────────────────────────────────

export const PERSONALITIES = {
  general: GENERAL_PERSONALITY,
  hvac: HVAC_PERSONALITY,
  legal: LEGAL_PERSONALITY,
  dental: DENTAL_PERSONALITY,
  coaching: COACHING_PERSONALITY,
  agency: AGENCY_PERSONALITY,
  medspa: MEDSPA_PERSONALITY,
} as const satisfies Record<PersonalityVertical, CRMPersonality>;

// v1.2.0 — DEFAULT_PERSONALITY changed from COACHING → GENERAL.
// Before: any business that didn't keyword-match got coaching's
// "Applied → Discovery Booked → Enrolled" pipeline + "Book a free
// discovery call" CTAs (wrong for trades / retailers / random
// services). Now: GENERAL is industry-neutral — Customer/Job/Activity
// terminology, "New Lead → Quoted → Approved → Scheduled → In
// Progress → Completed" pipeline, "Book a free quote" CTAs.
export const DEFAULT_PERSONALITY: CRMPersonality = GENERAL_PERSONALITY;

// Industry-keyword → vertical. Keywords are normalized (lowercased, hyphens
// preserved) and matched as substring containment against the input. Order
// matters when a keyword could match more than one bucket — first hit wins.
const INDUSTRY_KEYWORDS: Array<{ vertical: PersonalityVertical; keywords: string[] }> = [
  {
    vertical: "hvac",
    keywords: [
      // HVAC / heating / cooling — broadened May 2, 2026
      "hvac", "heating", "cooling", "air conditioning", "air conditioner",
      "ac repair", "ac install", "furnace", "boiler", "heat pump",
      "mini-split", "mini split", "duct cleaning", "indoor air quality",
      // Plumbing / electrical
      "plumb", "plumber", "plumbing", "electrician", "electrical",
      // Construction / contracting
      "contractor", "roofing", "roofer", "landscaping", "lawn care",
      "cleaning service", "house cleaning", "carpet cleaning",
      "pest control", "junk removal", "moving company", "pool service",
      "garage door", "auto repair", "appliance repair", "tree service",
      "snow removal", "handyman", "locksmith",
    ],
  },
  {
    vertical: "legal",
    keywords: ["legal", "lawyer", "attorney", "law firm", "law office", "law practice", "paralegal"],
  },
  {
    vertical: "dental",
    keywords: ["dental", "dentist", "dentistry", "orthodont", "oral health", "hygienist", "endodont", "periodont"],
  },
  {
    // v1.1.7 — added so med spa / aesthetics workspaces don't fall
    // through to the BUSINESS_TYPE_FALLBACK ("professional_service" →
    // "coaching") chain. Specific industry markers first; broader
    // wellness / aesthetics terms last so a chiropractor or massage
    // therapist doesn't accidentally pick up med-spa pipeline stages.
    vertical: "medspa",
    keywords: [
      "med spa", "medspa", "med-spa", "medical spa", "medical aesthetics",
      "aesthetic clinic", "aesthetic medicine", "aesthetics studio",
      "botox", "dysport", "filler", "dermal filler", "lip filler",
      "microneedling", "chemical peel", "hydrafacial", "facial treatment",
      "laser hair", "laser hair removal", "laser treatment",
      "body contouring", "coolsculpting", "emsculpt", "sculpting",
      "iv therapy", "iv drip", "iv hydration",
      "wellness clinic", "wellness studio", "wellness lounge",
      "cosmetic injector", "cosmetic injection", "cosmetic dermatology",
      "skin clinic", "skin studio", "skincare clinic",
      "rejuvenation", "anti-aging", "anti aging",
    ],
  },
  {
    vertical: "agency",
    keywords: ["agency", "studio", "marketing firm", "design firm", "branding firm", "creative collective", "production house"],
  },
  {
    vertical: "coaching",
    keywords: ["coach", "coaching", "mentor", "consult", "consultant", "consultancy", "advisory", "advisor", "therapy", "therapist", "counsel"],
  },
];

// Business-type fallback (the high-level classification in lib/page-schema/
// classify-business.ts). Less precise than industry — we only fall back
// here when the operator didn't supply an industry hint.
//
// v1.2.0 — professional_service no longer falls through to coaching
// (which was wrong for any non-coaching service business — accountants,
// consultants, real estate agents, financial planners, etc. all got
// "Discovery call" CTAs). Falls through to GENERAL instead — neutral
// "Customer / Job / Quote" terminology that works for any service.
// Same with local_service that doesn't match a specific HVAC keyword
// (e.g. roofing, landscaping, painting) — they used to inherit HVAC
// pipeline stages; now they get GENERAL's neutral "New Lead → Quoted
// → Approved → Scheduled → Completed".
const BUSINESS_TYPE_FALLBACK: Record<string, PersonalityVertical> = {
  local_service: "general",
  professional_service: "general",
  agency: "agency",
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[.,;:!?()\[\]{}<>"'`/\\|]/g, " ")
    .replace(/[_]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function matchIndustry(industry: string): PersonalityVertical | null {
  const haystack = normalize(industry);
  if (!haystack) return null;

  for (const rule of INDUSTRY_KEYWORDS) {
    if (rule.keywords.some((keyword) => haystack.includes(keyword))) {
      return rule.vertical;
    }
  }
  return null;
}

/**
 * Pick a personality from a (businessType, industry) pair. Industry hints
 * win when present — they're the more specific signal. Falls back through
 * the high-level businessType buckets, then defaults to coaching (the
 * safest neutral choice for "other" / unknown).
 */
export function selectCRMPersonality(
  businessType: string | null | undefined,
  industry?: string | null | undefined
): CRMPersonality {
  if (industry && industry.trim()) {
    const fromIndustry = matchIndustry(industry);
    if (fromIndustry) return PERSONALITIES[fromIndustry];
  }

  if (businessType && businessType.trim()) {
    const fromIndustry = matchIndustry(businessType);
    if (fromIndustry) return PERSONALITIES[fromIndustry];

    const mapped = BUSINESS_TYPE_FALLBACK[businessType];
    if (mapped) return PERSONALITIES[mapped];
  }

  return DEFAULT_PERSONALITY;
}

/**
 * Coerce a plausibly-personality-shaped value (e.g. straight from
 * `org.settings.crmPersonality`) into a CRMPersonality. Returns the
 * default when the value is missing or doesn't have the required fields.
 *
 * We're deliberately lenient — `settings` is a free jsonb column that
 * might contain stale shapes from earlier iterations. Reading code can
 * always trust the return value to be a valid personality without
 * having to pepper `??` everywhere.
 */
export function readPersonalityFromSettings(
  value: unknown
): CRMPersonality {
  if (!value || typeof value !== "object") return DEFAULT_PERSONALITY;
  const v = value as Partial<CRMPersonality>;
  if (
    !v.vertical ||
    !v.terminology?.contact?.singular ||
    !v.pipeline?.stages?.length ||
    !Array.isArray(v.intakeFields) ||
    !v.contactFields ||
    !v.dashboard
  ) {
    return DEFAULT_PERSONALITY;
  }
  // May 2, 2026 — settings.crmPersonality predates content_templates.
  // Stale rows missing the field still validate as a valid personality;
  // we backfill from the fresh registry entry so renders pick up the
  // industry-appropriate copy without a one-off migration.
  const stored = value as CRMPersonality;
  if (!stored.content_templates) {
    const fresh = PERSONALITIES[stored.vertical];
    if (fresh?.content_templates) {
      return { ...stored, content_templates: fresh.content_templates };
    }
  }
  return stored;
}

// ─── Template substitution ─────────────────────────────────────────────────
// May 2, 2026 — substitute {city}/{rating}/{review_count}/{phone}/...
// placeholders in personality.content_templates against workspace input.
//
// Substitution philosophy:
//   - Missing values → strip the placeholder (and any surrounding " · "
//     fragment so we don't ship "{review_count}+ patients" or " ·  · ")
//     rather than substituting "[unknown]" garbage.
//   - {certifications_sentence} expands to "We hold X, Y, and Z." or ""
//     when no certifications were provided.
//   - Pure-string-replace, no template engine, deterministic.

export interface PersonalityTemplateVars {
  city?: string | null;
  state?: string | null;
  phone?: string | null;
  rating?: number | null;
  review_count?: number | null;
  services_list?: string | null;
  service_area?: string | null;
  certifications?: string[] | null;
  business_name?: string | null;
}

function joinList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

/**
 * Substitute `{placeholder}` tokens in a single template string.
 *
 * Design:
 *   1. **Bracketed optional segments** — `[ ... {placeholder} ... ]`
 *      means "render this whole fragment iff every placeholder inside
 *      resolves to a non-empty value." If any inner placeholder is
 *      missing, the entire bracketed segment (and any adjacent
 *      separator like " · " or " — ") is dropped. This is the
 *      canonical way to mark proof-dependent copy ("[{rating}★ from
 *      {review_count}+ Patients]") so it disappears cleanly when the
 *      operator didn't supply review data — instead of shipping
 *      mangled "★ from + Patients" output.
 *   2. **Bare placeholders** — `{placeholder}` outside any brackets
 *      gets substituted to its value, or "" when missing. Surrounding
 *      whitespace and double-separator runs are then collapsed.
 *
 * Templates with a missing placeholder OUTSIDE brackets fail loud:
 * they ship empty/garbled copy. Always bracket proof-dependent
 * fragments.
 */
export function substitutePersonalityTemplate(
  template: string,
  vars: PersonalityTemplateVars
): string {
  const certifications = (vars.certifications ?? []).filter(
    (c): c is string => typeof c === "string" && c.trim().length > 0
  );
  const certificationsSentence =
    certifications.length > 0
      ? `We hold ${joinList(certifications)}.`
      : "";

  const replacements: Record<string, string | null> = {
    "{city}": vars.city?.trim() || null,
    "{state}": vars.state?.trim() || null,
    "{phone}": vars.phone?.trim() || null,
    "{rating}":
      typeof vars.rating === "number" && vars.rating > 0
        ? String(vars.rating)
        : null,
    "{review_count}":
      typeof vars.review_count === "number" && vars.review_count > 0
        ? String(vars.review_count)
        : null,
    "{services_list}": vars.services_list?.trim() || null,
    "{service_area}": vars.service_area?.trim() || null,
    "{certifications}":
      certifications.length > 0 ? joinList(certifications) : null,
    "{certifications_sentence}": certificationsSentence || null,
    "{business_name}": vars.business_name?.trim() || null,
  };

  function substituteSegment(segment: string): string | null {
    // Returns null if any placeholder inside has no value (drop the
    // whole segment); otherwise returns the substituted string.
    const placeholderRegex = /\{[a-z_]+\}/g;
    let resolved: string | null = segment;
    let match: RegExpExecArray | null;
    placeholderRegex.lastIndex = 0;
    while ((match = placeholderRegex.exec(segment)) !== null) {
      const token = match[0];
      const value = replacements[token];
      if (value === null || value === undefined || value.length === 0) {
        return null; // drop entire segment
      }
      resolved = (resolved as string).split(token).join(value);
    }
    return resolved;
  }

  // Pass 1: handle [ ... {placeholder} ... ] bracketed optional segments.
  // Walk left-to-right with a regex that captures the bracket contents
  // plus any *immediately adjacent* separator on the LEFT (so dropping
  // the bracket also drops the leading " · ", " — ", " in ", " from ").
  let out = template.replace(
    /([\s,—·-]+(?:in|from)\s+)?(\s*[·,—-]\s*)?\[([^\]]*)\](\s*[·,—-]\s*)?/g,
    (_full, leftConn: string | undefined, leftSep: string | undefined, inner: string, rightSep: string | undefined) => {
      const substituted = substituteSegment(inner);
      if (substituted === null || substituted.trim().length === 0) {
        return ""; // drop segment + adjacent separators
      }
      const left = leftConn ?? leftSep ?? "";
      const right = rightSep ?? "";
      return `${left}${substituted}${right}`;
    }
  );

  // Pass 2: substitute bare (non-bracketed) placeholders. Missing ones
  // become empty — design templates to bracket proof-dependent copy.
  for (const [token, value] of Object.entries(replacements)) {
    if (value && value.length > 0) {
      out = out.split(token).join(value);
    } else {
      out = out.split(token).join("");
    }
  }

  // Final tidy-up: collapse adjacent separators and double whitespace
  // introduced by the strip pass.
  return out
    .replace(/\s*·\s*·\s*/g, " · ")
    .replace(/\s*—\s*—\s*/g, " — ")
    .replace(/,\s*,/g, ",")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+\./g, ".")
    .replace(/\s+,/g, ",")
    .replace(/^[\s.,·—-]+|[\s,·—-]+$/g, "")
    .trim();
}

/**
 * Apply substitution to every string field in a personality's
 * content_templates. Returns null when the personality has no templates
 * (older rows OR personalities we haven't authored copy for yet — those
 * still fall back to the BusinessType content pack defaults).
 */
export interface ResolvedPersonalityContent {
  hero_headline: string;
  hero_subheadline: string;
  trust_badges: string[];
  services_heading: string;
  faqs: Array<{ question: string; answer: string }>;
  cta_button_primary: string;
  cta_button_secondary: string;
  bottom_cta_heading: string;
  bottom_cta_trust_points: string[];
}

export function resolvePersonalityContent(
  personality: CRMPersonality,
  vars: PersonalityTemplateVars
): ResolvedPersonalityContent | null {
  const t = personality.content_templates;
  if (!t) return null;
  const sub = (s: string) => substitutePersonalityTemplate(s, vars);
  return {
    hero_headline: sub(t.hero_headlines[0] ?? ""),
    hero_subheadline: sub(t.hero_subheadline),
    trust_badges: t.trust_badges
      .map(sub)
      .filter((s) => s.length > 0),
    services_heading: sub(t.services_heading),
    faqs: t.faqs
      .map((faq) => ({
        question: sub(faq.question),
        answer: sub(faq.answer_template),
      }))
      .filter((faq) => faq.question.length > 0 && faq.answer.length > 0),
    cta_button_primary: sub(t.cta_button_primary),
    cta_button_secondary: sub(t.cta_button_secondary),
    bottom_cta_heading: sub(t.bottom_cta_heading),
    bottom_cta_trust_points: t.bottom_cta_trust_points
      .map(sub)
      .filter((s) => s.length > 0),
  };
}
