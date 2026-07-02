// ChatGPT App MCP — the DI'd request handler core.
//
// This is the method-dispatch flow for the PUBLIC ChatGPT MCP server, lifted out
// of the route into a dependency-injected function returning a plain
// { status, body }. The route (app/api/chatgpt/mcp/route.ts) is a thin wrapper
// that binds the REAL deps (createAnonymousWorkspace + IP rate-limit,
// listMarketplaceAgentsFromDb, the bearer→org resolve + agent clone) and maps
// the result onto NextResponse.
//
// Mirrors lib/marketplace/agent-mcp-handler.ts, but:
//   - NO auth gate. The ChatGPT server is public/keyless by design (the magic
//     first-run vision). build_workspace mints an anonymous workspace bearer
//     that threads deploy_agent later in the SAME conversation.
//   - Three high-level tools (build/browse/deploy) instead of the rental `ask`.
//   - Every tools/call emits BOTH a human `content` text block AND a
//     `structuredContent` object so Apps-SDK clients can render rich UI.
//
// WHY DI not module-mocking: the repo prefers dependency injection over
// node:test mock.module (tsx's CJS interop makes mock.module unreliable). So all
// branching (each tool, validation errors, a dep that throws, a dep that returns
// ok:false) is exercised with fakes — no real DB, no network.

import {
  parseJsonRpcRequest,
  jsonRpcResult,
  jsonRpcError,
  toolTextResult,
  buildInitializeResult,
  JSONRPC_METHOD_NOT_FOUND,
  JSONRPC_INVALID_PARAMS,
  type JsonRpcId,
} from "@/lib/marketplace/agent-mcp-rpc";
import {
  buildChatGptToolsList,
  parseBuildWorkspaceArgs,
  parseBrowseArgs,
  parseDeployArgs,
  formatMarketplaceList,
  formatBuildResult,
  formatDeployResult,
  BUILD_WORKSPACE_TOOL,
  BROWSE_MARKETPLACE_TOOL,
  DEPLOY_AGENT_TOOL,
  type BuildWorkspaceArgs,
} from "./chatgpt-mcp-rpc";
import type { MarketplaceAgentRow } from "@/lib/marketplace/agent-listings";

/** MCP server `instructions` (returned on initialize). ChatGPT + Codex read this
 *  alongside the tool metadata to understand the cross-tool flow. Kept concise +
 *  self-contained in the first ~512 chars per the Apps SDK guidance. */
export const CHATGPT_SERVER_INSTRUCTIONS =
  "SeldonFrame builds a complete front office (public website, booking page, intake form, CRM, and AI chatbot) for a local service business from one short description, then lets you add free AI agents to it. Typical flow: call build_workspace first to create the workspace and get a workspace_token, then browse_marketplace to list free agents, then deploy_agent with that token plus an agent slug. build_workspace needs no login and returns a live public URL. This server never charges a card and never links out to make a purchase.";

/** The result of building an anonymous workspace (the route maps the real
 *  createAnonymousWorkspace return onto this). The workspaceToken threads
 *  deploy_agent later in the same conversation. */
export type BuildWorkspaceResult = {
  url: string;
  claimUrl?: string;
  workspaceToken: string;
};

/** The result of deploying an agent. Free agents instantiate inline (url).
 *  ok:false carries a friendly error — including "this agent isn't available
 *  to install through ChatGPT" for a paid/non-free agent. NEVER carries a
 *  claim/purchase URL or a price; paid agents are managed on seldonframe.com,
 *  not through ChatGPT. */
export type DeployAgentResult = {
  ok: boolean;
  name?: string;
  url?: string;
  error?: string;
};

export type ChatGptMcpDeps = {
  /** Create a complete anonymous workspace from the parsed build args. Applies
   *  the same IP rate-limit the anonymous route uses (throws a friendly Error on
   *  limit → surfaces as a tool isError). */
  buildWorkspace: (args: BuildWorkspaceArgs) => Promise<BuildWorkspaceResult>;
  /** List published marketplace agents, filtered. Public — no auth. */
  browse: (filters: { query?: string; niche?: string }) => Promise<MarketplaceAgentRow[]>;
  /** Deploy an agent into the workspace identified by the bearer token. */
  deploy: (args: { workspaceToken: string; slug: string }) => Promise<DeployAgentResult>;
  /** Current time (injected for determinism). */
  now: () => Date;
};

export type RpcOutcome = {
  status: number;
  /** null body → 202/no-content (notification ack). */
  body: Record<string, unknown> | null;
};

/** Shape an MCP tools/call success: a human text block PLUS structuredContent
 *  (the raw machine-readable object) for Apps-SDK clients that render rich UI. */
function toolResult(text: string, structured: Record<string, unknown>): Record<string, unknown> {
  return { ...toolTextResult(text), structuredContent: structured };
}

