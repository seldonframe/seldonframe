// Formbricks Intake block — tool schemas (Scope 3 Step 2b.2 block 5).
//
// Zod-authored schemas for the 7 Intake MCP tools. Source of truth
// for the tool surface; the emit step renders JSON Schema into
// formbricks-intake.block.md on next `pnpm emit:blocks`.
//
// 7 tools total (matches skills/mcp-server/src/tools.js lines 1115-1275):
//   Forms (5):       list_forms, get_form, create_form, update_form,
//                    delete_form
//   Submissions (1): list_submissions
//   Deprecated (1):  customize_intake_form (alias for
//                    update_form({form: 'intake', fields}))
//
// Return-shape note — DIFFERENT FROM OTHER BLOCKS:
//
// Unlike CRM / Booking / Email / SMS / Payments (which return
// `{data: {...}}` and the validator unwraps `data` for capture
// binding), Intake's runtime tools return `{ok: true, forms: [...]}`
// / `{ok: true, form: {...}}` / `{ok: true, submissions: [...]}` /
// `{ok: true, deleted: string}`. No `data` wrapper.
//
// The validator's capture-unwrap heuristic (types.ts:35) is: "if
// returns has a `data` key, bind to data; otherwise bind to full
// returns." So if an archetype ever captures from list_forms, it
// would address `{{forms.forms}}` — NOT `{{forms.data.forms}}`.
// The Zod schemas below preserve this shape exactly. If we
// accidentally wrapped these in `{data: ...}` to match the other
// blocks, we would silently break capture threading for any future
// intake-composed archetype.
//
// Archetype coverage (2026-04-22):
// None of the 3 shipped archetypes (Speed-to-Lead, Win-Back,
// Review-Requester) directly CALL any intake tool in their
// synthesized output. Speed-to-Lead TRIGGERS on form.submitted
// (intake's produces) with a filter.formId, and the archetype
// template declares `valuesFromTool: "list_forms"` — but the UI
// surfaces that at build-time, not synthesis-time. So the 9-probe
// regression on Intake is a "trigger-resolution + hash-preservation"
// check, not a direct tool-call validation. The Payments-style
// 'stub → real' pivot doesn't apply here; there was no intake
// stub in validator.spec.ts to replace.
//
// Containment (per Payments-migration precedent):
// Formbricks-specific complexity (question types, logic operators,
// webhooks, ActionClasses, display options) does NOT leak into
// lib/agents/types.ts. The full Formbricks entity zoo is documented
// in formbricks-intake.block.md for agent synthesis reference and
// lives in the runtime API — these tool schemas expose the simple
// SMB-facing form primitive (name / slug / fields / is_active)
// because that's the surface MCP agents touch. ConversationExit /
// Predicate / ExtractField / Step remain unchanged through 5 v2
// migrations.

import { z } from "zod";

import type { ToolDefinition } from "../lib/blocks/contract-v2";

// ---------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------

const workspaceIdArg = z
  .string()
  .uuid()
  .optional()
  .describe("Optional. Falls back to the active workspace.");

const formFieldType = z.enum(["text", "email", "tel", "textarea", "select"]);

const formTemplateId = z.enum([
  "blank",
  "contact",
  "lead-qualification",
  "booking-request",
  "nps-feedback",
  "event-registration",
]);

// Form identifier — accepts either a UUID or a slug string. Several
// tools take the same shape (get_form / update_form / delete_form).
// Keeping the rule explicit here vs z.string() means the JSON-Schema
// emit documents the union.
const formIdOrSlug = z
  .string()
  .min(1)
  .describe("Form id (uuid) or slug (e.g., 'contact', 'intake').");

// ---------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------

const FormField = z.object({
  key: z.string().describe("Stable field key (used as the keys in Submission.data)."),
  label: z.string().describe("Display label shown on the rendered form."),
  type: formFieldType,
  required: z.boolean(),
  options: z
    .array(z.string())
    .optional()
    .describe("Only meaningful for type='select'. Each entry is a selectable value."),
});

const FormRecord = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  fields: z.array(FormField),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const SubmissionRecord = z.object({
  id: z.string().uuid(),
  formId: z.string().uuid(),
  contactId: z.string().uuid().nullable(),
  data: z.record(z.string(), z.unknown()).describe("Map of FormField.key → submitted value."),
  createdAt: z.string().datetime(),
});

// ---------------------------------------------------------------------
// Forms (5)
// ---------------------------------------------------------------------

