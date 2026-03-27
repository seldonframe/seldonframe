import type { OrgSoul } from "@/lib/soul/types";

export const agencySoulTemplate: Partial<OrgSoul> = {
  entityLabels: {
    contact: { singular: "Client", plural: "Clients" },
    deal: { singular: "Project", plural: "Projects" },
    activity: { singular: "Touchpoint", plural: "Touchpoints" },
    pipeline: { singular: "Pipeline", plural: "Pipelines" },
    intakeForm: { singular: "Brief Form", plural: "Brief Forms" },
  },
};
