// ServiceCall — admin schema (scaffolded 2026-04-25 by scaffold → UI bridge).
//
// Drives column inference on the sibling page + any <EntityFormDrawer>
// that consumes the same schema. Edit freely — the scaffold will never
// overwrite this file; re-run the scaffold only on fresh blocks.

import { z } from "zod";

export const ServiceCallSchema = z.object({
  customerId: z.string(),
  equipmentId: z.string().nullable().optional(),
  technicianId: z.string().nullable().optional(),
  callType: z.string(),
  priority: z.string(),
  status: z.string(),
  scheduledAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  outcome: z.string().nullable().optional(),
  totalCost: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export type ServiceCall = z.infer<typeof ServiceCallSchema>;
