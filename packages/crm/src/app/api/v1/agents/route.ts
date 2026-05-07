// v1.26.0 — agent CRUD HTTP endpoint (MCP-callable, workspace-scoped)
//
// POST /api/v1/agents
//   Dispatches on body.op:
//     - "create"          → createAgent
//     - "update_blueprint" → updateAgentBlueprint
//     - "publish"         → publishAgent
//     - "list"            → list agents for caller's workspace
//
// Auth: workspace bearer (same pattern as /api/v1/partner-agencies).
// Caller's bearer resolves to a workspace orgId; the agent is created
// in/scoped to that workspace.

import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { agents, organizations } from "@/db/schema";
import { guardApiRequest } from "@/lib/api/guard";
import { logEvent } from "@/lib/observability/log";
import { encryptValue } from "@/lib/encryption";
import {
  createAgent,
  publishAgent,
  updateAgentBlueprint,
} from "@/lib/agents/store";

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
  // set_llm_key
  provider?: unknown;
  api_key?: unknown;
};

const VALID_OPS = [
  "create",
  "update_blueprint",
  "publish",
  "list",
  "set_llm_key",
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
      tokensUsedToday: agents.tokensUsedToday,
      dailyTokenBudget: agents.dailyTokenBudget,
      createdAt: agents.createdAt,
    })
    .from(agents)
    .where(eq(agents.orgId, guard.orgId));

  return NextResponse.json({ ok: true, agents: rows });
}
