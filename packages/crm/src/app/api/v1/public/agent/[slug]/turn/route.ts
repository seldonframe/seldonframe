// v1.26.2 — public agent turn endpoint
//
// POST /api/v1/public/agent/<slug>/turn
//   body: {
//     conversation_id?: string,        // omitted on first turn
//     anonymous_session_id?: string,   // browser-stable id from embed
//     message: string,
//     channel_meta?: object             // referrer, page url, etc.
//     stream?: boolean                  // v1.26.2 — opt-in SSE response
//   }
//   non-streaming response: { conversation_id, message, validators_critical_failed? }
//   streaming response (Content-Type: text/event-stream):
//     event: start    data: {"conversation_id":"..."}
//     event: delta    data: {"text":"..."}    (multiple)
//     event: done     data: {"conversation_id":"...","validators_critical_failed":false}
//     event: error    data: {"reason":"..."}
//
// Auth: anonymous. Agent's `slug` resolves to its workspace via
// `(orgs.slug, agents.slug)` join. Agent must be in 'live' or 'test' status.
//
// v1.26.2 SSE NOTE: the runtime still buffers the full response (validators
// run before any byte reaches the client — critical for safety). The SSE
// branch then chunks the buffered text and emits ~25ms-spaced delta events
// for typewriter UX. Real Anthropic-streaming-passthrough lands in v1.27
// alongside the multi-step tool-call streaming story.

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
  stream?: boolean;
};

const CRITICAL_VALIDATORS = [
  "quotes_only_from_soul_pricing",
  "no_prompt_injection_echo",
  "no_pii_leak",
];

// v1.40.8 — CORS headers for cross-origin embed.
//
// The chat widget is loaded as <script src="https://app.seldonframe.com/...">
// on workspace subdomain pages (e.g. sunset-plumbing-co.app.seldonframe.com),
// AND on operator-owned external websites (foo.com). The fetch from
// inside the widget to .../turn is therefore cross-origin in BOTH cases.
//
// Pre-1.40.8 this endpoint returned no CORS headers; browsers blocked the
// fetch and the widget surfaced "Connection issue. Please try again." —
// surfaced first on the v1.40.7 chatbot embed test on sunset-plumbing-co.
//
// Origin = "*" is correct here: the chatbot is intentionally embeddable on
// any operator's site (that's the entire point), and the endpoint serves
// only public, conversation-scoped data. The downstream agent runtime
// already enforces per-conversation auth via conversation_id + anonymous
// session id. Loosening CORS doesn't loosen application authorization.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
  "Access-Control-Max-Age": "86400",
} as const;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug: agentSlugPath } = await context.params;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json(
      { error: "invalid_json" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json(
      { error: "missing_message" },
      { status: 400, headers: CORS_HEADERS },
    );
  }
  if (message.length > 2000) {
    return NextResponse.json(
      { error: "message_too_long" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const wantsStream =
    body.stream === true ||
    request.headers.get("accept")?.includes("text/event-stream") ||
    request.nextUrl.searchParams.get("stream") === "1";

  // Resolve agent.
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
    return NextResponse.json(
      { error: "agent_not_found" },
      { status: 404, headers: CORS_HEADERS },
    );
  }

  if (agentRow.status !== "live" && agentRow.status !== "test") {
    return NextResponse.json(
      { error: "agent_not_active", status: agentRow.status },
      { status: 403, headers: CORS_HEADERS },
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
        { status: 500, headers: CORS_HEADERS },
      );
    }
    conversationId = created.id;
  }

  // SSE branch ───────────────────────────────────────────────────────────
  if (wantsStream) {
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const encoder = new TextEncoder();
        const send = (event: string, data: unknown) => {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        };
        try {
          send("start", { conversation_id: conversationId });
          const result = await executeTurn({
            conversationId: conversationId!,
            userMessage: message,
          });
          if (!result.ok) {
            send("delta", { text: result.fallbackMessage });
            send("done", {
              conversation_id: conversationId,
              degraded: true,
              reason: result.reason,
            });
            controller.close();
            return;
          }
          // Chunk + emit. Smaller chunks = smoother typewriter; we cap at
          // ~28 chars and pause ~22ms between chunks. Total response is
          // typically <600 chars so this lands in <500ms.
          const text = result.assistantMessage;
          const chunks = chunkText(text, 28);
          for (const chunk of chunks) {
            send("delta", { text: chunk });
            await sleep(22);
          }
          send("done", {
            conversation_id: conversationId,
            validators_critical_failed: result.validators.some(
              (v) => !v.passed && CRITICAL_VALIDATORS.includes(v.name),
            ),
          });
          controller.close();
        } catch (err) {
          send("error", {
            reason: "internal_error",
            detail: err instanceof Error ? err.message : String(err),
          });
          controller.close();
        }
      },
    });

    return new NextResponse(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        ...CORS_HEADERS,
      },
    });
  }

  // Non-streaming JSON branch (back-compat) ──────────────────────────────
  const result = await executeTurn({
    conversationId,
    userMessage: message,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        conversation_id: conversationId,
        message: result.fallbackMessage,
        degraded: true,
        reason: result.reason,
      },
      { headers: CORS_HEADERS },
    );
  }

  return NextResponse.json(
    {
      conversation_id: conversationId,
      message: result.assistantMessage,
      validators_critical_failed: result.validators.some(
        (v) => !v.passed && CRITICAL_VALIDATORS.includes(v.name),
      ),
    },
    { headers: CORS_HEADERS },
  );
}

// ─── helpers ────────────────────────────────────────────────────────────

function chunkText(text: string, maxLen: number): string[] {
  if (!text) return [""];
  // Split on word boundaries when possible so the typewriter pauses at
  // natural gaps. Falls back to fixed-width slicing for very long runs.
  const words = text.split(/(\s+)/);
  const out: string[] = [];
  let buf = "";
  for (const w of words) {
    if (buf.length + w.length > maxLen) {
      if (buf) out.push(buf);
      if (w.length > maxLen) {
        // very long token (URL, etc.) — slice
        for (let i = 0; i < w.length; i += maxLen) {
          out.push(w.slice(i, i + maxLen));
        }
        buf = "";
      } else {
        buf = w;
      }
    } else {
      buf += w;
    }
  }
  if (buf) out.push(buf);
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
