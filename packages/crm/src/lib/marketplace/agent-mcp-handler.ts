// Agent-marketplace MCP rental — the DI'd request handler core.
//
// This is the method-dispatch + auth-gate + usage-log flow lifted OUT of the
// route into a dependency-injected function returning a plain { status, body }.
// The route (app/api/v1/agents/[slug]/mcp/route.ts) is then a thin wrapper that
// binds the REAL deps (DB-backed resolveRentalAgent, runAgentRentalTurn, the
// rental secret, the analytics logger) + maps the result onto NextResponse.
//
// WHY DI not module-mocking: the repo prefers dependency injection over
// node:test mock.module (tsx's CJS interop makes mock.module unreliable — see
// missed-call-textback.spec.ts). So all the branching (auth missing/expired/
// wrong-agent, initialize-without-auth, tools/list + tools/call gated, unknown
// method, agent not found, degraded turn) is exercised here with fakes — no
// real DB, no LLM, no network.

import {
  parseJsonRpcRequest,
  buildInitializeResult,
  buildToolsListResult,
  buildTasteToolsListResult,
  buildPromptsListResult,
  buildPromptGetResult,
  parsePromptsGetParams,
  promptNameForSlug,
  isDeterministicTool,
  executeDeterministicTool,
  extractAskArgs,
  jsonRpcResult,
  jsonRpcError,
  toolTextResult,
  JSONRPC_METHOD_NOT_FOUND,
  JSONRPC_INVALID_PARAMS,
  JSONRPC_INTERNAL_ERROR,
  type JsonRpcId,
} from "./agent-mcp-rpc";
import { DAY_MS, TASTE_TOOL_ALLOWLIST, GROUND_TOOL_NAME } from "./taste/taste-policy";
import { verifyRentalKey } from "./rental-token";
import type { RentalAgent, RentalTurnResult } from "./agent-rental-run";
import {
  resolveRentalCharge,
  isFirstPartyListing,
  type RentalCharge,
} from "./rental-pricing";
import {
  buildPaymentRequired,
  parseXPaymentHeader,
  type SettlementVerifier,
} from "./x402";

/** JSON-RPC "auth failure" — no reserved code exists, so use the
 *  implementation-defined server range (-32000) per the JSON-RPC 2.0 spec. */
export const JSONRPC_UNAUTHORIZED = -32000;

/** JSON-RPC "payment required" — the x402 402. No reserved code exists, so the
 *  implementation-defined server range (-32002) carries the x402 requirements in
 *  `error.data`. The HTTP layer answers 402 alongside this envelope. */
export const JSONRPC_PAYMENT_REQUIRED = -32002;

export type AgentRentalRpcDeps = {
  /** Resolve a published kind:'agent' listing by slug (null = not found). */
  resolveAgent: (slug: string) => Promise<RentalAgent | null>;
  /** Run one delegated turn against the resolved agent. */
  runTurn: (input: {
    agent: RentalAgent;
    message: string;
    conversationId?: string;
  }) => Promise<RentalTurnResult>;
  /** Resolve the HMAC signing secret (throws if unconfigured). */
  getSecret: () => string;
  /** Fire-and-forget usage logger (the 2%-billing + accrual hook). The x402
   *  fields (amountCents/feeCents/txRef) are present only for PAID calls; free
   *  lanes log amount 0 and omit txRef. */
  logUsage: (entry: {
    slug: string;
    listingId: string;
    renterOrgId: string;
    creatorOrgId: string;
    amountCents?: number;
    feeCents?: number;
    txRef?: string;
  }) => void;
  /** Current time (injected for deterministic expiry checks). */
  now: () => Date;

  // ── x402 metering (ALL optional). When the four below are present the rail
  // meters every billable tools/call across the three lanes and returns 402
  // when payment is due. When ABSENT the rail serves every call free (the
  // pre-x402 behavior) — so metering is an explicit, fail-safe opt-in: prod
  // wires them in the route; a deployment that hasn't can't accidentally charge.
  /** Count rental calls this renter ALREADY made against this listing in the
   *  current calendar month (drives the SF free-allowance boundary). */
  countRenterCallsThisMonth?: (input: {
    renterOrgId: string;
    listingId: string;
    creatorOrgId: string;
    now: Date;
  }) => Promise<number>;
  /** Verify an X-PAYMENT against the requirement. Defaults (in the route) to
   *  devStubVerifier — which moves NO money. */
  settlementVerifier?: SettlementVerifier;
  /** The SeldonFrame house org id (SELDONFRAME_HOUSE_ORG_ID). A listing whose
   *  creator IS this org is first-party (SF free/floor lane). Unset ⇒ no listing
   *  is first-party (every agent bills on the builder lane). */
  houseOrgId?: string;
  /** The USDC pay-to address for the 402 body (Max's setup). */
  payTo?: string;
  /** Build the canonical resource URL for the 402 body, given the slug. */
  resourceUrl?: (slug: string) => string;

  /** Taste mode (net-new, anonymous free lane). ABSENT => every code path
   *  below is identical to today (design D7 / plan Task 8 byte-identical
   *  proof). Built by the route ONLY when SF_AGENT_TASTE_MODE=1. */
  taste?: TasteDeps;
};

