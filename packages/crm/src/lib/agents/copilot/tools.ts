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
import { saveThemeForOrg } from "@/lib/theme/save-theme";
import { isHexColor } from "@/lib/theme/normalize-theme";
import type { OrgTheme } from "@/lib/theme/types";
import { MODULE_IDS, MODULE_REGISTRY, type ModuleId } from "@/lib/workspace/modules";
import {
  setModuleEnabled as setModuleEnabledDefault,
  setPinned as setPinnedDefault,
} from "@/lib/workspace/surface";

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

// ─── update_theme ────────────────────────────────────────────────────────────
//
// Deterministic theme tool (hotfix H2). Colors/fonts/dark-mode/radius asks
// ("change accent color to powder blue") were previously routed through
// edit_site's freeform LLM section editor, which replies in prose for
// theme-shaped requests and trips r1-customize's invalid_payload path. This
// tool gives the copilot a structured, always-succeeds-or-tells-you-why path
// straight to the same write core the settings page uses
// (saveThemeForOrg, lib/theme/save-theme.ts — extracted from
// saveThemeSettingsAction, lib/theme/actions.ts:100).
//
// Only offers the exact enum values normalizeTheme() actually accepts
// (lib/theme/normalize-theme.ts) — anything else is silently coerced back to
// the current/default value by normalizeTheme, so the tool input must not
// promise a wider surface than that.
//
// SH2-F1 — until this fix, saveThemeForOrg's write was real but invisible:
// the R1 public site (SiteShell) never read organizations.theme at all, so a
// successful write here (and the LLM's resulting "Done!" read-back) was true
// about the DB and false about what the visitor actually saw. SiteShell now
// applies theme.accentColor/primaryColor once theme.customizedAt is stamped
// (which saveThemeForOrg does on every write, including this tool's), so the
// read-back is no longer a claim to soften — it's simply accurate.

const HEX_COLOR_DESCRIPTION =
  "Hex color, e.g. '#7fb3d5'. Convert color names (like 'powder blue') to hex yourself before calling this tool.";

const themeFontFamilyEnum = z.enum(["Inter", "DM Sans", "Playfair Display", "Space Grotesk", "Lora", "Outfit"]);
const themeModeEnum = z.enum(["light", "dark"]);
const themeBorderRadiusEnum = z.enum(["sharp", "rounded", "pill"]);

const updateThemeInput = z
  .object({
    accentColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "must be a hex color like #7fb3d5")
      .optional()
      .describe(HEX_COLOR_DESCRIPTION),
    primaryColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "must be a hex color like #7fb3d5")
      .optional()
      .describe(HEX_COLOR_DESCRIPTION),
    fontFamily: themeFontFamilyEnum.optional(),
    mode: themeModeEnum.optional(),
    borderRadius: themeBorderRadiusEnum.optional(),
  })
  .refine(
    (value) =>
      value.accentColor !== undefined ||
      value.primaryColor !== undefined ||
      value.fontFamily !== undefined ||
      value.mode !== undefined ||
      value.borderRadius !== undefined,
    { message: "At least one theme field must be provided." },
  );

/** Injectable seam for update_theme's execute (mirrors the DI pattern used by
 *  bookAppointment / lookUpAvailability in lib/agents/tools.ts): this repo
 *  prefers dependency injection over node:test mock.module / vi.mock because
 *  tsx's CJS interop makes module mocking unreliable (see
 *  agents/voice/realtime-tools.ts's PATTERN NOTE). Defaults to the real
 *  saveThemeForOrg so production callers are unaffected. */
export type UpdateThemeDeps = {
  saveThemeForOrg: (orgId: string, patch: Partial<OrgTheme>) => Promise<OrgTheme>;
};

