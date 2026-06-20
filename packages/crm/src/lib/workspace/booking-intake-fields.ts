// ============================================================================
// v1.40.1 — Vertical-aware booking intake field registry.
// ============================================================================
//
// Each aesthetic archetype maps to a set of booking-form questions appropriate
// for that archetype's customer flow. When create_full_workspace runs, the
// orchestrator picks an archetype, then populates each appointment-type
// (booking template) with the archetype's default intake fields. Operators
// can edit per-appointment-type from the dashboard later.
//
// WHY THIS LIVES IN ITS OWN FILE: aesthetic-archetypes.ts is about visual
// design (palette / fonts / hero variant). Intake fields are about CRM
// data shape — different concern, different cadence of edits. Keeping
// them parallel lets us evolve each independently.
//
// FIELD TYPES:
//   text     - single-line input (address, company, name)
//   tel      - phone-shaped input
//   textarea - multi-line input (project description, notes)
//   select   - dropdown picker
//   radio    - exclusive choice (urgency, frequency)
//
// PRINCIPLE: every field exists because an OPERATOR with that vertical's
// CRM personality needs that piece of info to ROUTE / DISPATCH / PRICE
// the lead. We don't ask "for fun." Each question removes a follow-up
// phone call.

import type { AestheticArchetypeId } from "./aesthetic-archetypes";
import type { BookingIntakeField } from "@/lib/bookings/actions";

// Universal fields appended after the per-archetype set. Every booking
// surface needs these regardless of vertical, but we list them
// explicitly so the schema is fully declarative.
const UNIVERSAL_TRAILER: BookingIntakeField[] = [
  {
    id: "notes",
    label: "Anything else we should know?",
    type: "textarea",
    required: false,
    placeholder: "Optional — share any additional context.",
  },
];

const URGENCY_OPTIONS = [
  "Today / emergency",
  "This week",
  "Next 2 weeks",
  "I'm planning ahead",
];

const TIMELINE_OPTIONS = [
  "ASAP",
  "1–2 weeks",
  "This month",
  "Just exploring",
];

const BUDGET_OPTIONS = [
  "Under $1k",
  "$1k–$5k",
  "$5k–$15k",
  "$15k–$30k",
  "$30k+",
  "Not sure yet",
];

const B2B_BUDGET_OPTIONS = [
  "Under $10k",
  "$10k–$50k",
  "$50k–$200k",
  "$200k+",
  "TBD",
];

// ─── Per-archetype field sets ───────────────────────────────────────────────

const BOLD_URGENCY_FIELDS: BookingIntakeField[] = [
  {
    id: "address",
    label: "Service address",
    type: "text",
    required: true,
    placeholder: "123 Main St, Round Rock, TX 78664",
    helpText: "Where should we dispatch the technician?",
  },
  {
    id: "phone",
    label: "Best phone number",
    type: "tel",
    required: true,
    placeholder: "(555) 123-4567",
    helpText: "We'll call you back within minutes for emergency requests.",
  },
  {
    id: "issue_type",
    label: "What's happening?",
    type: "select",
    required: true,
    options: [
      "Active emergency / leak / no service",
      "Diagnostic visit",
      "Repair quote",
      "Maintenance / tune-up",
      "New install / replacement",
      "Other",
    ],
  },
  {
    id: "urgency",
    label: "How urgent is this?",
    type: "radio",
    required: true,
    options: URGENCY_OPTIONS,
  },
];

const EDITORIAL_WARM_FIELDS: BookingIntakeField[] = [
  {
    id: "address",
    label: "Project address",
    type: "text",
    required: true,
    placeholder: "Where is the work?",
  },
  {
    id: "phone",
    label: "Best phone number",
    type: "tel",
    required: true,
    placeholder: "(555) 123-4567",
  },
  {
    id: "scope",
    label: "Tell us about the project",
    type: "textarea",
    required: true,
    placeholder:
      "Materials you're considering, condition of the existing structure, any photos you can describe...",
    helpText: "The more detail, the more accurate the estimate.",
  },
  {
    id: "timeline",
    label: "When are you hoping to start?",
    type: "radio",
    required: true,
    options: TIMELINE_OPTIONS,
  },
  {
    id: "budget_range",
    label: "Approximate budget range",
    type: "select",
    required: false,
    options: BUDGET_OPTIONS,
    helpText: "Helps us recommend the right material grade.",
  },
];

const CLINICAL_TRUST_FIELDS: BookingIntakeField[] = [
  {
    id: "phone",
    label: "Best phone number",
    type: "tel",
    required: true,
    placeholder: "(555) 123-4567",
  },
  {
    id: "client_status",
    label: "Are you a new client?",
    type: "radio",
    required: true,
    options: ["New client", "Returning client"],
  },
  {
    id: "concern",
    label: "What's the matter you'd like to discuss?",
    type: "textarea",
    required: true,
    placeholder: "A brief description helps us route to the right specialist.",
    helpText: "Confidential — only the practice sees this.",
  },
  {
    id: "insurance",
    label: "Insurance carrier (optional)",
    type: "text",
    required: false,
    placeholder: "If applicable",
  },
  {
    id: "referral_source",
    label: "How did you hear about us?",
    type: "text",
    required: false,
  },
];

