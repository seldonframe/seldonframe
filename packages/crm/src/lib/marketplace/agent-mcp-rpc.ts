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
// We deliberately expose ONE high-level delegating tool — `ask` — not the
// agent's raw sub-tools. Renting an agent means "delegate a task to the whole
// agent and get its reply", not "drive its internal booking API". The agent's
// own capabilities (book_appointment, look_up_availability, …) run INSIDE the
// turn; the renter just sends a message.

import type { McpToolDescriptor } from "@/lib/agents/mcp/client";

/** Advertised MCP protocol version. Matches the client's PROTOCOL_VERSION so a
 *  SeldonFrame-to-SeldonFrame connection negotiates cleanly. Renters on other
 *  clients negotiate down as needed. */
export const MCP_PROTOCOL_VERSION = "2025-06-18";

/** The single delegating tool name. */
export const ASK_TOOL_NAME = "ask";

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

/** The `initialize` result: protocol + server identity + capabilities. */
export function buildInitializeResult(input: { agentName: string }): Record<string, unknown> {
  return {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: { tools: {} },
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