const updateTheme: AgentTool<z.infer<typeof updateThemeInput>> & {
  execute: (
    input: z.infer<typeof updateThemeInput>,
    ctx: ToolExecuteContext,
    deps?: UpdateThemeDeps,
  ) => ReturnType<AgentTool<z.infer<typeof updateThemeInput>>["execute"]>;
} = {
  name: "update_theme",
  description:
    "Set the workspace's brand theme: primary/accent color (hex), font family, light/dark mode, or border radius. Use THIS tool for any visual-style ask (colors, fonts, dark mode, corner roundness) — use edit_site only for content, copy, or section layout changes.",
  inputSchema: updateThemeInput,
  jsonSchema: {
    type: "object",
    properties: {
      accentColor: { type: "string", pattern: "^#[0-9a-fA-F]{6}$", description: HEX_COLOR_DESCRIPTION },
      primaryColor: { type: "string", pattern: "^#[0-9a-fA-F]{6}$", description: HEX_COLOR_DESCRIPTION },
      fontFamily: { type: "string", enum: themeFontFamilyEnum.options, description: "Brand font family." },
      mode: { type: "string", enum: themeModeEnum.options, description: "Light or dark mode for public pages." },
      borderRadius: {
        type: "string",
        enum: themeBorderRadiusEnum.options,
        description: "Corner roundness for buttons/cards.",
      },
    },
    required: [],
  },
  execute: (
    input,
    ctx: ToolExecuteContext,
    deps: UpdateThemeDeps = { saveThemeForOrg },
  ) =>
    safe(async () => {
      const patch: Partial<OrgTheme> = {};
      if (input.accentColor !== undefined) {
        if (!isHexColor(input.accentColor)) {
          return { ok: false as const, error: "accentColor must be a hex color like #7fb3d5" };
        }
        patch.accentColor = input.accentColor;
      }
      if (input.primaryColor !== undefined) {
        if (!isHexColor(input.primaryColor)) {
          return { ok: false as const, error: "primaryColor must be a hex color like #7fb3d5" };
        }
        patch.primaryColor = input.primaryColor;
      }
      if (input.fontFamily !== undefined) patch.fontFamily = input.fontFamily;
      if (input.mode !== undefined) patch.mode = input.mode;
      if (input.borderRadius !== undefined) patch.borderRadius = input.borderRadius;

      // ctx.orgId is the ONLY source of the org to write — input is a zod-parsed
      // model-args object that has no orgId-shaped field in its schema at all, so
      // even a malicious/hallucinated arg object can't redirect the write.
      const theme = await deps.saveThemeForOrg(ctx.orgId, patch);

      logEvent("theme_update", { fields: Object.keys(patch), via: "copilot" }, { orgId: ctx.orgId });

      return { ok: true as const, theme };
    }),
};

// ─── enable_module / disable_module / pin_card ──────────────────────────────
//
// Simple-home wave (Task 8). Feature on/off and pinning go through the same
// surface helpers the /settings/features page uses
// (lib/workspace/surface.ts's setModuleEnabled/setPinned) — no new business
// logic here, just thin zod-validated tool wrappers with a plain-language
// read-back composed from MODULE_REGISTRY (never-lies: on a guard rejection,
// the reason returned by setModuleEnabled is surfaced verbatim, never
// reworded or softened).

/** Injectable seam for enable_module/disable_module/pin_card's execute
 *  (mirrors UpdateThemeDeps above): this repo prefers DI over node:test
 *  mock.module / vi.mock because tsx's CJS interop makes module mocking
 *  unreliable. Defaults to the real surface.ts helpers so production
 *  callers are unaffected. */
export type ModuleToolsDeps = {
  setModuleEnabled: typeof setModuleEnabledDefault;
  setPinned: typeof setPinnedDefault;
};

const defaultModuleToolsDeps: ModuleToolsDeps = {
  setModuleEnabled: setModuleEnabledDefault,
  setPinned: setPinnedDefault,
};

function moduleLabel(moduleId: ModuleId): string {
  return MODULE_REGISTRY.find((m) => m.id === moduleId)?.label ?? moduleId;
}

function moduleDescription(moduleId: ModuleId): string {
  return MODULE_REGISTRY.find((m) => m.id === moduleId)?.description ?? "";
}

const moduleIdEnum = z.enum(MODULE_IDS as [ModuleId, ...ModuleId[]]);

const enableModuleInput = z.object({
  module: moduleIdEnum,
});

const enableModule: AgentTool<z.infer<typeof enableModuleInput>> & {
  execute: (
    input: z.infer<typeof enableModuleInput>,
    ctx: ToolExecuteContext,
    deps?: ModuleToolsDeps,
  ) => ReturnType<AgentTool<z.infer<typeof enableModuleInput>>["execute"]>;
} = {
  name: "enable_module",
  description:
    "Turn a feature on and add it back to the workspace's sidebar. Use when the user asks to turn a feature on, add invoicing, start texting customers, or otherwise show something in the menu that's currently hidden.",
  inputSchema: enableModuleInput,
  jsonSchema: {
    type: "object",
    properties: {
      module: {
        type: "string",
        enum: MODULE_IDS as unknown as string[],
        description: "The module id to enable (e.g. 'money', 'messaging', 'agents').",
      },
    },
    required: ["module"],
  },
  execute: (
    input,
    ctx: ToolExecuteContext,
    deps: ModuleToolsDeps = defaultModuleToolsDeps,
  ) =>
    safe(async () => {
      // ctx.orgId is the ONLY source of the org to write — input is a
      // zod-parsed model-args object with no orgId-shaped field in its
      // schema at all, so even a malicious/hallucinated arg object can't
      // redirect the write.
      const result = await deps.setModuleEnabled(ctx.orgId, input.module, true);

      logEvent(
        "module_enable",
        { module: input.module, ok: result.ok, via: "copilot" },
        { orgId: ctx.orgId },
      );

      if (!result.ok) {
        return { ok: false as const, message: result.reason };
      }

      return {
        ok: true as const,
        modules: result.modules,
        message: `${moduleLabel(input.module)} is now in your sidebar — ${moduleDescription(input.module).toLowerCase()}.`,
      };
    }),
};

