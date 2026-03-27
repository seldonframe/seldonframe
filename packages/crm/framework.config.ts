import type { FrameworkConfig } from "@/lib/types/config";

const config: FrameworkConfig = {
  appName: "CoachCRM",
  appDescription: "Client management for coaching businesses",
  logo: "/logo.svg",
  entities: {
    contact: { singular: "Client", plural: "Clients" },
    deal: { singular: "Engagement", plural: "Engagements" },
    activity: { singular: "Interaction", plural: "Interactions" },
    pipeline: { singular: "Pipeline", plural: "Pipelines" },
  },
  defaultPipeline: {
    name: "Client Journey",
    stages: [
      { name: "Inquiry", color: "#6366f1", probability: 10 },
      { name: "Discovery Call", color: "#8b5cf6", probability: 25 },
      { name: "Proposal Sent", color: "#a855f7", probability: 50 },
      { name: "Negotiation", color: "#d946ef", probability: 75 },
      { name: "Won", color: "#22c55e", probability: 100 },
      { name: "Lost", color: "#ef4444", probability: 0 },
    ],
  },
  defaultCustomFields: {
    contact: [
      { key: "coaching_program", label: "Coaching Program", type: "select", options: ["1:1", "Group", "VIP"] },
      {
        key: "session_frequency",
        label: "Session Frequency",
        type: "select",
        options: ["Weekly", "Biweekly", "Monthly"],
      },
      { key: "goals", label: "Goals", type: "textarea" },
    ],
    deal: [{ key: "package_type", label: "Package Type", type: "select", options: ["3-month", "6-month", "12-month"] }],
  },
  features: {
    deals: true,
    intakeForms: true,
    aiFeatures: true,
    soulSystem: true,
    import: true,
    export: true,
    webhooks: true,
    api: true,
  },
  contactStatuses: ["inquiry", "prospect", "active_client", "past_client", "referral", "archived"],
  activityTypes: ["email", "call", "meeting", "note", "session", "task"],
  booking: {
    enabled: true,
    defaultDurationMinutes: 60,
    preferredProvider: "zoom",
    bookingPageHeadline: "Book a Discovery Session",
    bookingPageDescription: "Schedule a free 60-minute session to discuss your goals.",
    bufferMinutes: 15,
    allowWeekends: false,
  },
  landing: {
    enabled: true,
    defaultSections: [
      { type: "hero", title: "Transform Your Leadership" },
      { type: "benefits", title: "What You'll Gain" },
      { type: "testimonials", title: "Client Success Stories" },
      { type: "cta", title: "Start Your Journey" },
    ],
    defaultCtaLabel: "Book a Free Session",
    defaultCtaTarget: "booking",
    heroHeadline: "Executive Coaching for Founders",
    heroSubheadline: "Structured accountability that drives results.",
  },
  email: {
    enabled: true,
    preferredProvider: "resend",
    defaultFromName: "CoachCRM",
    defaultSubjectPrefix: "",
    welcomeTemplateSubject: "Welcome — let's map your goals",
    welcomeTemplateBody: "Hi {{firstName}}, thanks for reaching out. I'd love to learn more about your goals and see how we can work together.",
    followUpDelayHours: 24,
  },
  portal: {
    enabled: true,
    welcomeMessage: "Welcome to your coaching portal. Here you'll find session notes, resources, and a direct line to your coach.",
    enableMessaging: true,
    enableResources: true,
    enableInvoices: true,
    resourceCategories: ["Session Notes", "Worksheets", "Recordings", "Invoices"],
  },
};

export default config;
