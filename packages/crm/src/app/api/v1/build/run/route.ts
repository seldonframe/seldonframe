// POST /api/v1/build/run — run a catalog entry (spec 1ff09dcb, P1 Task 3).
//
// The Monid-shaped `run` step: { type, id, input } → execute the entry and
// return { runId, status, output, providerResponse?, price, billing }. This is
// the unit's payoff — but it is MONEY-SAFE BY CONSTRUCTION for P1:
//
//   • It EXECUTES (agent → the stateless rental turn on the creator's BYOK;
//     tool → Composio tools.execute on the renter's workspace key).
//   • It CALCULATES the cost (computeRunCost → micro-dollars, Monid's
//     billing.calculatedCost) and RECORDS a usage event (the meter).
//   • It NEVER CHARGES. There is NO Stripe call on this path. The actual money
//     movement is the prepaid WALLET drawdown in P2.
//
//   • ERRORS ARE NOT BILLED: a failed/degraded execution returns cost 0 and
//     records NO billable usage event (only successful runs accrue), exactly as
//     Monid bills only successful runs.
//
// Usage RECORDING (not charging) is gated behind SF_MARKETPLACE_BILLING so it's
// inert in dev; the cost is still computed + returned for transparency. A `runId`
// is returned for traceability. Agents/tools here are sync enough to return the
// result inline (no async poll in P1).

import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { marketplaceListings } from "@/db/schema/marketplace";
import { guardApiRequest } from "@/lib/api/guard";
import { logEvent } from "@/lib/observability/log";
import { trackEvent } from "@/lib/analytics/track";
import { isBillingEnabled } from "@/lib/marketplace/billing/billing-mode";
import { agentListingToCatalogEntry, type CatalogPrice } from "@/lib/build/discover";
import { computeRunCost, type RunCost } from "@/lib/build/run-cost";
import {
  gateRunAffordability,
  settleRunDrawdown,
  type RunDrawdownDeps,
  type RunGateResult,
} from "@/lib/build/run-drawdown";
import { buildRunDrawdownDeps } from "@/lib/build/run-drawdown-deps";
import { COMPOSIO_TOOLKITS, defaultToolsForToolkits } from "@/lib/integrations/composio/catalog";

