// packages/crm/src/lib/crm/template-suggestions.ts
//
// 2026-05-17 — Personality-aware defaults for the booking + intake
// creation drawers.
//
// Before this module: the Create Type drawer hardcoded "Strategy Call"
// as the appointment placeholder and "30 / 60 min" as the only duration
// options. For a plumbing or HVAC workspace those defaults are useless
// — the operator's actual services are 60-180 min on-site jobs, not
// coaching sessions.
//
// The `suggestedServices` chips from `soul.services` already help a
// little (they pre-fill the name from the operator's actual service
// list), but the placeholders + duration menu were still locked to the
// coaching default. This module makes both personality-aware while
// keeping the file shape backwards compatible — any field a personality
// doesn't override falls back to the original coaching default.
//
// Same module powers the intake-form creation drawer for the same
// reason ("Request a quote" makes sense for trades but not for legal
// or coaching).

import type { PersonalityVertical } from "./personality";

export interface BookingDefaults {
  /** Placeholder shown in the appointment-name input. */
  namePlaceholder: string;
  /** Placeholder shown in the description input. */
  descriptionPlaceholder: string;
  /** Placeholder shown in the public-slug input. */
  slugPlaceholder: string;
  /** Available duration options (minutes). The shorter ones stay in
   *  every personality so coaching/consulting flows aren't penalised;
   *  trades get longer ones added. */
  durationOptions: number[];
  /** Default duration the dropdown starts on. */
  defaultDurationMinutes: number;
  /** Two or three name suggestions the operator can pick from before
   *  customising. Drives the "quick start" chips at the top of the
   *  form. Empty array = no quick-start chips, fall back to soul
   *  services. */
  quickStartTemplates: Array<{ name: string; durationMinutes: number; description: string }>;
}

export interface IntakeDefaults {
  /** Default intake form name. */
  namePlaceholder: string;
  /** Default slug. */
  slugPlaceholder: string;
  /** Submit button label customer sees. */
  submitButtonLabel: string;
}

/** Coaching/consulting flavour — also the safe fallback when the
 *  personality isn't recognised. Matches the legacy hardcoded values
 *  so existing workspaces don't see surprise label changes. */
const GENERAL_BOOKING_DEFAULTS: BookingDefaults = {
  namePlaceholder: "Strategy Call",
  descriptionPlaceholder: "Initial planning session",
  slugPlaceholder: "strategy-call",
  durationOptions: [15, 30, 45, 60, 90],
  defaultDurationMinutes: 30,
  quickStartTemplates: [
    { name: "Discovery call", durationMinutes: 30, description: "Quick introduction + qualification" },
    { name: "Strategy session", durationMinutes: 60, description: "Deep dive on your goals + a plan" },
  ],
};

const GENERAL_INTAKE_DEFAULTS: IntakeDefaults = {
  namePlaceholder: "Get a Quote",
  slugPlaceholder: "quote",
  submitButtonLabel: "Submit",
};

