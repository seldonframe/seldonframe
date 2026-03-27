import type { FrameworkConfig } from "@/lib/types/config";

const config: FrameworkConfig = {
  appName: "EstateFlow CRM",
  appDescription: "Pipeline management for real estate teams",
  logo: "/logo.svg",
  entities: {
    contact: { singular: "Buyer", plural: "Buyers" },
    deal: { singular: "Property Deal", plural: "Property Deals" },
    activity: { singular: "Showing", plural: "Showings" },
    pipeline: { singular: "Deal Flow", plural: "Deal Flows" },
  },
  defaultPipeline: {
    name: "Property Deal Flow",
    stages: [
      { name: "Lead", color: "#1d4ed8", probability: 10 },
      { name: "Qualified", color: "#2563eb", probability: 35 },
      { name: "Property Tour", color: "#3b82f6", probability: 55 },
      { name: "Offer", color: "#22c55e", probability: 80 },
      { name: "Closed", color: "#16a34a", probability: 100 }
    ],
  },
  defaultCustomFields: { contact: [{ key: "budget", label: "Budget", type: "number" }], deal: [{ key: "property_type", label: "Property Type", type: "text" }] },
  features: { deals: true, intakeForms: true, aiFeatures: true, soulSystem: true, import: true, export: true, webhooks: true, api: true },
  contactStatuses: ["new", "active_search", "offer_made", "closed"],
  activityTypes: ["showing", "call", "email", "task"],
  booking: {
    enabled: true,
    defaultDurationMinutes: 45,
    preferredProvider: "google-calendar",
    bookingPageHeadline: "Schedule a Showing",
    bookingPageDescription: "Pick a time to tour properties with your agent.",
    bufferMinutes: 15,
    allowWeekends: true,
  },
  landing: {
    enabled: true,
    defaultSections: [
      { type: "hero", title: "Find Your Dream Home" },
      { type: "listings", title: "Featured Properties" },
      { type: "testimonials", title: "Happy Homeowners" },
      { type: "cta", title: "Get Started" },
    ],
    defaultCtaLabel: "Schedule a Showing",
    defaultCtaTarget: "booking",
    heroHeadline: "Your Trusted Real Estate Partner",
    heroSubheadline: "From first showing to closing day — we're with you every step.",
  },
  email: {
    enabled: true,
    preferredProvider: "resend",
    defaultFromName: "EstateFlow",
    defaultSubjectPrefix: "",
    welcomeTemplateSubject: "Welcome — let's find your perfect home",
    welcomeTemplateBody: "Hi {{firstName}}, thanks for reaching out to Northline Realty. I'll be in touch shortly to discuss your property goals.",
    followUpDelayHours: 4,
  },
  portal: {
    enabled: true,
    welcomeMessage: "Welcome to your buyer portal. Track showings, review documents, and stay in touch with your agent.",
    enableMessaging: true,
    enableResources: true,
    enableInvoices: false,
    resourceCategories: ["Property Details", "Inspection Reports", "Contracts", "Guides"],
  },
};

export default config;
