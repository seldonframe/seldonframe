import type { OrgSoul } from "@/lib/soul/types";

export const fitnessSoulTemplate: Partial<OrgSoul> = {
  entityLabels: {
    contact: { singular: "Member", plural: "Members" },
    deal: { singular: "Program", plural: "Programs" },
    activity: { singular: "Check-in", plural: "Check-ins" },
    pipeline: { singular: "Enrollment Flow", plural: "Enrollment Flows" },
    intakeForm: { singular: "Fitness Intake", plural: "Fitness Intakes" },
  },
};