/** Per-vertical overrides. Anything missing falls through to general. */
const BOOKING_DEFAULTS_BY_VERTICAL: Partial<Record<PersonalityVertical, Partial<BookingDefaults>>> = {
  hvac: {
    namePlaceholder: "Service Call",
    descriptionPlaceholder: "Furnace/AC inspection + repair quote",
    slugPlaceholder: "service-call",
    durationOptions: [30, 60, 90, 120, 180],
    defaultDurationMinutes: 60,
    quickStartTemplates: [
      { name: "Service call", durationMinutes: 60, description: "Diagnose + quote on-site" },
      { name: "Tune-up", durationMinutes: 90, description: "Seasonal maintenance check" },
      { name: "Emergency no-heat / no-cool", durationMinutes: 120, description: "Same-day urgent service" },
      { name: "New install consultation", durationMinutes: 30, description: "Free quote visit for replacement" },
    ],
  },
  dental: {
    namePlaceholder: "Routine Cleaning",
    descriptionPlaceholder: "30-minute hygienist visit",
    slugPlaceholder: "cleaning",
    durationOptions: [30, 45, 60, 90, 120],
    defaultDurationMinutes: 45,
    quickStartTemplates: [
      { name: "Routine cleaning", durationMinutes: 45, description: "Hygienist visit + exam" },
      { name: "New patient exam", durationMinutes: 60, description: "Full evaluation + X-rays" },
      { name: "Emergency", durationMinutes: 30, description: "Same-day pain / chipped tooth" },
    ],
  },
  legal: {
    namePlaceholder: "Free Consultation",
    descriptionPlaceholder: "Initial case review and next-step plan",
    slugPlaceholder: "consultation",
    durationOptions: [30, 45, 60, 90],
    defaultDurationMinutes: 30,
    quickStartTemplates: [
      { name: "Free consultation", durationMinutes: 30, description: "Initial case review, no commitment" },
      { name: "Discovery interview", durationMinutes: 60, description: "Deep dive on your situation" },
    ],
  },
  medspa: {
    namePlaceholder: "Treatment",
    descriptionPlaceholder: "Aesthetic treatment session",
    slugPlaceholder: "treatment",
    durationOptions: [30, 45, 60, 90, 120],
    defaultDurationMinutes: 60,
    quickStartTemplates: [
      { name: "Initial consultation", durationMinutes: 30, description: "Treatment planning + skin assessment" },
      { name: "Facial treatment", durationMinutes: 60, description: "Standard aesthetic session" },
      { name: "Injectables", durationMinutes: 45, description: "Botox / filler appointment" },
    ],
  },
  coaching: {
    namePlaceholder: "1:1 Session",
    descriptionPlaceholder: "Coaching session",
    slugPlaceholder: "session",
    durationOptions: [30, 45, 60, 90, 120],
    defaultDurationMinutes: 60,
    quickStartTemplates: [
      { name: "Free intro call", durationMinutes: 20, description: "Brief alignment + fit check" },
      { name: "1:1 session", durationMinutes: 60, description: "Standard coaching session" },
      { name: "Strategy intensive", durationMinutes: 90, description: "Deep planning + execution roadmap" },
    ],
  },
  agency: {
    namePlaceholder: "Discovery Call",
    descriptionPlaceholder: "Project scoping conversation",
    slugPlaceholder: "discovery",
    durationOptions: [30, 45, 60, 90],
    defaultDurationMinutes: 45,
    quickStartTemplates: [
      { name: "Discovery call", durationMinutes: 30, description: "Quick fit + scope conversation" },
      { name: "Project scoping", durationMinutes: 60, description: "Deep dive on requirements + timeline" },
    ],
  },
};

const INTAKE_DEFAULTS_BY_VERTICAL: Partial<Record<PersonalityVertical, Partial<IntakeDefaults>>> = {
  hvac: {
    namePlaceholder: "Request Service",
    slugPlaceholder: "service-request",
    submitButtonLabel: "Request service",
  },
  dental: {
    namePlaceholder: "New Patient Form",
    slugPlaceholder: "new-patient",
    submitButtonLabel: "Submit",
  },
  legal: {
    namePlaceholder: "Case Intake",
    slugPlaceholder: "case-intake",
    submitButtonLabel: "Submit case details",
  },
  medspa: {
    namePlaceholder: "Treatment Inquiry",
    slugPlaceholder: "treatment-inquiry",
    submitButtonLabel: "Send inquiry",
  },
  coaching: {
    namePlaceholder: "Coaching Application",
    slugPlaceholder: "application",
    submitButtonLabel: "Apply",
  },
  agency: {
    namePlaceholder: "Project Brief",
    slugPlaceholder: "project-brief",
    submitButtonLabel: "Send brief",
  },
};

/** Resolve booking defaults for a vertical. Falls back to the general
 *  (coaching-flavoured) defaults when the vertical isn't recognised. */
export function getBookingDefaults(
  vertical: PersonalityVertical | string | null | undefined,
): BookingDefaults {
  const override = BOOKING_DEFAULTS_BY_VERTICAL[vertical as PersonalityVertical];
  if (!override) return GENERAL_BOOKING_DEFAULTS;
  return { ...GENERAL_BOOKING_DEFAULTS, ...override };
}

/** Resolve intake-form defaults for a vertical. Same fallback strategy. */
export function getIntakeDefaults(
  vertical: PersonalityVertical | string | null | undefined,
): IntakeDefaults {
  const override = INTAKE_DEFAULTS_BY_VERTICAL[vertical as PersonalityVertical];
  if (!override) return GENERAL_INTAKE_DEFAULTS;
  return { ...GENERAL_INTAKE_DEFAULTS, ...override };
}
