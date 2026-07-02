// SeldonFrame Builder MCP — the DI'd request handler core.
//
// This is the method-dispatch flow for mcp.seldonframe.com/v1, lifted out of
// the route into a dependency-injected function returning a plain
// { status, body }. The route (app/api/mcp/v1/route.ts) is a thin wrapper
// that:
//   1. Runs guardApiRequest (the SAME auth guard every /api/v1/build/* route
//      uses) BEFORE this handler ever sees the request — so a missing/invalid
//      `wst_` bearer never reaches JSON-RPC dispatch at all.
//   2. Binds the REAL bridge (an internal fetch to /api/v1/build/{discover,
//      inspect,run}, forwarding the caller's Authorization header) and maps
//      this handler's result onto NextResponse.
//
// WHY DI not module-mocking: the repo prefers dependency injection over
// node:test mock.module (tsx's CJS interop makes mock.module unreliable). So
// all the branching (each tool, validation errors, a bridge that throws, a
// bridge that returns a non-2xx) is exercised with fakes — no real DB, no
// network.
//
// THIN BRIDGE, NOT A NEW SURFACE: tools/call for discover/inspect/run does not
// reimplement those routes' logic — it forwards the parsed args to
// deps.bridge(tool, body) and relays whatever { status, json } comes back
// (as MCP tool content + structuredContent, or a tool-level isError on a
// non-2xx). This guarantees IDENTICAL behavior to a builder calling the HTTP
// API directly with the same key.

import {
  parseJsonRpcRequest,
  jsonRpcResult,
  jsonRpcError,
  toolTextResult,
  JSONRPC_METHOD_NOT_FOUND,
  JSONRPC_INVALID_PARAMS,
  JSONRPC_UNAUTHORIZED,
  type JsonRpcId,
} from "./build-mcp-rpc";
import {
  buildBuildInitializeResult,
  buildBuildToolsList,
  parseDiscoverArgs,
  parseInspectArgs,
  parseRunArgs,
  DISCOVER_TOOL,
  INSPECT_TOOL,
  RUN_TOOL,
  type BuildToolName,
} from "./build-mcp-rpc";

export type RpcOutcome = {
  status: number;
  /** null body → 202/no-content (notification ack). */
  body: Record<string, unknown> | null;
};

/** The result of bridging one tools/call to its underlying HTTP route. */
export type BridgeResult = {
  /** The HTTP status the underlying /api/v1/build/* route returned. */
  status: number;
  /** The parsed JSON body (or a best-effort { error } shape on parse failure). */
  json: Record<string, unknown>;
};

export type BuildMcpDeps = {
  /** Already-authenticated: the orgId the guardApiRequest gate resolved from
   *  the caller's `wst_` bearer BEFORE this handler ran. NOT read by any
   *  dispatch branch today — every tools/call bridges to an HTTP route using
   *  the SAME bearer, and that route's OWN guardApiRequest re-validates it and
   *  logs the call (logEvent(..., { orgId })), so duplicating that log here
   *  would double-count. Kept on the deps shape as the caller's proof-of-auth
   *  contract (a BuildMcpDeps literally cannot be constructed without an
   *  authenticated org) and as the natural seam for an MCP-specific audit log
   *  later, without changing this type. */
  orgId: string;
  /** Bridge one tool call to its underlying /api/v1/build/<tool> route. The
   *  route (real deps) does an internal same-origin fetch forwarding the
   *  Authorization header; tests inject a fake that returns canned results. */
  bridge: (tool: BuildToolName, body: Record<string, unknown>) => Promise<BridgeResult>;
  /** Current time (injected for deterministic logging). */
  now: () => Date;
};

/** Shape a successful bridge call as MCP tools/call content: a human summary
 *  line PLUS structuredContent (the raw JSON the HTTP route returned) so an
 *  IDE agent can both read and programmatically use the result. */
function bridgeToolResult(json: Record<string, unknown>): Record<string, unknown> {
  return {
    content: [{ type: "text", text: JSON.stringify(json) }],
    structuredContent: json,
  };
}

/**
 * Handle one JSON-RPC request against the builder MCP. Pure over its deps:
 * parse → (notification ack) → route method. tools/list + tools/call both
 * require deps.orgId to be present (the route only builds deps AFTER
 * guardApiRequest succeeds — see the route's auth-gate comment); initialize
 * and ping are permitted so a client can complete the MCP handshake, but the
 * route itself still demands a valid bearer on every request per spec (no
 * unauthenticated initialize — see the route). Returns { status, body }.
 */
