// CRMPersonality — vertical-specific terminology, pipeline shape, fields,
// and dashboard layout. Same role for the admin UI that DesignTokens play
// for the marketing site: one primitive that swaps the vocabulary and
// shape of every surface a builder sees.
//
// Stored on `organizations.settings.crmPersonality`. Selected once at
// workspace creation from (businessType, industry) and immutable from
// then on unless the operator updates settings.

export type PersonalityVertical =
  | "hvac"
  | "legal"
  | "dental"
  | "coaching"
  | "agency";

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

export interface CRMPersonality {
  vertical: PersonalityVertical;
  terminology: PersonalityTerminology;
  pipeline: PersonalityPipeline;
  contactFields: PersonalityContactFields;
  intakeFields: PersonalityIntakeField[];
  dashboard: PersonalityDashboard;
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
};

// ─── Registry + selection ──────────────────────────────────────────────────

export const PERSONALITIES = {
  hvac: HVAC_PERSONALITY,
  legal: LEGAL_PERSONALITY,
  dental: DENTAL_PERSONALITY,
  coaching: COACHING_PERSONALITY,
  agency: AGENCY_PERSONALITY,
} as const satisfies Record<PersonalityVertical, CRMPersonality>;

export const DEFAULT_PERSONALITY: CRMPersonality = COACHING_PERSONALITY;

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
      // Real estate (uses similar workflow)
      "real-estate", "real estate",
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
const BUSINESS_TYPE_FALLBACK: Record<string, PersonalityVertical> = {
  local_service: "hvac",
  professional_service: "coaching",
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
  return value as CRMPersonality;
}
