// Workspace-scoped HVAC archetype registry.
// SLICE 9 PR 1 C6 per gate G-9-7.
//
// **Critical:** these archetypes are NOT exported into the global
// archetype registry at packages/crm/src/lib/agents/archetypes/index.ts.
// Per G-9-7 they ship via the hvac-arizona vertical pack install
// (PR 2). Keeping them out of the global registry preserves the
// 6-archetype baseline for synthesis-testing (the structural-hash
// streak depends on the global registry being stable).
//
// Consumers of this registry: the SLICE 9 PR 2 vertical-pack install
// flow + integration tests + (future) the workspace runtime that
// loads archetypes scoped to org.enabledBlocks containing
// "hvac-arizona".

import type { Archetype } from "../../agents/archetypes/types";
import { emergencyTriageArchetype } from "./emergency-triage";
import { heatAdvisoryArchetype } from "./heat-advisory";
import { postServiceFollowupArchetype } from "./post-service-followup";
import { preSeasonMaintenanceArchetype } from "./pre-season-maintenance";

export const hvacArchetypes: Record<string, Archetype> = {
  "hvac-pre-season-maintenance": preSeasonMaintenanceArchetype,
  "hvac-emergency-triage": emergencyTriageArchetype,
  "hvac-heat-advisory-outreach": heatAdvisoryArchetype,
  "hvac-post-service-followup": postServiceFollowupArchetype,
};

export function listHvacArchetypes(): Archetype[] {
  return Object.values(hvacArchetypes);
}

export function getHvacArchetype(id: string): Archetype | null {
  return hvacArchetypes[id] ?? null;
}
