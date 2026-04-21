import type { PuckPayload } from "@/lib/puck/validator";
import { agencyLeadGenTemplate } from "./agency-lead-gen";
import { coachingDiscoveryCallTemplate } from "./coaching-discovery-call";
import { serviceBusinessBookingTemplate } from "./service-business-booking";

// Vertical template registry. Each template is a validated Puck payload
// with placeholder copy that's easy to customize via Claude or hand-edit.
// Ships 3 seed templates; more can be added incrementally without
// touching this module — just import + register.

export type VerticalTemplate = {
  id: string;
  name: string;
  description: string;
  industry: string[];
  payload: PuckPayload;
};

export const landingTemplates: Record<string, VerticalTemplate> = {
  "agency-lead-gen": agencyLeadGenTemplate,
  "coaching-discovery-call": coachingDiscoveryCallTemplate,
  "service-business-booking": serviceBusinessBookingTemplate,
};

export function listTemplates(): VerticalTemplate[] {
  return Object.values(landingTemplates);
}

export function getTemplate(id: string): VerticalTemplate | null {
  return landingTemplates[id] ?? null;
}
