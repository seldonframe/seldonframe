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
import {
  LANDING_TEMPLATES,
  isLandingTemplateId,
  type LandingTemplateId,
} from "@/components/landing-templates/registry";
import { DESIGNS as DESIGN_PICKER_ENTRIES } from "@/components/clients/design-picker/data";
import { isHealthVertical } from "@/lib/landing/template-selection";
import {
  setLandingTemplateForOrg as setLandingTemplateForOrgDefault,
  type SetLandingTemplateResult,
} from "@/lib/landing/set-landing-template-for-org";
import {
  ARCHETYPES,
  classifyArchetype,
  type AestheticArchetypeId,
} from "@/lib/workspace/aesthetic-archetypes";
import {
  setArchetypeForOrg as setArchetypeForOrgDefault,
  type SetExplicitArchetypeResult,
} from "@/lib/workspace/apply-archetype-theme";
import {
  searchStockPhotos as searchStockPhotosDefault,
  type StockPhoto,
} from "@/lib/media/stock-search";
import {
  resolveExternalMedia as resolveExternalMediaDefault,
  type MediaKind,
  type ResolveMediaResult,
} from "@/lib/media/resolve-url";
import {
  setR1Media as setR1MediaDefault,
  clearR1Media as clearR1MediaDefault,
  type SetR1MediaInput,
  type SetR1MediaResult,
} from "@/lib/landing/set-r1-media";

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
    "Set the workspace's brand theme: primary/accent color (hex), font family, light/dark mode, or border radius. The site's main/dominant brand color is primaryColor; highlight/secondary accents are accentColor — when the user says 'the main color' or names the dominant site color, use primaryColor. Use THIS tool for any visual-style ask (colors, fonts, dark mode, corner roundness) — use edit_site only for content, copy, or section layout changes.",
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

// ─── list_designs / update_design ───────────────────────────────────────────
//
// Universal design-switch tool (win-ladder follow-on). update_theme (above)
// covers COLORS/FONTS/MODE/RADIUS — this covers the whole-site DESIGN SKIN:
//   1. Premium named landing templates (health/wellness only) — the 5
//      Claude-Design full-page templates in
//      components/landing-templates/registry.ts, switched today via
//      setLandingTemplateAction (ready/actions.ts:138). Factored the
//      org-id-scoped write into lib/landing/set-landing-template-for-org.ts
//      (setLandingTemplateForOrg) so both that server action AND this tool
//      call the same core.
//   2. Aesthetic archetypes (all verticals, 8 skins) — lib/workspace/
//      aesthetic-archetypes.ts's ARCHETYPES. classifyArchetype already
//      picks one from soul at creation time; setArchetypeForOrg
//      (lib/workspace/apply-archetype-theme.ts, added alongside this tool)
//      is the new explicit-choice write core an operator's natural-language
//      request drives.
//
// Both writes are content-safe theme swaps — no regeneration, no LLM call,
// no touching landing-page content/blueprints. Health/wellness orgs get
// premium template ids + "auto" + all 8 archetype keys; every other
// vertical gets the 8 archetype keys only (+"auto" meaning best-fit
// archetype, resolved via classifyArchetype from soul). Asking a
// non-health org for a premium named template is never a silent no-op —
// list_designs/update_design both say plainly that premium templates are
// health/wellness-only today and offer the archetype options that DO fit.

const ARCHETYPE_IDS = Object.keys(ARCHETYPES) as AestheticArchetypeId[];

function archetypeLabel(id: AestheticArchetypeId): string {
  return ARCHETYPES[id]?.label ?? id;
}

function templateLabel(id: LandingTemplateId): string {
  return DESIGN_PICKER_ENTRIES.find((d) => d.id === id)?.name ?? id;
}

/** Injectable seam for list_designs/update_design's execute (mirrors
 *  UpdateThemeDeps/ModuleToolsDeps above) — DI over module mocking per this
 *  repo's convention. Defaults to the real write cores so production
 *  callers are unaffected. */
