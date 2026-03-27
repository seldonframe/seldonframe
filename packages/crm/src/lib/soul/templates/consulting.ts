import type { OrgSoul } from "@/lib/soul/types";

export const consultingSoulTemplate: Partial<OrgSoul> = {
  entityLabels: {
    contact: { singular: "Client", plural: "Clients" },
    deal: { singular: "Engagement", plural: "Engagements" },
    activity: { singular: "Milestone", plural: "Milestones" },
    pipeline: { singular: "Engagement Pipeline", plural: "Engagement Pipelines" },
    intakeForm: { singular: "Discovery Form", plural: "Discovery Forms" },
  },
};
