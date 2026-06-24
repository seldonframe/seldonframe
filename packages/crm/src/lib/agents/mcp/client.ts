// Inline MCP-over-HTTP client (Streamable HTTP transport, JSON-RPC 2.0).
//
// WHY inline (not @modelcontextprotocol/sdk): the SDK is not in the lockfile
// and this worktree's pnpm refuses new deps (lessons L-17). This is a minimal,
// dependency-free client implementing exactly the three calls the connector
// layer needs — initialize / tools/list / tools/call — grounded in the current
// MCP Streamable HTTP transport spec (2025-03-26 .. 2025-11-25):
//
//   * Client POSTs JSON-RPC to a single endpoint with
//       Content-Type: application/json
//       Accept: application/json, text/event-stream
//   * `initialize` negotiates the protocol; the server MAY return an
//     `Mcp-Session-Id` response header which the client MUST echo on every
//     subsequent request. After a successful initialize the client sends a
//     `notifications/initialized` notification.
//   * `tools/list` → { tools: [{ name, description, inputSchema }] }
//   * `tools/call` (params { name, arguments }) →
//       { content: [{ type:"text", text }|…], isError? }
//   * The response body may be application/json OR an SSE text/event-stream
//     (the spec lets a server stream); we parse `data:` lines in that case.
//
// SECURITY: HTTPS-only endpoints (an http:// endpoint is rejected before any
// network call); a per-call AbortController timeout (default 20s) so a hung
// MCP server never wedges the agent turn; a non-empty bearer key is sent as an
// Authorization header (and a caller `headers` map — e.g. Composio's
// `x-api-key` — is forwarded), NEVER logged here. Errors (non-2xx, malformed
// JSON, JSON-RPC error, tool isError) are mapped to thrown Errors — the
// caller (wrap-tool) try/catches them into a tool_result so the agent loop
// never crashes.

const DEFAULT_TIMEOUT_MS = 20_000;
// We advertise a recent protocol version; servers negotiate down if needed.
const PROTOCOL_VERSION = "2025-06-18";

export type McpToolDescriptor = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type McpClient = {
  /** Negotiate the session: send `initialize`, capture any Mcp-Session-Id, then
   *  send the `notifications/initialized` follow-up. Idempotent-ish — safe to
   *  call once before listTools/callTool. */
  initialize: () => Promise<void>;
  /** `tools/list` → the server's advertised tools. Auto-initializes if needed. */
  listTools: () => Promise<McpToolDescriptor[]>;
  /** `tools/call` → returns the JSON-RPC `result` (typically `{ content, isError? }`).
   *  Throws on a JSON-RPC error or an `isError:true` tool result. */
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
};

export type CreateMcpClientOptions = {
  /** The MCP server endpoint. MUST be https:// (http is rejected). */
  endpoint: string;
  /** Bearer token sent as `Authorization: Bearer <bearer>`. OPTIONAL: when
   *  empty/omitted, NO Authorization header is emitted (so a connector that
   *  authenticates purely via `headers` — e.g. Composio's `x-api-key` — isn't
   *  given a bogus `Authorization: Bearer `). */
  bearer?: string;
  /** Extra request headers merged into every call (e.g. `{ "x-api-key": … }`).
   *  Merged BEFORE the managed content-type/accept/authorization so it can never
   *  override the JSON-RPC content negotiation. */
  headers?: Record<string, string>;
  /** Injectable fetch (tests pass a fake; default = global fetch). */
  fetchImpl?: typeof fetch;
  /** Per-call timeout in ms (AbortController). Default 20s. */
  timeoutMs?: number;
};

/** Raised when the endpoint is not HTTPS. Surfaced before any network call. */
class InsecureEndpointError extends Error {
  constructor(endpoint: string) {
    super(`MCP endpoint must use https:// (got: ${safeScheme(endpoint)})`);
    this.name = "InsecureEndpointError";
  }
}

function safeScheme(url: string): string {
  const idx = url.indexOf("://");
  return idx > 0 ? `${url.slice(0, idx)}://…` : "<invalid>";
}

function assertHttps(endpoint: string): void {
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new InsecureEndpointError(endpoint);
  }
  if (parsed.protocol !== "https:") {
    throw new InsecureEndpointError(endpoint);
  }
}

type JsonRpcResponse = {
  jsonrpc?: string;
  id?: number | string | null;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
};

/**
 * Parse an MCP HTTP response body into a single JSON-RPC message.
 *
 * Two transport encodings per the spec:
 *   - application/json: the body IS the JSON-RPC object.
 *   - text/event-stream (SSE): one or more `event:`/`data:` frames; the
 *     JSON-RPC reply rides on a `data:` line. We take the LAST `data:` line
 *     that parses as an object carrying a JSON-RPC `id` (the response to our
 *     request), skipping any interim server notifications.
 */
