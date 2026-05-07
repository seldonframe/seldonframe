// v1.28.1 — consolidated workspace-state endpoint
//
// Replaces 4-6 progressive MCP discovery calls with one. Returns
// everything Claude Code (or any client) needs to reason about a
// workspace's current state in a single round-trip:
//
//   - Workspace identity (id, name, slug, soul.industry, timezone)
//   - Integrations status (which LLM providers configured, which CRM
//     extras like Twilio/Resend are wired)
//   - Agents with INLINE health stats (status, version, eval pass rate,
//     validator pass rate 24h, conversations 24h)
//   - High-level counts (contacts, bookings, deals, agents)
//
// The MCP tool get_workspace_state wraps this. Every other discovery
// path (list_agents, get_agent_metrics, list of appointment types, etc.)
// remains available — this is sugar for the "what's in this workspace?"
// case which is overwhelmingly the most common question.

import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  agents,
  agentConversations,
  agentEvals,
  agentTurns,
  bookings,
  contacts,
  deals,
  organizations,
} from "@/db/schema";
import { guardApiRequest } from "@/lib/api/guard";

export async function GET(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const orgId = guard.orgId;
  const sinceTs = new Date(Date.now() - 24 * 3600 * 1000);

  // 1. Workspace identity
  const [org] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      soul: organizations.soul,
      timezone: organizations.timezone,
      integrations: organizations.integrations,
      theme: organizations.theme,
      createdAt: organizations.createdAt,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org) {
    return NextResponse.json(
      { ok: false, error: "workspace_not_found" },
      { status: 404 },
    );
  }

  // 2. Integrations status — flag which providers are configured
  // WITHOUT exposing the encrypted keys themselves.
  const integrations = (org.integrations ?? {}) as Record<string, unknown>;
  function isConfigured(key: string): boolean {
    const entry = integrations[key];
    if (!entry || typeof entry !== "object") return false;
    const obj = entry as Record<string, unknown>;
    return Boolean(obj.apiKey || obj.accessToken || obj.token);
  }

  // 3. Agents with inline health stats
  const agentRows = await db
    .select({
      id: agents.id,
      name: agents.name,
      slug: agents.slug,
      channel: agents.channel,
      archetype: agents.archetype,
      status: agents.status,
      currentVersion: agents.currentVersion,
      createdAt: agents.createdAt,
      updatedAt: agents.updatedAt,
    })
    .from(agents)
    .where(eq(agents.orgId, orgId))
    .orderBy(desc(agents.createdAt));

  // Per-agent stats: 24h conversations + validator pass rate + latest
  // eval pass rate. Computed in parallel for speed.
  const agentStats = await Promise.all(
    agentRows.map(async (agent) => {
      const [convAgg] = await db
        .select({
          conversations: sql<number>`count(distinct ${agentConversations.id})`,
        })
        .from(agentConversations)
        .where(
          and(
            eq(agentConversations.agentId, agent.id),
            gte(agentConversations.startedAt, sinceTs),
            sql`(${agentConversations.channelMeta} ->> 'eval_run') IS DISTINCT FROM 'true'`,
          ),
        );

      const [validatorAgg] = await db
        .select({
          total: sql<number>`count(*)`,
          clean: sql<number>`count(*) filter (where not exists (select 1 from jsonb_array_elements(${agentTurns.validatorsPassed}) elem where (elem->>'passed')::boolean = false))`,
        })
        .from(agentTurns)
        .innerJoin(
          agentConversations,
          eq(agentConversations.id, agentTurns.conversationId),
        )
        .where(
          and(
            eq(agentConversations.agentId, agent.id),
            eq(agentTurns.role, "assistant"),
            gte(agentTurns.createdAt, sinceTs),
          ),
        );

      const evalRows = await db
        .select({
          scenarioId: agentEvals.scenarioId,
          passed: agentEvals.passed,
          ranAt: agentEvals.ranAt,
        })
        .from(agentEvals)
        .where(eq(agentEvals.agentId, agent.id))
        .orderBy(desc(agentEvals.ranAt))
        .limit(50);

      const latestByScenario = new Map<string, boolean | null>();
      let mostRecentRun: Date | null = null;
      for (const row of evalRows) {
        if (!latestByScenario.has(row.scenarioId)) {
          latestByScenario.set(row.scenarioId, row.passed);
          if (!mostRecentRun || row.ranAt > mostRecentRun)
            mostRecentRun = row.ranAt;
        }
      }
      const evalTotal = latestByScenario.size;
      const evalPassed = [...latestByScenario.values()].filter(
        (p) => p === true,
      ).length;

      return {
        id: agent.id,
        name: agent.name,
        slug: agent.slug,
        channel: agent.channel,
        archetype: agent.archetype,
        status: agent.status,
        version: agent.currentVersion,
        created_at: agent.createdAt,
        updated_at: agent.updatedAt,
        stats: {
          conversations_24h: Number(convAgg?.conversations ?? 0),
          validator_pass_rate_24h:
            validatorAgg && validatorAgg.total > 0
              ? validatorAgg.clean / validatorAgg.total
              : null,
          validator_total_turns_24h: Number(validatorAgg?.total ?? 0),
          eval_pass_rate: evalTotal > 0 ? evalPassed / evalTotal : null,
          eval_passed: evalPassed,
          eval_total: evalTotal,
          eval_meets_publish_gate:
            evalTotal > 0 ? evalPassed / evalTotal >= 0.875 : null,
          last_eval_run_at: mostRecentRun
            ? mostRecentRun.toISOString()
            : null,
        },
      };
    }),
  );

  // 4. High-level counts (single round-trip via parallel awaits)
  const [contactsCount, bookingsCount, dealsCount] = await Promise.all([
    db
      .select({ n: count() })
      .from(contacts)
      .where(eq(contacts.orgId, orgId))
      .then((r) => Number(r[0]?.n ?? 0)),
    db
      .select({ n: count() })
      .from(bookings)
      .where(eq(bookings.orgId, orgId))
      .then((r) => Number(r[0]?.n ?? 0)),
    db
      .select({ n: count() })
      .from(deals)
      .where(eq(deals.orgId, orgId))
      .then((r) => Number(r[0]?.n ?? 0)),
  ]);

  const baseDomain =
    process.env.WORKSPACE_BASE_DOMAIN?.trim() || "app.seldonframe.com";

  // 6. Compose response. Designed to be self-explanatory to an LLM:
  // each section answers a question Claude Code would otherwise have
  // to ask via separate tool calls.
  return NextResponse.json({
    ok: true,
    workspace: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      timezone: org.timezone,
      industry:
        ((org.soul as { industry?: string } | null)?.industry as string) ??
        null,
      created_at: org.createdAt,
      dashboard_url: `https://${baseDomain}/dashboard`,
      public_site_url: `https://${org.slug}.${baseDomain.replace(/^app\./, "")}`,
    },
    integrations: {
      anthropic: { configured: isConfigured("anthropic") },
      openai: { configured: isConfigured("openai") },
      twilio: { configured: isConfigured("twilio") },
      resend: { configured: isConfigured("resend") },
      kit: { configured: isConfigured("kit") },
      mailchimp: { configured: isConfigured("mailchimp") },
    },
    agents: agentStats,
    counts: {
      contacts: contactsCount,
      bookings: bookingsCount,
      deals: dealsCount,
      agents: agentRows.length,
    },
    next_steps: composeNextSteps({
      agentCount: agentRows.length,
      anthropicConfigured: isConfigured("anthropic"),
      anyAgentLive: agentStats.some((a) => a.status === "live"),
      anyAgentNeedingEvalRun: agentStats.some(
        (a) =>
          a.status !== "live" && (a.stats.eval_total === 0 || !a.stats.eval_meets_publish_gate),
      ),
    }),
  });
}

