// wrap-tool — adapt a discovered MCP tool into a native-shaped AgentTool.
//
// This is what makes an MCP tool indistinguishable from a native one to the
// Anthropic tool loop. A wrapped tool has the exact AgentTool surface
// ({name, description, inputSchema, jsonSchema, execute}); the runtime exposes
// it to the model and dispatches to its execute() through the SAME code path as
// a native tool. No change to the loop, no special-casing.
//
// Namespacing: the wrapped name is `${serviceName}__${toolName}` so an MCP tool
// can never collide with a native tool (book_appointment etc.) or with another
// connector's same-named tool. The original (un-namespaced) tool name is what
// we send to the MCP server in tools/call.
//
// Input validation: native tools carry a precise Zod schema; for MCP tools the
// AUTHORITY is the MCP server, so we use a permissive pass-through Zod schema
// (z.record(unknown)) at the harness layer and forward the args verbatim. The
// model is still steered by `jsonSchema` (the server's real inputSchema), which
// the runtime advertises to Anthropic.
//
// SECURITY: the bearer key is fetched per-call from the encrypted secrets store
// via deps.getSecret(orgId, serviceName) — never read from the blueprint, never
// logged. The endpoint comes from resolveConnectorEndpoint (HTTPS-enforced). If
// no key is stored, execute() throws; the runtime loop catches it into an error
// tool_result, so a misconfigured connector degrades to "tool failed", never a
// crashed turn.

import { z } from "zod";
import type { AgentTool, ToolExecuteContext } from "../tools";
import type { McpClient } from "./client";
import {
  resolveConnectorEndpoint,
  type ConnectorBinding,
  type McpToolSchema,
} from "./connectors";

/** Injectable seam for a wrapped MCP tool's execute(). Defaults wire the real
 *  encrypted-secret read + the real inline MCP client; tests pass fakes. */
export type WrapMcpDeps = {
  /** Fetch the decrypted bearer for (orgId, serviceName), or null if unset. */
  getSecret: (orgId: string, serviceName: string) => Promise<string | null>;
  /** Build an MCP client for an endpoint + bearer. */
  makeClient: (endpoint: string, bearer: string) => McpClient;
};

/** The permissive pass-through input schema for MCP tools (the MCP server is the
 *  validation authority). Shared instance — no per-tool allocation. */
const PASS_THROUGH_INPUT = z.record(z.string(), z.unknown());

/**
 * Wrap one discovered MCP tool (from a binding's cached `tools`) into an
 * AgentTool. The binding supplies the endpoint + secret service; the
 * mcpToolSchema supplies the name/description/jsonSchema.
 */
export function wrapMcpTool(
  binding: ConnectorBinding,
  mcpTool: McpToolSchema,
  deps: WrapMcpDeps,
): AgentTool<Record<string, unknown>, unknown> {
  const serviceName = binding.serviceName;
  const toolName = mcpTool.name;
  const namespacedName = `${serviceName}__${toolName}`;

  return {
    name: namespacedName,
    description: mcpTool.description,
    inputSchema: PASS_THROUGH_INPUT,
    // Anthropic gets the MCP server's own input schema verbatim.
    jsonSchema: mcpTool.inputSchema,
    execute: async (input: Record<string, unknown>, ctx: ToolExecuteContext) => {
      // Resolve the endpoint (HTTPS-enforced) up front — a bad binding throws
      // here and the runtime maps it to an error tool_result.
      const endpoint = resolveConnectorEndpoint(binding);
      const bearer = await deps.getSecret(ctx.orgId, serviceName);
      if (!bearer) {
        throw new Error(
          `MCP connector "${binding.id}" has no stored credential for this workspace — re-bind it.`,
        );
      }
      const client = deps.makeClient(endpoint, bearer);
      // Forward the model's args verbatim under the ORIGINAL tool name.
      return client.callTool(toolName, input ?? {});
    },
  };
}
