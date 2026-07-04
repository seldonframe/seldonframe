// POST /api/copilot/turn — authed SeldonChat dock turn endpoint
// (win-ladder P0/Task 3). Flag-dark: 404 when SF_WIN_LADDER isn't "1".
//
// body: { message: string }
// response:
//   { kind: "reply", text, toolEvents: { name, ok }[] }
//   { kind: "capped", used, limit, upgrade }   — 20 turns/org/day, still 200
//
// Runs on the existing executeTurn agent runtime (same conversation/turn/
// validator plumbing every other agent gets) against the ONE hidden
// "workspace_copilot" agent per org (ensureWorkspaceCopilotAgent, T2). The
// copilot's persona (never-lies / confirm-before-destructive / act-then-
// report) is threaded through blueprintOverride.customSkillMd — the same
// operator-instructions seam composeSystemPrompt already honors for every
// operator-edited SKILL.md (see prompt.ts). No new runtime params.

import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUser, getOrgId } from "@/lib/auth/helpers";
import { checkRateLimit } from "@/lib/utils/rate-limit";
import { isWinLadderOn } from "@/lib/web-build/policy";
import { ensureWorkspaceCopilotAgent } from "@/lib/agents/copilot/ensure-agent";
import { COPILOT_CAPABILITY } from "@/lib/agents/copilot/tools";
import { executeTurn } from "@/lib/agents/runtime";
import type { AgentBlueprint } from "@/db/schema";
import { capResponse, COPILOT_PERSONA } from "@/lib/agents/copilot/cap";

export const runtime = "nodejs";

const DAILY_TURN_LIMIT = 20;
const DAILY_TURN_WINDOW_MS = 86_400_000;

type Body = {
  message?: string;
};

export async function POST(request: NextRequest) {
  if (!isWinLadderOn({ SF_WIN_LADDER: process.env.SF_WIN_LADDER })) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const orgId = await getOrgId();
  if (!orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  const allowed = await checkRateLimit(
    `copilot-daily:${orgId}`,
    DAILY_TURN_LIMIT,
    DAILY_TURN_WINDOW_MS,
  );
  if (!allowed) {
    return NextResponse.json(capResponse(DAILY_TURN_LIMIT));
  }

  const { conversationIdFor } = await ensureWorkspaceCopilotAgent(orgId);
  const conversationId = await conversationIdFor(user.id);

  const blueprintOverride: AgentBlueprint = {
    capabilities: [COPILOT_CAPABILITY],
    customSkillMd: COPILOT_PERSONA,
  };

  const result = await executeTurn({
    conversationId,
    userMessage: message,
    blueprintOverride,
  });

  if (!result.ok) {
    return NextResponse.json({
      kind: "reply",
      text: result.fallbackMessage,
      toolEvents: [],
    });
  }

  const toolEvents = result.toolCalls.map((call) => {
    const toolResult = result.toolResults.find((r) => r.toolCallId === call.id);
    return { name: call.name, ok: toolResult?.ok ?? false };
  });

  return NextResponse.json({
    kind: "reply",
    text: result.assistantMessage,
    toolEvents,
  });
}