async function parseRpcBody(res: Response): Promise<JsonRpcResponse> {
  const contentType = res.headers.get("content-type") ?? "";
  const text = await res.text();

  if (contentType.includes("text/event-stream")) {
    const dataLines = text
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trim())
      .filter((s) => s.length > 0 && s !== "[DONE]");
    // Prefer the last frame that has an `id` (the actual response to our call).
    let chosen: JsonRpcResponse | null = null;
    for (const raw of dataLines) {
      try {
        const obj = JSON.parse(raw) as JsonRpcResponse;
        if (obj && typeof obj === "object" && "id" in obj) chosen = obj;
        else if (!chosen) chosen = obj;
      } catch {
        // skip non-JSON data frames
      }
    }
    if (!chosen) {
      throw new Error("MCP SSE response carried no parseable JSON-RPC data frame");
    }
    return chosen;
  }

  // application/json (or unspecified — best effort).
  try {
    return JSON.parse(text) as JsonRpcResponse;
  } catch (err) {
    throw new Error(
      `MCP response was not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export function createMcpClient(options: CreateMcpClientOptions): McpClient {
  const { endpoint } = options;
  const bearer = options.bearer ?? "";
  const extraHeaders = options.headers;
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // HTTPS guard up front. We DON'T throw from the factory (so a misconfigured
  // BYO endpoint can't crash construction in a surprising place); instead the
  // guard runs on the first network call. A synchronous validate here lets the
  // first `send` reject cleanly without ever reaching fetch.
  let sessionId: string | null = null;
  let initialized = false;
  let nextId = 1;

  async function send(
    method: string,
    params: Record<string, unknown> | undefined,
    opts: { notification?: boolean } = {},
  ): Promise<JsonRpcResponse | null> {
    assertHttps(endpoint); // throws InsecureEndpointError before fetch

    const isNotification = opts.notification === true;
    const payload: Record<string, unknown> = {
      jsonrpc: "2.0",
      method,
      ...(params ? { params } : {}),
    };
    if (!isNotification) {
      payload.id = nextId++;
    }

    // Caller-supplied headers (e.g. Composio's `x-api-key`) ride FIRST, then the
    // managed JSON-RPC negotiation headers overwrite any collision so the
    // transport contract can never be broken by an override. `Authorization` is
    // emitted ONLY for a non-empty bearer — keeping the existing vetted/byo
    // bearer connectors byte-for-byte identical while letting a headers-only
    // (Composio) connector authenticate without a bogus `Authorization: Bearer `.
    const headers: Record<string, string> = {
      ...(extraHeaders ?? {}),
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    };
    if (bearer) {
      headers.authorization = `Bearer ${bearer}`;
    }
    if (sessionId) {
      headers["mcp-session-id"] = sessionId;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetchImpl(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      // AbortError surfaces as a timeout for the caller.
      throw new Error(
        controller.signal.aborted
          ? `MCP request timed out after ${timeoutMs}ms (${method})`
          : `MCP request failed (${method}): ${detail}`,
      );
    } finally {
      clearTimeout(timer);
    }

    // Capture/refresh the session id from any response that carries it.
    const returnedSession = res.headers.get("mcp-session-id");
    if (returnedSession) {
      sessionId = returnedSession;
    }

    if (!res.ok) {
      // Drain the body for diagnostics but keep it short + never log the key.
      let snippet = "";
      try {
        snippet = (await res.text()).slice(0, 200);
      } catch {
        /* ignore */
      }
      throw new Error(`MCP server returned HTTP ${res.status} for ${method}${snippet ? `: ${snippet}` : ""}`);
    }

    // Notifications and 202-Accepted bodies carry nothing to parse.
    if (isNotification || res.status === 202) {
      return null;
    }

    const rpc = await parseRpcBody(res);
    if (rpc.error) {
      throw new Error(`MCP ${method} error: ${rpc.error.message ?? "unknown"} (code ${rpc.error.code ?? "?"})`);
    }
    return rpc;
  }

  async function initialize(): Promise<void> {
    if (initialized) return;
    await send("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "seldonframe-mcp-connector", version: "1.0.0" },
    });
    // Per the lifecycle: confirm with an initialized notification (best-effort —
    // some servers 202 it, some ignore). Echoes the captured session id.
    await send("notifications/initialized", undefined, { notification: true });
    initialized = true;
  }

  async function listTools(): Promise<McpToolDescriptor[]> {
    await initialize();
    const rpc = await send("tools/list", {});
    const result = (rpc?.result ?? {}) as { tools?: unknown };
    const tools = Array.isArray(result.tools) ? result.tools : [];
    return tools.map((t) => {
      const tool = (t ?? {}) as {
        name?: unknown;
        description?: unknown;
        inputSchema?: unknown;
      };
      return {
        name: typeof tool.name === "string" ? tool.name : "",
        description: typeof tool.description === "string" ? tool.description : "",
        inputSchema:
          tool.inputSchema && typeof tool.inputSchema === "object"
            ? (tool.inputSchema as Record<string, unknown>)
            : { type: "object" },
      };
    });
  }

  async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    await initialize();
    const rpc = await send("tools/call", { name, arguments: args ?? {} });
    const result = (rpc?.result ?? {}) as {
      content?: Array<{ type?: string; text?: string }>;
      isError?: boolean;
    };
    if (result.isError === true) {
      // An MCP tool-level error: surface the text content so the wrapper maps it
      // into an error tool_result (it never propagates past wrap-tool).
      const text =
        Array.isArray(result.content)
          ? result.content
              .map((c) => (typeof c?.text === "string" ? c.text : ""))
              .filter(Boolean)
              .join(" ")
          : "";
      throw new Error(`MCP tool "${name}" reported an error: ${text || "(no detail)"}`);
    }
    return rpc?.result ?? null;
  }

  return { initialize, listTools, callTool };
}
