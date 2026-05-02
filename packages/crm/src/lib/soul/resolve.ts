import frameworkConfig from "@/lib/config";
import type { OrgSoul } from "@/lib/soul/types";
import type { CRMPersonality } from "@/lib/crm/personality";

const hardcodedDefaults = {
  entityLabels: {
    contact: { singular: "Contact", plural: "Contacts" },
    deal: { singular: "Deal", plural: "Deals" },
    activity: { singular: "Activity", plural: "Activities" },
    pipeline: { singular: "Pipeline", plural: "Pipelines" },
    intakeForm: { singular: "Intake Form", plural: "Intake Forms" },
  },
};

export function resolveSoul(soul: OrgSoul | null): OrgSoul | null {
  if (!soul) {
    return null;
  }

  return {
    ...soul,
    entityLabels: {
      ...hardcodedDefaults.entityLabels,
      contact: soul.entityLabels?.contact ?? frameworkConfig.entities.contact,
      deal: soul.entityLabels?.deal ?? frameworkConfig.entities.deal,
      activity: soul.entityLabels?.activity ?? frameworkConfig.entities.activity,
      pipeline: soul.entityLabels?.pipeline ?? frameworkConfig.entities.pipeline,
      intakeForm: soul.entityLabels?.intakeForm ?? hardcodedDefaults.entityLabels.intakeForm,
    },
  };
}

export function resolveLabels(
  soul: OrgSoul | null,
  personality?: CRMPersonality | null
) {
  // Personality terminology wins when present — it's the operator-facing
  // primitive that drives sidebar / page labels per vertical. Soul
  // entityLabels are the legacy override path; both fall back to the
  // framework defaults.
  return {
    contact:
      personality?.terminology?.contact ??
      soul?.entityLabels?.contact ??
      frameworkConfig.entities.contact ??
      hardcodedDefaults.entityLabels.contact,
    deal:
      personality?.terminology?.deal ??
      soul?.entityLabels?.deal ??
      frameworkConfig.entities.deal ??
      hardcodedDefaults.entityLabels.deal,
    activity:
      personality?.terminology?.activity ??
      soul?.entityLabels?.activity ??
      frameworkConfig.entities.activity ??
      hardcodedDefaults.entityLabels.activity,
    pipeline: soul?.entityLabels?.pipeline ?? frameworkConfig.entities.pipeline ?? hardcodedDefaults.entityLabels.pipeline,
    intakeForm: soul?.entityLabels?.intakeForm ?? hardcodedDefaults.entityLabels.intakeForm,
  };
}
