// SeldonChat operator-copilot toolset (win-ladder P0, Task 1).
//
// Thin zod wrappers over the already-shipped admin action layer — no new
// business logic, no new DB writes beyond what those functions already do.
// Every tool is workspace-scoped via ctx.orgId (never trusts an LLM-supplied
// workspace id) and NEVER throws: execute() bodies are wrapped in try/catch
// and return `{ ok: false, error }` on any failure so a bad tool call can
// never crash the copilot's turn.

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { landingPages, organizations } from "@/db/schema";
import type { AgentTool, ToolExecuteContext } from "@/lib/agents/tools";
import { loadBlueprintOrFallback, renderBlueprint } from "@/lib/blueprint/persist";
import { mutateSectionField } from "@/lib/blueprint/mutate";
import { VALID_SECTION_TYPES } from "@/lib/blueprint/section-types";
import type { LandingSection } from "@/lib/blueprint/types";
import { logEvent } from "@/lib/observability/log";
import {
  getLandingStructureForWorkspace,
  moveSectionForWorkspace,
  deleteSectionForWorkspace,
} from "@/lib/page-blocks/landing-structure";
import { addIntakeFieldForWorkspace } from "@/lib/page-blocks/intake-structure";
import {
  customizeLandingR1,
  listLandingVersions,
  revertLandingR1,
} from "@/lib/landing/r1-customize";

export const COPILOT_CAPABILITY = "workspace_copilot";

const LANDING_SLUG = "home";

/** Wrap an execute body so a tool NEVER throws — the copilot's turn always
 *  gets a structured result, never an unhandled rejection. */
