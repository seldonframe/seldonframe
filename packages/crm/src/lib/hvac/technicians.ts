// Technicians Soul attribute schema + read helpers.
// SLICE 9 PR 1 C4 per gate G-9-1 revised (technicians as Soul
// attribute, not block).
//
// Per scenario doc (tasks/launch-content/desert-cool-hvac-scenario.md):
// each technician carries id, name, employeeId, hire date, skill level,
// certifications, service-area zip codes, on-call flag, and current
// assignment. Stored under `org.soul.technicians[]`.
//
// Read helpers exposed for archetype dispatchers (emergency-triage in
// C7 reads on-call list; pre-season-maintenance in C6 doesn't need
// technicians).
//
// No write surface in PR 1 — operator updates technicians via Soul
// JSON edit (or future settings UI in a post-launch slice). Schema
// here is the contract.

import { z } from "zod";

export const TechnicianSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  employeeId: z.string().min(1),
  hireDate: z.string().min(1), // ISO 8601 date
  skill_level: z.enum(["apprentice", "journeyman", "senior", "master"]),
  certifications: z.array(z.string()),
  service_area: z.array(z.string().regex(/^\d{5}$/)), // 5-digit ZIPs
  on_call_today: z.boolean(),
  current_assignment: z.string().nullable(),
});

export type Technician = z.infer<typeof TechnicianSchema>;

export const TechniciansSoulAttributeSchema = z.array(TechnicianSchema);

export type TechniciansSoulAttribute = z.infer<typeof TechniciansSoulAttributeSchema>;

// ---------------------------------------------------------------------
// Read helpers — pure, take Soul object as input (caller fetches org)
// ---------------------------------------------------------------------

export function getTechnicians(soul: unknown): Technician[] {
  if (!soul || typeof soul !== "object") return [];
  const techs = (soul as { technicians?: unknown }).technicians;
  if (!Array.isArray(techs)) return [];
  // Use safeParse to skip malformed entries rather than throwing.
  const valid: Technician[] = [];
  for (const t of techs) {
    const result = TechnicianSchema.safeParse(t);
    if (result.success) valid.push(result.data);
  }
  return valid;
}

export function getOnCallTechnicians(soul: unknown): Technician[] {
  return getTechnicians(soul).filter((t) => t.on_call_today);
}

export function getTechniciansForZip(soul: unknown, zip: string): Technician[] {
  return getTechnicians(soul).filter((t) => t.service_area.includes(zip));
}

export function getAvailableTechnicianForZip(
  soul: unknown,
  zip: string,
): Technician | null {
  // Available = on_call_today AND no current_assignment AND service_area
  // includes the requested zip. Returned ordered by skill level
  // (master > senior > journeyman > apprentice) so emergency triage
  // routes to the most-experienced available tech.
  const skillRank: Record<Technician["skill_level"], number> = {
    master: 4,
    senior: 3,
    journeyman: 2,
    apprentice: 1,
  };
  const candidates = getTechnicians(soul).filter(
    (t) =>
      t.on_call_today &&
      t.current_assignment === null &&
      t.service_area.includes(zip),
  );
  candidates.sort((a, b) => skillRank[b.skill_level] - skillRank[a.skill_level]);
  return candidates[0] ?? null;
}
