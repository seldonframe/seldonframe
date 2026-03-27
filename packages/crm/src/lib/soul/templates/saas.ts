import type { OrgSoul } from "@/lib/soul/types";

export const saasSoulTemplate: Partial<OrgSoul> = {
  entityLabels: {
    contact: { singular: "Account", plural: "Accounts" },
    deal: { singular: "Subscription", plural: "Subscriptions" },
    activity: { singular: "Usage Event", plural: "Usage Events" },
    pipeline: { singular: "Growth Pipeline", plural: "Growth Pipelines" },
    intakeForm: { singular: "Trial Form", plural: "Trial Forms" },
  },
};
