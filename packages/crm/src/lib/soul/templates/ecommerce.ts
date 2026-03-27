import type { OrgSoul } from "@/lib/soul/types";

export const ecommerceSoulTemplate: Partial<OrgSoul> = {
  entityLabels: {
    contact: { singular: "Customer", plural: "Customers" },
    deal: { singular: "Order Opportunity", plural: "Order Opportunities" },
    activity: { singular: "Interaction", plural: "Interactions" },
    pipeline: { singular: "Revenue Pipeline", plural: "Revenue Pipelines" },
    intakeForm: { singular: "Order Intake", plural: "Order Intakes" },
  },
};
