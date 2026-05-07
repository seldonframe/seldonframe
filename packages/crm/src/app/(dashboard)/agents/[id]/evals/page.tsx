// v1.27.0 — agent evals tab. Shows latest result per scenario + a
// run-now button. Re-running is gated server-side via runEvalsAction.

import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agents } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { getLatestEvalRun } from "@/lib/agents/eval-runner";
import { getScenariosForArchetype } from "@/lib/agents/eval-scenarios";
import { EvalsClient } from "./evals-client";

export default async function AgentEvalsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const orgId = await getOrgId();
  if (!orgId) notFound();

  const [agent] = await db
    .select({ id: agents.id, archetype: agents.archetype, orgId: agents.orgId })
    .from(agents)
    .where(eq(agents.id, id))
    .limit(1);
  if (!agent || agent.orgId !== orgId) notFound();

  const scenarios = getScenariosForArchetype(agent.archetype);
  const latest = await getLatestEvalRun({ agentId: agent.id, orgId });

  return (
    <EvalsClient
      agentId={agent.id}
      scenarios={scenarios.map((b) => ({
        id: b.scenario.id,
        description: b.scenario.description,
        severity: b.severity,
        category: b.category,
      }))}
      initialSummary={latest}
    />
  );
}
