// Agent-marketplace MCP rental endpoint — expose a listed agent as an
// MCP-over-HTTP server. Phase 2 of the agent marketplace ("Rent via MCP").
//
//   POST /api/v1/agents/<slug>/mcp     (JSON-RPC 2.0, Streamable HTTP)
//   Authorization: Bearer <rental key>
//
// An external human or agent connects to a published kind:'agent' marketplace
// listing as an MCP server and delegates tasks to it via a single high-level
// `ask` tool. The agent runs through the SAME runtime the public-turn endpoint
// uses (runStatelessAgentTurn — the DB-free lift of executeTurn) on the CREATOR
// org's workspace + BYOK key. The wire shape mirrors EXACTLY what our own
// inline MCP client (lib/agents/mcp/client.ts) consumes — initialize →
// notifications/initialized → tools/list → tools/call — so SF agents are
// reachable by the very protocol we use to reach other MCP servers.
//
// AUTH (thin, no table): a per-renter signed rental key — HMAC over
// { slug, renterOrgId, exp } (lib/marketplace/rental-token). Validated on every
// call against the path slug + server secret + expiry. No DB lookup. A
// revocable per-key table + metered 2%-on-rentals billing are FOLLOW-ONS; this
// endpoint just LOGS each successful call (lib/analytics/track →
// seldonframe_events) as the hook the billing later reads.
//
// This route is a THIN wrapper: it binds the real deps + maps the DI'd handler's
// { status, body } onto NextResponse. All dispatch/auth/usage logic lives in
// lib/marketplace/agent-mcp-handler (unit-tested with fakes).

import { NextRequest, NextResponse } from "next/server";
import {
  handleAgentRentalRpc,
  type AgentRentalRpcDeps,
} from "@/lib/marketplace/agent-mcp-handler";
import { getRentalSigningSecret } from "@/lib/marketplace/rental-secret";
import { resolveRentalAgent, runAgentRentalTurn } from "@/lib/marketplace/agent-rental-run";
import { trackEvent } from "@/lib/analytics/track";

// CORS: an MCP client may be browser-hosted or a server; mirror the public-turn
// endpoint's permissive stance. The endpoint exposes only the delegating tool
// and gates anything that runs the agent behind the bearer key, so a permissive
// Origin doesn't loosen authorization.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization, Mcp-Session-Id",
  "Access-Control-Max-Age": "86400",
} as const;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/** Pull the bearer token from the Authorization header (case-insensitive). */
function readBearer(request: NextRequest): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

const REAL_DEPS: AgentRentalRpcDeps = {
  resolveAgent: resolveRentalAgent,
  runTurn: runAgentRentalTurn,
  getSecret: getRentalSigningSecret,
  logUsage: (entry) =>
    trackEvent(
      "agent_rental_call",
      {
        slug: entry.slug,
        listing_id: entry.listingId,
        renter_org_id: entry.renterOrgId,
        creator_org_id: entry.creatorOrgId,
      },
      // Attribute to the CREATOR org (whose agent earned the call — the side the
      // future 2% accrues to).
      { orgId: entry.creatorOrgId },
    ),
  now: () => new Date(),
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const rawBody = await request.text();
  const bearer = readBearer(request);

  const outcome = await handleAgentRentalRpc(slug, rawBody, bearer, REAL_DEPS);

  if (outcome.body === null) {
    // Notification ack — 202, no body (matches what our MCP client expects).
    return new NextResponse(null, { status: outcome.status, headers: CORS_HEADERS });
  }
  return NextResponse.json(outcome.body, { status: outcome.status, headers: CORS_HEADERS });
}
