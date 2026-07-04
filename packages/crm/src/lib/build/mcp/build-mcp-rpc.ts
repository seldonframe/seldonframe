// SeldonFrame Builder MCP (mcp.seldonframe.com/v1) — the PURE wire layer.
//
// This is the transport the /build page's `claude mcp add seldonframe
// --transport http https://mcp.seldonframe.com/v1` instructions actually
// connect to. It speaks the SAME JSON-RPC 2.0 / Streamable-HTTP shape as the
// other two MCP surfaces in this codebase (agent-mcp-rpc.ts, the rental
// endpoint; chatgpt-mcp-rpc.ts, the public ChatGPT app) — we IMPORT that
// shared envelope vocabulary rather than duplicate it, so there is ONE
// transport spelling across the codebase.
//
// UNLIKE the other two, this server is WORKSPACE-BEARER-AUTHED on every call
// (no public/keyless mode — see the route + handler for the auth gate) and
// its tool surface is a THIN BRIDGE over the existing /api/v1/build/{discover,
// inspect,run} HTTP API: this file does NOT reimplement discover/inspect/run
// logic, it only describes the three tools (MCP inputSchemas, for tools/list)
// and validates+shapes the tools/call arguments the handler forwards verbatim
// to those routes. "Do not invent new capabilities" — this is a transport
// adapter, not a new tool surface.

import type { McpToolDescriptor } from "@/lib/agents/mcp/client";

// Re-export the transport envelope builders shared with the other two MCP
// surfaces, so callers only need to import this ONE module for the builder
// MCP's wire vocabulary.
export {
  parseJsonRpcRequest,
  jsonRpcResult,
  jsonRpcError,
  toolTextResult,
  MCP_PROTOCOL_VERSION,
  JSONRPC_PARSE_ERROR,
  JSONRPC_INVALID_REQUEST,
  JSONRPC_METHOD_NOT_FOUND,
  JSONRPC_INVALID_PARAMS,
  JSONRPC_INTERNAL_ERROR,
  type JsonRpcId,
} from "@/lib/marketplace/agent-mcp-rpc";

/** JSON-RPC "auth failure" — no reserved code exists, so use the
 *  implementation-defined server range (-32000), matching the rental MCP's
 *  own JSONRPC_UNAUTHORIZED convention. */
export const JSONRPC_UNAUTHORIZED = -32000;

// ─── tool names ──────────────────────────────────────────────────────────────

export const DISCOVER_TOOL = "discover";
export const INSPECT_TOOL = "inspect";
export const RUN_TOOL = "run";

/** The three tool names this server exposes (the only valid tools/call names). */
export const BUILD_TOOL_NAMES = [DISCOVER_TOOL, INSPECT_TOOL, RUN_TOOL] as const;

export type BuildToolName = (typeof BUILD_TOOL_NAMES)[number];

// ─── initialize ──────────────────────────────────────────────────────────────

/** MCP server `instructions` (returned on initialize) — concise, self-
 *  contained framing of the discover → inspect → run flow for an IDE agent. */
export const BUILD_SERVER_INSTRUCTIONS =
  "SeldonFrame's builder marketplace: agents and tools you can find, inspect, and run from your IDE. " +
  "Typical flow: call discover with a natural-language query to search the catalog, then inspect an " +
  "entry's id to see its input schema and price, then run it with { type, id, input } to execute. " +
  "Every call is billed to the workspace that owns this bearer key — run never charges a card directly " +
  "(see the billing block in each run result).";

/** The `initialize` result: protocol + server identity + capabilities. Tools
 *  only (no prompts) — this server's whole surface is the three bridge tools. */
export function buildBuildInitializeResult(): Record<string, unknown> {
  return {
    protocolVersion: "2025-06-18",
    capabilities: { tools: {} },
    serverInfo: { name: "SeldonFrame", version: "1.0.0" },
    instructions: BUILD_SERVER_INSTRUCTIONS,
  };
}

// ─── tools/list ──────────────────────────────────────────────────────────────

/**
 * The `tools/list` result: real MCP inputSchemas for discover/inspect/run,
 * mirroring EXACTLY the request bodies /api/v1/build/{discover,inspect,run}
 * accept (this transport is a thin bridge, not a new API).
 */
