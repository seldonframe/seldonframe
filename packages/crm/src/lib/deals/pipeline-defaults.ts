import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { pipelines, type PipelineStage } from "@/db/schema";

/**
 * Default pipeline stages used when a workspace doesn't yet have a
 * `pipelines` row. Chosen to mirror the standard B2B funnel + the
 * fallback already used by `/deals/page.tsx` (DealsView's
 * FALLBACK_STAGES) so the kanban / table look identical whether
 * the org has customized or not.
 *
 * Probabilities follow the conventional Hubspot / Salesforce
 * defaults so workflow runs that condition on probability >= N
 * produce sensible behavior without operator tuning.
 */
export const DEFAULT_PIPELINE_STAGES: PipelineStage[] = [
  { name: "Lead", color: "#0284c7", probability: 10 },
  { name: "Qualified", color: "#9333ea", probability: 30 },
  { name: "Proposal", color: "#d97706", probability: 60 },
  { name: "Negotiation", color: "#ea580c", probability: 80 },
  { name: "Won", color: "#16a34a", probability: 100 },
  { name: "Lost", color: "#71717a", probability: 0 },
];

/**
 * Returns the org's default pipeline, creating one with
 * `DEFAULT_PIPELINE_STAGES` if none exists. Idempotent — concurrent
 * callers may race on the INSERT but the SELECT-then-INSERT pattern
 * is safe under the unique-by-orgId+isDefault check that callers
 * apply afterwards (worst case: two pipelines exist, the SELECT picks
 * one, the other is harmless garbage). For the launch this is good
 * enough; a unique index on `(orgId, isDefault) WHERE isDefault` would
 * tighten it.
 *
 * Why lazy seed in addition to eager seed at workspace creation:
 * legacy workspaces created before pipeline-seeding was wired into
 * `createAnonymousWorkspace` (most workspaces minted via the MCP
 * `create_workspace` tool prior to 2026-04-29) have no pipelines row.
 * Without lazy seed, the very first `createDealAction` call on those
 * workspaces throws "Pipeline not configured" and the kanban
 * `<CreateDealForm>` submission lands the page in the global error
 * boundary. Lazy seed makes "create your first deal" Just Work.
 */
export async function ensureDefaultPipelineForOrg(
  orgId: string,
  workspaceName?: string | null,
  overrides?: { stages?: PipelineStage[]; pipelineName?: string }
): Promise<{ id: string; stages: PipelineStage[] }> {
  const [existing] = await db
    .select({ id: pipelines.id, stages: pipelines.stages })
    .from(pipelines)
    .where(and(eq(pipelines.orgId, orgId), eq(pipelines.isDefault, true)))
    .limit(1);

  if (existing) {
    return { id: existing.id, stages: existing.stages };
  }

  // Personality-driven seed when caller supplies stages (e.g. HVAC's
  // "New Lead → Estimate Scheduled → …" funnel). Falls back to the
  // generic B2B funnel for legacy callers and lazy-seed paths that
  // don't carry personality context.
  const stages = overrides?.stages?.length ? overrides.stages : DEFAULT_PIPELINE_STAGES;
  const name =
    overrides?.pipelineName ??
    (workspaceName ? `${workspaceName} pipeline` : "Default pipeline");
  const [created] = await db
    .insert(pipelines)
    .values({
      orgId,
      name,
      stages,
      isDefault: true,
    })
    .returning({ id: pipelines.id, stages: pipelines.stages });

  if (!created) {
    throw new Error("Could not create default pipeline.");
  }

  return { id: created.id, stages: created.stages };
}
