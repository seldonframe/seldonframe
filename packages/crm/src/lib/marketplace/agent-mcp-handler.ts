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
  buildPromptsListResult,
  buildPromptGetResult,
  parsePromptsGetParams,
  promptNameForSlug,
  extractAskArgs,
  jsonRpcResult,
  jsonRpcError,
  toolTextResult,
  JSONRPC_METHOD_NOT_FOUND,
  JSONRPC_INVALID_PARAMS,
  JSONRPC_INTERNAL_ERROR,
  type JsonRpcId,
} from "./agent-mcp-rpc";
import { verifyRentalKey } from "./rental-token";
import type { RentalAgent, RentalTurnResult } from "./agent-rental-run";

/** JSON-RPC "auth failure" — no reserved code exists, so use the
 *  implementation-defined server range (-32000) per the JSON-RPC 2.0 spec. */
export const JSONRPC_UNAUTHORIZED = -32000;

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
  /** Fire-and-forget usage logger (the 2%-billing hook). */
  logUsage: (entry: {
    slug: string;
    listingId: string;
    renterOrgId: string;
    creatorOrgId: string;
  }) => void;
  /** Current time (injected for deterministic expiry checks). */
  now: () => Date;
};

export type RpcOutcome = {
  status: number;
  /** null body → 202/no-content (notification ack). */
  body: Record<string, unknown> | null;
};

/**
 * Handle one JSON-RPC request against a rented agent. Pure over its deps:
 * parse → (notification ack) → resolve agent → route method, gating
 * tools/list + tools/call behind a valid rental key. Returns { status, body }.
 */
export async function handleAgentRentalRpc(
  slug: string,
  rawBody: string,
  bearer: string | null,
  deps: AgentRentalRpcDeps,
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
    case "initialize":
      // Unauthenticated negotiation/discovery. No agent work happens here.
      return { status: 200, body: jsonRpcResult(id, buildInitializeResult({ agentName: agent.agentName })) };

    case "ping":
      return { status: 200, body: jsonRpcResult(id, {}) };

    case "tools/list": {
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
      const auth = authorize(bearer, slug, id, deps);
      if (!auth.ok) return auth.outcome;

      const askArgs = extractAskArgs(params);
      if (!askArgs.ok) {
        return { status: 200, body: jsonRpcError(id, askArgs.error.code, askArgs.error.message) };
      }

      let turn: RentalTurnResult;
      try {
        turn = await deps.runTurn({ agent, message: askArgs.message, conversationId: askArgs.conversationId });
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        console.error(`[agent-rental] turn_error slug=${slug} renter=${auth.renterOrgId} err=${detail}`);
        return {
          status: 200,
          body: jsonRpcError(id, JSONRPC_INTERNAL_ERROR, "The agent failed to respond. Please try again."),
        };
      }

      if (!turn.ok) {
        // Degraded agent → MCP tool error (a successful JSON-RPC response with
        // an isError tool result), so the renter's client maps it to a
        // tool_result error, not a transport crash.
        return { status: 200, body: jsonRpcResult(id, toolTextResult(turn.message, true)) };
      }

      // Usage log — the hook the future 2%-on-rentals billing reads.
      const entry = {
        event: "agent_rental_call",
        slug,
        listingId: agent.listingId,
        renterOrgId: auth.renterOrgId,
        creatorOrgId: agent.creatorOrgId,
        ts: deps.now().toISOString(),
      };
      console.log(`[agent-rental] ${JSON.stringify(entry)}`);
      deps.logUsage({
        slug,
        listingId: agent.listingId,
        renterOrgId: auth.renterOrgId,
        creatorOrgId: agent.creatorOrgId,
      });

      const result = toolTextResult(turn.reply);
      (result as { conversationId?: string }).conversationId = turn.conversationId;
      return { status: 200, body: jsonRpcResult(id, result) };
    }

    default:
      return { status: 200, body: jsonRpcError(id, JSONRPC_METHOD_NOT_FOUND, `Method not found: ${method}`) };
  }
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
