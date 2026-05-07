// v1.26.0 — public agent turn endpoint
//
// POST /api/v1/public/agent/<slug>/turn
//   body: {
//     conversation_id?: string,        // omitted on first turn
//     anonymous_session_id?: string,   // browser-stable id from embed
//     message: string,
//     channel_meta?: object             // referrer, page url, etc.
//   }
//   response: {
//     conversation_id: string,
//     message: string,
//     validators_critical_failed?: boolean
//   }
//
// Auth: anonymous. Agent's `slug` resolves to its workspace via
// `(orgs.slug, agents.slug)` join. The agent must be in 'live' or
// 'test' status.
//
// v1.26.0 ships non-streaming JSON response. v1.26.1 adds SSE.

import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { agentConversations, agents, organizations } from "@/db/schema";
import { executeTurn } from "@/lib/agents/runtime";

type Body = {
  conversation_id?: string;
  anonymous_session_id?: string;
  message?: string;
  channel_meta?: Record<string, unknown>;
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug: agentSlugPath } = await context.params;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ error: "missing_message" }, { status: 400 });
  }
  if (message.length > 2000) {
    return NextResponse.json({ error: "message_too_long" }, { status: 400 });
  }

  // Resolve agent. The slug path encodes org + agent: format
  // "<orgSlug>--<agentSlug>". This avoids needing two URL params for
  // public chat embeds (one slug per workspace+agent pair). Operators
  // who only have one agent can use just the org slug.
  const [orgSlugPart, agentSlugPart] = agentSlugPath.includes("--")
    ? agentSlugPath.split("--", 2)
    : [agentSlugPath, "default"];

  const [agentRow] = await db
    .select({
      id: agents.id,
      orgId: agents.orgId,
      orgSlug: organizations.slug,
      orgName: organizations.name,
      agentSlug: agents.slug,
      status: agents.status,
    })
    .from(agents)
    .innerJoin(organizations, eq(organizations.id, agents.orgId))
    .where(
      and(
        eq(organizations.slug, orgSlugPart),
        eq(agents.slug, agentSlugPart),
      ),
    )
    .limit(1);

  if (!agentRow) {
    return NextResponse.json({ error: "agent_not_found" }, { status: 404 });
  }

  if (agentRow.status !== "live" && agentRow.status !== "test") {
    return NextResponse.json(
      { error: "agent_not_active", status: agentRow.status },
      { status: 403 },
    );
  }

  // Get-or-create conversation
  let conversationId = body.conversation_id;
  if (!conversationId) {
    const [agentForVersion] = await db
      .select({ currentVersion: agents.currentVersion })
      .from(agents)
      .where(eq(agents.id, agentRow.id))
      .limit(1);
    const [created] = await db
      .insert(agentConversations)
      .values({
        agentId: agentRow.id,
        agentVersion: agentForVersion?.currentVersion ?? 1,
        orgId: agentRow.orgId,
        anonymousSessionId: body.anonymous_session_id ?? null,
        channelMeta: body.channel_meta ?? {},
        status: agentRow.status === "test" ? "test" : "active",
      })
      .returning({ id: agentConversations.id });
    if (!created) {
      return NextResponse.json(
        { error: "conversation_create_failed" },
        { status: 500 },
      );
    }
    conversationId = created.id;
  }

  const result = await executeTurn({
    conversationId,
    userMessage: message,
  });

  if (!result.ok) {
    return NextResponse.json({
      conversation_id: conversationId,
      message: result.fallbackMessage,
      degraded: true,
      reason: result.reason,
    });
  }

  return NextResponse.json({
    conversation_id: conversationId,
    message: result.assistantMessage,
    validators_critical_failed: result.validators.some(
      (v) =>
        !v.passed &&
        // critical validators only — these are the ones that gate
        // response delivery. quotes_only / no_injection / no_pii.
        ["quotes_only_from_soul_pricing", "no_prompt_injection_echo", "no_pii_leak"].includes(v.name),
    ),
  });
}
