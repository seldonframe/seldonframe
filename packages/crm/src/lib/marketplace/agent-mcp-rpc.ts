// Agent-marketplace MCP rental — the PURE JSON-RPC 2.0 / MCP wire layer.
//
// The /api/v1/agents/[slug]/mcp endpoint exposes a listed agent as an
// MCP-over-HTTP server. It speaks the SAME JSON-RPC 2.0 / Streamable-HTTP shape
// that our inline MCP client (lib/agents/mcp/client.ts) CONSUMES — so a
// SeldonFrame agent is reachable by the exact protocol we use to reach other
// MCP servers (initialize → notifications/initialized → tools/list →
// tools/call). Symmetry by design.
//
// Everything here is pure (no db, no env, no I/O) so the route handler stays a
// thin shell: parse → route → run the agent → shape the reply. Unit-tested in
// agent-mcp-rpc.spec.ts.
//
// RENTAL MODEL — "the renter brings the fuel" (BUILD #1):
//   The agent's SKILL is exposed as an MCP *prompt* (prompts/list + prompts/get
//   → blueprint.customSkillMd, the playbook). The RENTER's OWN LLM loads the
//   prompt and drives the agent — zero compute cost to the agent owner. The
//   `ask` tool remains as the optional agent-as-a-service path (owner's compute).

import type { McpToolDescriptor } from "@/lib/agents/mcp/client";
import type { AgentBlueprint } from "@/db/schema/agents";

/** Advertised MCP protocol version. Matches the client's PROTOCOL_VERSION so a
 *  SeldonFrame-to-SeldonFrame connection negotiates cleanly. Renters on other
 *  clients negotiate down as needed. */
export const MCP_PROTOCOL_VERSION = "2025-06-18";

/** The single delegating tool name. */
export const ASK_TOOL_NAME = "ask";

/** Names of the deterministic, blueprint-carried tools a renter's own model
 *  drives (their descriptors + executors land with the deterministic-tools
 *  work). The skill prompt below lists them so the renter knows what to call. */
export const GET_QUOTE_RANGE_TOOL_NAME = "get_quote_range";
export const PROVIDE_FAQ_ANSWER_TOOL_NAME = "provide_faq_answer";

// JSON-RPC 2.0 reserved error codes (subset we use).
export const JSONRPC_PARSE_ERROR = -32700;
export const JSONRPC_INVALID_REQUEST = -32600;
export const JSONRPC_METHOD_NOT_FOUND = -32601;
export const JSONRPC_INVALID_PARAMS = -32602;
export const JSONRPC_INTERNAL_ERROR = -32603;

export type JsonRpcId = number | string | null;

export type JsonRpcRequest = {
  id: JsonRpcId;
  method: string;
  params: Record<string, unknown>;
  /** True when the inbound message carried no `id` (a JSON-RPC notification —
   *  the server MUST NOT reply with a result/error). */
  isNotification: boolean;
};

export type JsonRpcErrorShape = { code: number; message: string; data?: unknown };

export type ParseResult =
  | { ok: true; request: JsonRpcRequest }
  | { ok: false; id: JsonRpcId; error: JsonRpcErrorShape };

/**
 * Parse a raw request body into a JSON-RPC request. Returns a parse-error
 * (-32700) for non-JSON, an invalid-request (-32600) for a malformed envelope
 * (missing/blank method). Notifications (no `id`) are flagged so the caller
 * returns 202 with no body.
 */
export function parseJsonRpcRequest(body: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { ok: false, id: null, error: { code: JSONRPC_PARSE_ERROR, message: "Parse error: invalid JSON" } };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    // We don't support JSON-RPC batch arrays for this endpoint (MCP doesn't
    // require them for the calls a renter makes).
    return { ok: false, id: null, error: { code: JSONRPC_INVALID_REQUEST, message: "Invalid Request: expected a JSON-RPC object" } };
  }
  const obj = parsed as Record<string, unknown>;
  const hasId = "id" in obj && (typeof obj.id === "number" || typeof obj.id === "string");
  const id: JsonRpcId = hasId ? (obj.id as number | string) : null;

  if (typeof obj.method !== "string" || obj.method.length === 0) {
    return { ok: false, id, error: { code: JSONRPC_INVALID_REQUEST, message: "Invalid Request: missing method" } };
  }
  const params =
    typeof obj.params === "object" && obj.params !== null && !Array.isArray(obj.params)
      ? (obj.params as Record<string, unknown>)
      : {};

  return {
    ok: true,
    request: { id, method: obj.method, params, isNotification: !hasId },
  };
}

