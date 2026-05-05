// ============================================================================
// v1.10.0 — regenerate_block: thin-harness context bundle
// ============================================================================
//
// regenerate_block lets the IDE agent re-do a block with operator
// instructions ("make the hero punchier", "add a card about kids
// cuts") while keeping the LLM-generation work on the agent side.
//
// This module ships the *pure* assembly function `buildRegenerateContext`.
// It takes pre-loaded rows (block_instances, organizations.soul,
// brain_patterns) and produces the bundle the agent needs:
//
//   - block_name + status (first_generation vs regenerate)
//   - current_props + current_generation_prompt + customization_history
//   - workspace_summary (business_name, industry, services, voice) — best
//     effort from organizations.soul
//   - brain_patterns (anonymized cross-workspace patterns for this vertical)
//   - new_instructions (echoed back so the agent sees them in scope)
//   - next_step (operator-facing prose telling the agent: read SKILL.md,
//     generate new props, call persist_block)
//
// Why pure: testable without a DB. The DB-loading wrapper (in this same
// file) calls buildRegenerateContext after fetching the rows.
//
// Antifragility: as LLMs improve, regeneration improves with zero
// harness changes — we only assemble; we never decide creative output.

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  blockInstances,
  organizations,
  type BlockCustomization,
} from "@/db/schema";
import { listBrainDir } from "@/lib/brain/store";

// ─── public types ───────────────────────────────────────────────────────────

export interface RegenerateWorkspaceSummary {
  business_name: string;
  industry: string | null;
  services: Array<{ name: string; description?: string }>;
  voice: {
    style: string;
    vocabulary: string[];
    avoidWords: string[];
  } | null;
}

export interface RegenerateBrainPattern {
  path: string;
  body_preview: string;
  confidence: number;
}

export interface RegenerateContextInput {
  blockName: string;
  /** The current persisted block_instances row, or null if the block has
   *  never been persisted (first-time regeneration is a valid path —
   *  e.g. when the v2 flow skipped a block and the operator now wants
   *  to fill it in). */
  blockInstance: {
    props: Record<string, unknown>;
    generation_prompt: string;
    customizations: BlockCustomization[];
    template_version: string;
  } | null;
  workspaceSummary: RegenerateWorkspaceSummary;
  brainPatterns: RegenerateBrainPattern[];
  /** Operator's free-form regeneration request, if any. */
  newInstructions?: string;
}

export interface RegenerateContextOutput {
  block_name: string;
  status: "first_generation" | "regenerate";
  current_props: Record<string, unknown> | null;
  current_generation_prompt: string | null;
  customization_history: BlockCustomization[];
  template_version: string | null;
  workspace_summary: RegenerateWorkspaceSummary;
  brain_patterns: RegenerateBrainPattern[];
  new_instructions: string | null;
  /** Operator-facing prose telling the IDE agent what to do next. */
  next_step: string;
}

// ─── pure assembly ──────────────────────────────────────────────────────────

export function buildRegenerateContext(
  input: RegenerateContextInput,
): RegenerateContextOutput {
  const status: "first_generation" | "regenerate" = input.blockInstance
    ? "regenerate"
    : "first_generation";

  const newInstructions = input.newInstructions?.trim() || null;

  const nextStep =
    status === "first_generation"
      ? `This block has no prior persisted instance. Use get_block_skill("${input.blockName}") to fetch the SKILL.md, generate props from the workspace_summary + brain_patterns + (if any) new_instructions, then call persist_block to save them.`
      : newInstructions
        ? `Iterate on current_props by applying new_instructions. Use get_block_skill("${input.blockName}") to recall the prop schema + voice rules, then call persist_block with the new props and customization: { prompt: <new_instructions> } so the change is recorded in customization_history.`
        : `Refresh this block. Use get_block_skill("${input.blockName}") to fetch SKILL.md, regenerate props from current_props + workspace_summary + brain_patterns, then call persist_block. No customization field needed (this is a fresh regeneration, not an operator edit).`;

  return {
    block_name: input.blockName,
    status,
    current_props: input.blockInstance?.props ?? null,
    current_generation_prompt: input.blockInstance?.generation_prompt ?? null,
    customization_history: input.blockInstance?.customizations ?? [],
    template_version: input.blockInstance?.template_version ?? null,
    workspace_summary: input.workspaceSummary,
    brain_patterns: input.brainPatterns,
    new_instructions: newInstructions,
    next_step: nextStep,
  };
}