function composeNextSteps(input: {
  agentCount: number;
  anthropicConfigured: boolean;
  anyAgentLive: boolean;
  anyAgentNeedingEvalRun: boolean;
}): string[] {
  const steps: string[] = [];
  if (!input.anthropicConfigured) {
    steps.push(
      "Configure Anthropic LLM key — call configure_llm_provider({ provider: 'anthropic' }) (auto-detects ANTHROPIC_API_KEY from your shell env), or paste in /settings/integrations/llm.",
    );
  }
  if (input.agentCount === 0) {
    steps.push(
      "No agents yet — call build_website_chatbot to create your first chatbot end-to-end (configures LLM + creates + publishes to test in one call).",
    );
  } else if (input.anyAgentNeedingEvalRun) {
    steps.push(
      "One or more agents in draft/test — run their eval suite via /agents/[id]/evals → 'Run evals now' or call run_agent_evals from MCP. Need ≥87.5% pass to promote to live.",
    );
  } else if (!input.anyAgentLive) {
    steps.push(
      "All agents pass evals but none are live — promote with publish_agent({ status: 'live' }).",
    );
  } else {
    steps.push(
      "Workspace is healthy. Use update_website_chatbot to iterate FAQ/pricing on existing agents, or tail_agent_conversations to see recent customer chats.",
    );
  }
  return steps;
}