// ─── tool descriptor + result shapes ─────────────────────────────────────────

/** Render a human phrase from the agent's capability allowlist for the `ask`
 *  tool description, so the renter (often another LLM) knows what it can
 *  delegate. Falls back to a generic phrase when the agent declares none. */
export function summarizeCapabilities(capabilities: string[] | undefined | null): string {
  const labels: Record<string, string> = {
    look_up_availability: "check availability",
    book_appointment: "book appointments",
    find_my_existing_appointment: "look up existing appointments",
    escalate_to_human: "escalate to a human",
    provide_faq_answer: "answer questions about the business",
    take_message: "take a message",
    get_quote_range: "give ballpark price ranges",
  };
  const phrases = (capabilities ?? [])
    .map((c) => labels[c] ?? c.replace(/_/g, " "))
    .filter(Boolean);
  if (phrases.length === 0) return "handle requests and answer questions on the business's behalf";
  if (phrases.length === 1) return phrases[0];
  if (phrases.length === 2) return `${phrases[0]} and ${phrases[1]}`;
  return `${phrases.slice(0, -1).join(", ")}, and ${phrases[phrases.length - 1]}`;
}

/** Build the ONE delegating `ask` tool descriptor for a given agent. */
export function buildAskToolDescriptor(input: {
  agentName: string;
  capabilities: string[] | undefined | null;
}): McpToolDescriptor {
  const summary = summarizeCapabilities(input.capabilities);
  return {
    name: ASK_TOOL_NAME,
    description:
      `Send a task or message to the ${input.agentName} agent — it can ${summary}. ` +
      `Returns the agent's reply. Pass conversation_id to continue an existing thread.`,
    inputSchema: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: `The task or message for the ${input.agentName} agent.`,
        },
        conversation_id: {
          type: "string",
          description: "Optional. Echo back a prior reply's conversation_id to keep context.",
        },
      },
      required: ["message"],
    },
  };
}

/** The `initialize` result: protocol + server identity + capabilities. Now
 *  advertises BOTH tools (ask + deterministic) and prompts (the skill prompt). */
export function buildInitializeResult(input: { agentName: string }): Record<string, unknown> {
  return {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: { tools: {}, prompts: {} },
    serverInfo: {
      name: input.agentName,
      version: "1.0.0",
    },
  };
}

/** The `tools/list` result: just the one `ask` tool. */
export function buildToolsListResult(input: {
  agentName: string;
  capabilities: string[] | undefined | null;
}): Record<string, unknown> {
  return { tools: [buildAskToolDescriptor(input)] };
}

// ─── tools/call argument extraction ──────────────────────────────────────────

export type AskArgs =
  | { ok: true; message: string; conversationId: string | undefined }
  | { ok: false; error: JsonRpcErrorShape };

/**
 * Validate + extract the `ask` call's arguments from a tools/call params block
 * ({ name, arguments }). A wrong tool name is method-not-found (-32601 — the
 * only callable tool is `ask`); a missing/blank/non-string message is
 * invalid-params (-32602). A non-string conversation_id is treated as absent
 * (lenient — a bad optional field shouldn't fail the call).
 */
export function extractAskArgs(params: Record<string, unknown>): AskArgs {
  const name = typeof params.name === "string" ? params.name : "";
  if (name !== ASK_TOOL_NAME) {
    return { ok: false, error: { code: JSONRPC_METHOD_NOT_FOUND, message: `Unknown tool: ${name || "(none)"}. The only tool is "${ASK_TOOL_NAME}".` } };
  }
  const args =
    typeof params.arguments === "object" && params.arguments !== null
      ? (params.arguments as Record<string, unknown>)
      : {};
  const rawMessage = args.message;
  if (typeof rawMessage !== "string" || rawMessage.trim().length === 0) {
    return { ok: false, error: { code: JSONRPC_INVALID_PARAMS, message: "Invalid params: `message` (non-empty string) is required." } };
  }
  const conversationId =
    typeof args.conversation_id === "string" && args.conversation_id.length > 0
      ? args.conversation_id
      : undefined;
  return { ok: true, message: rawMessage.trim(), conversationId };
}

