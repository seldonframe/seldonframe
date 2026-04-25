// Vehicle Service History block — tool schemas (scaffolded 2026-04-23 by block-creation skill).
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

export const addVehicle: ToolDefinition = {
  name: "add_vehicle",
  description: "Register a new vehicle against a contact. Requires year/make/model; VIN is optional.",
  args: z.object({
    contactId: z.string(),
    year: z.number().int(),
    make: z.string(),
    model: z.string(),
    vin: z.string().nullable().optional(),
  }),
  returns: z.object({
    vehicleId: z.string(),
  }),
  emits: ["vehicle.added"],
};

export const logService: ToolDefinition = {
  name: "log_service",
  description: "Record a service event performed on a vehicle. Service type is a free-form label (oil change, brake pads, inspection, etc.).",
  args: z.object({
    vehicleId: z.string(),
    serviceType: z.string(),
    mileage: z.number().int().nullable().optional(),
    notes: z.string().nullable().optional(),
    cost: z.number().nullable().optional(),
  }),
  returns: z.object({
    serviceEventId: z.string(),
  }),
  emits: ["service.logged"],
};

export const listServiceHistory: ToolDefinition = {
  name: "list_service_history",
  description: "List all service events for a given vehicle, newest first.",
  args: z.object({
    vehicleId: z.string(),
  }),
  returns: z.object({

  }),
  emits: [],
};

export const getVehicle: ToolDefinition = {
  name: "get_vehicle",
  description: "Fetch a single vehicle by id.",
  args: z.object({
    vehicleId: z.string(),
  }),
  returns: z.object({

  }),
  emits: [],
};

// ---------------------------------------------------------------------
// Exported tuple — order stable across emits.
// ---------------------------------------------------------------------

export const VEHICLE_SERVICE_HISTORY_TOOLS: readonly ToolDefinition[] = [
  addVehicle,
  logService,
  listServiceHistory,
  getVehicle,
] as const;
