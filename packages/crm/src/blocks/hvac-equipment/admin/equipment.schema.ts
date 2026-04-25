// Equipment — admin schema (scaffolded 2026-04-25 by scaffold → UI bridge).
//
// Drives column inference on the sibling page + any <EntityFormDrawer>
// that consumes the same schema. Edit freely — the scaffold will never
// overwrite this file; re-run the scaffold only on fresh blocks.

import { z } from "zod";

export const EquipmentSchema = z.object({
  customerId: z.string(),
  brand: z.string(),
  model: z.string(),
  type: z.string(),
  serialNumber: z.string(),
  installDate: z.string(),
  lastServiceAt: z.string().nullable().optional(),
  warrantyExpiresAt: z.string().nullable().optional(),
  ageYears: z.number().int().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export type Equipment = z.infer<typeof EquipmentSchema>;
