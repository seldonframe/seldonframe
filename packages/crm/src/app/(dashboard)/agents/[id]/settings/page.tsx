// v1.27.0 — agent settings tab. Inline blueprint editing — same patch
// semantics as the MCP update_agent_blueprint tool but driven from
// the dashboard. Each save bumps blueprint version + writes a new
// agent_versions row for rollback.

import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agents, organizations, type AgentBlueprint } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { composeDefaultSkillMd } from "@/lib/agents/skills/registry";
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
      archetype: agents.archetype,
      blueprint: agents.blueprint,
      currentVersion: agents.currentVersion,
      orgId: agents.orgId,
    })
    .from(agents)
    .where(eq(agents.id, id))
    .limit(1);
  if (!agent || agent.orgId !== orgId) notFound();

  const blueprint = (agent.blueprint ?? {}) as AgentBlueprint;

  // 2026-05-17 — render the platform skill pack the same way the
  // runtime will, so the SKILL.md editor's textarea can be pre-filled
  // with what's ACTUALLY running. Operator edits this in place; saving
  // stores it as customSkillMd and the runtime substitutes their copy
  // for the platform up-front skills (hard-rules + pricing facts +
  // business facts are appended later and still platform-enforced).
  const [orgRow] = await db
    .select({ timezone: organizations.timezone })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  const tz = orgRow?.timezone ?? "America/New_York";
  const now = new Date();
  const dateFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timeFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const defaultSkillMd = composeDefaultSkillMd(agent.archetype, {
    currentDate: dateFormatter.format(now),
    currentTime: timeFormatter.format(now),
    timezone: tz,
  });

  return (
    <SettingsClient
      agentId={agent.id}
      currentVersion={agent.currentVersion}
      initialBlueprint={{
        greeting: blueprint.greeting ?? "",
        capabilities: blueprint.capabilities ?? [...ALL_CAPABILITIES],
        faq: blueprint.faq ?? [],
        pricingFacts: blueprint.pricingFacts ?? [],
        customSkillMd: blueprint.customSkillMd ?? "",
      }}
      defaultSkillMd={defaultSkillMd}
      allCapabilities={ALL_CAPABILITIES}
    />
  );
}
