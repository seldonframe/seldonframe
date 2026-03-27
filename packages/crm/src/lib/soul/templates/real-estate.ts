import type { OrgSoul } from "@/lib/soul/types";

export const realEstateSoulTemplate: Partial<OrgSoul> = {
  entityLabels: {
    contact: { singular: "Buyer", plural: "Buyers" },
    deal: { singular: "Property Deal", plural: "Property Deals" },
    activity: { singular: "Showing", plural: "Showings" },
    pipeline: { singular: "Deal Flow", plural: "Deal Flows" },
    intakeForm: { singular: "Qualification Form", plural: "Qualification Forms" },
  },
};
