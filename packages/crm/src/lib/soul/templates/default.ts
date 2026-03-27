import type { OrgSoul } from "@/lib/soul/types";

export const defaultSoulTemplate: Partial<OrgSoul> = {
  entityLabels: {
    contact: { singular: "Client", plural: "Clients" },
    deal: { singular: "Deal", plural: "Deals" },
    activity: { singular: "Activity", plural: "Activities" },
    pipeline: { singular: "Pipeline", plural: "Pipelines" },
    intakeForm: { singular: "Intake Form", plural: "Intake Forms" },
  },
  pipeline: {
    name: "Sales Pipeline",
    stages: [
      { name: "New Lead", color: "#6366f1", probability: 10 },
      { name: "Qualified", color: "#8b5cf6", probability: 30 },
      { name: "Proposal", color: "#a855f7", probability: 60 },
      { name: "Won", color: "#22c55e", probability: 100 },
      { name: "Lost", color: "#ef4444", probability: 0 },
    ],
  },
  suggestedFields: {
    contact: [{ key: "source", label: "Lead Source", type: "text" }],
    deal: [{ key: "budget", label: "Budget", type: "number" }],
  },
  contactStatuses: [
    { value: "lead", label: "Lead", color: "#6366f1" },
    { value: "active", label: "Active", color: "#22c55e" },
  ],
  voice: {
    style: "friendly-professional",
    vocabulary: ["results", "clarity"],
    avoidWords: ["cheap", "quick fix"],
    samplePhrases: ["Let’s align on your goals and timeline."],
  },
  priorities: ["new client acquisition", "pipeline visibility", "task management"],
  branding: {
    primaryColor: "234 89% 74%",
    accentColor: "262 83% 70%",
    mood: "minimal",
  },
};