/** Taste mode dependency bundle — see
 *  docs/superpowers/specs/2026-07-03-agent-taste-mode-design.md. All policy
 *  decisions (budgets, doors copy, key resolution) live behind these seams so
 *  the handler stays pure + DI'd for node:test. */
export type TasteDeps = {
  /** sha256(ip|secret) of the caller's IP — never the raw IP. */
  ipHash: string;
  /** Listing-level activation: flag is already on if this object exists; this
   *  resolves budget + key predicate. */
  policyFor: (agent: RentalAgent) => Promise<
    { active: false } | { active: true; visitorLimit: number; dailyCap: number }
  >;
  /** checkRateLimit binding. */
  checkLimit: (key: string, limit: number, windowMs: number) => Promise<boolean>;
  ground: (args: { agent: RentalAgent; url: string; ipHash: string }) => Promise<
    { ok: true; text: string } | { ok: false; text: string }
  >;
  runTasteTurn: (args: { agent: RentalAgent; message: string; tasteSession: string | null }) => Promise<RentalTurnResult>;
  doorsText: (args: { agent: RentalAgent; visitorLimit: number; reason: "visitor_cap" | "daily_cap" | "locked_tool" }) => string;
  instructions: (args: { agent: RentalAgent; visitorLimit: number }) => string;
  track: (event: "taste_session_started" | "taste_grounded" | "taste_limit_hit", props: Record<string, unknown>, creatorOrgId: string) => void;
};

/** Resolve the taste policy when the lane could apply. null = lane inactive
 *  (fall through to today's behavior verbatim). The taste lane engages ONLY
 *  when bearer === null AND deps.taste is present AND the listing's policy
 *  resolves active — any other combination falls through unchanged. */
async function tastePolicyOrNull(
  bearer: string | null,
  deps: AgentRentalRpcDeps,
  agent: RentalAgent,
): Promise<{ taste: TasteDeps; visitorLimit: number; dailyCap: number } | null> {
  if (bearer !== null || !deps.taste) return null;
  const policy = await deps.taste.policyFor(agent);
  if (!policy.active) return null;
  return { taste: deps.taste, visitorLimit: policy.visitorLimit, dailyCap: policy.dailyCap };
}

/** True when the deps carry a complete metering rig (so we should enforce the
 *  three lanes). A partial rig is treated as "not metering" — fail-safe. */
function isMeteringEnabled(deps: AgentRentalRpcDeps): boolean {
  return (
    typeof deps.countRenterCallsThisMonth === "function" &&
    typeof deps.settlementVerifier === "function" &&
    typeof deps.resourceUrl === "function" &&
    typeof deps.payTo === "string" &&
    deps.payTo.length > 0
  );
}

export type RpcOutcome = {
  status: number;
  /** null body → 202/no-content (notification ack). */
  body: Record<string, unknown> | null;
};

/**
 * Handle one JSON-RPC request against a rented agent. Pure over its deps:
 * parse → (notification ack) → resolve agent → route method, gating
 * tools/list + tools/call behind a valid rental key. Returns { status, body }.
 *
 * `headers` carries lower-cased request headers (e.g. `x-payment`) so the
 * tools/call metering gate can read the renter's x402 payment on a retry.
 */