// ─── disable_module ──────────────────────────────────────────────────────────

const disableModuleInput = z.object({
  module: moduleIdEnum,
});

const disableModule: AgentTool<z.infer<typeof disableModuleInput>> & {
  execute: (
    input: z.infer<typeof disableModuleInput>,
    ctx: ToolExecuteContext,
    deps?: ModuleToolsDeps,
  ) => ReturnType<AgentTool<z.infer<typeof disableModuleInput>>["execute"]>;
} = {
  name: "disable_module",
  description:
    "Turn a feature off and hide it from the workspace's sidebar. Nothing is deleted — it can be turned back on any time. Use when the user asks to turn a feature off, hide something from the menu, or simplify their sidebar. Some features (Money with an active subscription, AI staff with a deployed agent, Home) cannot be hidden — the tool will say why.",
  inputSchema: disableModuleInput,
  jsonSchema: {
    type: "object",
    properties: {
      module: {
        type: "string",
        enum: MODULE_IDS as unknown as string[],
        description: "The module id to disable (e.g. 'money', 'messaging', 'agents').",
      },
    },
    required: ["module"],
  },
  execute: (
    input,
    ctx: ToolExecuteContext,
    deps: ModuleToolsDeps = defaultModuleToolsDeps,
  ) =>
    safe(async () => {
      const result = await deps.setModuleEnabled(ctx.orgId, input.module, false);

      logEvent(
        "module_disable",
        { module: input.module, ok: result.ok, via: "copilot" },
        { orgId: ctx.orgId },
      );

      if (!result.ok) {
        // Never-lies: surface the guard's reason verbatim, never reworded.
        return { ok: false as const, message: result.reason };
      }

      return {
        ok: true as const,
        modules: result.modules,
        message: `${moduleLabel(input.module)} is now hidden from your sidebar. Nothing was deleted — turn it back on any time.`,
      };
    }),
};

// ─── pin_card ────────────────────────────────────────────────────────────────

const pinCardInput = z.object({
  modules: z.array(moduleIdEnum).min(1).max(4),
});

const pinCard: AgentTool<z.infer<typeof pinCardInput>> & {
  execute: (
    input: z.infer<typeof pinCardInput>,
    ctx: ToolExecuteContext,
    deps?: ModuleToolsDeps,
  ) => ReturnType<AgentTool<z.infer<typeof pinCardInput>>["execute"]>;
} = {
  name: "pin_card",
  description:
    "Set which features (up to 4) should lead the workspace's Home page, in order. Use when the user expresses an ordering preference for their Home page, e.g. 'put Bookings first' or 'I want Money and Customers at the top'.",
  inputSchema: pinCardInput,
  jsonSchema: {
    type: "object",
    properties: {
      modules: {
        type: "array",
        items: { type: "string", enum: MODULE_IDS as unknown as string[] },
        minItems: 1,
        maxItems: 4,
        description: "Module ids in the order they should lead Home, e.g. ['bookings','money'].",
      },
    },
    required: ["modules"],
  },
  execute: (
    input,
    ctx: ToolExecuteContext,
    deps: ModuleToolsDeps = defaultModuleToolsDeps,
  ) =>
    safe(async () => {
      // ctx.orgId is the ONLY source of the org to write — same rule as
      // enable_module/disable_module above.
      await deps.setPinned(ctx.orgId, input.modules);

      logEvent(
        "module_pin",
        { modules: input.modules, via: "copilot" },
        { orgId: ctx.orgId },
      );

      return {
        ok: true as const,
        pinned: input.modules,
        message: "Saved — pinned sections will lead your Home page.",
      };
    }),
};

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
    updateTheme as AgentTool,
    enableModule as AgentTool,
    disableModule as AgentTool,
    pinCard as AgentTool,
  ];
}