const CINEMATIC_ASPIRATIONAL_FIELDS: BookingIntakeField[] = [
  {
    id: "phone",
    label: "Best phone number",
    type: "tel",
    required: true,
    placeholder: "(555) 123-4567",
  },
  {
    id: "primary_goal",
    label: "What's your primary goal for this visit?",
    type: "textarea",
    required: true,
    placeholder:
      "What you'd like to refine, restore, or address. The more specific, the better the consult.",
  },
  {
    id: "previous_treatments",
    label: "Previous treatments (optional)",
    type: "text",
    required: false,
    placeholder: "Relevant procedures or products in the last 12 months",
  },
  {
    id: "allergies_concerns",
    label: "Allergies or sensitivities",
    type: "text",
    required: false,
    placeholder: "Anything we should know before we plan",
  },
  {
    id: "preferred_provider",
    label: "Preferred provider (optional)",
    type: "text",
    required: false,
    placeholder: "If you've worked with someone here before",
  },
];

const TECHNICAL_RESTRAINED_FIELDS: BookingIntakeField[] = [
  {
    id: "company",
    label: "Company",
    type: "text",
    required: true,
    placeholder: "Where do you work?",
  },
  {
    id: "role",
    label: "Your role",
    type: "text",
    required: true,
    placeholder: "Title or function",
  },
  {
    id: "team_size",
    label: "Team size",
    type: "select",
    required: false,
    options: ["Just me", "2–10", "11–50", "51–250", "250+"],
  },
  {
    id: "scope",
    label: "Project scope",
    type: "textarea",
    required: true,
    placeholder: "Outcomes you're after, current bottlenecks, anything we should know.",
  },
  {
    id: "timeline",
    label: "Timeline",
    type: "select",
    required: false,
    options: ["ASAP", "Next month", "Next quarter", "Just exploring"],
  },
  {
    id: "budget_range",
    label: "Budget range",
    type: "select",
    required: false,
    options: B2B_BUDGET_OPTIONS,
  },
];

const SOFT_RESIDENTIAL_FIELDS: BookingIntakeField[] = [
  {
    id: "address",
    label: "Service address",
    type: "text",
    required: true,
    placeholder: "Where should we come?",
  },
  {
    id: "phone",
    label: "Best phone number",
    type: "tel",
    required: true,
    placeholder: "(555) 123-4567",
  },
  {
    id: "frequency",
    label: "How often would you like service?",
    type: "radio",
    required: true,
    options: ["One-time", "Weekly", "Bi-weekly", "Monthly", "Not sure yet"],
  },
  {
    id: "preferred_day",
    label: "Preferred day",
    type: "select",
    required: false,
    options: ["Weekdays", "Weekends", "Either works"],
  },
  {
    id: "special_notes",
    label: "Pets, gate codes, or special instructions",
    type: "textarea",
    required: false,
    placeholder: "Optional — anything we should know to take great care",
  },
];

const BRUTALIST_FIELDS: BookingIntakeField[] = [
  {
    id: "company",
    label: "Company / brand",
    type: "text",
    required: true,
  },
  {
    id: "project_type",
    label: "What kind of project?",
    type: "text",
    required: true,
    placeholder: "Identity, web, packaging, motion, campaign…",
  },
  {
    id: "brief",
    label: "The brief",
    type: "textarea",
    required: true,
    placeholder: "What you're trying to make. Audience, voice, references.",
  },
  {
    id: "timeline",
    label: "Timeline",
    type: "text",
    required: false,
    placeholder: "Target launch / hard deadlines",
  },
  {
    id: "budget_range",
    label: "Budget range",
    type: "select",
    required: false,
    options: B2B_BUDGET_OPTIONS,
  },
];

// ─── Public API ─────────────────────────────────────────────────────────────

const FIELDS_BY_ARCHETYPE: Record<AestheticArchetypeId, BookingIntakeField[]> = {
  "bold-urgency": BOLD_URGENCY_FIELDS,
  "editorial-warm": EDITORIAL_WARM_FIELDS,
  "clinical-trust": CLINICAL_TRUST_FIELDS,
  "cinematic-aspirational": CINEMATIC_ASPIRATIONAL_FIELDS,
  "technical-restrained": TECHNICAL_RESTRAINED_FIELDS,
  "soft-residential": SOFT_RESIDENTIAL_FIELDS,
  brutalist: BRUTALIST_FIELDS,
  "midnight-craft": BRUTALIST_FIELDS, // premium creative/studio shape — same inquiry-style fields
};

/**
 * Resolve the booking-intake field schema for an archetype. Always
 * includes the universal trailer (notes textarea) so every booking has
 * a free-text overflow channel.
 */
export function getBookingIntakeFieldsForArchetype(
  archetypeId: AestheticArchetypeId,
): BookingIntakeField[] {
  return [...FIELDS_BY_ARCHETYPE[archetypeId], ...UNIVERSAL_TRAILER];
}
