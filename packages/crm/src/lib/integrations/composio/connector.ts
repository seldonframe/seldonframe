// Composio connector → AgentTool resolver (the runtime bridge).
//
// A `kind:"composio"` ConnectorBinding carries NO endpoint and NO secret — the
// MCP URL and its `x-api-key` header come from the workspace's LIVE Composio
// session. So unlike the vetted/byo path (which resolves a static endpoint +
// stored bearer in wrap-tool.ts), this resolver wraps each allowlisted tool with
// an executor that LAZILY ensures the session at call time (orgId = ctx.orgId)
// and dials the MCP client with the session's dynamic endpoint + headers.
//
// Fail-closed: if the workspace has no Composio key, `ensureSession` returns null
// and the tool's execute throws — the runtime loop maps that to an error
// tool_result, never a crash. (getToolsForCapabilities additionally short-circuits
// composio bindings to zero tools when no key is configured, so the model never
// even sees them — see tools.ts.)
//
// SECURITY: the session's `x-api-key` header is fetched per-call and handed to
// the inline MCP client (which never logs it). Nothing Composio-secret lives on
// the binding or in the blueprint.

import { z } from "zod";

import type { AgentTool, ToolExecuteContext } from "@/lib/agents/tools";
import type { McpClient } from "@/lib/agents/mcp/client";
import type {
  ConnectorBinding,
  McpToolSchema,
} from "@/lib/agents/mcp/connectors";
import type { ComposioSessionInfo } from "./client";

/** The stable namespace prefix for every Composio tool exposed to the model. */
export const COMPOSIO_TOOL_NAMESPACE = "composio";

/** A composio binding, narrowed. */
export type ComposioBinding = Extract<ConnectorBinding, { kind: "composio" }>;

/** Injectable seam: ensure the live session + build an MCP client. Tests stub
 *  both so no network/DB is touched. */
export type ComposioWrapDeps = {
  /** Ensure/reuse the workspace session for the given toolkits, or null when no
   *  Composio key is configured for the workspace. */
  ensureSession: (
    orgId: string,
    toolkits: string[],
  ) => Promise<ComposioSessionInfo | null>;
  /** Build an MCP client for an endpoint + headers map (Composio's x-api-key). */
  makeClient: (
    endpoint: string,
    headers: Record<string, string>,
  ) => McpClient;
};

/** Permissive pass-through input schema (the MCP server is the authority). */
const PASS_THROUGH_INPUT = z.record(z.string(), z.unknown());

/** A permissive default jsonSchema for an enabled tool with no cached schema. */
const DEFAULT_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: true,
};

/**
 * Wrap one allowlisted Composio tool into an AgentTool. The wrapped name is
 * `composio__<tool>`; the original tool name is sent to the MCP server. The
 * executor ensures the session lazily so orgId is read from execute-time ctx.
 */
function wrapComposioTool(
  binding: ComposioBinding,
  toolName: string,
  cachedSchema: McpToolSchema | undefined,
  deps: ComposioWrapDeps,
): AgentTool<Record<string, unknown>, unknown> {
  return {
    name: `${COMPOSIO_TOOL_NAMESPACE}__${toolName}`,
    description: cachedSchema?.description ?? `Composio tool ${toolName}.`,
    inputSchema: PASS_THROUGH_INPUT,
    jsonSchema: cachedSchema?.inputSchema ?? DEFAULT_JSON_SCHEMA,
    execute: async (input: Record<string, unknown>, ctx: ToolExecuteContext) => {
      const session = await deps.ensureSession(ctx.orgId, binding.enabledToolkits);
      if (!session) {
        throw new Error(
          "Composio is not configured for this workspace (no API key) — connect it in Integrations.",
        );
      }
      const client = deps.makeClient(session.mcpUrl, session.mcpHeaders);
      return client.callTool(toolName, input ?? {});
    },
  };
}

/**
 * Resolve a composio binding to its enabled AgentTools. Wraps ONLY the binding's
 * `enabledTools` allowlist; uses the cached schema for `jsonSchema` when present
 * (so the model sees the real shape), else a permissive default. An empty
 * allowlist yields []. Does NOT touch the network here — the session is resolved
 * lazily inside each tool's executor.
 */
export function resolveComposioBinding(
  binding: ComposioBinding,
  deps: ComposioWrapDeps,
): AgentTool[] {
  const cacheByName = new Map<string, McpToolSchema>(
    (binding.tools ?? []).map((t) => [t.name, t]),
  );
  const out: AgentTool[] = [];
  for (const toolName of binding.enabledTools) {
    out.push(
      wrapComposioTool(binding, toolName, cacheByName.get(toolName), deps) as AgentTool,
    );
  }
  return out;
}

/** Lazily-built default deps wiring the real adapter + inline MCP client. */
export async function defaultComposioWrapDeps(): Promise<ComposioWrapDeps> {
  const [{ ensureSession }, { createMcpClient }] = await Promise.all([
    import("./client"),
    import("@/lib/agents/mcp/client"),
  ]);
  return {
    ensureSession: (orgId, toolkits) => ensureSession(orgId, toolkits),
    makeClient: (endpoint, headers) =>
      createMcpClient({ endpoint, headers, bearer: "" }),
  };
}
