import type { OrgSoul } from "@/lib/soul/types";

export const healthcareSoulTemplate: Partial<OrgSoul> = {
  entityLabels: {
    contact: { singular: "Patient", plural: "Patients" },
    deal: { singular: "Care Plan", plural: "Care Plans" },
    activity: { singular: "Visit", plural: "Visits" },
    pipeline: { singular: "Care Pipeline", plural: "Care Pipelines" },
    intakeForm: { singular: "Patient Intake", plural: "Patient Intakes" },
  },
};
