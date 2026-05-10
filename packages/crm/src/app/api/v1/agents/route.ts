// v1.26.2 — agent CRUD + debug HTTP endpoint (MCP-callable, workspace-scoped)
//
// POST /api/v1/agents
//   Dispatches on body.op:
//     - "create"            → createAgent
//     - "update_blueprint"  → updateAgentBlueprint
//     - "publish"           → publishAgent (eval-gated for status='live')
//     - "list"              → list agents for caller's workspace
//     - "set_llm_key"       → BYOK provider config
//     - "run_evals"         → execute eval suite, persist + return summary
//     - "tail_conversations" → recent N conversations (excludes eval runs)
//     - "get_conversation"  → full transcript with tool calls + validators
//     - "replay_conversation" → re-run user msgs against current blueprint
//     - "get_metrics"       → aggregate stats over a window
//
// Auth: workspace bearer (same pattern as /api/v1/partner-agencies).
// Caller's bearer resolves to a workspace orgId; agents are scoped to it.

import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  agents,
  agentConversations,
  agentTurns,
  agentEvals,
  organizations,
} from "@/db/schema";
import { guardApiRequest } from "@/lib/api/guard";
import { logEvent } from "@/lib/observability/log";
import { encryptValue } from "@/lib/encryption";
import {
  createAgent,
  publishAgent,
  updateAgentBlueprint,
} from "@/lib/agents/store";
import { runEvalSuite } from "@/lib/agents/eval-runner";
import { executeTurn } from "@/lib/agents/runtime";
// v1.40.7 — workspace-level chatbot embed.
import {
  setPublicChatbotEmbed,
  clearPublicChatbotEmbed,
} from "@/lib/agents/public-embed";

type Body = {
  op?: unknown;
  // create
  name?: unknown;
  archetype?: unknown;
  channel?: unknown;
  capabilities?: unknown;
  faq?: unknown;
  pricing_facts?: unknown;
  greeting?: unknown;
  // update
  agent_id?: unknown;
  patch?: unknown;
  publish_notes?: unknown;
  // publish
  status?: unknown;
  force?: unknown;
  // set_llm_key
  provider?: unknown;
  api_key?: unknown;
  // tail_conversations / get_conversation / get_metrics / replay
  conversation_id?: unknown;
  limit?: unknown;
  since_hours?: unknown;
  include_eval_runs?: unknown;
};

const VALID_OPS = [
  "create",
  "update_blueprint",
  "publish",
  "list",
  "set_llm_key",
  "run_evals",
  "tail_conversations",
  "get_conversation",
  "replay_conversation",
  "get_metrics",
  // v1.40.7 — embed chatbot on workspace's public landing.
  "embed_on_landing",
  "remove_from_landing",
] as const;
type Op = (typeof VALID_OPS)[number];

