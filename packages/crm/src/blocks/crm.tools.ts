// CRM block — tool schemas (Scope 3 Step 2b.1 PR 1 C4).
//
// Zod-authored schemas for the 13 MCP tools in the CRM block. Source of
// truth for the tool surface; the emit step (C6) calls z.toJSONSchema()
// on each schema to render JSON-Schema into crm.block.md between the
// <!-- TOOLS:START --> / <!-- TOOLS:END --> markers. PR 3 wires the
// CRM BLOCK.md `## Composition Contract` section to v2 shape and this
// emit step runs for the first time on a real block.
//
// Tool enumeration matches skills/mcp-server/src/tools.js (checked
// 2026-04-21, tool count 82 after Scope 3 Step 2a):
//   Contacts: list / get / create / update / delete   (5)
//   Deals:    list / get / create / update / move_stage / delete (6)
//   Activities: list / create                         (2)
// Total: 13 tools.
//
// Scope note: this file doesn't import or touch the MCP runtime.
// Runtime execution of these tools lives in skills/mcp-server; this
// file is pure schema. Drift between the two is detected by the PR-2
// agent-spec validator and (when 7.e ships) by the agent runtime
// itself.

import { z } from "zod";

import type { ToolDefinition } from "../lib/blocks/contract-v2";

// ---------------------------------------------------------------------
// Shared primitives — reused across the 13 tool schemas so changes
// (e.g., tightening the contact lifecycle enum) happen in one place.
// ---------------------------------------------------------------------

const workspaceIdArg = z
  .string()
  .uuid()
  .optional()
  .describe("Optional. Falls back to the active workspace.");

const contactIdArg = z.string().uuid().describe("UUID of the contact.");
const dealIdArg = z.string().uuid().describe("UUID of the deal.");

const contactLifecycleStatus = z.enum([
  "lead",
  "prospect",
  "customer",
  "inactive",
]);

const activityType = z.enum([
  "task",
  "note",
  "email",
  "sms",
  "call",
  "meeting",
  "stage_change",
  "payment",
  "review_request",
  "agent_action",
]);

// Return shapes — deliberately narrow. Agents that want the full CRM
// record shape can fetch it explicitly; here we capture just the fields
// downstream {{interpolation}} will commonly reach for. When PR 2's
// agent-spec validator walks interpolation paths, it needs field types;
// these are those types.

