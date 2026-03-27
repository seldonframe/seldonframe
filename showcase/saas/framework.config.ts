import type { FrameworkConfig } from "@/lib/types/config";

const config: FrameworkConfig = {
  appName: "SaaS Revenue CRM",
  appDescription: "Pipeline and expansion CRM for SaaS teams",
  logo: "/logo.svg",
  entities: {
    contact: { singular: "Account", plural: "Accounts" },
    deal: { singular: "Subscription", plural: "Subscriptions" },
    activity: { singular: "Usage Event", plural: "Usage Events" },
    pipeline: { singular: "Growth Pipeline", plural: "Growth Pipelines" },
  },
  defaultPipeline: {
    name: "Growth Pipeline",
    stages: [
      { name: "Trial", color: "#6366f1", probability: 10 },
      { name: "Activated", color: "#8b5cf6", probability: 35 },
      { name: "Converted", color: "#22c55e", probability: 100 },
      { name: "Expansion", color: "#16a34a", probability: 85 },
      { name: "Churn Risk", color: "#ef4444", probability: 20 }
    ],
  },
  defaultCustomFields: { contact: [{ key: "plan", label: "Plan", type: "text" }], deal: [{ key: "mrr", label: "MRR", type: "number" }] },
  features: { deals: true, intakeForms: true, aiFeatures: true, soulSystem: true, import: true, export: true, webhooks: true, api: true },
  contactStatuses: ["trial", "active", "expansion", "churn_risk"],
  activityTypes: ["usage", "email", "call", "task"],
  booking: {
    enabled: true,
    defaultDurationMinutes: 30,
    preferredProvider: "google-meet",
    bookingPageHeadline: "Book a Demo",
    bookingPageDescription: "See Orbit Analytics in action with a personalized walkthrough.",
    bufferMinutes: 10,
    allowWeekends: false,
  },
  landing: {
    enabled: true,
    defaultSections: [
      { type: "hero", title: "Product Analytics That Drive Growth" },
      { type: "features", title: "Key Capabilities" },
      { type: "pricing", title: "Plans & Pricing" },
      { type: "cta", title: "Start Free Trial" },
    ],
    defaultCtaLabel: "Start Free Trial",
    defaultCtaTarget: "intake",
    heroHeadline: "Understand Your Users, Grow Your Revenue",
    heroSubheadline: "Real-time product analytics for modern SaaS teams.",
  },
  email: {
    enabled: true,
    preferredProvider: "resend",
    defaultFromName: "Orbit Analytics",
    defaultSubjectPrefix: "[Orbit]",
    welcomeTemplateSubject: "Welcome to Orbit — your trial is live",
    welcomeTemplateBody: "Hi {{firstName}}, your Orbit Analytics trial is active. Here are three things to try in your first 10 minutes.",
    followUpDelayHours: 6,
  },
  portal: {
    enabled: true,
    welcomeMessage: "Welcome to your account portal. Manage your subscription, view usage reports, and contact support.",
    enableMessaging: true,
    enableResources: true,
    enableInvoices: true,
    resourceCategories: ["Usage Reports", "API Docs", "Invoices", "Onboarding Guides"],
  },
};

export default config;