export async function handleAgentRentalRpc(
  slug: string,
  rawBody: string,
  bearer: string | null,
  deps: AgentRentalRpcDeps,
  headers: Record<string, string> = {},
): Promise<RpcOutcome> {
  const parsed = parseJsonRpcRequest(rawBody);
  if (!parsed.ok) {
    return { status: 200, body: jsonRpcError(parsed.id, parsed.error.code, parsed.error.message) };
  }
  const { id, method, params, isNotification } = parsed.request;

  // Notifications (e.g. notifications/initialized) get a 202 + no body.
  if (isNotification) {
    return { status: 202, body: null };
  }

  const agent = await deps.resolveAgent(slug);
  if (!agent) {
    return {
      status: 200,
      body: jsonRpcError(id, JSONRPC_METHOD_NOT_FOUND, `No rentable agent found at slug "${slug}".`),
    };
  }

  switch (method) {
    case "initialize": {
      // Unauthenticated negotiation/discovery. No agent work happens here.
      // Taste mode adds `instructions` ONLY when the lane resolves active —
      // the key is absent otherwise, so the flag-off envelope is unchanged.
      const lane = await tastePolicyOrNull(bearer, deps, agent);
      return {
        status: 200,
        body: jsonRpcResult(
          id,
          buildInitializeResult({
            agentName: agent.agentName,
            ...(lane
              ? { instructions: lane.taste.instructions({ agent, visitorLimit: lane.visitorLimit }) }
              : {}),
          }),
        ),
      };
    }

    case "ping":
      return { status: 200, body: jsonRpcResult(id, {}) };

    case "tools/list": {
      const lane = await tastePolicyOrNull(bearer, deps, agent);
      if (lane) {
        return {
          status: 200,
          body: jsonRpcResult(id, buildTasteToolsListResult({
            agentName: agent.agentName,
            capabilities: agent.capabilities,
            visitorLimit: lane.visitorLimit,
          })),
        };
      }
      const auth = authorize(bearer, slug, id, deps);
      if (!auth.ok) return auth.outcome;
      return {
        status: 200,
        body: jsonRpcResult(id, buildToolsListResult({ agentName: agent.agentName, capabilities: agent.capabilities })),
      };
    }

    // prompts/list + prompts/get (NET-NEW): the agent's SKILL as an MCP prompt.
    // Loading a prompt runs NO agent turn — the renter's own model drives the
    // deterministic tools afterward, so the owner spends zero compute.
    case "prompts/list": {
      const auth = authorize(bearer, slug, id, deps);
      if (!auth.ok) return auth.outcome;
      return {
        status: 200,
        body: jsonRpcResult(
          id,
          buildPromptsListResult({ slug, agentName: agent.agentName, capabilities: agent.capabilities }),
        ),
      };
    }

    case "prompts/get": {
      const auth = authorize(bearer, slug, id, deps);
      if (!auth.ok) return auth.outcome;

      const parsed = parsePromptsGetParams(params);
      if (!parsed.ok) {
        return { status: 200, body: jsonRpcError(id, parsed.error.code, parsed.error.message) };
      }
      // The only prompt this agent exposes is its own act_as_<slug> skill.
      if (parsed.name !== promptNameForSlug(slug)) {
        return {
          status: 200,
          body: jsonRpcError(id, JSONRPC_INVALID_PARAMS, `Unknown prompt: ${parsed.name}. This agent exposes only "${promptNameForSlug(slug)}".`),
        };
      }
      const prompt = buildPromptGetResult({ slug, agentName: agent.agentName, blueprint: agent.blueprint });
      if (!prompt.ok) {
        return { status: 200, body: jsonRpcError(id, prompt.error.code, prompt.error.message) };
      }
      return { status: 200, body: jsonRpcResult(id, prompt.result) };
    }

    case "tools/call": {
      const lane = await tastePolicyOrNull(bearer, deps, agent);
      if (lane) return await handleTasteToolCall({ id, slug, agent, params, lane, deps });

      const auth = authorize(bearer, slug, id, deps);
      if (!auth.ok) return auth.outcome;

      const toolName = typeof params.name === "string" ? params.name : "";
      const isDeterministic = isDeterministicTool(toolName);

      // Validate the tool/args BEFORE metering, so a bad request never demands
      // payment (you shouldn't pay to learn your call was malformed). For the
      // deterministic lane this is just an "is it a known tool" check; for the
      // agent-as-a-service lane it's the `ask` arg validation.
      let askMessage = "";
      let askConversationId: string | undefined;
      if (!isDeterministic) {
        const askArgs = extractAskArgs(params);
        if (!askArgs.ok) {
          return { status: 200, body: jsonRpcError(id, askArgs.error.code, askArgs.error.message) };
        }
        askMessage = askArgs.message;
        askConversationId = askArgs.conversationId;
      }

      // ── x402 METERING GATE. Resolve which lane this billable call is in; if
      // payment is due, demand it (402) and verify the X-PAYMENT before serving.
      // When metering isn't wired, charge is the free lane (today's behavior).
      const charge = await resolveCharge(slug, agent, auth.renterOrgId, deps);
      if (charge.requiresPayment) {
        const gate = await settleOr402(slug, id, charge, headers, deps);
        if (!gate.ok) return gate.outcome; // 402 (missing/invalid/underpaid)
        // gate.txRef carries the (dev-stub) settlement reference to accrue.
        return await executeAndAccrue({
          id, slug, agent, charge, isDeterministic, params, toolName,
          askMessage, askConversationId, renterOrgId: auth.renterOrgId,
          txRef: gate.txRef, deps,
        });
      }

      // Free lane (sf_free / free / metering-off): serve + accrue amount 0.
      return await executeAndAccrue({
        id, slug, agent, charge, isDeterministic, params, toolName,
        askMessage, askConversationId, renterOrgId: auth.renterOrgId,
        txRef: undefined, deps,
      });
    }

    default:
      return { status: 200, body: jsonRpcError(id, JSONRPC_METHOD_NOT_FOUND, `Method not found: ${method}`) };
  }
}

