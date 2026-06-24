// ChatGPT App MCP endpoint — expose SeldonFrame to ChatGPT (Apps SDK) as a
// PUBLIC, keyless MCP-over-HTTP server.
//
//   POST /api/chatgpt/mcp     (JSON-RPC 2.0, Streamable HTTP)
//
// ChatGPT connects to this server (dev mode → connector URL) and gets three
// high-level tools — build_workspace, browse_marketplace, deploy_agent — so a
// ChatGPT user can stand up a SeldonFrame front office and add agents without
// leaving the chat. The wire shape mirrors EXACTLY the agent-marketplace rental
// endpoint (app/api/v1/agents/[slug]/mcp) — initialize → notifications/initialized
// → tools/list → tools/call.
//
// KEYLESS BY DESIGN (the magic first-run vision): no OAuth, no API key.
// build_workspace mints an ANONYMOUS workspace bearer (no SF account) and
// returns it as workspace_token; that token threads deploy_agent later in the
// SAME conversation. Connecting an EXISTING SF account (OAuth 2.1 AS) is a
// documented follow-on, NOT in v1.
//
// MONEY-SAFETY: paid agents return a claim URL — deploy NEVER charges a card.
//
// This route is a THIN wrapper: it reads the IP for the build rate-limit, binds
// the real deps (lib/chatgpt-app/deps), and maps the DI'd handler's
// { status, body } onto NextResponse. All dispatch logic lives in
// lib/chatgpt-app/chatgpt-mcp-handler (unit-tested with fakes).

import { NextRequest, NextResponse } from "next/server";
import { handleChatGptRpc } from "@/lib/chatgpt-app/chatgpt-mcp-handler";
import { buildRealDeps } from "@/lib/chatgpt-app/deps";

// CORS: an MCP client (ChatGPT) is server-hosted; mirror the rental endpoint's
// permissive stance. The server exposes only the three high-level tools and
// build_workspace is IP-rate-limited, so a permissive Origin doesn't loosen
// anything (there's no per-user auth to leak).
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization, Mcp-Session-Id",
  "Access-Control-Max-Age": "86400",
} as const;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// ChatGPT's connector wizard probes the MCP URL (and adjacent discovery paths)
// with a GET while it negotiates. Answer with a tiny health payload so the
// wizard never sees a 502 mid-connect. (We use NO OAuth in v1 — the server is
// public — so there is no protected-resource metadata to advertise here.)
export async function GET() {
  return NextResponse.json(
    {
      name: "SeldonFrame",
      status: "ok",
      transport: "mcp/streamable-http",
      endpoint: "/api/chatgpt/mcp",
    },
    { status: 200, headers: CORS_HEADERS },
  );
}

/** The caller IP for the build_workspace rate-limit (matches the anonymous
 *  /api/v1/workspace/create route's resolution). */
function resolveRequestIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  const ip = resolveRequestIp(request);

  const outcome = await handleChatGptRpc(raw, buildRealDeps(ip));

  if (outcome.body === null) {
    // Notification ack — 202, no body (matches what an MCP client expects).
    return new NextResponse(null, { status: outcome.status, headers: CORS_HEADERS });
  }
  return NextResponse.json(outcome.body, { status: outcome.status, headers: CORS_HEADERS });
}
