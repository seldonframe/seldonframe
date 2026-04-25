// HVAC Equipment block — tool schemas (scaffolded 2026-04-25 by block-creation skill).
//
// Zod-authored schemas for the block's MCP tools. Source of truth for
// the tool surface; the emit step renders JSON Schema into the BLOCK.md
// on next `pnpm emit:blocks`.
//
// TODO (scaffold-default): replace tool descriptions + arg/return shapes
// with the real block semantics. Defaults are structural skeletons —
// they compile + emit cleanly but don't reflect your intended behavior.

import { z } from "zod";

import type { ToolDefinition } from "../lib/blocks/contract-v2";

// ---------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------
// TODO (scaffold-default): extract reusable z.enum / z.object primitives
// here when multiple tools need the same shape.

export const listEquipmentForCustomer: ToolDefinition = {
  name: "list_equipment_for_customer",
  description: "List all HVAC equipment installed at a given customer site, including age in years and last-service date.",
  args: z.object({
    customerId: z.string(),
  }),
  returns: z.object({
    equipmentJson: z.string(),
  }),
  emits: [],
};

export const createEquipmentRecord: ToolDefinition = {
  name: "create_equipment_record",
  description: "Add a new equipment record to a customer site. Used when a tech installs new equipment after a quote-to-install workflow.",
  args: z.object({
    customerId: z.string(),
    brand: z.string(),
    model: z.string(),
    type: z.string(),
    serialNumber: z.string(),
    installDate: z.string(),
    warrantyYears: z.number().int().optional(),
  }),
  returns: z.object({
    equipmentId: z.string(),
  }),
  emits: ["equipment.installed"],
};

export const updateServiceRecord: ToolDefinition = {
  name: "update_service_record",
  description: "Mark an equipment record as serviced. Updates last_service_at + emits equipment.serviced for downstream subscriptions.",
  args: z.object({
    equipmentId: z.string(),
    technicianId: z.string(),
    servicedAt: z.string(),
    notes: z.string().optional(),
  }),
  returns: z.object({
    ok: z.boolean(),
  }),
  emits: ["equipment.serviced"],
};

// ---------------------------------------------------------------------
// Exported tuple — order stable across emits.
// ---------------------------------------------------------------------

export const HVAC_EQUIPMENT_TOOLS: readonly ToolDefinition[] = [
  listEquipmentForCustomer,
  createEquipmentRecord,
  updateServiceRecord,
] as const;
