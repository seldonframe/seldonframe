// v1.27.0 — agent settings tab. Inline blueprint editing — same patch
// semantics as the MCP update_agent_blueprint tool but driven from
// the dashboard. Each save bumps blueprint version + writes a new
// agent_versions row for rollback.

import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agents, type AgentBlueprint } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { SettingsClient } from "./settings-client";

const ALL_CAPABILITIES = [
  "look_up_availability",
  "book_appointment",
  "find_my_existing_appointment",
  "reschedule_appointment",
  "cancel_appointment",
  "escalate_to_human",
  "provide_faq_answer",
];

export default async function AgentSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const orgId = await getOrgId();
  if (!orgId) notFound();

  const [agent] = await db
    .select({
      id: agents.id,
      blueprint: agents.blueprint,
      currentVersion: agents.currentVersion,
      orgId: agents.orgId,
    })
    .from(agents)
    .where(eq(agents.id, id))
    .limit(1);
  if (!agent || agent.orgId !== orgId) notFound();

  const blueprint = (agent.blueprint ?? {}) as AgentBlueprint;

  return (
    <SettingsClient
      agentId={agent.id}
      currentVersion={agent.currentVersion}
      initialBlueprint={{
        greeting: blueprint.greeting ?? "",
        capabilities: blueprint.capabilities ?? [...ALL_CAPABILITIES],
        faq: blueprint.faq ?? [],
        pricingFacts: blueprint.pricingFacts ?? [],
      }}
      allCapabilities={ALL_CAPABILITIES}
    />
  );
}
