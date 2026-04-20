import type { IntakeFormField } from "@/db/schema";

// Pre-built intake form templates for the Create Form flow.
//
// Inspired by the template library in Formbricks (AGPLv3), but implemented
// from scratch against SeldonFrame's 5-type field schema (text, email, tel,
// textarea, select). No Formbricks code is copied — only the idea that
// builders should start from a common pattern instead of a blank slate.
//
// To add a template: append to INTAKE_FORM_TEMPLATES with a stable id, a
// display name/description, an emoji, a defaultSlug, and a fields array
// that conforms to IntakeFormField. Keep templates useful and obvious —
// niche-specific variants belong in the marketplace, not here.

export type IntakeFormTemplate = {
  id: string;
  name: string;
  description: string;
  emoji: string;
  // Short default slug; the UI may suffix a random string if the workspace
  // already has a form at this slug.
  defaultSlug: string;
  // Optional settings written alongside fields on insert (theme, submit
  // button label, confirmation message, etc.).
  settings?: Record<string, unknown>;
  fields: IntakeFormField[];
};

export const INTAKE_FORM_TEMPLATES: IntakeFormTemplate[] = [
  {
    id: "blank",
    name: "Blank form",
    description: "Start from scratch. Add fields yourself.",
    emoji: "✏️",
    defaultSlug: "new-intake-form",
    fields: [],
  },
  {
    id: "contact",
    name: "Contact us",
    description: "Name, email, and a message. The default for most sites.",
    emoji: "📬",
    defaultSlug: "contact",
    settings: { submitLabel: "Send message" },
    fields: [
      { key: "fullName", label: "Full name", type: "text", required: true },
      { key: "email", label: "Email", type: "email", required: true },
      { key: "message", label: "What can we help with?", type: "textarea", required: true },
    ],
  },
  {
    id: "lead-qualification",
    name: "Lead qualification",
    description: "Qualify inbound leads with company, team size, and budget.",
    emoji: "🎯",
    defaultSlug: "lead-qualification",
    settings: { submitLabel: "Request a call" },
    fields: [
      { key: "fullName", label: "Full name", type: "text", required: true },
      { key: "workEmail", label: "Work email", type: "email", required: true },
      { key: "company", label: "Company", type: "text", required: true },
      {
        key: "teamSize",
        label: "Team size",
        type: "select",
        required: true,
        options: ["Just me", "2–10", "11–50", "51–200", "201+"],
      },
      {
        key: "budget",
        label: "Monthly budget",
        type: "select",
        required: false,
        options: ["Under $500", "$500–$2k", "$2k–$10k", "$10k+"],
      },
      { key: "useCase", label: "What are you trying to solve?", type: "textarea", required: true },
    ],
  },
  {
    id: "booking-request",
    name: "Booking request",
    description: "Ask for a name, topic, and preferred times before a call.",
    emoji: "📅",
    defaultSlug: "booking-request",
    settings: { submitLabel: "Request a time" },
    fields: [
      { key: "fullName", label: "Full name", type: "text", required: true },
      { key: "email", label: "Email", type: "email", required: true },
      { key: "phone", label: "Phone (optional)", type: "tel", required: false },
      {
        key: "topic",
        label: "What should we cover?",
        type: "select",
        required: true,
        options: ["Intro call", "Strategy session", "Product demo", "Pricing", "Something else"],
      },
      { key: "availability", label: "When are you available?", type: "textarea", required: true },
    ],
  },
  {
    id: "nps-feedback",
    name: "Customer feedback (NPS)",
    description: "How likely are customers to recommend you? With a reason.",
    emoji: "⭐",
    defaultSlug: "feedback",
    settings: { submitLabel: "Send feedback" },
    fields: [
      { key: "email", label: "Email (optional)", type: "email", required: false },
      {
        key: "score",
        label: "How likely are you to recommend us? (0 = not at all, 10 = extremely)",
        type: "select",
        required: true,
        options: ["10", "9", "8", "7", "6", "5", "4", "3", "2", "1", "0"],
      },
      { key: "reason", label: "Tell us why", type: "textarea", required: true },
      {
        key: "improvement",
        label: "What could we do better? (optional)",
        type: "textarea",
        required: false,
      },
    ],
  },
  {
    id: "event-registration",
    name: "Event registration",
    description: "Name, email, dietary preferences, and open questions.",
    emoji: "🎟️",
    defaultSlug: "rsvp",
    settings: { submitLabel: "Register" },
    fields: [
      { key: "fullName", label: "Full name", type: "text", required: true },
      { key: "email", label: "Email", type: "email", required: true },
      { key: "company", label: "Company (optional)", type: "text", required: false },
      {
        key: "dietary",
        label: "Dietary preferences",
        type: "select",
        required: false,
        options: ["None", "Vegetarian", "Vegan", "Gluten-free", "Other"],
      },
      {
        key: "questions",
        label: "Anything we should know ahead of time?",
        type: "textarea",
        required: false,
      },
    ],
  },
];

export function getIntakeFormTemplate(id: string): IntakeFormTemplate | undefined {
  return INTAKE_FORM_TEMPLATES.find((template) => template.id === id);
}
