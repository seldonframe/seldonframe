// src/lib/operator-portal/today.ts
// NOT "use server" — called from the Today page server component.
import { db } from "@/db";
import { deals, pipelines } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export type PipelineStageInfo = { name: string; probability: number };

export type PipelineRollupDeps = {
  fetchDeals: (orgId: string) => Promise<Array<{ stage: string; value: string }>>;
  fetchPipelineStages: (orgId: string) => Promise<PipelineStageInfo[]>;
};

export type StageRollup = {
  name: string;
  totalValue: number;
  count: number;
};

export type PipelineRollup = {
  totalOpenValue: number;
  byStage: StageRollup[];
};

/** A stage is closed when it is Won (probability=100) or Lost
 *  (probability=0 AND name contains "lost", case-insensitive). */
export async function isClosedStage(stage: PipelineStageInfo): Promise<boolean> {
  if (stage.probability === 100) return true;
  if (stage.probability === 0 && stage.name.toLowerCase().includes("lost")) return true;
  return false;
}

function defaultDeps(): PipelineRollupDeps {
  return {
    fetchDeals: async (orgId) => {
      return db
        .select({ stage: deals.stage, value: deals.value })
        .from(deals)
        .where(eq(deals.orgId, orgId));
    },
    fetchPipelineStages: async (orgId) => {
      const [pipeline] = await db
        .select({ stages: pipelines.stages })
        .from(pipelines)
        .where(and(eq(pipelines.orgId, orgId), eq(pipelines.isDefault, true)))
        .limit(1);
      return (pipeline?.stages ?? []) as PipelineStageInfo[];
    },
  };
}

export async function getPipelineRollup(
  orgId: string,
  deps: PipelineRollupDeps = defaultDeps()
): Promise<PipelineRollup> {
  const [allDeals, pipelineStages] = await Promise.all([
    deps.fetchDeals(orgId),
    deps.fetchPipelineStages(orgId),
  ]);

  const stageMap = new Map<string, PipelineStageInfo>(
    pipelineStages.map((s) => [s.name, s])
  );

  const openDeals = allDeals.filter((d) => {
    const stageInfo = stageMap.get(d.stage);
    if (!stageInfo) return true; // unknown stage → treat as open
    // sync-call the pure logic (isClosedStage is trivially async for "use server" compat; call inline)
    if (stageInfo.probability === 100) return false;
    if (stageInfo.probability === 0 && stageInfo.name.toLowerCase().includes("lost")) return false;
    return true;
  });

  const byStageMap = new Map<string, StageRollup>();
  let totalOpenValue = 0;

  for (const d of openDeals) {
    const v = Number(d.value) || 0;
    totalOpenValue += v;
    const existing = byStageMap.get(d.stage);
    if (existing) {
      existing.totalValue += v;
      existing.count += 1;
    } else {
      byStageMap.set(d.stage, { name: d.stage, totalValue: v, count: 1 });
    }
  }

  return { totalOpenValue, byStage: Array.from(byStageMap.values()) };
}
