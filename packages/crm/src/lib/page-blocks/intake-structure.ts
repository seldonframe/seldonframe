// ============================================================================
// v1.13.0 — intake-form structural primitives
// ============================================================================
//
// Five atomic primitives over the intake form's fields array. Mirrors
// the v1.11 landing-structure pattern (read / move / delete) plus two
// form-specific ops (add new field, update existing field):
//
//   - get_intake_structure(workspace_id)
//   - add_intake_field(workspace_id, field, position?)
//   - move_intake_field(workspace_id, from_index, to_index)
//   - delete_intake_field(workspace_id, index)
//   - update_intake_field(workspace_id, index, patch)
//
// Index-based addressing (handles any duplicate-label edge cases),
// atomic, agent re-reads structure between mutating calls.
//
// Forms have BOTH index AND a stable `id` field (used as the bind
// key by the public intake POST handler). The agent uses index
// during edits; the system uses id for answer→field binding. We
// enforce id uniqueness on add/update.
//
// Persistence touches TWO surfaces (mirroring the existing v2
// persistIntakeBlock pattern in persist.ts):
//   1. Blueprint.intake.questions — the canonical source-of-truth
//   2. intakeForms.fields — the DB row the public POST handler reads
// Both are updated atomically per mutation; renderer also re-runs.

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { intakeForms, landingPages, organizations } from "@/db/schema";
import { loadBlueprintOrFallback } from "@/lib/blueprint/persist";
import { renderFormbricksStackV1 } from "@/lib/blueprint/renderers/formbricks-stack-v1";
import type { Blueprint, IntakeQuestion } from "@/lib/blueprint/types";

// ─── pure: applyAddField ───────────────────────────────────────────────────

export type FieldOpResult =
  | { ok: true; fields: IntakeQuestion[] }
  | { ok: false; errors: string[] };

export function applyAddField(
  fields: IntakeQuestion[],
  newField: IntakeQuestion,
  position?: number,
): FieldOpResult {
  const errors: string[] = [];

  if (!newField.id || typeof newField.id !== "string") {
    errors.push("new field requires a non-empty id");
  }
  if (!newField.label || typeof newField.label !== "string") {
    errors.push("new field requires a non-empty label");
  }
  // Duplicate id check — the intake POST handler binds answers by id;
  // duplicates would silently drop one set of answers.
  if (fields.some((f) => f.id === newField.id)) {
    errors.push(
      `duplicate field id "${newField.id}" already exists in the form`,
    );
  }
  // Position bounds: [0, length]. length means "append at the end."
  const pos = position ?? fields.length;
  if (!Number.isInteger(pos) || pos < 0 || pos > fields.length) {
    errors.push(`position ${pos} out of range [0, ${fields.length}]`);
  }
  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    fields: [...fields.slice(0, pos), newField, ...fields.slice(pos)],
  };
}

// ─── pure: applyMoveField ──────────────────────────────────────────────────

export function applyMoveField(
  fields: IntakeQuestion[],
  fromIndex: number,
  toIndex: number,
): FieldOpResult {
  const errors: string[] = [];

  if (fields.length === 0) {
    errors.push("cannot move within an empty fields array");
    return { ok: false, errors };
  }
  if (!Number.isInteger(fromIndex) || fromIndex < 0 || fromIndex >= fields.length) {
    errors.push(`from_index ${fromIndex} out of range [0, ${fields.length - 1}]`);
  }
  if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= fields.length) {
    errors.push(`to_index ${toIndex} out of range [0, ${fields.length - 1}]`);
  }
  if (errors.length > 0) return { ok: false, errors };

  if (fromIndex === toIndex) return { ok: true, fields: [...fields] };

  const next = [...fields];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return { ok: true, fields: next };
}

// ─── pure: applyDeleteField ────────────────────────────────────────────────

export type DeleteFieldResult =
  | { ok: true; fields: IntakeQuestion[]; removed: IntakeQuestion }
  | { ok: false; errors: string[] };

export function applyDeleteField(
  fields: IntakeQuestion[],
  index: number,
): DeleteFieldResult {
  const errors: string[] = [];

  if (!Number.isInteger(index) || index < 0 || index >= fields.length) {
    errors.push(`index ${index} out of range [0, ${fields.length - 1}]`);
    return { ok: false, errors };
  }
  if (fields.length <= 1) {
    errors.push(
      "delete refused: would leave 0 fields. The intake form needs at least one field for the public submit to make sense. Use update_intake_field if you want to change a field's content instead.",
    );
    return { ok: false, errors };
  }

  const next = [...fields];
  const [removed] = next.splice(index, 1);
  return { ok: true, fields: next, removed };
}

// ─── pure: applyUpdateField ────────────────────────────────────────────────

/** Patch shape — every IntakeQuestion field is optional in the patch.
 *  We allow id changes (to a fresh, non-colliding value); the ops that
 *  consume the form's answers will re-bind on the next submission. */
export type IntakeFieldPatch = Partial<IntakeQuestion>;

