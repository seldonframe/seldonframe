// ============================================================================
// v1.21.0 — customer-portal industry-aware copy packs
// ============================================================================
//
// What the homeowner / patient / client / etc. sees in the customer
// portal needs to match how their business actually talks. An HVAC
// company calls them "service visits"; a dentist calls them
// "appointments"; a coach calls them "sessions"; a lawyer calls
// them "consultations." Pre-1.21 we hardcoded "appointment" /
// "visit" / "booking" in the customer portal copy and the result
// felt jarring — like a SaaS template, not a portal built for THIS
// business.
//
// v1.21: derive copy from organizations.soul.industry + a small
// hand-tuned copy pack per industry. The picker falls back to a
// neutral "general" pack for unknown industries.
//
// We DELIBERATELY use a small fixed set of industries with hand-
// tuned copy rather than letting the LLM generate it per workspace.
// Reasons: (1) consistency across releases — copy doesn't drift
// between dashboards; (2) speed — no LLM call on every portal
// render; (3) the long tail can fall back to "general" without
// any noticeable regression.
//
// Adding a new industry = append a new entry below + add the
// industry name to the source pickers (BusinessType classifier,
// CRMPersonality JSON templates, etc.). All copy fields are
// REQUIRED on each pack so picker code can rely on completeness.

export type CustomerCopyPack = {
  /** Identifier — matches `organizations.soul.industry` value. */
  industry: string;

  // ── Greeting / hero ────────────────────────────────────────────────
  /** Top header above customer's name. Set tone for the surface. */
  welcomeHeading: string;
  /** Single sentence below welcomeHeading. Sets context — what is
   *  this place. Example: "Here's everything we've got going on
   *  for your home." */
  welcomeSubtext: string;

  // ── Appointment terminology ────────────────────────────────────────
  /** Singular noun for the unit-of-engagement. Used in body copy:
   *  "your next {appointmentSingular}", "Book a {appointmentSingular}". */
  appointmentSingular: string;
  /** Plural form. "Your upcoming {appointmentPlural}". */
  appointmentPlural: string;
  /** What the operator-side person performing the work is called.
   *  "Your {providerLabel} will arrive at..." */
  providerLabel: string;

  // ── Action labels ──────────────────────────────────────────────────
  rescheduleAction: string;
  cancelAction: string;
  bookAnotherAction: string;
  getDirectionsAction: string;

  // ── Section headings ───────────────────────────────────────────────
  /** Hero card heading on overview. "Your next service visit". */
  nextHeading: string;
  /** "Your upcoming visits" / "Your appointments" / etc. */
  upcomingHeading: string;
  /** "Visit history" / "Past appointments" / etc. */
  pastHeading: string;
  /** "Your documents" / "Your records" — depends on industry feel. */
  documentsHeading: string;

  // ── Empty states ───────────────────────────────────────────────────
  /** Shown when no upcoming appointments exist. */
  noUpcomingMessage: string;
  /** Shown when no past appointments exist. */
  noPastMessage: string;
  /** Shown when no documents have been shared. */
  noDocumentsMessage: string;
};