// ─── prompts (the agent's skill, BUILD #1) ───────────────────────────────────
//
// MCP prompts/list + prompts/get are NET-NEW on this router. We expose ONE
// prompt — `act_as_<slug>` — whose body is the agent's blueprint.customSkillMd
// (its playbook) plus a one-line framing. The renter's own LLM loads this and
// then drives the deterministic tools below — zero owner compute.

/** Stable prompt name for an agent's skill. One prompt per rented agent. */
export function promptNameForSlug(slug: string): string {
  return `act_as_${slug}`;
}

/** The `prompts/list` result: the single act-as skill prompt (no arguments). */
export function buildPromptsListResult(input: {
  slug: string;
  agentName: string;
  capabilities: string[] | undefined | null;
}): Record<string, unknown> {
  const summary = summarizeCapabilities(input.capabilities);
  return {
    prompts: [
      {
        name: promptNameForSlug(input.slug),
        description: `Act as the ${input.agentName} agent — it can ${summary}. Loads the agent's skill (its playbook) so your own model can run it.`,
        arguments: [],
      },
    ],
  };
}

/** Validated `prompts/get` params. */
export type PromptsGetParams =
  | { ok: true; name: string }
  | { ok: false; error: JsonRpcErrorShape };

/** Extract + validate the `prompts/get` `name`. Blank/missing/non-string →
 *  invalid-params (-32602). */
export function parsePromptsGetParams(params: Record<string, unknown>): PromptsGetParams {
  const raw = params.name;
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { ok: false, error: { code: JSONRPC_INVALID_PARAMS, message: "Invalid params: `name` (non-empty string) is required." } };
  }
  return { ok: true, name: raw.trim() };
}

/** The names of the deterministic, blueprint-carried tools a renter can drive. */
function deterministicToolNames(): string[] {
  return [GET_QUOTE_RANGE_TOOL_NAME, PROVIDE_FAQ_ANSWER_TOOL_NAME];
}

export type PromptGetOutcome =
  | { ok: true; result: Record<string, unknown> }
  | { ok: false; error: JsonRpcErrorShape };

/**
 * Build the `prompts/get` result for an agent: a single message whose text is
 * the agent's playbook (blueprint.customSkillMd) framed by a one-liner that
 * names the agent and lists the deterministic tools the renter's model can call.
 * When the blueprint has no customSkillMd, we still return a usable instruction
 * (name + capabilities) so the prompt is never empty.
 *
 * Pure: the caller is responsible for having resolved the agent + verified the
 * requested prompt name matches (see handler). We accept the agent here and
 * always succeed — an unknown NAME is rejected in the handler, not here.
 */
export function buildPromptGetResult(input: {
  slug: string;
  agentName: string;
  blueprint: AgentBlueprint;
}): PromptGetOutcome {
  const toolNames = deterministicToolNames().join(", ");
  const skill = (input.blueprint.customSkillMd ?? "").trim();
  const framing =
    `You are ${input.agentName}. Follow this skill exactly. ` +
    `Tools available: ${toolNames}.`;
  const body = skill ? `${framing}\n\n${skill}` : framing;
  return {
    ok: true,
    result: {
      description: `The ${input.agentName} agent's skill — load it, then drive the ${toolNames} tools with your own model.`,
      messages: [
        {
          role: "user",
          content: { type: "text", text: body },
        },
      ],
    },
  };
}

// ─── envelope builders ───────────────────────────────────────────────────────

/** A JSON-RPC 2.0 success envelope. */
export function jsonRpcResult(id: JsonRpcId, result: unknown): Record<string, unknown> {
  return { jsonrpc: "2.0", id, result };
}

/** A JSON-RPC 2.0 error envelope. */
export function jsonRpcError(id: JsonRpcId, code: number, message: string, data?: unknown): Record<string, unknown> {
  return { jsonrpc: "2.0", id, error: { code, message, ...(data !== undefined ? { data } : {}) } };
}

/** Shape an agent reply text as an MCP `tools/call` result (content array). */
export function toolTextResult(text: string, isError = false): Record<string, unknown> {
  return {
    content: [{ type: "text", text }],
    ...(isError ? { isError: true } : {}),
  };
}