export function applyUpdateField(
  fields: IntakeQuestion[],
  index: number,
  patch: IntakeFieldPatch,
): FieldOpResult {
  const errors: string[] = [];

  if (!Number.isInteger(index) || index < 0 || index >= fields.length) {
    errors.push(`index ${index} out of range [0, ${fields.length - 1}]`);
    return { ok: false, errors };
  }
  if (!patch || Object.keys(patch).length === 0) {
    errors.push("patch is empty — no update requested");
    return { ok: false, errors };
  }

  // ID-change collision: if the patch sets a new id, ensure no OTHER
  // field already has it.
  if (patch.id && patch.id !== fields[index].id) {
    if (fields.some((f, i) => i !== index && f.id === patch.id)) {
      errors.push(`new id "${patch.id}" already used by another field`);
      return { ok: false, errors };
    }
  }

  const next = fields.map((f, i) =>
    i === index ? ({ ...f, ...patch } as IntakeQuestion) : f,
  );
  return { ok: true, fields: next };
}

// ─── pure: deriveFieldPreview ──────────────────────────────────────────────

const PREVIEW_MAX = 80;

function truncate(s: string, max = PREVIEW_MAX): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

export function deriveFieldPreview(field: IntakeQuestion): string {
  const required = field.required ? " *required" : "";
  const optionsHint =
    field.type === "select" || field.type === "multi-select"
      ? ` (${(field.options ?? []).length} options)`
      : "";
  return truncate(`${field.label} — ${field.type}${optionsHint}${required}`);
}

// ─── DB-loading wrappers ───────────────────────────────────────────────────

export interface IntakeFieldSummary {
  index: number;
  id: string;
  type: string;
  label: string;
  required: boolean;
  preview: string;
}

export interface IntakeStructureResult {
  ok: true;
  workspace_id: string;
  slug: string | null;
  public_url: string | null;
  intake: {
    title: string;
    description?: string;
  };
  fields: IntakeFieldSummary[];
}

export interface IntakeStructureError {
  ok: false;
  error: string;
  validation_errors: string[];
}

export async function getIntakeStructureForWorkspace(
  workspaceId: string,
): Promise<IntakeStructureResult | IntakeStructureError> {
  const loaded = await loadIntakeForRead(workspaceId);
  if (!loaded.ok) return loaded;

  const baseDomain =
    process.env.WORKSPACE_BASE_DOMAIN?.trim() || "app.seldonframe.com";
  const intake_url = loaded.slug ? `https://${loaded.slug}.${baseDomain}/intake` : null;

  const fields = (loaded.intakeQuestions ?? []).map((field, index) => ({
    index,
    id: field.id,
    type: field.type,
    label: field.label,
    required: Boolean(field.required),
    preview: deriveFieldPreview(field),
  }));

  return {
    ok: true,
    workspace_id: workspaceId,
    slug: loaded.slug,
    public_url: intake_url,
    intake: {
      title: loaded.intakeTitle,
      description: loaded.intakeDescription,
    },
    fields,
  };
}

// ─── DB-loading mutators ───────────────────────────────────────────────────

export type ApplyFieldOpResult =
  | {
      ok: true;
      fields: IntakeFieldSummary[];
      public_url: string | null;
    }
  | {
      ok: false;
      error: string;
      validation_errors: string[];
    };

export async function addIntakeFieldForWorkspace(
  workspaceId: string,
  field: IntakeQuestion,
  position?: number,
): Promise<ApplyFieldOpResult> {
  const loaded = await loadIntakeForMutation(workspaceId);
  if (!loaded.ok) return loaded;

  const result = applyAddField(loaded.intakeQuestions, field, position);
  if (!result.ok) {
    return {
      ok: false,
      error: "field_invalid",
      validation_errors: result.errors,
    };
  }
  return await persistAndRender(loaded, result.fields);
}

export async function moveIntakeFieldForWorkspace(
  workspaceId: string,
  fromIndex: number,
  toIndex: number,
): Promise<ApplyFieldOpResult> {
  const loaded = await loadIntakeForMutation(workspaceId);
  if (!loaded.ok) return loaded;

  const result = applyMoveField(loaded.intakeQuestions, fromIndex, toIndex);
  if (!result.ok) {
    return {
      ok: false,
      error: "move_invalid",
      validation_errors: result.errors,
    };
  }
  return await persistAndRender(loaded, result.fields);
}

export async function deleteIntakeFieldForWorkspace(
  workspaceId: string,
  index: number,
): Promise<ApplyFieldOpResult> {
  const loaded = await loadIntakeForMutation(workspaceId);
  if (!loaded.ok) return loaded;

  const result = applyDeleteField(loaded.intakeQuestions, index);
  if (!result.ok) {
    return {
      ok: false,
      error: "delete_invalid",
      validation_errors: result.errors,
    };
  }
  return await persistAndRender(loaded, result.fields);
}

