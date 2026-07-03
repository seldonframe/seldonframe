// Improve verb + trust rail (2026-07-02) — Task 12: agent "Improve" tab.
//
// Server component: org-guarded exactly like the sibling `evals`/`settings`
// tabs on this same layout (agent-tabs.tsx) — `agents.orgId !== orgId` is a
// clean notFound, never a leak. Loads only the current blueprint (the
// "before" side of the panel's field diff); everything else (the run
// itself, the proposal's patch) is fetched client-side by the panel via the
// T9 actions + the new read-only proposal-actions.ts.

import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agents, type AgentBlueprint } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { ImprovePanel } from "./improve-panel";

export default async function AgentImprovePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const orgId = await getOrgId();
  if (!orgId) notFound();

  const [agent] = await db
    .select({ id: agents.id, blueprint: agents.blueprint, orgId: agents.orgId })
    .from(agents)
    .where(eq(agents.id, id))
    .limit(1);
  if (!agent || agent.orgId !== orgId) notFound();

  const blueprint = (agent.blueprint ?? {}) as AgentBlueprint;

  return <ImprovePanel agentId={agent.id} currentBlueprint={blueprint} />;
}