// ─── x402 metering ───────────────────────────────────────────────────────────

/**
 * Resolve the charge for this billable call across the three lanes. When the
 * metering rig isn't fully wired (isMeteringEnabled false), returns the free
 * lane — so a deployment that hasn't configured x402 serves every call free
 * (the pre-x402 behavior) and never accidentally demands payment.
 */
async function resolveCharge(
  slug: string,
  agent: RentalAgent,
  renterOrgId: string,
  deps: AgentRentalRpcDeps,
): Promise<RentalCharge> {
  if (!isMeteringEnabled(deps)) {
    return { lane: "free", amountCents: 0, requiresPayment: false, feeCents: 0 };
  }
  const isFirstParty = isFirstPartyListing(agent.creatorOrgId, deps.houseOrgId);
  let renterCallsThisMonth = 0;
  try {
    renterCallsThisMonth = await deps.countRenterCallsThisMonth!({
      renterOrgId,
      listingId: agent.listingId,
      creatorOrgId: agent.creatorOrgId,
      now: deps.now(),
    });
  } catch (err) {
    // A counter failure must NOT silently grant free first-party calls. NaN is
    // not < the allowance, so resolveRentalCharge fails closed to the floor.
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[agent-rental] meter_count_error slug=${slug} renter=${renterOrgId} err=${detail}`);
    renterCallsThisMonth = Number.NaN;
  }
  return resolveRentalCharge({
    listing: {
      priceModel: agent.priceModel ?? "onetime",
      perCallPriceCents: agent.perCallPriceCents ?? null,
      perOutcomePriceCents: agent.perOutcomePriceCents ?? null,
      outcomeType: agent.outcomeType ?? null,
    },
    isFirstParty,
    renterCallsThisMonth,
  });
}

type SettleGate =
  | { ok: true; txRef: string }
  | { ok: false; outcome: RpcOutcome };

/**
 * The x402 402 → verify gate. Reads the `X-PAYMENT` header; if missing/invalid
 * or the verifier rejects, returns an HTTP 402 carrying the x402 payment-
 * requirements (in the JSON-RPC error envelope's `data`). On a verified payment
 * returns the settlement txRef to accrue.
 *
 * MONEY-SAFETY: `deps.settlementVerifier` is the dev stub by default, which
 * validates shape + amount and returns a fake `dev-` txRef WITHOUT moving money.
 */
async function settleOr402(
  slug: string,
  id: JsonRpcId,
  charge: RentalCharge,
  headers: Record<string, string>,
  deps: AgentRentalRpcDeps,
): Promise<SettleGate> {
  const requirements = buildPaymentRequired({
    amountCents: charge.amountCents,
    resource: deps.resourceUrl!(slug),
    payTo: deps.payTo!,
    description: `Per-call payment (${charge.lane}) for an MCP rental request.`,
  });
  const requirement = requirements.accepts[0];

  const paymentHeader = headers["x-payment"] ?? null;
  const parsed = parseXPaymentHeader(paymentHeader);
  if (!parsed.ok) {
    // Missing or malformed payment → demand it.
    return { ok: false, outcome: paymentRequiredOutcome(id, requirements, parsed.reason) };
  }

  let verdict: Awaited<ReturnType<SettlementVerifier>>;
  try {
    verdict = await deps.settlementVerifier!(parsed.payment, requirement);
  } catch (err) {
    // A verifier crash is treated as "not paid" — never serve on an error.
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[agent-rental] verifier_error slug=${slug} err=${detail}`);
    return { ok: false, outcome: paymentRequiredOutcome(id, requirements, "Payment verification failed.") };
  }
  if (!verdict.ok) {
    return { ok: false, outcome: paymentRequiredOutcome(id, requirements, verdict.reason) };
  }
  return { ok: true, txRef: verdict.txRef };
}