const PACKS: Record<string, CustomerCopyPack> = {
  hvac: {
    industry: "hvac",
    welcomeHeading: "Welcome back",
    welcomeSubtext: "Here's everything we've got going on for your home.",
    appointmentSingular: "service visit",
    appointmentPlural: "service visits",
    providerLabel: "technician",
    rescheduleAction: "Reschedule visit",
    cancelAction: "Cancel visit",
    bookAnotherAction: "Schedule another visit",
    getDirectionsAction: "Get directions",
    nextHeading: "Your next service visit",
    upcomingHeading: "Upcoming visits",
    pastHeading: "Visit history",
    documentsHeading: "Your documents",
    noUpcomingMessage:
      "No upcoming visits scheduled. Need work done? Schedule a visit below.",
    noPastMessage: "No past visits yet — we're getting to know each other.",
    noDocumentsMessage:
      "No documents yet. Estimates, invoices, and photos will appear here as we work together.",
  },

  dental: {
    industry: "dental",
    welcomeHeading: "Hello",
    welcomeSubtext: "Your account with our practice.",
    appointmentSingular: "appointment",
    appointmentPlural: "appointments",
    providerLabel: "doctor",
    rescheduleAction: "Reschedule",
    cancelAction: "Cancel appointment",
    bookAnotherAction: "Book an appointment",
    getDirectionsAction: "Get directions",
    nextHeading: "Your next appointment",
    upcomingHeading: "Upcoming appointments",
    pastHeading: "Visit history",
    documentsHeading: "Your records",
    noUpcomingMessage:
      "No upcoming appointments. Time for a checkup? Book one below.",
    noPastMessage: "No past appointments on record yet.",
    noDocumentsMessage:
      "No records shared yet. X-rays, treatment plans, and receipts will appear here.",
  },

  legal: {
    industry: "legal",
    welcomeHeading: "Welcome",
    welcomeSubtext: "Your case dashboard.",
    appointmentSingular: "consultation",
    appointmentPlural: "consultations",
    providerLabel: "attorney",
    rescheduleAction: "Reschedule",
    cancelAction: "Cancel consultation",
    bookAnotherAction: "Schedule a consultation",
    getDirectionsAction: "Get directions",
    nextHeading: "Your next consultation",
    upcomingHeading: "Upcoming consultations",
    pastHeading: "Consultation history",
    documentsHeading: "Case documents",
    noUpcomingMessage:
      "No upcoming consultations scheduled.",
    noPastMessage: "No past consultations on record yet.",
    noDocumentsMessage:
      "No documents shared yet. Filings, contracts, and case notes will appear here.",
  },

  coaching: {
    industry: "coaching",
    welcomeHeading: "Welcome back",
    welcomeSubtext: "Your coaching journey at a glance.",
    appointmentSingular: "session",
    appointmentPlural: "sessions",
    providerLabel: "coach",
    rescheduleAction: "Reschedule session",
    cancelAction: "Cancel session",
    bookAnotherAction: "Book a session",
    getDirectionsAction: "View location",
    nextHeading: "Your next session",
    upcomingHeading: "Upcoming sessions",
    pastHeading: "Session history",
    documentsHeading: "Your resources",
    noUpcomingMessage: "No upcoming sessions scheduled.",
    noPastMessage: "No past sessions yet — let's get started.",
    noDocumentsMessage:
      "No resources shared yet. Worksheets and notes will appear here.",
  },

  agency: {
    industry: "agency",
    welcomeHeading: "Hi there",
    welcomeSubtext: "Your account with us.",
    appointmentSingular: "meeting",
    appointmentPlural: "meetings",
    providerLabel: "account manager",
    rescheduleAction: "Reschedule",
    cancelAction: "Cancel meeting",
    bookAnotherAction: "Book a meeting",
    getDirectionsAction: "View location",
    nextHeading: "Your next meeting",
    upcomingHeading: "Upcoming meetings",
    pastHeading: "Past meetings",
    documentsHeading: "Project files",
    noUpcomingMessage: "No upcoming meetings scheduled.",
    noPastMessage: "No past meetings on record yet.",
    noDocumentsMessage:
      "No files shared yet. Briefs, deliverables, and reports will appear here.",
  },

  medspa: {
    industry: "medspa",
    welcomeHeading: "Welcome",
    welcomeSubtext: "Your wellness portal.",
    appointmentSingular: "appointment",
    appointmentPlural: "appointments",
    providerLabel: "specialist",
    rescheduleAction: "Reschedule",
    cancelAction: "Cancel appointment",
    bookAnotherAction: "Book an appointment",
    getDirectionsAction: "Get directions",
    nextHeading: "Your next appointment",
    upcomingHeading: "Upcoming appointments",
    pastHeading: "Treatment history",
    documentsHeading: "Your records",
    noUpcomingMessage: "No upcoming appointments. Time to treat yourself?",
    noPastMessage: "No past appointments yet.",
    noDocumentsMessage:
      "No records shared yet. Treatment plans and receipts will appear here.",
  },

  accounting: {
    industry: "accounting",
    welcomeHeading: "Hello",
    welcomeSubtext: "Your account with our firm.",
    appointmentSingular: "meeting",
    appointmentPlural: "meetings",
    providerLabel: "accountant",
    rescheduleAction: "Reschedule",
    cancelAction: "Cancel meeting",
    bookAnotherAction: "Schedule a meeting",
    getDirectionsAction: "Get directions",
    nextHeading: "Your next meeting",
    upcomingHeading: "Upcoming meetings",
    pastHeading: "Filing history",
    documentsHeading: "Your documents",
    noUpcomingMessage: "No upcoming meetings scheduled.",
    noPastMessage: "No past meetings on record yet.",
    noDocumentsMessage:
      "No documents shared yet. Returns, statements, and reports will appear here.",
  },

  general: {
    industry: "general",
    welcomeHeading: "Welcome back",
    welcomeSubtext: "Your account at a glance.",
    appointmentSingular: "appointment",
    appointmentPlural: "appointments",
    providerLabel: "team member",
    rescheduleAction: "Reschedule",
    cancelAction: "Cancel",
    bookAnotherAction: "Book another visit",
    getDirectionsAction: "Get directions",
    nextHeading: "Your next appointment",
    upcomingHeading: "Upcoming",
    pastHeading: "History",
    documentsHeading: "Your documents",
    noUpcomingMessage: "No upcoming appointments scheduled.",
    noPastMessage: "No past appointments yet.",
    noDocumentsMessage: "No documents shared yet.",
  },
};

/**
 * Look up the copy pack for an industry. Defaults to "general" for
 * unknown / null / empty industries.
 *
 * The picker is pure (no DB) — caller passes the industry string
 * derived from `organizations.soul.industry` (or null when soul
 * isn't populated yet). Industry is normalized to lowercase + trim
 * before lookup.
 */
export function pickCustomerCopyPack(
  industry: string | null | undefined,
): CustomerCopyPack {
  const normalized = (industry ?? "").trim().toLowerCase();
  return PACKS[normalized] ?? PACKS.general;
}

/** All available industry keys (for tests + tooling). */
export function listKnownIndustries(): string[] {
  return Object.keys(PACKS);
}