export function buildBuildToolsList(): { tools: McpToolDescriptor[] } {
  return {
    tools: [
      {
        name: DISCOVER_TOOL,
        description:
          "Search the SeldonFrame builder marketplace catalog (published agents + Composio tools) by " +
          "natural language. USE-WHEN you want to find an agent or tool to inspect/run. Returns ranked " +
          "results, each with id, type, name, description, and price.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Free-text search (e.g. 'send an email', 'book an appointment'). Optional — a blank query lists the catalog.",
            },
            limit: {
              type: "number",
              description: "Max results to return. Optional, defaults to 10.",
            },
          },
        },
        // Pure catalog search over our own closed marketplace index — never
        // mutates anything, safe to re-run, no external/open-world fetch.
        annotations: {
          title: "Search Builder Catalog",
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      {
        name: INSPECT_TOOL,
        description:
          "Inspect one catalog entry (an agent or a tool) by id. USE-WHEN you have an id from discover and " +
          "need its input schema and price before running it. Returns { id, type, name, description, " +
          "inputSchema, price, docUrl? }.",
        inputSchema: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["agent", "tool"], description: "The entry's type, from discover's result." },
            id: { type: "string", description: "The entry's id (agent slug or tool action slug), from discover's result." },
          },
          required: ["type", "id"],
        },
        // A metadata lookup by id against our own catalog — read-only,
        // repeatable, closed-world (same reasoning as discover).
        annotations: {
          title: "Inspect Catalog Entry",
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      {
        name: RUN_TOOL,
        description:
          "Run a catalog entry (an agent or a tool) with the given input. USE-WHEN you've inspected the " +
          "entry's schema and are ready to execute it. Returns { runId, status, output, price, billing }. " +
          "Never charges a card directly — billing.charged reflects a workspace-wallet ledger debit only " +
          "when the workspace has wallet billing enabled; an errored run is never billed.",
        inputSchema: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["agent", "tool"], description: "The entry's type, from discover/inspect." },
            id: { type: "string", description: "The entry's id (agent slug or tool action slug)." },
            input: {
              type: "object",
              description: "The entry's input, matching the schema inspect returned (e.g. { message } for an agent).",
              additionalProperties: true,
            },
          },
          required: ["type", "id"],
        },
        // `run` EXECUTES an arbitrary catalog entry — a published agent (which
        // may itself write CRM records, send messages, etc.) or a Composio
        // tool action (which may reach an arbitrary third-party API — open
        // world). We cannot prove no reachable entry deletes/mutates data, so
        // we do NOT claim readOnlyHint/idempotentHint here; destructiveHint is
        // true because a runnable entry can perform destructive third-party
        // actions (e.g. a Composio "delete" action) that this transport has no
        // way to distinguish from a benign one at tools/list time.
        annotations: {
          title: "Run Catalog Entry",
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: true,
        },
      },
    ],
  };
}

// ─── tools/call argument extraction ──────────────────────────────────────────
//
// Each parser validates just enough to route the call safely (matching the
// -32602 invalid-params discipline the other MCP surfaces use); the DEEPER
// validation (unknown id, bad input shape, etc.) is the bridged HTTP route's
// job — we don't duplicate it here, we forward and relay its response.

export type ParseOk<T> = { ok: true; value: T };
export type ParseErr = { ok: false; error: string };
export type ParseResult<T> = ParseOk<T> | ParseErr;

export type DiscoverArgs = { query?: string; limit?: number };

/** Validate + normalize discover's arguments (both optional). */
export function parseDiscoverArgs(args: Record<string, unknown>): ParseResult<DiscoverArgs> {
  const query = typeof args.query === "string" ? args.query : undefined;
  const limitRaw = args.limit;
  const limit =
    typeof limitRaw === "number" && Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.floor(limitRaw)
      : undefined;
  return { ok: true, value: { query, limit } };
}

export type InspectArgs = { type: "agent" | "tool"; id: string };

/** Validate + normalize inspect's arguments (both required). */
export function parseInspectArgs(args: Record<string, unknown>): ParseResult<InspectArgs> {
  const type = args.type;
  if (type !== "agent" && type !== "tool") {
    return { ok: false, error: '`type` must be "agent" or "tool".' };
  }
  const id = typeof args.id === "string" ? args.id.trim() : "";
  if (!id) {
    return { ok: false, error: "`id` (a non-empty string) is required." };
  }
  return { ok: true, value: { type, id } };
}

export type RunArgs = { type: "agent" | "tool"; id: string; input: Record<string, unknown> };

/** Validate + normalize run's arguments (type + id required, input optional). */
export function parseRunArgs(args: Record<string, unknown>): ParseResult<RunArgs> {
  const type = args.type;
  if (type !== "agent" && type !== "tool") {
    return { ok: false, error: '`type` must be "agent" or "tool".' };
  }
  const id = typeof args.id === "string" ? args.id.trim() : "";
  if (!id) {
    return { ok: false, error: "`id` (a non-empty string) is required." };
  }
  const input =
    typeof args.input === "object" && args.input !== null && !Array.isArray(args.input)
      ? (args.input as Record<string, unknown>)
      : {};
  return { ok: true, value: { type, id, input } };
}