/** Build the HTTP 402 RpcOutcome: a JSON-RPC payment-required error whose `data`
 *  carries the full x402 payment-requirements, plus HTTP status 402 so a
 *  protocol-aware client sees the standard 402. */
function paymentRequiredOutcome(
  id: JsonRpcId,
  requirements: ReturnType<typeof buildPaymentRequired>,
  reason: string,
): RpcOutcome {
  return {
    status: 402,
    body: jsonRpcError(
      id,
      JSONRPC_PAYMENT_REQUIRED,
      `Payment required: ${reason}`,
      requirements,
    ),
  };
}

/**
 * Execute the (already-paid-or-free) billable call and accrue it. Runs the
 * deterministic tool (no owner compute) or the `ask` agent turn (owner compute),
 * then logs the `agent_rental_call` event with the charge accrual
 * (amount_cents / fee_cents / tx_ref) via event properties — NO migration. A
 * degraded/erroring agent turn does NOT accrue (nothing was delivered).
 */
async function executeAndAccrue(args: {
  id: JsonRpcId;
  slug: string;
  agent: RentalAgent;
  charge: RentalCharge;
  isDeterministic: boolean;
  params: Record<string, unknown>;
  toolName: string;
  askMessage: string;
  askConversationId?: string;
  renterOrgId: string;
  txRef?: string;
  deps: AgentRentalRpcDeps;
}): Promise<RpcOutcome> {
  const { id, slug, agent, charge, isDeterministic, params, toolName, askMessage, askConversationId, renterOrgId, txRef, deps } = args;

  const accrue = () =>
    deps.logUsage({
      slug,
      listingId: agent.listingId,
      renterOrgId,
      creatorOrgId: agent.creatorOrgId,
      amountCents: charge.amountCents,
      feeCents: charge.feeCents,
      txRef,
    });

  // ── Deterministic lane: a pure blueprint lookup (quote/faq). No agent loop. ──
  if (isDeterministic) {
    const toolArgs =
      typeof params.arguments === "object" && params.arguments !== null
        ? (params.arguments as Record<string, unknown>)
        : {};
    const det = executeDeterministicTool(toolName, toolArgs, agent.blueprint);
    if (!det.ok) {
      // Bad args → an error, and NO accrual (we delivered nothing of value).
      return { status: 200, body: jsonRpcError(id, det.error.code, det.error.message) };
    }
    // Accrue only when this call belongs to a METERED lane (sf_free counts toward
    // the allowance even at $0; sf_floor/builder are paid). A plain `free` lane
    // deterministic call (unpriced agent, or metering off) logs nothing — exactly
    // as before x402, since it carries zero owner compute and nothing to bill.
    if (charge.lane !== "free") accrue();
    return { status: 200, body: jsonRpcResult(id, toolTextResult(JSON.stringify(det.result))) };
  }

  // ── Agent-as-a-service lane: `ask` delegates to the live agent (owner compute). ──
  let turn: RentalTurnResult;
  try {
    turn = await deps.runTurn({ agent, message: askMessage, conversationId: askConversationId });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[agent-rental] turn_error slug=${slug} renter=${renterOrgId} err=${detail}`);
    return {
      status: 200,
      body: jsonRpcError(id, JSONRPC_INTERNAL_ERROR, "The agent failed to respond. Please try again."),
    };
  }
  if (!turn.ok) {
    // Degraded agent → MCP tool error result. No accrual (nothing delivered).
    return { status: 200, body: jsonRpcResult(id, toolTextResult(turn.message, true)) };
  }

  const entry = {
    event: "agent_rental_call",
    slug,
    listingId: agent.listingId,
    renterOrgId,
    creatorOrgId: agent.creatorOrgId,
    amountCents: charge.amountCents,
    feeCents: charge.feeCents,
    txRef,
    ts: deps.now().toISOString(),
  };
  console.log(`[agent-rental] ${JSON.stringify(entry)}`);
  accrue();

  const result = toolTextResult(turn.reply);
  (result as { conversationId?: string }).conversationId = turn.conversationId;
  return { status: 200, body: jsonRpcResult(id, result) };
}

// ─── taste mode (net-new, anonymous free lane) ───────────────────────────────
//
// Only reachable via tastePolicyOrNull (bearer === null AND deps.taste AND the
// listing's policy is active). Never calls deps.logUsage — agent_rental_call
// is a rental accrual; taste calls are not rentals (P1 is tracking-only, see
// design D10). Doors are ALWAYS a successful jsonRpcResult, never an error —
// so a renter LLM relays the offer instead of retrying.

async function handleTasteToolCall(args: {
  id: JsonRpcId;
  slug: string;
  agent: RentalAgent;
  params: Record<string, unknown>;
  lane: { taste: TasteDeps; visitorLimit: number; dailyCap: number };
  deps: AgentRentalRpcDeps;
}): Promise<RpcOutcome> {
  const { id, slug, agent, params, lane } = args;
  const { taste, visitorLimit, dailyCap } = lane;
  const toolName = typeof params.name === "string" ? params.name : "";
  const toolArgs =
    typeof params.arguments === "object" && params.arguments !== null
      ? (params.arguments as Record<string, unknown>)
      : {};

  const doors = (reason: "visitor_cap" | "daily_cap" | "locked_tool"): RpcOutcome => {
    taste.track("taste_limit_hit", { slug, listing_id: agent.listingId, reason }, agent.creatorOrgId);
    return {
      status: 200,
      body: jsonRpcResult(id, toolTextResult(taste.doorsText({ agent, visitorLimit, reason }))),
    };
  };

  // Funnel start (once per ip+listing+day — deduped by a 1/day rate key).
  if (await taste.checkLimit(`taste:started:${agent.listingId}:${taste.ipHash}`, 1, DAY_MS)) {
    taste.track("taste_session_started", { slug, listing_id: agent.listingId }, agent.creatorOrgId);
  }

  if (!TASTE_TOOL_ALLOWLIST.has(toolName)) return doors("locked_tool");
  // Per-(ip,listing) per-VISITOR cap — the anti-abuse gate, applies to EVERY
  // taste tool call regardless of cost (cheap+correct as-is).
  if (!(await taste.checkLimit(`taste:calls:${agent.listingId}:${taste.ipHash}`, visitorLimit, DAY_MS))) {
    return doors("visitor_cap");
  }

  if (isDeterministicTool(toolName)) {
    // Deterministic tools (get_quote_range, provide_faq_answer, …) never
    // touch the LLM, so they must NOT charge the per-listing DAILY cap
    // (security follow-up: charging it here let a zero-cost tool spam burn
    // the seller's whole day's funnel budget and serve `doors` to real
    // visitors). The per-visitor cap above already gates abuse.
    const det = executeDeterministicTool(toolName, toolArgs, agent.blueprint);
    if (!det.ok) return { status: 200, body: jsonRpcError(id, det.error.code, det.error.message) };
    return { status: 200, body: jsonRpcResult(id, toolTextResult(JSON.stringify(det.result))) };
  }

  // Everything past this point is LLM-bearing (ground_on_my_business, ask) —
  // this is the ONLY place the per-listing DAILY cap is charged, because
  // it's the only spend that actually costs the seller money.
  if (!(await taste.checkLimit(`taste:daily:${agent.listingId}`, dailyCap, DAY_MS))) {
    return doors("daily_cap");
  }

  if (toolName === GROUND_TOOL_NAME) {
    const url = typeof toolArgs.url === "string" ? toolArgs.url.trim() : "";
    if (!url) {
      return { status: 200, body: jsonRpcError(id, JSONRPC_INVALID_PARAMS, "Invalid params: `url` (non-empty string) is required.") };
    }
    // Grounding creation caps (2/visitor+listing/day, 6/ip/day across listings).
    if (
      !(await taste.checkLimit(`taste:ground:${agent.listingId}:${taste.ipHash}`, 2, DAY_MS)) ||
      !(await taste.checkLimit(`taste:ground:ip:${taste.ipHash}`, 6, DAY_MS))
    ) {
      return doors("visitor_cap");
    }
    const ground = await taste.ground({ agent, url, ipHash: taste.ipHash });
    if (ground.ok) {
      taste.track("taste_grounded", { slug, listing_id: agent.listingId, has_grounding: true }, agent.creatorOrgId);
    }
    return { status: 200, body: jsonRpcResult(id, toolTextResult(ground.text)) };
  }

  // ask — taste variant (seller key + flagship guard live inside runTasteTurn).
  const askArgs = extractAskArgs(params);
  if (!askArgs.ok) return { status: 200, body: jsonRpcError(id, askArgs.error.code, askArgs.error.message) };
  const tasteSession = typeof toolArgs.taste_session === "string" && toolArgs.taste_session.length > 0
    ? toolArgs.taste_session
    : null;
  const turn = await taste.runTasteTurn({ agent, message: askArgs.message, tasteSession });
  if (!turn.ok) return { status: 200, body: jsonRpcResult(id, toolTextResult(turn.message, true)) };
  const result = toolTextResult(turn.reply);
  (result as { conversationId?: string }).conversationId = turn.conversationId;
  return { status: 200, body: jsonRpcResult(id, result) };
}

// ─── auth ────────────────────────────────────────────────────────────────────

type AuthResult =
  | { ok: true; renterOrgId: string }
  | { ok: false; outcome: RpcOutcome };

function authorize(
  bearer: string | null,
  slug: string,
  id: JsonRpcId,
  deps: AgentRentalRpcDeps,
): AuthResult {
  if (!bearer) {
    return {
      ok: false,
      outcome: {
        status: 200,
        body: jsonRpcError(id, JSONRPC_UNAUTHORIZED, "Missing rental key. Send `Authorization: Bearer <key>`."),
      },
    };
  }

  let secret: string;
  try {
    secret = deps.getSecret();
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[agent-rental] secret_unavailable: ${detail}`);
    return {
      ok: false,
      outcome: {
        status: 200,
        body: jsonRpcError(id, JSONRPC_INTERNAL_ERROR, "Rental verification is temporarily unavailable."),
      },
    };
  }

  const verdict = verifyRentalKey({ key: bearer, slug, secret, now: deps.now() });
  switch (verdict.kind) {
    case "valid":
      return { ok: true, renterOrgId: verdict.renterOrgId };
    case "expired":
      return {
        ok: false,
        outcome: { status: 200, body: jsonRpcError(id, JSONRPC_UNAUTHORIZED, "Rental key has expired. Generate a new one.") },
      };
    case "slug_mismatch":
      return {
        ok: false,
        outcome: { status: 200, body: jsonRpcError(id, JSONRPC_UNAUTHORIZED, "Rental key is for a different agent.") },
      };
    default:
      return {
        ok: false,
        outcome: { status: 200, body: jsonRpcError(id, JSONRPC_UNAUTHORIZED, "Invalid rental key.") },
      };
  }
}