export async function updateIntakeFieldForWorkspace(
  workspaceId: string,
  index: number,
  patch: IntakeFieldPatch,
): Promise<ApplyFieldOpResult> {
  const loaded = await loadIntakeForMutation(workspaceId);
  if (!loaded.ok) return loaded;

  const result = applyUpdateField(loaded.intakeQuestions, index, patch);
  if (!result.ok) {
    return {
      ok: false,
      error: "update_invalid",
      validation_errors: result.errors,
    };
  }
  return await persistAndRender(loaded, result.fields);
}

// ─── shared loaders / persisters ───────────────────────────────────────────

interface LoadedIntake {
  ok: true;
  workspaceId: string;
  landingPageId: string;
  blueprint: Blueprint;
  intakeQuestions: IntakeQuestion[];
  intakeTitle: string;
  intakeDescription?: string;
  slug: string | null;
}

interface LoadError {
  ok: false;
  error: string;
  validation_errors: string[];
}

async function loadIntakeForRead(
  workspaceId: string,
): Promise<LoadedIntake | LoadError> {
  return await loadIntakeForMutation(workspaceId);
}

async function loadIntakeForMutation(
  workspaceId: string,
): Promise<LoadedIntake | LoadError> {
  const [orgRow] = await db
    .select({ slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.id, workspaceId))
    .limit(1);
  if (!orgRow) {
    return { ok: false, error: "workspace_not_found", validation_errors: [] };
  }

  const [landing] = await db
    .select({
      id: landingPages.id,
      title: landingPages.title,
      settings: landingPages.settings,
      blueprintJson: landingPages.blueprintJson,
    })
    .from(landingPages)
    .where(
      and(
        eq(landingPages.orgId, workspaceId),
        eq(landingPages.slug, "home"),
      ),
    )
    .limit(1);
  if (!landing) {
    return {
      ok: false,
      error: "workspace_landing_missing",
      validation_errors: [
        "no landing_pages row with slug='home'. Run create_workspace_v2 first.",
      ],
    };
  }

  const settings = (landing.settings ?? {}) as Record<string, unknown>;
  const industry =
    typeof settings.industry === "string" ? (settings.industry as string) : null;
  const blueprint = loadBlueprintOrFallback(
    { blueprintJson: landing.blueprintJson },
    landing.title,
    industry,
  );

  const intake = blueprint.intake;
  if (!intake) {
    return {
      ok: false,
      error: "workspace_intake_missing",
      validation_errors: [
        "blueprint has no intake form. Use persist_block(intake) or create_workspace_v2 to bootstrap one.",
      ],
    };
  }

  return {
    ok: true,
    workspaceId,
    landingPageId: landing.id,
    blueprint,
    intakeQuestions: intake.questions ?? [],
    intakeTitle: intake.title ?? "Intake",
    intakeDescription: intake.description,
    slug: orgRow.slug ?? null,
  };
}

async function persistAndRender(
  loaded: LoadedIntake,
  nextFields: IntakeQuestion[],
): Promise<ApplyFieldOpResult> {
  const nextIntake = {
    ...(loaded.blueprint.intake ?? {}),
    questions: nextFields,
  } as Blueprint["intake"];
  const nextBlueprint: Blueprint = {
    ...loaded.blueprint,
    intake: nextIntake,
  };

  // Re-render intake form HTML/CSS via formbricks-stack-v1.
  const { html, css } = renderFormbricksStackV1(nextBlueprint);

  // Persist blueprint update on landing_pages.
  await db
    .update(landingPages)
    .set({
      blueprintJson: nextBlueprint as unknown as Record<string, unknown>,
      updatedAt: new Date(),
    })
    .where(eq(landingPages.id, loaded.landingPageId));

  // Persist intakeForms row(s) — the public POST handler reads
  // intake_forms.fields (key/label/type/required/options shape) to
  // validate submissions.
  const fieldsForRow = nextFields.map((f) => ({
    key: f.id,
    label: f.label,
    type: f.type,
    required: f.required ?? false,
    options: f.options,
  }));

  // We need to find the org's intake form rows and update them.
  const formRows = await db
    .select({ id: intakeForms.id })
    .from(intakeForms)
    .where(eq(intakeForms.orgId, loaded.workspaceId));

  for (const row of formRows) {
    await db
      .update(intakeForms)
      .set({
        fields: fieldsForRow,
        contentHtml: html,
        contentCss: css,
        updatedAt: new Date(),
      })
      .where(eq(intakeForms.id, row.id));
  }

  const baseDomain =
    process.env.WORKSPACE_BASE_DOMAIN?.trim() || "app.seldonframe.com";
  const publicUrl = loaded.slug ? `https://${loaded.slug}.${baseDomain}/intake` : null;

  const summaries = nextFields.map((field, index) => ({
    index,
    id: field.id,
    type: field.type,
    label: field.label,
    required: Boolean(field.required),
    preview: deriveFieldPreview(field),
  }));

  return {
    ok: true,
    fields: summaries,
    public_url: publicUrl,
  };
}