// ─── DB-loading wrapper ─────────────────────────────────────────────────────

/**
 * Load all the rows the regenerate context needs and assemble the
 * bundle. Caller (the API route) handles auth + workspace ownership;
 * this function trusts that workspaceId has been authorized.
 *
 * Returns null for a non-existent workspace; the API route translates
 * that to a 404. All other states (block never persisted, soul empty,
 * brain empty) are valid and produce a partial-but-usable bundle.
 */
export async function loadRegenerateContext(
  workspaceId: string,
  blockName: string,
  newInstructions: string | undefined,
): Promise<RegenerateContextOutput | null> {
  const [orgRow] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      soul: organizations.soul,
      settings: organizations.settings,
    })
    .from(organizations)
    .where(eq(organizations.id, workspaceId))
    .limit(1);
  if (!orgRow) return null;

  const [instanceRow] = await db
    .select({
      props: blockInstances.props,
      generationPrompt: blockInstances.generationPrompt,
      customizations: blockInstances.customizations,
      templateVersion: blockInstances.templateVersion,
    })
    .from(blockInstances)
    .where(
      and(
        eq(blockInstances.orgId, workspaceId),
        eq(blockInstances.blockName, blockName),
      ),
    )
    .limit(1);

  const blockInstance = instanceRow
    ? {
        props: (instanceRow.props ?? {}) as Record<string, unknown>,
        generation_prompt: instanceRow.generationPrompt ?? "",
        customizations: (instanceRow.customizations ?? []) as BlockCustomization[],
        template_version: instanceRow.templateVersion ?? "1.0.0",
      }
    : null;

  const soul = orgRow.soul;
  const settings = (orgRow.settings ?? {}) as Record<string, unknown>;
  const industryFromSettings =
    typeof settings.crmPersonality === "string"
      ? (settings.crmPersonality as string)
      : null;

  const workspaceSummary: RegenerateWorkspaceSummary = {
    business_name: soul?.businessName ?? orgRow.name ?? "",
    industry: soul?.industry ?? industryFromSettings ?? null,
    services: (soul?.services ?? []).map((s) => ({
      name: s.name,
      description: s.description,
    })),
    voice: soul?.voice
      ? {
          style: soul.voice.style ?? "",
          vocabulary: soul.voice.vocabulary ?? [],
          avoidWords: soul.voice.avoidWords ?? [],
        }
      : null,
  };

  // Brain patterns: cross-workspace, layer-2. Filter by industry when
  // we have one (so HVAC operators get HVAC patterns, not coaching
  // patterns). Empty result is fine — brain compounds over time.
  let brainPatterns: RegenerateBrainPattern[] = [];
  try {
    const prefix = workspaceSummary.industry
      ? `patterns/by-vertical/${workspaceSummary.industry}`
      : "patterns/";
    const notes = await listBrainDir({
      orgId: null,
      scope: "global",
      prefix,
      limit: 8,
    });
    brainPatterns = notes.map((n) => ({
      path: n.path,
      body_preview: n.body_preview,
      confidence: n.confidence,
    }));
  } catch {
    // Brain not yet populated — empty is the expected state for new
    // verticals.
  }

  return buildRegenerateContext({
    blockName,
    blockInstance,
    workspaceSummary,
    brainPatterns,
    newInstructions,
  });
}