export const listForms: ToolDefinition = {
  name: "list_forms",
  description: "List intake forms in the workspace.",
  args: z.object({
    workspace_id: workspaceIdArg,
  }),
  // NOTE: top-level `forms` (not `data.forms`) — matches runtime
  // handler at skills/mcp-server/src/tools.js:1124.
  returns: z.object({
    ok: z.literal(true),
    forms: z.array(FormRecord),
  }),
  emits: [],
};

export const getForm: ToolDefinition = {
  name: "get_form",
  description: "Fetch one form by id or slug.",
  args: z.object({
    form: formIdOrSlug,
    workspace_id: workspaceIdArg,
  }),
  returns: z.object({
    ok: z.literal(true),
    form: FormRecord.nullable(),
  }),
  emits: [],
};

export const createForm: ToolDefinition = {
  name: "create_form",
  description:
    "Create a new intake form. Pass template_id to pre-fill fields from a built-in template (contact, lead-qualification, booking-request, nps-feedback, event-registration, blank), or pass explicit fields to define the shape from scratch.",
  args: z.object({
    template_id: formTemplateId.optional().describe("Optional. Pre-fills fields from a built-in template."),
    name: z.string().optional().describe("Optional. Falls back to template name or 'New intake form'."),
    slug: z.string().optional().describe("Optional URL-safe slug. Falls back to template defaultSlug or slugified name."),
    fields: z
      .array(FormField)
      .optional()
      .describe("Optional field list. Overrides template fields when both are provided."),
    is_active: z.boolean().optional().describe("Optional. Defaults to true."),
    workspace_id: workspaceIdArg,
  }),
  returns: z.object({
    ok: z.literal(true),
    form: FormRecord,
  }),
  // No event at create time. form.submitted fires at submission
  // time via the public form endpoint, not any MCP tool call.
  emits: [],
};

export const updateForm: ToolDefinition = {
  name: "update_form",
  description:
    "Update a form. Partial — omit fields to keep them. Replacing `fields` replaces the whole array.",
  args: z.object({
    form: formIdOrSlug,
    name: z.string().optional().describe("Optional new name."),
    slug: z.string().optional().describe("Optional new slug (URL-safe)."),
    fields: z.array(FormField).optional().describe("Optional new field array. Whole replacement."),
    is_active: z.boolean().optional().describe("Optional. Toggle publish state."),
    workspace_id: workspaceIdArg,
  }),
  returns: z.object({
    ok: z.literal(true),
    form: FormRecord,
  }),
  emits: [],
};

export const deleteForm: ToolDefinition = {
  name: "delete_form",
  description:
    "Delete a form. Irreversible. Submissions are NOT deleted (form_submissions has ON DELETE SET NULL on form_id).",
  args: z.object({
    form: formIdOrSlug,
    workspace_id: workspaceIdArg,
  }),
  returns: z.object({
    ok: z.literal(true),
    deleted: z.string().describe("Echoes the input `form` identifier."),
  }),
  emits: [],
};

// ---------------------------------------------------------------------
// Submissions (1)
// ---------------------------------------------------------------------

export const listSubmissions: ToolDefinition = {
  name: "list_submissions",
  description:
    "List submissions for a form. Slug lookup is NOT supported on this endpoint — pass the form's UUID. Call get_form first if you only have a slug.",
  args: z.object({
    form_id: z.string().uuid().describe("UUID of the form."),
    workspace_id: workspaceIdArg,
  }),
  returns: z.object({
    ok: z.literal(true),
    submissions: z.array(SubmissionRecord),
  }),
  emits: [],
};

// ---------------------------------------------------------------------
// Deprecated alias (1)
// ---------------------------------------------------------------------

export const customizeIntakeForm: ToolDefinition = {
  name: "customize_intake_form",
  description:
    "DEPRECATED alias for update_form({form: 'intake', fields}). Only edits the auto-seeded default form; prefer update_form for new scripts so you can target any form in the workspace.",
  args: z.object({
    fields: z.array(FormField).optional().describe("Replacement field list for the default 'intake' form."),
    form_name: z.string().optional().describe("Optional new display name for the default form."),
    workspace_id: workspaceIdArg,
  }),
  returns: z.object({
    ok: z.literal(true),
    form: FormRecord,
  }),
  emits: [],
};

// ---------------------------------------------------------------------
// Exported tuple — order matches tools.js for byte-stable emission.
// ---------------------------------------------------------------------

export const INTAKE_TOOLS: readonly ToolDefinition[] = [
  listForms,
  getForm,
  createForm,
  updateForm,
  deleteForm,
  listSubmissions,
  customizeIntakeForm,
] as const;
