// HVAC Service Calls block — tool schemas (scaffolded 2026-04-25 by block-creation skill).
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

export const createServiceCall: ToolDefinition = {
  name: "create_service_call",
  description: "Create a new service call for a customer. Used when a call comes in (emergency, scheduled tune-up, install request, warranty claim).",
  args: z.object({
    customerId: z.string(),
    callType: z.string(),
    priority: z.string(),
    equipmentId: z.string().optional(),
    scheduledAt: z.string().optional(),
    notes: z.string().optional(),
  }),
  returns: z.object({
    serviceCallId: z.string(),
  }),
  emits: ["service_call.created"],
};

export const assignTechnician: ToolDefinition = {
  name: "assign_technician",
  description: "Assign an on-call technician to a service call. Used by the emergency-triage archetype after priority-routing branches.",
  args: z.object({
    serviceCallId: z.string(),
    technicianId: z.string(),
    etaMinutes: z.number().int(),
  }),
  returns: z.object({
    ok: z.boolean(),
  }),
  emits: ["service_call.assigned"],
};

export const completeServiceCall: ToolDefinition = {
  name: "complete_service_call",
  description: "Mark a service call complete with outcome (resolved, parts-needed, escalation). Triggers the post-service-followup subscription via service_call.completed event.",
  args: z.object({
    serviceCallId: z.string(),
    outcome: z.string(),
    partsUsed: z.string().optional(),
    totalCost: z.number().optional(),
    notes: z.string().optional(),
  }),
  returns: z.object({
    ok: z.boolean(),
  }),
  emits: ["service_call.completed"],
};

export const listEmergencyQueue: ToolDefinition = {
  name: "list_emergency_queue",
  description: "Return all service calls currently in priority=emergency or vip status, sorted by created_at. Powers the dispatcher dashboard.",
  args: z.object({

  }),
  returns: z.object({
    queueJson: z.string(),
  }),
  emits: [],
};

// ---------------------------------------------------------------------
// Exported tuple — order stable across emits.
// ---------------------------------------------------------------------

export const HVAC_SERVICE_CALLS_TOOLS: readonly ToolDefinition[] = [
  createServiceCall,
  assignTechnician,
  completeServiceCall,
  listEmergencyQueue,
] as const;