export type DesignToolsDeps = {
  setLandingTemplateForOrg: (orgId: string, choice: string) => Promise<SetLandingTemplateResult>;
  setArchetypeForOrg: (
    orgId: string,
    archetypeId: AestheticArchetypeId,
  ) => Promise<SetExplicitArchetypeResult>;
  /** Resolve the org's vertical string (soul.industry / personality_vertical /
   *  settings.crmPersonality.vertical, most-specific first) — used to decide
   *  whether premium named templates are offered. Injectable so this tool's
   *  option-computation is unit-testable without a DB (this repo's DI
   *  convention — see UpdateThemeDeps/ModuleToolsDeps above). */
  resolveOrgVertical: (orgId: string) => Promise<string>;
};

/** Real DB-backed vertical resolver — same soul.industry / settings.
 *  crmPersonality.vertical fallback pattern applyArchetypeThemeToOrg uses. */
async function resolveOrgVerticalFromDb(orgId: string): Promise<string> {
  const [org] = await db
    .select({ soul: organizations.soul, settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!org) return "";

  const soulRecord = (org.soul as unknown as Record<string, unknown> | null) ?? null;
  const settingsRecord = (org.settings ?? null) as Record<string, unknown> | null;
  const crmPersonality = settingsRecord?.crmPersonality as { vertical?: string } | undefined;

  // soul.industry is the field setLandingTemplateAction reads; soul's
  // snake_case personality_vertical / settings.crmPersonality.vertical are
  // the fallbacks apply-archetype-theme.ts reads for the archetype
  // classifier. Try all three, most-specific first.
  return (
    (soulRecord?.industry as string | undefined) ??
    (soulRecord?.personality_vertical as string | undefined) ??
    crmPersonality?.vertical ??
    ""
  ).toString();
}

const defaultDesignToolsDeps: DesignToolsDeps = {
  setLandingTemplateForOrg: setLandingTemplateForOrgDefault,
  setArchetypeForOrg: setArchetypeForOrgDefault,
  resolveOrgVertical: resolveOrgVerticalFromDb,
};

/** The full set of design ids valid for this org, split by kind, plus a
 *  flag for whether premium named templates are offered at all. */
async function computeDesignOptions(
  orgId: string,
  resolveOrgVertical: DesignToolsDeps["resolveOrgVertical"],
): Promise<{
  isHealth: boolean;
  vertical: string;
  templateIds: LandingTemplateId[];
  archetypeIds: AestheticArchetypeId[];
}> {
  const vertical = await resolveOrgVertical(orgId);
  const isHealth = isHealthVertical(vertical);
  return {
    isHealth,
    vertical,
    templateIds: isHealth ? (Object.keys(LANDING_TEMPLATES) as LandingTemplateId[]) : [],
    archetypeIds: ARCHETYPE_IDS,
  };
}

const listDesignsInput = z.object({});

const listDesigns: AgentTool<z.infer<typeof listDesignsInput>> & {
  execute: (
    input: z.infer<typeof listDesignsInput>,
    ctx: ToolExecuteContext,
    deps?: DesignToolsDeps,
  ) => ReturnType<AgentTool<z.infer<typeof listDesignsInput>>["execute"]>;
} = {
  name: "list_designs",
  description:
    "List the design options valid for THIS workspace, so you can name them correctly before calling update_design. Health/wellness workspaces get premium named templates (e.g. 'Clinical Luxe') plus the 8 general archetype looks; every other workspace gets just the 8 archetype looks. Always call this before update_design if you're not sure what's available.",
  inputSchema: listDesignsInput,
  jsonSchema: { type: "object", properties: {}, required: [] },
  execute: (
    _input,
    ctx: ToolExecuteContext,
    deps: DesignToolsDeps = defaultDesignToolsDeps,
  ) =>
    safe(async () => {
      const { isHealth, vertical, templateIds, archetypeIds } = await computeDesignOptions(
        ctx.orgId,
        deps.resolveOrgVertical,
      );
      return {
        ok: true as const,
        isHealthWorkspace: isHealth,
        vertical: vertical || null,
        premiumTemplates: templateIds.map((id) => ({ id, name: templateLabel(id) })),
        archetypes: archetypeIds.map((id) => ({ id, name: archetypeLabel(id) })),
        note: isHealth
          ? "This workspace can use either a premium named template or an archetype look. 'auto' picks the best fit automatically."
          : "Premium named templates are health/wellness only today — this workspace uses the archetype looks. 'auto' picks the best-fit archetype automatically.",
      };
    }),
};

const updateDesignInput = z.object({
  design: z.string().min(1, "design is required"),
});

const updateDesign: AgentTool<z.infer<typeof updateDesignInput>> & {
  execute: (
    input: z.infer<typeof updateDesignInput>,
    ctx: ToolExecuteContext,
    deps?: DesignToolsDeps,
  ) => ReturnType<AgentTool<z.infer<typeof updateDesignInput>>["execute"]>;
} = {
  name: "update_design",
  description:
    "Switch the workspace's whole public-site DESIGN/TEMPLATE/LOOK by name — a content-safe re-skin, never a regeneration (existing copy, sections, and edits are untouched). Use THIS tool when the user asks to change the overall design, template, or aesthetic/vibe of their site (e.g. 'switch to the bold-urgency look', 'use the Clinical Luxe template', 'make my site feel more premium'). Use update_theme instead for just colors/fonts/mode/radius, and edit_site for content/copy/section changes. Pass design='auto' to let the system pick the best fit. Call list_designs first if you don't already know which design names are valid for this workspace.",
  inputSchema: updateDesignInput,
  jsonSchema: {
    type: "object",
    properties: {
      design: {
        type: "string",
        description:
          "The design to switch to: a premium template id/name (health/wellness workspaces only), an archetype id (e.g. 'bold-urgency', 'clinical-trust'), or 'auto' for best-fit.",
      },
    },
    required: ["design"],
  },
  execute: (
    input,
    ctx: ToolExecuteContext,
    deps: DesignToolsDeps = defaultDesignToolsDeps,
  ) =>
    safe(async () => {
      const requested = input.design.trim();
      const requestedLower = requested.toLowerCase();
      const { isHealth, templateIds, archetypeIds } = await computeDesignOptions(
        ctx.orgId,
        deps.resolveOrgVertical,
      );

      // 1. "auto" — health orgs resolve to the best-fit premium template
      //    (setLandingTemplateForOrg's own "auto" handling); non-health orgs
      //    resolve to the best-fit archetype via classifyArchetype, invoked
      //    inside applyArchetypeThemeToOrg's sibling write path — but since
      //    THIS tool is an explicit operator request, we still want an
      //    honest, deterministic pick rather than silently no-op-ing, so we
      //    reuse setArchetypeForOrg with the archetype the org would
      //    classify to. isHealthVertical already told us which track we're
      //    on; for non-health "auto" we classify from resolved vertical.
      if (requestedLower === "auto") {
        if (isHealth) {
          const result = await deps.setLandingTemplateForOrg(ctx.orgId, "auto");
          logEvent("design_update", { design: "auto", kind: "template", via: "copilot" }, { orgId: ctx.orgId });
          if (!result.ok) return { ok: false as const, error: result.error };
          return {
            ok: true as const,
            kind: "template" as const,
            applied: result.landingTemplate,
            message: `Your site now uses the ${templateLabel(result.landingTemplate as LandingTemplateId)} design (auto-picked for your business).`,
          };
        }
        // Non-health auto → best-fit archetype. classifyArchetype needs the
        // soul shape, which resolveOrgVertical already partially reads; reuse
        // the same vertical string as a conservative classifier input.
        const vertical = await deps.resolveOrgVertical(ctx.orgId);
        const archetypeId = classifyArchetype({ vertical });
        const result = await deps.setArchetypeForOrg(ctx.orgId, archetypeId);
        logEvent("design_update", { design: archetypeId, kind: "archetype", via: "copilot" }, { orgId: ctx.orgId });
        if (!result.ok) return { ok: false as const, error: result.reason ?? "archetype_apply_failed" };
        return {
          ok: true as const,
          kind: "archetype" as const,
          applied: archetypeId,
          message: `Your site now uses the ${archetypeLabel(archetypeId)} look (auto-picked for your business).`,
        };
      }

      // 2. Premium named template match (health orgs only).
      const templateMatch = templateIds.find((id) => id === requestedLower || id === requested);
      if (templateMatch || isLandingTemplateId(requestedLower)) {
        if (!isHealth) {
          // Never-lies: don't silently no-op. Say plainly that premium
          // templates aren't available for this workspace and offer what
          // IS available.
          return {
            ok: false as const,
            error: "premium_template_not_available_for_vertical",
            message: `Premium named templates like that are health/wellness only today — this workspace isn't on that track. You can still switch to one of the archetype looks: ${archetypeIds.map(archetypeLabel).join(", ")}.`,
          };
        }
        const id = (templateMatch ?? requestedLower) as LandingTemplateId;
        const result = await deps.setLandingTemplateForOrg(ctx.orgId, id);
        logEvent("design_update", { design: id, kind: "template", via: "copilot" }, { orgId: ctx.orgId });
        if (!result.ok) return { ok: false as const, error: result.error };
        return {
          ok: true as const,
          kind: "template" as const,
          applied: result.landingTemplate,
          message: `Your site now uses the ${templateLabel(id)} design.`,
        };
      }

      // 3. Archetype key match (every vertical).
      const archetypeMatch = archetypeIds.find((id) => id === requestedLower);
      if (archetypeMatch) {
        const result = await deps.setArchetypeForOrg(ctx.orgId, archetypeMatch);
        logEvent("design_update", { design: archetypeMatch, kind: "archetype", via: "copilot" }, { orgId: ctx.orgId });
        if (!result.ok) return { ok: false as const, error: result.reason ?? "archetype_apply_failed" };
        return {
          ok: true as const,
          kind: "archetype" as const,
          applied: archetypeMatch,
          message: `Your site now uses the ${archetypeLabel(archetypeMatch)} look.`,
        };
      }

      // 4. Nothing matched — honest rejection naming what DOES fit.
      const validOptions = isHealth
        ? [...templateIds, ...archetypeIds, "auto"]
        : [...archetypeIds, "auto"];
      return {
        ok: false as const,
        error: "unknown_design",
        message: `"${requested}" isn't a design this workspace can use. Valid options: ${validOptions.join(", ")}.`,
      };
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

// ─── search_media / update_media / delete_media ─────────────────────────────
//
// Media-editing T3 (SeldonChat media tools). Wires the T1 write seam
// (setR1Media/clearR1Media) and T2 media sources (searchStockPhotos,
// resolveExternalMedia) into the copilot toolset — parallels the
// list_designs/update_design chip-picker pattern above: search_media never
// writes, its candidates are surfaced by the route as tappable thumbnails
// (mediaOptions) instead of a verbalized list; tapping one sends a
// deterministic apply payload that resolves to update_media.
//
// Slot vocabulary (shared across all three tools, matches R1MediaSlot in
// set-r1-media.ts):
//   - hero_background        — the main background image behind the hero.
//     DEFAULT for "add/change the background".
//   - hero_background_video  — background video (kind:"video" on update_media).
//   - hero_image             — the foreground hero photo (a distinct panel
//     image, not the background).
//   - service_photo:<index>  — a specific service card photo (0-based).
//
// SECURITY: update_media/delete_media's zod schemas carry NO orgId-shaped
// field at all — ctx.orgId (from the runtime, never the model) is the only
// source of which org's payload gets written. Any external/user/stock URL
// applied via update_media is routed through resolveExternalMedia FIRST,
// which runs the SSRF guard (assertPublicHttpUrl) on the URL and every
// redirect hop before anything is fetched — this protects even a
// client-supplied URL that arrived via a tapped thumbnail, since the tap
// still goes through this same tool.

/** Injectable seam for search_media/update_media/delete_media's execute
 *  (mirrors UpdateThemeDeps/ModuleToolsDeps/DesignToolsDeps above). Defaults
 *  to the real T1/T2 seams so production callers are unaffected. */
export type MediaToolsDeps = {
  searchStockPhotos: (query: string) => Promise<StockPhoto[]>;
  resolveExternalMedia: (url: string, kind: MediaKind) => Promise<ResolveMediaResult>;
  setR1Media: (orgId: string, input: SetR1MediaInput) => Promise<SetR1MediaResult>;
  clearR1Media: (orgId: string, slot: string) => Promise<SetR1MediaResult>;
};

const defaultMediaToolsDeps: MediaToolsDeps = {
  searchStockPhotos: searchStockPhotosDefault,
  resolveExternalMedia: resolveExternalMediaDefault,
  setR1Media: setR1MediaDefault,
  clearR1Media: clearR1MediaDefault,
};

const MEDIA_SLOT_DESCRIPTION =
  "Media slot id: 'hero_background' (the main background image behind the hero — the DEFAULT for \"add/change the background\"), 'hero_background_video' (background video), 'hero_image' (the foreground hero photo, a separate panel image), or 'service_photo:<index>' (a specific service card photo, 0-based, e.g. 'service_photo:0').";

const searchMediaInput = z.object({
  query: z.string().min(1, "query is required"),
  target_slot: z.string().optional(),
});

const searchMedia: AgentTool<z.infer<typeof searchMediaInput>> & {
  execute: (
    input: z.infer<typeof searchMediaInput>,
    ctx: ToolExecuteContext,
    deps?: MediaToolsDeps,
  ) => ReturnType<AgentTool<z.infer<typeof searchMediaInput>>["execute"]>;
} = {
  name: "search_media",
  description:
    "Search stock photos (Unsplash + Pexels) for an image matching a description, e.g. 'a friendly plumber at work' or 'cozy modern cafe interior'. Does NOT write anything — the results are shown to the operator as tappable thumbnails; they pick one to apply. Use target_slot to hint which slot a pick should apply to (defaults to hero_background — the main site background). Call this when the operator describes an image they want rather than giving you a URL.",
  inputSchema: searchMediaInput,
  jsonSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Plain-English description of the image to find." },
      target_slot: {
        type: "string",
        description: `${MEDIA_SLOT_DESCRIPTION} Hint for where a picked photo should apply; defaults to 'hero_background'.`,
      },
    },
    required: ["query"],
  },
  execute: (
    input,
    _ctx: ToolExecuteContext,
    deps: MediaToolsDeps = defaultMediaToolsDeps,
  ) =>
    safe(async () => {
      const photos = await deps.searchStockPhotos(input.query);
      const targetSlot = input.target_slot ?? "hero_background";

      logEvent(
        "media_search",
        { query: input.query, target_slot: targetSlot, result_count: photos.length },
        {},
      );

      return {
        ok: true as const,
        target_slot: targetSlot,
        photos,
        message:
          photos.length > 0
            ? "Found some options — tap one below to use it."
            : "No stock photos found for that search — try a different description, or give me a direct image URL.",
      };
    }),
};

const updateMediaInput = z.object({
  slot: z.string().min(1, "slot is required"),
  url: z.string().min(1, "url is required"),
  kind: z.enum(["image", "video"]).optional(),
  alt: z.string().optional(),
});

const updateMedia: AgentTool<z.infer<typeof updateMediaInput>> & {
  execute: (
    input: z.infer<typeof updateMediaInput>,
    ctx: ToolExecuteContext,
    deps?: MediaToolsDeps,
  ) => ReturnType<AgentTool<z.infer<typeof updateMediaInput>>["execute"]>;
} = {
  name: "update_media",
  description:
    "Set an image or background video on the site from a URL (a stock-photo URL from search_media's results, or any image/video URL the operator gives you). Validates the URL is safe and re-hosts images before applying. Pass kind:'video' (and slot:'hero_background_video') for a background video; otherwise defaults to image. Use the slot vocabulary: hero_background (main background image, the default for \"add/change the background\"), hero_background_video, hero_image (foreground hero photo), service_photo:<index>.",
  inputSchema: updateMediaInput,
  jsonSchema: {
    type: "object",
    properties: {
      slot: { type: "string", description: MEDIA_SLOT_DESCRIPTION },
      url: { type: "string", description: "The image or video URL to apply." },
      kind: {
        type: "string",
        enum: ["image", "video"],
        description: "Media kind — defaults to 'image'. Use 'video' for a background video URL.",
      },
      alt: { type: "string", description: "Alt text describing the image (skip for video)." },
    },
    required: ["slot", "url"],
  },
  // ctx.orgId is the ONLY source of the org to write — input is a zod-parsed
  // model-args object with no orgId-shaped field in its schema at all, so
  // even a malicious/hallucinated arg object can't redirect the write.
  execute: (
    input,
    ctx: ToolExecuteContext,
    deps: MediaToolsDeps = defaultMediaToolsDeps,
  ) =>
    safe(async () => {
      const kind: MediaKind = input.kind ?? "image";

      // Guard: kind and slot must agree BEFORE any resolve/write happens.
      // setR1Media dispatches purely on `slot`, so a mismatched kind/slot
      // pair (e.g. slot:"hero_background", kind:"video") would validate
      // here and then write a wrong-shaped media value into the slot,
      // breaking the hero render on a live customer site.
      if (kind === "video" && input.slot !== "hero_background_video") {
        return {
          ok: false as const,
          error: "kind_slot_mismatch",
          message:
            'A video can only go in the background-video slot (hero_background_video). For an image, drop kind or use kind:"image".',
        };
      }
      if (kind !== "video" && input.slot === "hero_background_video") {
        return {
          ok: false as const,
          error: "kind_slot_mismatch",
          message:
            'The background-video slot needs kind:"video". For an image, pick hero_background / hero_image / service_photo:<i>.',
        };
      }

      const resolved = await deps.resolveExternalMedia(input.url, kind);
      if (!resolved.ok) {
        return {
          ok: false as const,
          error: resolved.error,
          message: `Couldn't use that URL (${resolved.error}) — try a different image/video URL, or search_media for a stock photo instead.`,
        };
      }

      const setResult = await deps.setR1Media(ctx.orgId, {
        slot: input.slot,
        src: resolved.url,
        alt: input.alt,
      });

      logEvent(
        "media_update",
        { slot: input.slot, kind, ok: setResult.ok, via: "copilot" },
        { orgId: ctx.orgId },
      );

      if (!setResult.ok) {
        return {
          ok: false as const,
          error: setResult.error,
          message: `Couldn't apply that to ${input.slot} (${setResult.error}).`,
        };
      }

      return {
        ok: true as const,
        slot: setResult.slot,
        message: `Updated ${setResult.slot} with the new ${kind}.`,
      };
    }),
};

const deleteMediaInput = z.object({
  slot: z.string().min(1, "slot is required"),
});

const deleteMedia: AgentTool<z.infer<typeof deleteMediaInput>> & {
  execute: (
    input: z.infer<typeof deleteMediaInput>,
    ctx: ToolExecuteContext,
    deps?: MediaToolsDeps,
  ) => ReturnType<AgentTool<z.infer<typeof deleteMediaInput>>["execute"]>;
} = {
  name: "delete_media",
  description:
    "Remove an image or background video from the site (clears the field — never deletes the section/service itself). Use the slot vocabulary: hero_background, hero_background_video, hero_image, service_photo:<index>.",
  inputSchema: deleteMediaInput,
  jsonSchema: {
    type: "object",
    properties: {
      slot: { type: "string", description: MEDIA_SLOT_DESCRIPTION },
    },
    required: ["slot"],
  },
  // ctx.orgId is the ONLY source of the org to write — same rule as
  // update_media above.
  execute: (
    input,
    ctx: ToolExecuteContext,
    deps: MediaToolsDeps = defaultMediaToolsDeps,
  ) =>
    safe(async () => {
      const result = await deps.clearR1Media(ctx.orgId, input.slot);

      logEvent(
        "media_delete",
        { slot: input.slot, ok: result.ok, via: "copilot" },
        { orgId: ctx.orgId },
      );

      if (!result.ok) {
        return {
          ok: false as const,
          error: result.error,
          message: `Couldn't remove ${input.slot} (${result.error}).`,
        };
      }

      return {
        ok: true as const,
        slot: result.slot,
        message: `Removed the media from ${result.slot}.`,
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
    listDesigns as AgentTool,
    updateDesign as AgentTool,
    enableModule as AgentTool,
    disableModule as AgentTool,
    pinCard as AgentTool,
    searchMedia as AgentTool,
    updateMedia as AgentTool,
    deleteMedia as AgentTool,
  ];
}