const ContactRecord = z.object({
  id: z.string().uuid(),
  firstName: z.string(),
  lastName: z.string().nullable(),
  email: z.string().email().nullable(),
  phone: z.string().nullable(),
  status: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const DealRecord = z.object({
  id: z.string().uuid(),
  contactId: z.string().uuid(),
  title: z.string(),
  stage: z.string(),
  value: z.number(),
  probability: z.number().min(0).max(100),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const ActivityRecord = z.object({
  id: z.string().uuid(),
  contactId: z.string().uuid().nullable(),
  dealId: z.string().uuid().nullable(),
  type: activityType,
  subject: z.string().nullable(),
  body: z.string().nullable(),
  scheduledAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

// ---------------------------------------------------------------------
// Contact tools (5)
// ---------------------------------------------------------------------

export const listContacts: ToolDefinition = {
  name: "list_contacts",
  description:
    "List contacts in the active workspace. Returns every contact the caller can read.",
  args: z.object({ workspace_id: workspaceIdArg }),
  returns: z.object({
    ok: z.literal(true),
    contacts: z.array(ContactRecord),
    meta: z.unknown().nullable(),
  }),
  emits: [],
};

export const getContact: ToolDefinition = {
  name: "get_contact",
  description: "Fetch one contact by id. Returns null if not found.",
  args: z.object({
    contact_id: contactIdArg,
    workspace_id: workspaceIdArg,
  }),
  returns: z.object({
    ok: z.literal(true),
    contact: ContactRecord.nullable(),
  }),
  emits: [],
};

export const createContact: ToolDefinition = {
  name: "create_contact",
  description:
    "Create a new contact. Email is optional but strongly recommended — unlocks form auto-linking and email sends.",
  args: z.object({
    first_name: z.string().min(1).describe("Required. Contact's first name."),
    last_name: z.string().optional().describe("Optional. Last name."),
    email: z.string().email().optional().describe("Optional but strongly recommended."),
    status: contactLifecycleStatus
      .optional()
      .describe("Optional lifecycle stage. Defaults to 'lead'."),
    source: z
      .string()
      .optional()
      .describe("Optional source tag (e.g., 'manual', 'intake-form', 'import'). Defaults to 'mcp'."),
    workspace_id: workspaceIdArg,
  }),
  returns: z.object({ ok: z.literal(true), contact: ContactRecord }),
  emits: ["contact.created"],
};

export const updateContact: ToolDefinition = {
  name: "update_contact",
  description:
    "Partial update — omit fields you don't want to change. Emits contact.updated on success.",
  args: z.object({
    contact_id: contactIdArg,
    first_name: z.string().min(1).optional(),
    last_name: z.string().optional(),
    email: z.string().email().optional(),
    status: contactLifecycleStatus.optional(),
    workspace_id: workspaceIdArg,
  }),
  returns: z.object({ ok: z.literal(true), contact: ContactRecord }),
  emits: ["contact.updated"],
};

export const deleteContact: ToolDefinition = {
  name: "delete_contact",
  description:
    "Delete a contact and all linked deals/activities (cascades via FK). Irreversible.",
  args: z.object({
    contact_id: contactIdArg,
    workspace_id: workspaceIdArg,
  }),
  returns: z.object({ ok: z.literal(true), deleted: z.string().uuid() }),
  emits: [],
};

// ---------------------------------------------------------------------
// Deal tools (6)
// ---------------------------------------------------------------------

export const listDeals: ToolDefinition = {
  name: "list_deals",
  description: "List deals in the active workspace.",
  args: z.object({ workspace_id: workspaceIdArg }),
  returns: z.object({ ok: z.literal(true), deals: z.array(DealRecord) }),
  emits: [],
};

export const getDeal: ToolDefinition = {
  name: "get_deal",
  description: "Fetch one deal by id. Returns null if not found.",
  args: z.object({
    deal_id: dealIdArg,
    workspace_id: workspaceIdArg,
  }),
  returns: z.object({ ok: z.literal(true), deal: DealRecord.nullable() }),
  emits: [],
};

export const createDeal: ToolDefinition = {
  name: "create_deal",
  description:
    "Create a new deal attached to a contact on the default pipeline. Value defaults to 0; stage defaults to the first stage; probability defaults to 0.",
  args: z.object({
    contact_id: contactIdArg,
    title: z.string().min(1).describe("Human-readable deal name."),
    value: z
      .number()
      .nonnegative()
      .optional()
      .describe("Optional deal value in workspace's default currency."),
    stage: z.string().optional().describe("Optional stage name. Defaults to the first stage."),
    probability: z
      .number()
      .min(0)
      .max(100)
      .optional()
      .describe("Optional win probability 0-100."),
    workspace_id: workspaceIdArg,
  }),
  returns: z.object({ ok: z.literal(true), deal: DealRecord }),
  emits: [],
};

export const updateDeal: ToolDefinition = {
  name: "update_deal",
  description:
    "Partial update. For stage-only moves prefer move_deal_stage (clearer intent). Emits deal.stage_changed if the stage field changes.",
  args: z.object({
    deal_id: dealIdArg,
    title: z.string().min(1).optional(),
    stage: z.string().optional(),
    value: z.number().nonnegative().optional(),
    probability: z.number().min(0).max(100).optional(),
    workspace_id: workspaceIdArg,
  }),
  returns: z.object({ ok: z.literal(true), deal: DealRecord }),
  emits: ["deal.stage_changed"],
};

export const moveDealStage: ToolDefinition = {
  name: "move_deal_stage",
  description:
    "Move a deal to a new stage. Same effect as dragging the card on the kanban. Always emits deal.stage_changed.",
  args: z.object({
    deal_id: dealIdArg,
    to_stage: z.string().min(1).describe("Destination stage name."),
    probability: z
      .number()
      .min(0)
      .max(100)
      .optional()
      .describe("Optional. Stage probability if the pipeline has one defined for this stage."),
    workspace_id: workspaceIdArg,
  }),
  returns: z.object({ ok: z.literal(true), deal: DealRecord }),
  emits: ["deal.stage_changed"],
};

export const deleteDeal: ToolDefinition = {
  name: "delete_deal",
  description: "Delete a deal. Irreversible.",
  args: z.object({
    deal_id: dealIdArg,
    workspace_id: workspaceIdArg,
  }),
  returns: z.object({ ok: z.literal(true), deleted: z.string().uuid() }),
  emits: [],
};

// ---------------------------------------------------------------------
// Activity tools (2)
// ---------------------------------------------------------------------

export const listActivities: ToolDefinition = {
  name: "list_activities",
  description:
    "List activity log entries (tasks, notes, email sent, booking created, etc.) across the workspace.",
  args: z.object({ workspace_id: workspaceIdArg }),
  returns: z.object({ ok: z.literal(true), activities: z.array(ActivityRecord) }),
  emits: [],
};

export const createActivity: ToolDefinition = {
  name: "create_activity",
  description:
    "Append an activity-log entry to a contact and/or deal. Use this instead of stuffing reminders into contacts.notes — notes gets overwritten on updates; activities are append-only. Either contact_id or deal_id is required; subject or body is required.",
  args: z
    .object({
      contact_id: z.string().uuid().optional(),
      deal_id: z.string().uuid().optional(),
      type: activityType,
      subject: z.string().max(200).optional(),
      body: z.string().max(4000).optional(),
      scheduled_at: z
        .string()
        .datetime()
        .optional()
        .describe("ISO timestamp if the activity is planned for a future time."),
      completed_at: z
        .string()
        .datetime()
        .optional()
        .describe("ISO timestamp if logging a completed past action."),
      metadata: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("Optional JSON metadata — e.g., { agentId: 'agt_...', confidence: 0.87 }."),
      workspace_id: workspaceIdArg,
    })
    .refine((v) => v.contact_id !== undefined || v.deal_id !== undefined, {
      message: "Either contact_id or deal_id is required",
    })
    .refine((v) => v.subject !== undefined || v.body !== undefined, {
      message: "Either subject or body is required",
    }),
  returns: z.object({ ok: z.literal(true), activity: ActivityRecord }),
  emits: [],
};

// ---------------------------------------------------------------------
// The ordered list of all CRM tools. Consumed by the emit step in C6.
// Order matches tools.js for byte-stable JSON-Schema emission.
// ---------------------------------------------------------------------

export const CRM_TOOLS: readonly ToolDefinition[] = [
  listContacts,
  getContact,
  createContact,
  updateContact,
  deleteContact,
  listDeals,
  getDeal,
  createDeal,
  updateDeal,
  moveDealStage,
  deleteDeal,
  listActivities,
  createActivity,
] as const;
