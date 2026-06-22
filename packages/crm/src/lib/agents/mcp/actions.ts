// MCP connector bind/unbind/refresh — thin "use server" actions.
//
// These are the dashboard/MCP entry points an operator (or Claude Code) calls
// to attach an external MCP server to an agent. They do ONLY auth + the
// blueprint DB write around the pure composer in ./bind (which holds the
// resolve→store→discover→cache logic, unit-tested in bind.spec.ts). Per repo
// convention (check-use-server.sh) a "use server" file exports only async
// functions — so all the testable logic lives in ./bind and ./connectors, and
// this file is the structural wiring.
//
// SECURITY: org-guarded via getOrgId(); the apiKey is stored ENCRYPTED through
// lib/secrets storeSecret (AES-GCM workspaceSecrets) and never persisted to the
// blueprint nor logged; the blueprint only gets the serviceName pointer + the
// discovered (non-secret) tool schemas. BYO endpoints are HTTPS-validated inside
// buildConnectorBinding before the key is stored or any discovery runs.

"use server";

import { getOrgId } from "@/lib/auth/helpers";
import { storeSecret, getSecretValue, rotateSecret } from "@/lib/secrets";
import { updateAgentBlueprint } from "../store";
import { createMcpClient } from "./client";
import {
  buildConnectorBinding,
  mergeConnectorBinding,
  removeConnectorBinding,
  withRediscoveredTools,
  type BindConnectorInput,
  type BindDeps,
} from "./bind";
import { resolveConnectorEndpoint, type ConnectorBinding } from "./connectors";
import { db } from "@/db";
import { agents, type AgentBlueprint } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export type BindConnectorResult =
  | { ok: true; version: number; connectorId: string; toolCount: number }
  | { ok: false; error: string };

/** Real bind deps: encrypted-secret store + live tools/list via the inline
 *  client. Centralized so bind/refresh share the exact discovery path. */
function realBindDeps(): BindDeps {
  return {
    storeSecret: async ({ workspaceId, serviceName, value }) => {
      await storeSecret({ workspaceId, serviceName, value });
    },
    discoverTools: async ({ endpoint, bearer }) => {
      const client = createMcpClient({ endpoint, bearer });
      return client.listTools();
    },
  };
}

/** Load the agent's current blueprint, org-scoped. */
async function loadBlueprint(
  agentId: string,
  orgId: string,
): Promise<AgentBlueprint | null> {
  const [agent] = await db
    .select({ blueprint: agents.blueprint })
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.orgId, orgId)))
    .limit(1);
  return agent ? ((agent.blueprint ?? {}) as AgentBlueprint) : null;
}

/**
 * Bind (or re-bind) an MCP connector to an agent: store the key encrypted,
 * discover the server's tools, and cache them (default-enabled, or the passed
 * subset) onto blueprint.connectors via the existing blueprint-update path.
 */
export async function bindMcpConnectorAction(input: {
  agentId: string;
  connector: BindConnectorInput;
  apiKey: string;
  enabledTools?: string[];
}): Promise<BindConnectorResult> {
  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  if (!input.apiKey || input.apiKey.trim().length === 0) {
    return { ok: false, error: "api_key_required" };
  }

  const blueprint = await loadBlueprint(input.agentId, orgId);
  if (!blueprint) return { ok: false, error: "agent_not_found" };

  let binding: ConnectorBinding;
  try {
    binding = await buildConnectorBinding({
      orgId,
      connector: input.connector,
      apiKey: input.apiKey.trim(),
      enabledTools: input.enabledTools,
      deps: realBindDeps(),
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const connectors = mergeConnectorBinding(blueprint.connectors, binding);
  const result = await updateAgentBlueprint({
    agentId: input.agentId,
    orgId,
    patch: { connectors },
    publishNotes: `Bound MCP connector: ${binding.id}`,
  });
  if (!result.ok) return { ok: false, error: result.error };

  return {
    ok: true,
    version: result.version,
    connectorId: binding.id,
    toolCount: binding.tools?.length ?? 0,
  };
}

/**
 * Unbind a connector: remove it from blueprint.connectors and delete its stored
 * key (best-effort — a leftover secret is harmless but we clean it up).
 */
export async function unbindMcpConnectorAction(input: {
  agentId: string;
  connectorId: string;
}): Promise<{ ok: true; version: number } | { ok: false; error: string }> {
  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  const blueprint = await loadBlueprint(input.agentId, orgId);
  if (!blueprint) return { ok: false, error: "agent_not_found" };

  const existing = blueprint.connectors ?? [];
  const target = existing.find((b) => b.id === input.connectorId);
  const connectors = removeConnectorBinding(existing, input.connectorId);

  const result = await updateAgentBlueprint({
    agentId: input.agentId,
    orgId,
    patch: { connectors },
    publishNotes: `Unbound MCP connector: ${input.connectorId}`,
  });
  if (!result.ok) return { ok: false, error: result.error };

  // Best-effort: drop the stored key so it isn't left dangling. rotateSecret
  // deletes the row (and mints a fresh capture link we ignore here).
  if (target) {
    try {
      await rotateSecret({ workspaceId: orgId, serviceName: target.serviceName });
    } catch {
      // non-fatal — the binding is already gone, the orphan secret is inert.
    }
  }

  return { ok: true, version: result.version };
}

/**
 * Refresh a connector: re-discover the server's tools (using the stored key) and
 * re-cache them, preserving the operator's previously-enabled selection where
 * those tools still exist.
 */
export async function refreshMcpConnectorAction(input: {
  agentId: string;
  connectorId: string;
}): Promise<
  { ok: true; version: number; toolCount: number } | { ok: false; error: string }
> {
  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  const blueprint = await loadBlueprint(input.agentId, orgId);
  if (!blueprint) return { ok: false, error: "agent_not_found" };

  const existing = blueprint.connectors ?? [];
  const binding = existing.find((b) => b.id === input.connectorId);
  if (!binding) return { ok: false, error: "connector_not_bound" };

  let endpoint: string;
  try {
    endpoint = resolveConnectorEndpoint(binding); // HTTPS-guarded
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const bearer = await getSecretValue({
    workspaceId: orgId,
    serviceName: binding.serviceName,
    skipAccessCheck: true,
  });
  if (!bearer) return { ok: false, error: "connector_key_missing" };

  let tools;
  try {
    tools = await createMcpClient({ endpoint, bearer }).listTools();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const refreshed = withRediscoveredTools(binding, tools);
  const connectors = mergeConnectorBinding(existing, refreshed);
  const result = await updateAgentBlueprint({
    agentId: input.agentId,
    orgId,
    patch: { connectors },
    publishNotes: `Refreshed MCP connector: ${input.connectorId}`,
  });
  if (!result.ok) return { ok: false, error: result.error };

  return { ok: true, version: result.version, toolCount: tools.length };
}