/**
 * Handle one JSON-RPC request against the public ChatGPT MCP server. Pure over
 * its deps: parse → (notification ack) → route method. tools/list + tools/call
 * are PUBLIC (no auth gate). Returns { status, body }.
 */
export async function handleChatGptRpc(rawBody: string, deps: ChatGptMcpDeps): Promise<RpcOutcome> {
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
      return {
        status: 200,
        body: jsonRpcResult(id, {
          ...buildInitializeResult({ agentName: "SeldonFrame" }),
          instructions: CHATGPT_SERVER_INSTRUCTIONS,
        }),
      };

    case "ping":
      return { status: 200, body: jsonRpcResult(id, {}) };

    case "tools/list":
      // Public — no auth gate. ChatGPT discovers the three tools freely.
      return { status: 200, body: jsonRpcResult(id, buildChatGptToolsList()) };

    case "tools/call":
      return handleToolsCall(id, params, deps);

    default:
      return { status: 200, body: jsonRpcError(id, JSONRPC_METHOD_NOT_FOUND, `Method not found: ${method}`) };
  }
}

async function handleToolsCall(
  id: JsonRpcId,
  params: Record<string, unknown>,
  deps: ChatGptMcpDeps,
): Promise<RpcOutcome> {
  const toolName = typeof params.name === "string" ? params.name : "";
  const args =
    typeof params.arguments === "object" && params.arguments !== null && !Array.isArray(params.arguments)
      ? (params.arguments as Record<string, unknown>)
      : {};

  switch (toolName) {
    case BUILD_WORKSPACE_TOOL: {
      const parsed = parseBuildWorkspaceArgs(args);
      if (!parsed.ok) {
        return { status: 200, body: jsonRpcError(id, JSONRPC_INVALID_PARAMS, `Invalid params: ${parsed.error}`) };
      }
      return runTool(id, deps, async () => {
        const result = await deps.buildWorkspace(parsed.value);
        return toolResult(formatBuildResult(result), { ...result });
      });
    }

    case BROWSE_MARKETPLACE_TOOL: {
      const parsed = parseBrowseArgs(args);
      if (!parsed.ok) {
        return { status: 200, body: jsonRpcError(id, JSONRPC_INVALID_PARAMS, `Invalid params: ${parsed.error}`) };
      }
      return runTool(id, deps, async () => {
        const rows = await deps.browse(parsed.value);
        // structuredContent mirrors the DECLARED output schema exactly — the
        // raw MarketplaceAgentRow carries extra columns (price, rating, …)
        // that the free-utility surface deliberately does not emit.
        const agents = rows.map((row) => ({
          slug: row.slug,
          name: row.name,
          description: row.description,
          niche: row.niche,
        }));
        return toolResult(formatMarketplaceList(rows), { agents });
      });
    }

    case DEPLOY_AGENT_TOOL: {
      const parsed = parseDeployArgs(args);
      if (!parsed.ok) {
        return { status: 200, body: jsonRpcError(id, JSONRPC_INVALID_PARAMS, `Invalid params: ${parsed.error}`) };
      }
      return runTool(id, deps, async () => {
        const result = await deps.deploy({ workspaceToken: parsed.value.workspace_token, slug: parsed.value.agent_slug });
        if (!result.ok) {
          // A handled failure (e.g. expired token, unknown slug) → tool-level
          // isError, NOT a transport error. The text is the friendly message.
          return toolTextResult(result.error ?? "Could not deploy that agent.", true);
        }
        return toolResult(
          formatDeployResult({ name: result.name ?? "the agent", url: result.url }),
          { ...result },
        );
      });
    }

    default:
      return {
        status: 200,
        body: jsonRpcError(
          id,
          JSONRPC_METHOD_NOT_FOUND,
          `Unknown tool: ${toolName || "(none)"}. Valid tools: ${BUILD_WORKSPACE_TOOL}, ${BROWSE_MARKETPLACE_TOOL}, ${DEPLOY_AGENT_TOOL}.`,
        ),
      };
  }
}

/**
 * Run a tool body, converting any THROW into a tool-level isError result (HTTP
 * 200) rather than a transport 500. This is the fail-safe boundary: a rate-limit
 * throw from buildWorkspace, a DB hiccup in browse, etc. all surface to ChatGPT
 * as a readable error inside the assistant turn — the connection stays healthy.
 */
async function runTool(
  id: JsonRpcId,
  deps: ChatGptMcpDeps,
  body: () => Promise<Record<string, unknown>>,
): Promise<RpcOutcome> {
  try {
    const result = await body();
    return { status: 200, body: jsonRpcResult(id, result) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[chatgpt-mcp] tool_error ts=${deps.now().toISOString()} err=${message}`);
    return { status: 200, body: jsonRpcResult(id, toolTextResult(message, true)) };
  }
}
