import type { OrgSoul } from "@/lib/soul/types";

export const coachingSoulTemplate: Partial<OrgSoul> = {
  entityLabels: {
    contact: { singular: "Client", plural: "Clients" },
    deal: { singular: "Engagement", plural: "Engagements" },
    activity: { singular: "Session", plural: "Sessions" },
    pipeline: { singular: "Journey", plural: "Journeys" },
    intakeForm: { singular: "Application", plural: "Applications" },
  },
  pipeline: {
    name: "Client Journey",
    stages: [
      { name: "Inquiry", color: "#6366f1", probability: 10 },
      { name: "Discovery Call", color: "#8b5cf6", probability: 25 },
      { name: "Proposal Sent", color: "#a855f7", probability: 50 },
      { name: "Active Program", color: "#22c55e", probability: 85 },
      { name: "Completed", color: "#16a34a", probability: 100 },
    ],
  },
};
