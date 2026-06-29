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
import {
  resolveRentalAgent,
  runAgentRentalTurn,
  countRenterCallsThisMonth,
} from "@/lib/marketplace/agent-rental-run";
import { devStubVerifier } from "@/lib/marketplace/x402";
import { trackEvent } from "@/lib/analytics/track";
import { reportAgentUsage } from "@/lib/marketplace/billing/metered-subscription";
import {
  buildUsageReportDeps,
  resolveRenterMeteredSubscriptionItemId,
} from "@/lib/marketplace/billing/real-deps";

/**
 * #139 P3 — fire-and-forget metered usage report for a RENTED agent call. Behind
 * the SF_MARKETPLACE_BILLING flag (reportAgentUsage gates on it) and INERT without
 * a Stripe key. Resolves the renter's ACTIVE metered subscription item for this
 * listing; if one exists, reports 1 unit. Never throws — both the resolver and
 * reportAgentUsage swallow errors — so metering can NEVER break the rental path.
 */
async function reportRentalUsageFailSoft(entry: {
  slug: string;
  listingId: string;
  renterOrgId: string;
  creatorOrgId: string;
}): Promise<void> {
  try {
    const metered = await resolveRenterMeteredSubscriptionItemId({
      renterOrgId: entry.renterOrgId,
      listingId: entry.listingId,
    });
    if (!metered) return; // no metered subscription → no-op.
    await reportAgentUsage(
      {
        subscriptionItemId: metered.subscriptionItemId,
        connectAccountId: metered.connectAccountId,
        quantity: 1,
        idempotencyKey: `mkt-usage-${metered.subscriptionItemId}-${Date.now()}`,
      },
      buildUsageReportDeps(),
    );
  } catch (err) {
    // Defensive: the inner calls already fail-soft, but never let this escape.
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[agent-rental] usage_report_error listing=${entry.listingId} renter=${entry.renterOrgId} err=${detail}`);
  }
}

// CORS: an MCP client may be browser-hosted or a server; mirror the public-turn
// endpoint's permissive stance. The endpoint exposes only the delegating tool
// and gates anything that runs the agent behind the bearer key, so a permissive
// Origin doesn't loosen authorization.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization, Mcp-Session-Id, X-Payment",
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

// The canonical resource URL the x402 402 body advertises for a slug (matches
// the endpoint the renter is hitting). Mirrors the rental-key action's builder.
function resourceUrl(slug: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://app.seldonframe.com").replace(/\/$/, "");
  return `${base}/api/v1/agents/${slug}/mcp`;
}

const REAL_DEPS: AgentRentalRpcDeps = {
  resolveAgent: resolveRentalAgent,
  runTurn: runAgentRentalTurn,
  getSecret: getRentalSigningSecret,
  logUsage: (entry) => {
    trackEvent(
      "agent_rental_call",
      {
        slug: entry.slug,
        listing_id: entry.listingId,
        renter_org_id: entry.renterOrgId,
        creator_org_id: entry.creatorOrgId,
        // x402 accrual (no migration): the per-call charge + SF cut + the (dev-
        // stub) settlement reference live on the event property bag. amount_cents
        // is 0 for free lanes; tx_ref is present only for a settled paid call.
        amount_cents: entry.amountCents ?? 0,
        fee_cents: entry.feeCents ?? 0,
        ...(entry.txRef ? { tx_ref: entry.txRef } : {}),
      },
      // Attribute to the CREATOR org (whose agent earned the call — the side the
      // 5% accrues to, and the org the meter counts against).
      { orgId: entry.creatorOrgId },
    );
    // #139 P3 — ALSO report a metered usage unit (fail-soft, flag-gated, inert
    // without a key). Fire-and-forget: a metering failure must not affect the
    // rental reply, which has already been produced.
    void reportRentalUsageFailSoft({
      slug: entry.slug,
      listingId: entry.listingId,
      renterOrgId: entry.renterOrgId,
      creatorOrgId: entry.creatorOrgId,
    });
  },
  now: () => new Date(),

  // ── x402 metering wiring. The verifier is the DEV STUB → NO money moves. To
  // turn on live USDC settlement, Max swaps `settlementVerifier` for
  // coinbaseFacilitatorVerifier(...) (see lib/marketplace/x402.ts) and sets the
  // env below. Until then this rail returns 402 + verifies SHAPE only.
  countRenterCallsThisMonth,
  settlementVerifier: devStubVerifier, // TODO(Max): coinbaseFacilitatorVerifier
  // SELDONFRAME_HOUSE_ORG_ID → the SF house org id; when UNSET no listing is
  // first-party, so every agent bills on the builder lane (fail-safe).
  houseOrgId: process.env.SELDONFRAME_HOUSE_ORG_ID,
  // X402_PAY_TO → the USDC address that receives settlement (Max's setup). When
  // unset, metering is disabled (the handler serves free) — so prod never demands
  // a payment with no address to pay to.
  payTo: process.env.X402_PAY_TO,
  resourceUrl,
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const rawBody = await request.text();
  const bearer = readBearer(request);
  // Lower-cased headers the handler's metering gate reads (the x402 retry).
  const headers = { "x-payment": request.headers.get("x-payment") ?? "" };

  const outcome = await handleAgentRentalRpc(slug, rawBody, bearer, REAL_DEPS, headers);

  if (outcome.body === null) {
    // Notification ack — 202, no body (matches what our MCP client expects).
    return new NextResponse(null, { status: outcome.status, headers: CORS_HEADERS });
  }
  return NextResponse.json(outcome.body, { status: outcome.status, headers: CORS_HEADERS });
}
