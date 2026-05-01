// ============================================================================
// applyPipelineStagesFromSoul — re-seed the workspace's pipeline from Soul.
// ============================================================================
//
// April 30, 2026 — primitives architecture B6. The pipeline gets a generic
// default seeded at workspace creation (Lead → Qualified → Proposal →
// Negotiation → Won → Lost). When the Soul submits later with custom stages
// (e.g. SeldonFrame's "Lead → Demo Scheduled → Trial Active → Growth
// Converted → Scale Converted → Churned"), those stages should override the
// generic ones — but only if the Soul actually carries them.
//
// This helper is idempotent and safe to call on every Soul submission:
//   - If soul.pipeline_stages is missing or empty → no-op.
//   - If the existing stages match the Soul's already → no-op.
//   - Otherwise → update the default pipeline's stages array. Existing deals
//     keep their `stage` column value as-is; the kanban falls back to the
//     "Lead" stage for any unmatched values, so deals don't disappear.

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { pipelines, type PipelineStage } from "@/db/schema";
import { ensureDefaultPipelineForOrg } from "@/lib/deals/pipeline-defaults";

interface SoulPipelineStage {
  name: string;
  order?: number;
  description?: string;
  color?: string;
  probability?: number;
}

/** Default color palette walked round-robin when the Soul stages don't
 *  carry explicit colors. Matches the colors operators see in the kanban. */
const COLOR_PALETTE = [
  "#0284c7", // blue
  "#9333ea", // purple
  "#0d9488", // teal
  "#d97706", // amber
  "#ea580c", // orange
  "#16a34a", // green
  "#dc2626", // red
  "#71717a", // slate
];

/** Heuristic probability for the LAST stage based on its name. Stages that
 *  look like "Won", "Converted", "Closed", "Active" → 100. Stages that look
 *  like "Lost", "Churned", "Canceled" → 0. */
function probabilityForTerminalStage(name: string): number {
  const lower = name.toLowerCase();
  if (
    lower.includes("lost") ||
    lower.includes("churn") ||
    lower.includes("cancel") ||
    lower.includes("dead") ||
    lower.includes("declin")
  ) {
    return 0;
  }
  if (
    lower.includes("won") ||
    lower.includes("convert") ||
    lower.includes("closed") ||
    lower.includes("paid") ||
    lower.includes("active")
  ) {
    return 100;
  }
  return 80;
}

/** Distribute probabilities across N stages. The first stage = 10%, the last
 *  stage = derived (won/lost), everything in between = linearly interpolated.
 *  This means a 6-stage Soul like SeldonFrame's gets {10, 28, 46, 64, 100, 0}
 *  — the closing stage gets 100 because "Scale Converted" matches "convert",
 *  and "Churned" gets handled as a separate "lost"-class stage at 0. */
function distributeProbabilities(stages: SoulPipelineStage[]): number[] {
  if (stages.length === 0) return [];
  if (stages.length === 1) return [probabilityForTerminalStage(stages[0].name)];

  // Special-case the final stage if it's clearly a terminal (won/lost). The
  // second-to-last then becomes the "real" close — usually 100.
  const lastName = stages[stages.length - 1].name.toLowerCase();
  const lastIsLost =
    lastName.includes("lost") ||
    lastName.includes("churn") ||
    lastName.includes("cancel") ||
    lastName.includes("dead");

  const closeIndex = lastIsLost ? stages.length - 2 : stages.length - 1;
  const closeProb = lastIsLost ? 100 : probabilityForTerminalStage(stages[closeIndex].name);

  const probs = new Array<number>(stages.length).fill(50);
  // Ramp from 10 → closeProb across the non-terminal stages.
  for (let i = 0; i <= closeIndex; i += 1) {
    if (closeIndex === 0) {
      probs[i] = closeProb;
    } else {
      probs[i] = Math.round(10 + ((closeProb - 10) * i) / closeIndex);
    }
  }
  if (lastIsLost) {
    probs[stages.length - 1] = 0;
  }
  return probs;
}

/**
 * Convert the loose Soul pipeline-stage shape into the Drizzle PipelineStage
 * shape. Sorts by `order` if present (preserves operator-defined ordering),
 * fills in colors round-robin, and distributes probabilities heuristically
 * if not provided.
 */
export function normalizeSoulPipelineStages(
  rawStages: unknown
): PipelineStage[] | null {
  if (!Array.isArray(rawStages) || rawStages.length === 0) return null;

  // Coerce to SoulPipelineStage shape, filter unusable entries.
  const usable = rawStages
    .map((entry, index) => {
      if (!entry || typeof entry !== "object") return null;
      const obj = entry as Record<string, unknown>;
      const name = typeof obj.name === "string" ? obj.name.trim() : "";
      if (!name) return null;
      return {
        name,
        order: typeof obj.order === "number" ? obj.order : index,
        description: typeof obj.description === "string" ? obj.description : undefined,
        color: typeof obj.color === "string" ? obj.color : undefined,
        probability: typeof obj.probability === "number" ? obj.probability : undefined,
      } as SoulPipelineStage;
    })
    .filter((entry): entry is SoulPipelineStage => entry !== null);

  if (usable.length === 0) return null;

  usable.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const probs = distributeProbabilities(usable);

  return usable.map((stage, index) => ({
    name: stage.name,
    color: stage.color ?? COLOR_PALETTE[index % COLOR_PALETTE.length],
    probability: stage.probability ?? probs[index] ?? 50,
  }));
}

/**
 * Apply the Soul's pipeline stages to the workspace's default pipeline.
 * Returns { changed: true } if the stages were updated, { changed: false }
 * if the Soul didn't carry stages or they already matched the existing.
 *
 * Idempotent. Safe to call on every Soul submission.
 */
export async function applyPipelineStagesFromSoul(
  orgId: string,
  soul: Record<string, unknown> | null | undefined,
  workspaceName?: string | null
): Promise<{ changed: boolean; stages: PipelineStage[] | null }> {
  if (!soul) return { changed: false, stages: null };

  const next = normalizeSoulPipelineStages(soul.pipeline_stages);
  if (!next) return { changed: false, stages: null };

  // Ensure a default pipeline row exists (creates it with generic stages
  // if missing — required for legacy workspaces that pre-date the eager
  // seed at workspace creation).
  const pipeline = await ensureDefaultPipelineForOrg(orgId, workspaceName ?? null);

  // No-op if the existing stages already match.
  if (stagesEqual(pipeline.stages, next)) {
    return { changed: false, stages: pipeline.stages };
  }

  await db
    .update(pipelines)
    .set({ stages: next, updatedAt: new Date() })
    .where(and(eq(pipelines.orgId, orgId), eq(pipelines.id, pipeline.id)));

  return { changed: true, stages: next };
}

function stagesEqual(a: PipelineStage[], b: PipelineStage[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].name !== b[i].name) return false;
    if (a[i].color !== b[i].color) return false;
    if (a[i].probability !== b[i].probability) return false;
  }
  return true;
}