async function safe<T>(fn: () => Promise<T>): Promise<T | { ok: false; error: string }> {
  try {
    return await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

// ─── get_site_structure ─────────────────────────────────────────────────────

const getSiteStructureInput = z.object({});

const getSiteStructure: AgentTool<z.infer<typeof getSiteStructureInput>> = {
  name: "get_site_structure",
  description:
    "Read the workspace's landing page section list (index, type, preview) plus its slug and public URL. Call this first before any section edit so you know the current layout and indices.",
  inputSchema: getSiteStructureInput,
  jsonSchema: {
    type: "object",
    properties: {},
    required: [],
  },
  execute: (_input, ctx: ToolExecuteContext) =>
    safe(() => getLandingStructureForWorkspace(ctx.orgId)),
};

// ─── edit_site ───────────────────────────────────────────────────────────────

const editSiteInput = z.object({
  instruction: z.string().min(1, "instruction is required"),
});

const editSite: AgentTool<z.infer<typeof editSiteInput>> = {
  name: "edit_site",
  description:
    "Apply a natural-language edit instruction to the workspace's landing page (e.g. 'make the hero headline punchier', 'add a testimonial from Jane'). Uses the platform's Anthropic key. Returns { ok, summary, versionId }.",
  inputSchema: editSiteInput,
  jsonSchema: {
    type: "object",
    properties: {
      instruction: {
        type: "string",
        description: "Plain-English description of the change to make.",
      },
    },
    required: ["instruction"],
  },
  execute: (input, ctx: ToolExecuteContext) =>
    safe(() =>
      customizeLandingR1({
        workspaceId: ctx.orgId,
        instruction: input.instruction,
        userId: `copilot:${ctx.orgId}`,
        byokKey: process.env.ANTHROPIC_API_KEY ?? "",
      }),
    ),
};

// ─── update_section_field ───────────────────────────────────────────────────

const updateSectionFieldInput = z.object({
  section: z.enum(VALID_SECTION_TYPES as [string, ...string[]]),
  field: z.string().min(1, "field is required"),
  value: z.unknown(),
});

async function updateSectionFieldForWorkspace(
  workspaceId: string,
  sectionType: LandingSection["type"],
  field: string,
  value: unknown,
) {
  const [org] = await db
    .select({ slug: organizations.slug, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, workspaceId))
    .limit(1);
  if (!org) {
    return { ok: false as const, error: "workspace_not_found" };
  }

  const [existing] = await db
    .select({
      id: landingPages.id,
      title: landingPages.title,
      settings: landingPages.settings,
      blueprintJson: landingPages.blueprintJson,
    })
    .from(landingPages)
    .where(and(eq(landingPages.orgId, workspaceId), eq(landingPages.slug, LANDING_SLUG)))
    .limit(1);
  if (!existing) {
    return { ok: false as const, error: "workspace_landing_missing" };
  }

  const fallbackIndustry =
    typeof (existing.settings as Record<string, unknown>)?.industry === "string"
      ? ((existing.settings as Record<string, unknown>).industry as string)
      : null;

  const startingBlueprint = loadBlueprintOrFallback(
    { blueprintJson: existing.blueprintJson },
    existing.title ?? org.name,
    fallbackIndustry,
  );

  const mutated = mutateSectionField(startingBlueprint, sectionType, field, value);
  const rendered = renderBlueprint(mutated);

  const nextSettings = {
    ...((existing.settings ?? {}) as Record<string, unknown>),
    blueprintRenderer: "general-service-v1",
    industry: fallbackIndustry,
  };

  await db
    .update(landingPages)
    .set({
      contentHtml: rendered.contentHtml,
      contentCss: rendered.contentCss,
      blueprintJson: mutated as unknown as Record<string, unknown>,
      settings: nextSettings,
      updatedAt: new Date(),
    })
    .where(eq(landingPages.id, existing.id));

  logEvent(
    "landing_section_update",
    { section: sectionType, field, value_type: typeof value, via: "copilot" },
    { orgId: workspaceId },
  );

  return {
    ok: true as const,
    workspace_id: workspaceId,
    slug: LANDING_SLUG,
    applied: { section: sectionType, field, value },
  };
}

const updateSectionField: AgentTool<z.infer<typeof updateSectionFieldInput>> = {
  name: "update_section_field",
  description:
    "Set a single field on a landing-page section by dot-path (e.g. section='hero', field='headline', value='Same-day HVAC repair'). The escape hatch for edits edit_site can't target precisely.",
  inputSchema: updateSectionFieldInput,
  jsonSchema: {
    type: "object",
    properties: {
      section: {
        type: "string",
        enum: VALID_SECTION_TYPES,
        description: "Section type to mutate.",
      },
      field: {
        type: "string",
        description: "Dot-segmented field path, e.g. 'headline' or 'items.0.title'.",
      },
      value: {
        description: "New value for the field (any JSON type; null clears an optional field).",
      },
    },
    required: ["section", "field", "value"],
  },
  execute: (input, ctx: ToolExecuteContext) =>
    safe(() =>
      updateSectionFieldForWorkspace(
        ctx.orgId,
        input.section as LandingSection["type"],
        input.field,
        input.value,
      ),
    ),
};

// ─── move_section ───────────────────────────────────────────────────────────

const moveSectionInput = z.object({
  fromIndex: z.number().int().min(0),
  toIndex: z.number().int().min(0),
});

const moveSection: AgentTool<z.infer<typeof moveSectionInput>> = {
  name: "move_section",
  description: "Reorder a landing-page section from one index to another.",
  inputSchema: moveSectionInput,
  jsonSchema: {
    type: "object",
    properties: {
      fromIndex: { type: "integer", description: "Current index of the section to move." },
      toIndex: { type: "integer", description: "Destination index." },
    },
    required: ["fromIndex", "toIndex"],
  },
  execute: (input, ctx: ToolExecuteContext) =>
    safe(() => moveSectionForWorkspace(ctx.orgId, input.fromIndex, input.toIndex)),
};

// ─── delete_section ──────────────────────────────────────────────────────────

const deleteSectionInput = z.object({
  index: z.number().int().min(0),
  confirm: z.literal(true),
});

const deleteSection: AgentTool<z.infer<typeof deleteSectionInput>> = {
  name: "delete_section",
  description:
    "Delete a landing-page section by index. Destructive — requires confirm:true. Always call get_site_structure first and confirm the index with the operator before calling this.",
  inputSchema: deleteSectionInput,
  jsonSchema: {
    type: "object",
    properties: {
      index: { type: "integer", description: "Index of the section to delete." },
      confirm: {
        type: "boolean",
        const: true,
        description: "Must be true. The operator must have explicitly confirmed the deletion.",
      },
    },
    required: ["index", "confirm"],
  },
  execute: (input, ctx: ToolExecuteContext) =>
    safe(() => deleteSectionForWorkspace(ctx.orgId, input.index)),
};

// ─── add_intake_field ────────────────────────────────────────────────────────

const intakeFieldTypeEnum = z.enum([
  "text",
  "textarea",
  "email",
  "phone",
  "number",
  "select",
  "multi-select",
  "rating",
  "date",
  "file",
]);

const addIntakeFieldInput = z.object({
  id: z.string().min(1),
  type: intakeFieldTypeEnum,
  label: z.string().min(1),
  helper: z.string().optional(),
  required: z.boolean().optional(),
  options: z.array(z.string()).optional(),
  position: z.number().int().min(0).optional(),
});

const addIntakeField: AgentTool<z.infer<typeof addIntakeFieldInput>> = {
  name: "add_intake_field",
  description: "Add a new question to the workspace's intake form, optionally at a given position.",
  inputSchema: addIntakeFieldInput,
  jsonSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Unique id for the new field." },
      type: {
        type: "string",
        enum: intakeFieldTypeEnum.options,
        description: "Field input type.",
      },
      label: { type: "string", description: "Question label shown to the visitor." },
      helper: { type: "string", description: "Optional helper text." },
      required: { type: "boolean", description: "Whether the field is required." },
      options: {
        type: "array",
        items: { type: "string" },
        description: "Choices for select/multi-select fields.",
      },
      position: { type: "integer", description: "Optional insertion index." },
    },
    required: ["id", "type", "label"],
  },
  execute: (input, ctx: ToolExecuteContext) =>
    safe(() =>
      addIntakeFieldForWorkspace(
        ctx.orgId,
        {
          id: input.id,
          type: input.type,
          label: input.label,
          helper: input.helper,
          required: input.required,
          options: input.options,
        },
        input.position,
      ),
    ),
};