export async function POST(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const body = (await request.json().catch(() => ({}))) as Body;
  const op =
    typeof body.op === "string" && (VALID_OPS as readonly string[]).includes(body.op)
      ? (body.op as Op)
      : null;
  if (!op) {
    return NextResponse.json(
      { ok: false, error: "missing_op", allowed: VALID_OPS },
      { status: 400 },
    );
  }

  if (op === "create") {
    if (typeof body.name !== "string") {
      return NextResponse.json(
        { ok: false, error: "missing_required_field", required: ["name"] },
        { status: 400 },
      );
    }
    const archetype =
      typeof body.archetype === "string" ? body.archetype : "website-chatbot";
    const channel = typeof body.channel === "string" ? body.channel : "web_chat";
    if (!["website-chatbot", "voice-receptionist", "sms-followup-bot"].includes(archetype)) {
      return NextResponse.json(
        { ok: false, error: "invalid_archetype", allowed: ["website-chatbot", "voice-receptionist", "sms-followup-bot"] },
        { status: 400 },
      );
    }
    if (!["web_chat", "voice", "sms", "email"].includes(channel)) {
      return NextResponse.json(
        { ok: false, error: "invalid_channel" },
        { status: 400 },
      );
    }

    const result = await createAgent({
      orgId: guard.orgId,
      name: body.name,
      archetype: archetype as "website-chatbot" | "voice-receptionist" | "sms-followup-bot",
      channel: channel as "web_chat" | "voice" | "sms" | "email",
      capabilities: Array.isArray(body.capabilities)
        ? (body.capabilities.filter((c) => typeof c === "string") as string[])
        : undefined,
      faq: Array.isArray(body.faq)
        ? (body.faq as Array<{ q: string; a: string }>)
        : undefined,
      pricingFacts: Array.isArray(body.pricing_facts)
        ? (body.pricing_facts as Array<{ label: string; amount: number; currency: string }>)
        : undefined,
      greeting: typeof body.greeting === "string" ? body.greeting : undefined,
    });

    if (!result.ok) {
      logEvent(
        "v26_create_agent_failed",
        { error: result.error, validation_errors: result.validation_errors },
        { request, orgId: guard.orgId, status: 422, severity: "warn" },
      );
      return NextResponse.json(result, { status: 422 });
    }

    logEvent(
      "v26_create_agent_succeeded",
      { agent_id: result.agent.id, archetype, channel },
      { request, orgId: guard.orgId, status: 200 },
    );

    return NextResponse.json({
      ok: true,
      agent: {
        id: result.agent.id,
        name: result.agent.name,
        slug: result.agent.slug,
        channel: result.agent.channel,
        archetype: result.agent.archetype,
        status: result.agent.status,
        version: result.agent.currentVersion,
      },
      embed_url: result.embedUrl,
      turn_url: result.turnUrl,
      next_steps: [
        "Test the agent in sandbox: POST to turn_url with {message: '...'} and a unique anonymous_session_id.",
        "Once you're happy, publish with op='publish', status='live'.",
        "Add agent to your website with: <script src=\"" + result.embedUrl + "\" async></script>",
      ],
    });
  }

  if (op === "update_blueprint") {
    if (typeof body.agent_id !== "string" || typeof body.patch !== "object") {
      return NextResponse.json(
        { ok: false, error: "missing_required_field", required: ["agent_id", "patch"] },
        { status: 400 },
      );
    }
    const result = await updateAgentBlueprint({
      agentId: body.agent_id,
      orgId: guard.orgId,
      patch: body.patch as Record<string, unknown>,
      publishNotes:
        typeof body.publish_notes === "string" ? body.publish_notes : undefined,
    });
    if (!result.ok) {
      return NextResponse.json(result, { status: 422 });
    }
    return NextResponse.json(result);
  }

  if (op === "publish") {
    if (typeof body.agent_id !== "string" || typeof body.status !== "string") {
      return NextResponse.json(
        { ok: false, error: "missing_required_field", required: ["agent_id", "status"] },
        { status: 400 },
      );
    }
    if (!["draft", "test", "live", "paused"].includes(body.status)) {
      return NextResponse.json(
        { ok: false, error: "invalid_status" },
        { status: 400 },
      );
    }
    const result = await publishAgent({
      agentId: body.agent_id,
      orgId: guard.orgId,
      status: body.status as "draft" | "test" | "live" | "paused",
      force: body.force === true,
    });
    if (!result.ok) {
      return NextResponse.json(result, { status: 422 });
    }
    return NextResponse.json(result);
  }

  if (op === "set_llm_key") {
    if (typeof body.provider !== "string" || typeof body.api_key !== "string") {
      return NextResponse.json(
        { ok: false, error: "missing_required_field", required: ["provider", "api_key"] },
        { status: 400 },
      );
    }
    if (!["anthropic", "openai"].includes(body.provider)) {
      return NextResponse.json(
        { ok: false, error: "invalid_provider", allowed: ["anthropic", "openai"] },
        { status: 400 },
      );
    }
    if (body.api_key.length < 10) {
      return NextResponse.json(
        { ok: false, error: "invalid_api_key" },
        { status: 400 },
      );
    }

    // Encrypt at rest. encryptValue prefixes "v1." which the
    // existing decryptIfNeeded path in lib/ai/client.ts recognizes.
    let encryptedKey: string;
    try {
      encryptedKey = encryptValue(body.api_key);
    } catch (err) {
      console.error(
        `[agents/set_llm_key] encryption_failed orgId=${guard.orgId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return NextResponse.json(
        {
          ok: false,
          error: "encryption_unavailable",
          hint: "Set ENCRYPTION_KEY env var on the deployment.",
        },
        { status: 503 },
      );
    }

    // Merge into organizations.integrations jsonb. Other providers'
    // entries (kit, mailchimp, etc.) remain untouched.
    const [orgRow] = await db
      .select({ integrations: organizations.integrations })
      .from(organizations)
      .where(eq(organizations.id, guard.orgId))
      .limit(1);
    const existing = (orgRow?.integrations ?? {}) as Record<string, unknown>;
    const next = {
      ...existing,
      [body.provider]: {
        ...((existing[body.provider] as Record<string, unknown>) ?? {}),
        apiKey: encryptedKey,
      },
    };

    await db
      .update(organizations)
      .set({ integrations: next, updatedAt: new Date() })
      .where(eq(organizations.id, guard.orgId));

    logEvent(
      "v26_agent_llm_key_configured",
      { provider: body.provider },
      { request, orgId: guard.orgId, status: 200 },
    );

    return NextResponse.json({
      ok: true,
      provider: body.provider,
      configured_at: new Date().toISOString(),
      next_steps: [
        "Create your first agent: call create_agent with your workspace's archetype + faq + pricing_facts.",
        "Test in sandbox before flipping to live: publish_agent with status='test'.",
        "Once you're happy, publish_agent with status='live' and add the embed snippet to your website.",
      ],
    });
  }

  if (op === "run_evals") {
    if (typeof body.agent_id !== "string") {
      return NextResponse.json(
        { ok: false, error: "missing_required_field", required: ["agent_id"] },
        { status: 400 },
      );
    }
    const result = await runEvalSuite({
      agentId: body.agent_id,
      orgId: guard.orgId,
    });
    if (!result.ok) {
      return NextResponse.json(result, { status: 422 });
    }
    return NextResponse.json(result);
  }

  if (op === "tail_conversations") {
    if (typeof body.agent_id !== "string") {
      return NextResponse.json(
        { ok: false, error: "missing_required_field", required: ["agent_id"] },
        { status: 400 },
      );
    }
    const limit = Math.min(
      typeof body.limit === "number" ? body.limit : 20,
      100,
    );
    const includeEvalRuns = body.include_eval_runs === true;
    // Verify agent ownership
    const [agent] = await db
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.id, body.agent_id), eq(agents.orgId, guard.orgId)))
      .limit(1);
    if (!agent) {
      return NextResponse.json(
        { ok: false, error: "agent_not_found" },
        { status: 404 },
      );
    }
    const conds = [eq(agentConversations.agentId, body.agent_id)];
    if (!includeEvalRuns) {
      conds.push(
        sql`(${agentConversations.channelMeta} ->> 'eval_run') IS DISTINCT FROM 'true'`,
      );
    }
    const rows = await db
      .select({
        id: agentConversations.id,
        status: agentConversations.status,
        startedAt: agentConversations.startedAt,
        lastTurnAt: agentConversations.lastTurnAt,
        turnCount: agentConversations.turnCount,
        tokensIn: agentConversations.tokensIn,
        tokensOut: agentConversations.tokensOut,
        llmCostCents: agentConversations.llmCostCents,
        anonymousSessionId: agentConversations.anonymousSessionId,
        channelMeta: agentConversations.channelMeta,
      })
      .from(agentConversations)
      .where(and(...conds))
      .orderBy(desc(agentConversations.lastTurnAt))
      .limit(limit);

    // Enrich with first user msg for quick scanning.
    const ids = rows.map((r) => r.id);
    const firstTurns =
      ids.length === 0
        ? []
        : await db
            .select({
              conversationId: agentTurns.conversationId,
              role: agentTurns.role,
              content: agentTurns.content,
              turnIndex: agentTurns.turnIndex,
            })
            .from(agentTurns)
            .where(
              and(
                sql`${agentTurns.conversationId} = ANY(${sql.raw(`ARRAY[${ids.map((id) => `'${id}'`).join(",")}]::uuid[]`)})`,
                sql`${agentTurns.turnIndex} <= 1`,
              ),
            );
    const firstUserByConv = new Map<string, string>();
    for (const t of firstTurns) {
      if (t.role === "user" && !firstUserByConv.has(t.conversationId)) {
        firstUserByConv.set(t.conversationId, t.content ?? "");
      }
    }

    return NextResponse.json({
      ok: true,
      conversations: rows.map((r) => ({
        ...r,
        first_user_message: firstUserByConv.get(r.id) ?? null,
      })),
    });
  }

  if (op === "get_conversation") {
    if (typeof body.conversation_id !== "string") {
      return NextResponse.json(
        {
          ok: false,
          error: "missing_required_field",
          required: ["conversation_id"],
        },
        { status: 400 },
      );
    }
    const [conv] = await db
      .select()
      .from(agentConversations)
      .where(
        and(
          eq(agentConversations.id, body.conversation_id),
          eq(agentConversations.orgId, guard.orgId),
        ),
      )
      .limit(1);
    if (!conv) {
      return NextResponse.json(
        { ok: false, error: "conversation_not_found" },
        { status: 404 },
      );
    }
    const turns = await db
      .select()
      .from(agentTurns)
      .where(eq(agentTurns.conversationId, conv.id))
      .orderBy(asc(agentTurns.turnIndex));
    return NextResponse.json({
      ok: true,
      conversation: conv,
      turns,
    });
  }

  if (op === "replay_conversation") {
    if (typeof body.conversation_id !== "string") {
      return NextResponse.json(
        {
          ok: false,
          error: "missing_required_field",
          required: ["conversation_id"],
        },
        { status: 400 },
      );
    }
    const [orig] = await db
      .select()
      .from(agentConversations)
      .where(
        and(
          eq(agentConversations.id, body.conversation_id),
          eq(agentConversations.orgId, guard.orgId),
        ),
      )
      .limit(1);
    if (!orig) {
      return NextResponse.json(
        { ok: false, error: "conversation_not_found" },
        { status: 404 },
      );
    }
    const origTurns = await db
      .select({
        turnIndex: agentTurns.turnIndex,
        role: agentTurns.role,
        content: agentTurns.content,
      })
      .from(agentTurns)
      .where(eq(agentTurns.conversationId, orig.id))
      .orderBy(asc(agentTurns.turnIndex));

    const userMessages = origTurns
      .filter((t) => t.role === "user")
      .map((t) => t.content ?? "");

    // Create a new ephemeral test conversation against the CURRENT
    // blueprint version.
    const [agentRow] = await db
      .select({ currentVersion: agents.currentVersion })
      .from(agents)
      .where(eq(agents.id, orig.agentId))
      .limit(1);
    const [replayConv] = await db
      .insert(agentConversations)
      .values({
        agentId: orig.agentId,
        agentVersion: agentRow?.currentVersion ?? 1,
        orgId: orig.orgId,
        status: "test",
        channelMeta: {
          replay_of: orig.id,
          replay_run: true,
        },
      })
      .returning({ id: agentConversations.id });

    if (!replayConv) {
      return NextResponse.json(
        { ok: false, error: "replay_conversation_create_failed" },
        { status: 500 },
      );
    }

    const replayTurns: Array<{
      userMessage: string;
      assistantMessage: string;
      ok: boolean;
      reason?: string;
    }> = [];
    for (const userMessage of userMessages) {
      const turn = await executeTurn({
        conversationId: replayConv.id,
        userMessage,
      });
      replayTurns.push({
        userMessage,
        assistantMessage: turn.ok
          ? turn.assistantMessage
          : turn.fallbackMessage,
        ok: turn.ok,
        reason: turn.ok ? undefined : turn.reason,
      });
    }

    return NextResponse.json({
      ok: true,
      original_conversation_id: orig.id,
      replay_conversation_id: replayConv.id,
      original_turns: origTurns,
      replay_turns: replayTurns,
    });
  }

  if (op === "get_metrics") {
    if (typeof body.agent_id !== "string") {
      return NextResponse.json(
        { ok: false, error: "missing_required_field", required: ["agent_id"] },
        { status: 400 },
      );
    }
    const sinceHours =
      typeof body.since_hours === "number" ? body.since_hours : 24;
    const sinceTs = new Date(Date.now() - sinceHours * 3600 * 1000);

    const [agent] = await db
      .select({
        id: agents.id,
        name: agents.name,
        status: agents.status,
        currentVersion: agents.currentVersion,
      })
      .from(agents)
      .where(and(eq(agents.id, body.agent_id), eq(agents.orgId, guard.orgId)))
      .limit(1);
    if (!agent) {
      return NextResponse.json(
        { ok: false, error: "agent_not_found" },
        { status: 404 },
      );
    }

    // Conversations + turn aggregates over the window
    const [aggRow] = await db
      .select({
        conversations: sql<number>`count(distinct ${agentConversations.id})`,
        turns: sql<number>`count(${agentTurns.id})`,
        tokensIn: sql<number>`coalesce(sum(${agentTurns.tokensIn}), 0)`,
        tokensOut: sql<number>`coalesce(sum(${agentTurns.tokensOut}), 0)`,
        avgLatency: sql<number>`coalesce(avg(${agentTurns.latencyMs}), 0)::int`,
      })
      .from(agentConversations)
      .leftJoin(
        agentTurns,
        eq(agentTurns.conversationId, agentConversations.id),
      )
      .where(
        and(
          eq(agentConversations.agentId, body.agent_id),
          gte(agentConversations.startedAt, sinceTs),
          sql`(${agentConversations.channelMeta} ->> 'eval_run') IS DISTINCT FROM 'true'`,
        ),
      );

    // Validator pass rate (assistant turns only)
    const [validatorRow] = await db
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
          eq(agentConversations.agentId, body.agent_id),
          eq(agentTurns.role, "assistant"),
          gte(agentTurns.createdAt, sinceTs),
        ),
      );

    // Latest eval pass rate
    const evalRows = await db
      .select({
        scenarioId: agentEvals.scenarioId,
        passed: agentEvals.passed,
        ranAt: agentEvals.ranAt,
      })
      .from(agentEvals)
      .where(eq(agentEvals.agentId, body.agent_id))
      .orderBy(desc(agentEvals.ranAt))
      .limit(50);

    const latestByScenario = new Map<string, boolean | null>();
    for (const row of evalRows) {
      if (!latestByScenario.has(row.scenarioId)) {
        latestByScenario.set(row.scenarioId, row.passed);
      }
    }
    const evalTotal = latestByScenario.size;
    const evalPassed = [...latestByScenario.values()].filter(
      (p) => p === true,
    ).length;

    return NextResponse.json({
      ok: true,
      agent: {
        id: agent.id,
        name: agent.name,
        status: agent.status,
        current_version: agent.currentVersion,
      },
      window_hours: sinceHours,
      conversations: aggRow?.conversations ?? 0,
      turns: aggRow?.turns ?? 0,
      tokens_in: aggRow?.tokensIn ?? 0,
      tokens_out: aggRow?.tokensOut ?? 0,
      avg_latency_ms: aggRow?.avgLatency ?? 0,
      validator_pass_rate:
        validatorRow && validatorRow.total > 0
          ? validatorRow.clean / validatorRow.total
          : null,
      validator_total_turns: validatorRow?.total ?? 0,
      eval_pass_rate: evalTotal > 0 ? evalPassed / evalTotal : null,
      eval_total: evalTotal,
      eval_passed: evalPassed,
    });
  }

  // v1.40.7 — embed_on_landing: stash the agent's embed.js URL on the
  // organization so the public landing page renderer (/s/ + /l/ routes)
  // injects <script src="..." async></script>. One-shot — no per-section
  // editing, no Pages → Edit step, no copy-paste. The chatbot bubble
  // floats on every public page of the workspace until removed.
  if (op === "embed_on_landing") {
    if (typeof body.agent_id !== "string" || !body.agent_id.trim()) {
      return NextResponse.json(
        { ok: false, error: "missing_required_field", required: ["agent_id"] },
        { status: 400 },
      );
    }
    const [agent] = await db
      .select({
        id: agents.id,
        name: agents.name,
        slug: agents.slug,
        status: agents.status,
        orgId: agents.orgId,
        orgSlug: organizations.slug,
      })
      .from(agents)
      .innerJoin(organizations, eq(organizations.id, agents.orgId))
      .where(eq(agents.id, body.agent_id))
      .limit(1);
    if (!agent || agent.orgId !== guard.orgId) {
      return NextResponse.json(
        { ok: false, error: "agent_not_found" },
        { status: 404 },
      );
    }
    if (agent.status !== "live" && agent.status !== "test") {
      return NextResponse.json(
        {
          ok: false,
          error: "agent_not_published",
          message:
            "Publish the agent (status=test or live) before embedding it on the landing page.",
        },
        { status: 422 },
      );
    }
    const baseDomain =
      process.env.WORKSPACE_BASE_DOMAIN?.trim() || "app.seldonframe.com";
    const embedUrl = `https://${baseDomain}/api/v1/public/agent/${agent.orgSlug}--${agent.slug}/embed.js`;
    try {
      await setPublicChatbotEmbed(agent.orgId, {
        embedUrl,
        agentId: agent.id,
      });
    } catch (err) {
      logEvent("agent_embed_on_landing_error", {
        agent_id: agent.id,
        org_id: agent.orgId,
        error: err instanceof Error ? err.message : String(err),
      });
      return NextResponse.json(
        { ok: false, error: "persist_failed" },
        { status: 500 },
      );
    }
    return NextResponse.json({
      ok: true,
      agent_id: agent.id,
      agent_name: agent.name,
      embed_url: embedUrl,
      message: `${agent.name} is now live on every page of the workspace's public landing. Visitors see the chat bubble bottom-right; conversations appear in /agents/${agent.id}/conversations.`,
    });
  }

  if (op === "remove_from_landing") {
    try {
      await clearPublicChatbotEmbed(guard.orgId);
    } catch (err) {
      logEvent("agent_remove_from_landing_error", {
        org_id: guard.orgId,
        error: err instanceof Error ? err.message : String(err),
      });
      return NextResponse.json(
        { ok: false, error: "persist_failed" },
        { status: 500 },
      );
    }
    return NextResponse.json({
      ok: true,
      message:
        "Chatbot removed from public landing. The agent itself is unchanged and still serves /agents/[id]/test.",
    });
  }

  // op === "list"
  const rows = await db
    .select({
      id: agents.id,
      name: agents.name,
      slug: agents.slug,
      channel: agents.channel,
      archetype: agents.archetype,
      status: agents.status,
      currentVersion: agents.currentVersion,
      createdAt: agents.createdAt,
    })
    .from(agents)
    .where(eq(agents.orgId, guard.orgId));

  return NextResponse.json({ ok: true, agents: rows });
}
