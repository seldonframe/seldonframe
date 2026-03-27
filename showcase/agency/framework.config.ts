import type { FrameworkConfig } from "@/lib/types/config";

const config: FrameworkConfig = {
  appName: "AgencyFlow CRM",
  appDescription: "Client operations for creative and growth agencies",
  logo: "/logo.svg",
  entities: {
    contact: { singular: "Client", plural: "Clients" },
    deal: { singular: "Project", plural: "Projects" },
    activity: { singular: "Touchpoint", plural: "Touchpoints" },
    pipeline: { singular: "Pipeline", plural: "Pipelines" },
  },
  defaultPipeline: {
    name: "Project Pipeline",
    stages: [
      { name: "Inbound Lead", color: "#0ea5e9", probability: 10 },
      { name: "Discovery", color: "#6366f1", probability: 30 },
      { name: "Proposal", color: "#8b5cf6", probability: 55 },
      { name: "Contracted", color: "#22c55e", probability: 90 },
      { name: "On Retainer", color: "#16a34a", probability: 100 }
    ],
  },
  defaultCustomFields: { contact: [{ key: "niche", label: "Niche", type: "text" }], deal: [{ key: "retainer", label: "Retainer", type: "number" }] },
  features: { deals: true, intakeForms: true, aiFeatures: true, soulSystem: true, import: true, export: true, webhooks: true, api: true },
  contactStatuses: ["lead", "proposal", "active", "retainer"],
  activityTypes: ["call", "email", "meeting", "task"],
  booking: {
    enabled: true,
    defaultDurationMinutes: 30,
    preferredProvider: "google-meet",
    bookingPageHeadline: "Book a Strategy Call",
    bookingPageDescription: "Let's discuss your brand goals and how we can help.",
    bufferMinutes: 10,
    allowWeekends: false,
  },
  landing: {
    enabled: true,
    defaultSections: [
      { type: "hero", title: "Grow Your Brand with Signal Studio" },
      { type: "services", title: "What We Do" },
      { type: "case-studies", title: "Our Work" },
      { type: "cta", title: "Let's Talk" },
    ],
    defaultCtaLabel: "Book a Strategy Call",
    defaultCtaTarget: "booking",
    heroHeadline: "Creative & Growth Agency",
    heroSubheadline: "Full-service brand, content, and performance marketing.",
  },
  email: {
    enabled: true,
    preferredProvider: "resend",
    defaultFromName: "AgencyFlow",
    defaultSubjectPrefix: "[Signal Studio]",
    welcomeTemplateSubject: "Welcome to Signal Studio",
    welcomeTemplateBody: "Hi {{firstName}}, thanks for your interest. We'll follow up with a discovery brief shortly.",
    followUpDelayHours: 12,
  },
  portal: {
    enabled: true,
    welcomeMessage: "Welcome to your client portal. Access project updates, deliverables, and invoices here.",
    enableMessaging: true,
    enableResources: true,
    enableInvoices: true,
    resourceCategories: ["Deliverables", "Brand Assets", "Reports", "Invoices"],
  },
};

export default config;