// ─── list_versions ───────────────────────────────────────────────────────────

const listVersionsInput = z.object({
  limit: z.number().int().min(1).max(100).optional(),
});

const listVersions: AgentTool<z.infer<typeof listVersionsInput>> = {
  name: "list_versions",
  description: "List recent landing-page edit versions (newest first) for this workspace, for review or undo.",
  inputSchema: listVersionsInput,
  jsonSchema: {
    type: "object",
    properties: {
      limit: { type: "integer", description: "Max versions to return (default 20)." },
    },
    required: [],
  },
  execute: (input, ctx: ToolExecuteContext) =>
    safe(async () => {
      const versions = await listLandingVersions(ctx.orgId, input.limit ?? 20);
      return { ok: true as const, versions };
    }),
};

// ─── undo_last_change ────────────────────────────────────────────────────────

const undoLastChangeInput = z.object({});

const undoLastChange: AgentTool<z.infer<typeof undoLastChangeInput>> = {
  name: "undo_last_change",
  description: "Revert the workspace's landing page to the version BEFORE the most recent edit.",
  inputSchema: undoLastChangeInput,
  jsonSchema: {
    type: "object",
    properties: {},
    required: [],
  },
  execute: (_input, ctx: ToolExecuteContext) =>
    safe(async () => {
      const versions = await listLandingVersions(ctx.orgId, 2);
      if (versions.length < 2) {
        return { ok: false as const, error: "nothing to undo" };
      }
      return revertLandingR1({
        workspaceId: ctx.orgId,
        versionId: versions[1].id,
        userId: `copilot:${ctx.orgId}`,
      });
    }),
};

// ─── update_theme (referenced by later tasks; kept for parity with the admin
//     action layer's field set — mirrors saveThemeSettingsAction, lib/theme/actions.ts:100)

// Note: update_theme is intentionally NOT part of the 8-tool copilot surface
// per the Task 1 brief (get_site_structure, edit_site, update_section_field,
// move_section, delete_section, add_intake_field, list_versions,
// undo_last_change). Left undeclared here; a later task may add it.

export function buildCopilotTools(): AgentTool[] {
  return [
    getSiteStructure as AgentTool,
    editSite as AgentTool,
    updateSectionField as AgentTool,
    moveSection as AgentTool,
    deleteSection as AgentTool,
    addIntakeField as AgentTool,
    listVersions as AgentTool,
    undoLastChange as AgentTool,
  ];
}