type Body = { type?: unknown; id?: unknown; input?: unknown };

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** The billing block on every response. On error, calculatedCost is 0 + not
 *  recorded (charged:false). In P2 `charged` becomes true when the prepaid wallet
 *  is funded AND the billing flag is on (a LEDGER debit — NO Stripe call per run);
 *  it stays false when the wallet/flag is off (P1's money-safe behavior). */
type BillingBlock = {
  calculatedCost: number; // micro-dollars (Monid)
  amountCents: number;
  feeCents: number;
  netCents: number;
  /** True when the wallet was actually debited for this run (P2). false on error,
   *  on a 0-cost run, or when the wallet/flag is off (P1 behavior). */
  charged: boolean;
  /** Whether a billable usage event was recorded (success + flag on). */
  recorded: boolean;
  /** The renter's wallet balance after the debit, in micro-dollars (present only
   *  when charged). */
  balanceMicros?: number;
};

const ZERO_BILLING: BillingBlock = {
  calculatedCost: 0,
  amountCents: 0,
  feeCents: 0,
  netCents: 0,
  charged: false,
  recorded: false,
};

export async function POST(request: Request): Promise<Response> {
  const guard = await guardApiRequest(request);
  if (guard.error) return guard.error;
  if (!guard.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const renterOrgId = guard.orgId;

  const body = (await request.json().catch(() => ({}))) as Body;
  const type = str(body.type);
  const id = str(body.id);
  const input =
    typeof body.input === "object" && body.input !== null ? (body.input as Record<string, unknown>) : {};

  if (type !== "agent" && type !== "tool") {
    return NextResponse.json({ error: 'type must be "agent" or "tool".' }, { status: 400 });
  }
  if (!id) {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }

  const runId = `run_${randomUUID()}`;

  // The DB-backed wallet seams (gate + debit + earning). Built once per request and
  // threaded through so the agent/tool paths share one wallet view. Inert when the
  // billing flag is off (the deps' billingEnabled is false → no wallet touch).
  const drawdownDeps = buildRunDrawdownDeps();

  if (type === "agent") {
    return runAgent({ request, renterOrgId, runId, slug: id, input, drawdownDeps });
  }
  return runTool({ request, renterOrgId, runId, actionSlug: id, input, drawdownDeps });
}

// ── shared: record a SUCCESSFUL run's cost + draw down the wallet ─────────────
//
// Records the computed cost as a usage event (the meter) AND — in P2 — draws the
// cost down from the prepaid WALLET (a LEDGER debit, NO Stripe call per run) +
// accrues the builder's earning. Both are gated behind SF_MARKETPLACE_BILLING so
// they're inert in dev. The debit is idempotent on runId and can never drive the
// balance negative. Returns the billing block (`charged` reflects whether the
// wallet was actually debited; false when the wallet/flag is off — P1 behavior).
async function recordRunUsage(args: {
  type: "agent" | "tool";
  id: string;
  renterOrgId: string;
  creatorOrgId?: string;
  cost: RunCost;
  runId: string;
  drawdownDeps: RunDrawdownDeps;
}): Promise<BillingBlock> {
  const flagOn = isBillingEnabled(process.env);
  const recorded = flagOn && args.cost.amountCents >= 0;

  // P2 — DRAW DOWN THE WALLET (ledger debit, NO Stripe call) + accrue the builder
  // earning. Idempotent on runId; never negative. charged:false when the flag is
  // off / the run is free / the balance couldn't cover it at settle.
  const settle = await settleRunDrawdown(args.drawdownDeps, {
    renterOrgId: args.renterOrgId,
    sellerOrgId: args.creatorOrgId,
    runId: args.runId,
    cost: args.cost,
  });

  if (recorded) {
    // Fire-and-forget usage event — the meter. amount_cents + fee_cents recorded
    // for analytics; the actual money move is the wallet debit above. The event
    // name is build_run_usage (distinct from the x402 agent_rental_call so the two
    // rails never cross-count).
    trackEvent(
      "build_run_usage",
      {
        run_id: args.runId,
        entry_type: args.type,
        entry_id: args.id,
        renter_org_id: args.renterOrgId,
        creator_org_id: args.creatorOrgId ?? null,
        amount_cents: args.cost.amountCents,
        fee_cents: args.cost.feeCents,
        calculated_cost_micros: args.cost.calculatedCost,
        charged: settle.charged,
      },
      { orgId: args.renterOrgId },
    );
  }

  return {
    calculatedCost: args.cost.calculatedCost,
    amountCents: args.cost.amountCents,
    feeCents: args.cost.feeCents,
    netCents: args.cost.netCents,
    charged: settle.charged,
    recorded,
    ...(settle.charged && settle.balanceMicros !== undefined
      ? { balanceMicros: settle.balanceMicros }
      : {}),
  };
}

// ── agents ────────────────────────────────────────────────────────────────────
async function runAgent(args: {
  request: Request;
  renterOrgId: string;
  runId: string;
  slug: string;
  input: Record<string, unknown>;
  drawdownDeps: RunDrawdownDeps;
}): Promise<Response> {
  const { request, renterOrgId, runId, slug, input, drawdownDeps } = args;

  const { resolveRentalAgent, runAgentRentalTurn } = await import(
    "@/lib/marketplace/agent-rental-run"
  );

  const agent = await resolveRentalAgent(slug);
  if (!agent) {
    return NextResponse.json({ error: "No published agent with that id." }, { status: 404 });
  }

  const message = str(input.message);
  if (!message) {
    return NextResponse.json(
      { error: "input.message is required to run an agent." },
      { status: 400 },
    );
  }

  // The agent's catalog price drives the cost calc.
  const price: CatalogPrice = agentListingToCatalogEntry({
    slug: agent.slug,
    name: agent.agentName,
    description: null,
    priceModel: agent.priceModel ?? "onetime",
    price: null,
    perCallPriceCents: agent.perCallPriceCents ?? null,
    perOutcomePriceCents: agent.perOutcomePriceCents ?? null,
    outcomeType: agent.outcomeType ?? null,
  }).price;

  // A single agent turn = one per_call/per_outcome unit (resultCount 1). For these
  // flat models the cost is known upfront, so the affordability GATE is exact.
  const cost = computeRunCost(price, 1);

  // P2 — GATE BEFORE EXECUTION: when the wallet is enforced and can't cover the
  // cost, return 402 and do NOT run the agent (no work for free, no negative
  // balance). Flag off / free run → allowed.
  const gate = await gateRunAffordability(drawdownDeps, renterOrgId, cost);
  if (!gate.allowed) {
    return insufficientBalance(request, renterOrgId, runId, "agent", slug, price, gate);
  }

  let turn: Awaited<ReturnType<typeof runAgentRentalTurn>>;
  try {
    turn = await runAgentRentalTurn({
      agent,
      message,
      conversationId: str(input.conversationId) || undefined,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[build.run] agent_turn_error slug=${slug} err=${detail}`);
    return errorRun(request, renterOrgId, runId, "agent", slug, "The agent failed to respond.");
  }

  if (!turn.ok) {
    // Degraded agent → NOT billed (nothing delivered).
    return errorRun(request, renterOrgId, runId, "agent", slug, turn.message);
  }

  // Success: debit the wallet (ledger only) + accrue the builder earning.
  const billing = await recordRunUsage({
    type: "agent",
    id: slug,
    renterOrgId,
    creatorOrgId: agent.creatorOrgId,
    cost,
    runId,
    drawdownDeps,
  });

  logEvent(
    "build_run",
    { type: "agent", id: slug, status: "ok", amount_cents: cost.amountCents, recorded: billing.recorded },
    { request, orgId: renterOrgId, status: 200 },
  );

  return NextResponse.json({
    runId,
    status: "completed",
    output: { reply: turn.reply, conversationId: turn.conversationId },
    price,
    billing,
  });
}

// ── tools ─────────────────────────────────────────────────────────────────────

/** Find the curated toolkit that owns an action slug (GMAIL_SEND_EMAIL → gmail). */
function toolkitForAction(actionSlug: string): string | null {
  const upper = actionSlug.toUpperCase();
  for (const tk of COMPOSIO_TOOLKITS) {
    if (upper.startsWith(`${tk.slug.toUpperCase()}_`)) return tk.slug;
  }
  return null;
}

async function runTool(args: {
  request: Request;
  renterOrgId: string;
  runId: string;
  actionSlug: string;
  input: Record<string, unknown>;
  drawdownDeps: RunDrawdownDeps;
}): Promise<Response> {
  const { request, renterOrgId, runId, actionSlug, input, drawdownDeps } = args;

  const toolkit = toolkitForAction(actionSlug);
  if (!toolkit || !defaultToolsForToolkits([toolkit]).includes(actionSlug)) {
    return NextResponse.json({ error: "Unknown tool id." }, { status: 404 });
  }

  // Tools price per_call @ 0 in P1 (resold-tool markup is a P2 wallet concern) —
  // so a successful tool run records a 0-cost usage event and never charges.
  const price: CatalogPrice = { type: "per_call", amountCents: 0 };

  let providerResponse: unknown;
  let successful = false;
  try {
    const [{ Composio }, { resolveComposioKey }] = await Promise.all([
      import("@composio/core"),
      import("@/lib/integrations/composio/keys"),
    ]);
    const { apiKey } = await resolveComposioKey(renterOrgId);
    if (!apiKey) {
      // Composio not configured for this workspace → inert (no charge, no crash).
      return NextResponse.json(
        {
          runId,
          status: "error",
          error: "Composio isn't connected for this workspace. Connect it to run tools.",
          price,
          billing: ZERO_BILLING,
        },
        { status: 200 },
      );
    }

    const composio = new Composio({ apiKey });
    providerResponse = await composio.tools.execute(actionSlug, {
      userId: renterOrgId, // user_id = orgId (the L-20 convention).
      arguments: input,
      dangerouslySkipVersionCheck: true,
    });
    successful = isSuccessfulComposioResponse(providerResponse);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[build.run] tool_exec_error action=${actionSlug} err=${detail}`);
    return errorRun(request, renterOrgId, runId, "tool", actionSlug, "The tool failed to execute.", price);
  }

  if (!successful) {
    // Composio returned a non-success envelope → treat as an error: NOT billed.
    return errorRun(
      request,
      renterOrgId,
      runId,
      "tool",
      actionSlug,
      "The tool reported a failure.",
      price,
      providerResponse,
    );
  }

  const cost = computeRunCost(price, resultCountOf(providerResponse));
  const billing = await recordRunUsage({
    type: "tool",
    id: actionSlug,
    renterOrgId,
    cost,
    runId,
    drawdownDeps,
  });

  logEvent(
    "build_run",
    { type: "tool", id: actionSlug, status: "ok", amount_cents: cost.amountCents, recorded: billing.recorded },
    { request, orgId: renterOrgId, status: 200 },
  );

  return NextResponse.json({
    runId,
    status: "completed",
    output: extractComposioData(providerResponse),
    providerResponse,
    price,
    billing,
  });
}

/** True when a Composio execute response indicates success. Composio returns
 *  `{ successful: boolean, data, error }`; default to true if the shape is
 *  unexpected but no error is present (best-effort, never throws). */
function isSuccessfulComposioResponse(resp: unknown): boolean {
  if (typeof resp !== "object" || resp === null) return false;
  const r = resp as { successful?: unknown; error?: unknown };
  if (typeof r.successful === "boolean") return r.successful;
  // No explicit flag: success unless an error field is populated.
  return !r.error;
}

/** Pull the `data` payload out of a Composio response (or the whole thing). */
function extractComposioData(resp: unknown): unknown {
  if (typeof resp === "object" && resp !== null && "data" in resp) {
    return (resp as { data: unknown }).data;
  }
  return resp;
}

/** How many items a tool run returned, for per_result pricing. Best-effort: if
 *  `data` (or `data.items` / `data.results`) is an array, its length; else 1. */
function resultCountOf(resp: unknown): number {
  const data = extractComposioData(resp);
  if (Array.isArray(data)) return data.length;
  if (typeof data === "object" && data !== null) {
    const d = data as Record<string, unknown>;
    if (Array.isArray(d.items)) return d.items.length;
    if (Array.isArray(d.results)) return d.results.length;
  }
  return 1;
}

// ── shared error path: cost 0, NOT recorded as billable ───────────────────────
function errorRun(
  request: Request,
  renterOrgId: string,
  runId: string,
  type: "agent" | "tool",
  id: string,
  message: string,
  price: CatalogPrice = { type: "per_call", amountCents: 0 },
  providerResponse?: unknown,
): Response {
  logEvent(
    "build_run",
    { type, id, status: "error", amount_cents: 0, recorded: false },
    { request, orgId: renterOrgId, status: 200, severity: "warn" },
  );
  // An errored run carries calculatedCost 0 and is NOT recorded billable.
  return NextResponse.json({
    runId,
    status: "error",
    error: message,
    ...(providerResponse !== undefined ? { providerResponse } : {}),
    price,
    billing: { ...ZERO_BILLING },
  });
}

// ── 402: insufficient wallet balance — the run did NOT execute ────────────────
//
// P2: the affordability gate failed (the prepaid wallet can't cover this run). We
// return 402 and DO NOT execute — no work done for free, no negative balance, no
// charge. The body carries the price + the (uncharged) cost + the current balance
// so the caller knows how much to top up.
function insufficientBalance(
  request: Request,
  renterOrgId: string,
  runId: string,
  type: "agent" | "tool",
  id: string,
  price: CatalogPrice,
  gate: RunGateResult,
): Response {
  logEvent(
    "build_run",
    { type, id, status: "insufficient_balance", amount_cents: 0, recorded: false },
    { request, orgId: renterOrgId, status: 402, severity: "warn" },
  );
  return NextResponse.json(
    {
      runId,
      status: "insufficient_balance",
      error: "Insufficient wallet balance. Top up at /build/wallet to run this.",
      price,
      billing: {
        calculatedCost: gate.costMicros,
        amountCents: Math.round(gate.costMicros / 10_000),
        feeCents: 0,
        netCents: 0,
        charged: false,
        recorded: false,
        balanceMicros: gate.balanceMicros,
      },
    },
    { status: 402 },
  );
}