export async function handleBuildMcpRpc(rawBody: string, deps: BuildMcpDeps): Promise<RpcOutcome> {
  const parsed = parseJsonRpcRequest(rawBody);
  if (!parsed.ok) {
    return { status: 200, body: jsonRpcError(parsed.id, parsed.error.code, parsed.error.message) };
  }
  const { id, method, params, isNotification } = parsed.request;

  // Notifications (e.g. notifications/initialized) get a 202 + no body.
  if (isNotification) {
    return { status: 202, body: null };
  }

  switch (method) {
    case "initialize":
      return { status: 200, body: jsonRpcResult(id, buildBuildInitializeResult()) };

    case "ping":
      return { status: 200, body: jsonRpcResult(id, {}) };

    case "tools/list":
      return { status: 200, body: jsonRpcResult(id, buildBuildToolsList()) };

    case "tools/call":
      return handleToolsCall(id, params, deps);

    default:
      return { status: 200, body: jsonRpcError(id, JSONRPC_METHOD_NOT_FOUND, `Method not found: ${method}`) };
  }
}

async function handleToolsCall(
  id: JsonRpcId,
  params: Record<string, unknown>,
  deps: BuildMcpDeps,
): Promise<RpcOutcome> {
  const toolName = typeof params.name === "string" ? params.name : "";
  const args =
    typeof params.arguments === "object" && params.arguments !== null && !Array.isArray(params.arguments)
      ? (params.arguments as Record<string, unknown>)
      : {};

  switch (toolName) {
    case DISCOVER_TOOL: {
      const parsed = parseDiscoverArgs(args);
      if (!parsed.ok) {
        return { status: 200, body: jsonRpcError(id, JSONRPC_INVALID_PARAMS, `Invalid params: ${parsed.error}`) };
      }
      return runBridged(id, deps, DISCOVER_TOOL, {
        query: parsed.value.query,
        limit: parsed.value.limit,
      });
    }

    case INSPECT_TOOL: {
      const parsed = parseInspectArgs(args);
      if (!parsed.ok) {
        return { status: 200, body: jsonRpcError(id, JSONRPC_INVALID_PARAMS, `Invalid params: ${parsed.error}`) };
      }
      return runBridged(id, deps, INSPECT_TOOL, { type: parsed.value.type, id: parsed.value.id });
    }

    case RUN_TOOL: {
      const parsed = parseRunArgs(args);
      if (!parsed.ok) {
        return { status: 200, body: jsonRpcError(id, JSONRPC_INVALID_PARAMS, `Invalid params: ${parsed.error}`) };
      }
      return runBridged(id, deps, RUN_TOOL, {
        type: parsed.value.type,
        id: parsed.value.id,
        input: parsed.value.input,
      });
    }

    default:
      return {
        status: 200,
        body: jsonRpcError(
          id,
          JSONRPC_METHOD_NOT_FOUND,
          `Unknown tool: ${toolName || "(none)"}. Valid tools: ${DISCOVER_TOOL}, ${INSPECT_TOOL}, ${RUN_TOOL}.`,
        ),
      };
  }
}

/**
 * Bridge one tool call to its underlying HTTP route and relay the result as an
 * MCP tools/call outcome. A non-2xx from the bridged route becomes a tool-
 * level isError (HTTP 200 at the JSON-RPC layer, matching every other MCP
 * surface's fail-safe boundary: the caller's error is legible in-band, the
 * transport connection stays healthy). A THROWING bridge (network failure,
 * unexpected shape) is caught the same way — never a transport 500.
 */
async function runBridged(
  id: JsonRpcId,
  deps: BuildMcpDeps,
  tool: BuildToolName,
  body: Record<string, unknown>,
): Promise<RpcOutcome> {
  try {
    const result = await deps.bridge(tool, body);
    if (result.status >= 200 && result.status < 300) {
      return { status: 200, body: jsonRpcResult(id, bridgeToolResult(result.json)) };
    }
    // A handled failure from the bridged route (400/404/402/etc.) → tool-level
    // isError carrying the route's own error message, NOT a transport error.
    const message =
      typeof result.json.error === "string" ? result.json.error : `Request failed with status ${result.status}.`;
    return { status: 200, body: jsonRpcResult(id, { ...toolTextResult(message, true), structuredContent: result.json }) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[build-mcp] bridge_error ts=${deps.now().toISOString()} tool=${tool} err=${message}`);
    return { status: 200, body: jsonRpcResult(id, toolTextResult(message, true)) };
  }
}

/** Re-exported so the route can build the 401 JSON-RPC error body for an
 *  unauthenticated request without importing the rpc module directly. */
export function unauthorizedRpcBody(): Record<string, unknown> {
  return jsonRpcError(null, JSONRPC_UNAUTHORIZED, "Missing or invalid workspace key. Send `Authorization: Bearer wst_...`.");
}
