// Composio connector → AgentTool resolver (the runtime bridge).
//
// A `kind:"composio"` ConnectorBinding carries NO endpoint and NO secret — the
// toolkit action runs against the workspace's LIVE Composio key. So unlike the
// vetted/byo path (which resolves a static endpoint + stored bearer in
// wrap-tool.ts), this resolver wraps each allowlisted tool with an executor that
// LAZILY resolves the key at call time (orgId = ctx.orgId) and executes the
// action via the Composio SDK (`composio.tools.execute`).
//
// WHY THE SDK, NOT THE MCP SESSION: the per-workspace Composio MCP session runs
// in "tool-router" mode — its tools/list exposes ONLY meta-tools
// (COMPOSIO_SEARCH_TOOLS / COMPOSIO_MULTI_EXECUTE_TOOL / …), NOT the direct
// toolkit actions. So a direct callTool("GMAIL_SEND_EMAIL", …) over MCP 404s
// "Tool not found" (MCP error -32602). The SDK's tools.execute hits the action
// slug directly. This mirrors the calendar adapter fix in lib/agents/tools.ts
// (buildCalendarBackendDeps → makeComposio.callTool).
//
// Fail-closed: if the workspace has no Composio key, the executor throws — the
// runtime loop maps that to an error tool_result, never a crash.
// (getToolsForCapabilities additionally short-circuits composio bindings to zero
// tools when no key is configured, so the model never even sees them — see
// tools.ts.)
//
// SECURITY: the Composio API key is resolved per-call (BYO secret else platform
// env) and handed to the SDK client (which never logs it). Nothing
// Composio-secret lives on the binding or in the blueprint.

import { z } from "zod";

import type { AgentTool, ToolExecuteContext } from "@/lib/agents/tools";
import type {
  ConnectorBinding,
  McpToolSchema,
} from "@/lib/agents/mcp/connectors";

/** The stable namespace prefix for every Composio tool exposed to the model. */
export const COMPOSIO_TOOL_NAMESPACE = "composio";

/** A composio binding, narrowed. */
export type ComposioBinding = Extract<ConnectorBinding, { kind: "composio" }>;

/** Injectable seam: execute a Composio toolkit action by its slug for a
 *  workspace. The default (defaultComposioWrapDeps) runs it via the Composio SDK
 *  (`composio.tools.execute`); tests stub it so no network/DB is touched.
 *  Throws when the workspace has no Composio key (mapped to a tool_result
 *  upstream). */
export type ComposioWrapDeps = {
  executeTool: (
    orgId: string,
    toolName: string,
    args: Record<string, unknown>,
  ) => Promise<unknown>;
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
 * `composio__<tool>`; the bare action slug (`toolName`) is what we execute via
 * the SDK. The executor resolves the key lazily so orgId is read from
 * execute-time ctx (deps.executeTool throws when no key is configured).
 */
function wrapComposioTool(
  toolName: string,
  cachedSchema: McpToolSchema | undefined,
  deps: ComposioWrapDeps,
): AgentTool<Record<string, unknown>, unknown> {
  return {
    name: `${COMPOSIO_TOOL_NAMESPACE}__${toolName}`,
    description: cachedSchema?.description ?? `Composio tool ${toolName}.`,
    inputSchema: PASS_THROUGH_INPUT,
    jsonSchema: cachedSchema?.inputSchema ?? DEFAULT_JSON_SCHEMA,
    execute: async (input: Record<string, unknown>, ctx: ToolExecuteContext) =>
      deps.executeTool(ctx.orgId, toolName, input ?? {}),
  };
}

/**
 * Resolve a composio binding to its enabled AgentTools. Wraps ONLY the binding's
 * `enabledTools` allowlist; uses the cached schema for `jsonSchema` when present
 * (so the model sees the real shape), else a permissive default. An empty
 * allowlist yields []. Does NOT touch the network here — the key is resolved and
 * the action executed lazily inside each tool's executor.
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
      wrapComposioTool(toolName, cacheByName.get(toolName), deps) as AgentTool,
    );
  }
  return out;
}

/**
 * Lazily-built default deps: execute the action via the Composio SDK
 * (`composio.tools.execute`) — NOT the per-workspace MCP session, which runs in
 * tool-router mode and only exposes meta-tools (a direct callTool on the action
 * slug 404s). The workspace's Composio key is resolved BYO-else-platform; a
 * missing key throws the friendly "not configured" message (mapped to a
 * tool_result upstream). Lazy `import("@composio/core")` + `import("./keys")`
 * keep the Node SDK off the eager module graph. Mirrors the calendar fix in
 * lib/agents/tools.ts (buildCalendarBackendDeps).
 */
export async function defaultComposioWrapDeps(): Promise<ComposioWrapDeps> {
  return {
    executeTool: async (orgId, toolName, args) => {
      const [{ Composio }, { resolveComposioKey }] = await Promise.all([
        import("@composio/core"),
        import("./keys"),
      ]);
      const { apiKey } = await resolveComposioKey(orgId);
      if (!apiKey) {
        throw new Error(
          "Composio is not configured for this workspace (no API key) — connect it in Integrations.",
        );
      }
      const composio = new Composio({ apiKey });
      // userId = orgId (the Composio entity); dangerouslySkipVersionCheck uses
      // the toolkit's latest action version (none pinned).
      const res = await composio.tools.execute(toolName, {
        userId: orgId,
        dangerouslySkipVersionCheck: true,
        arguments: args,
      });
      // Hand the model the action payload (res.data) on success; on a failed/
      // empty result return the whole envelope so errors still surface.
      const ok =
        (res as { successful?: boolean })?.successful !== false &&
        (res as { data?: unknown })?.data != null;
      return ok ? (res as { data: unknown }).data : res;
    },
  };
}
