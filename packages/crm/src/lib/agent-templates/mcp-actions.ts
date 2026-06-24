// #3 — template-scoped MCP connector composition (pure / DI layer).
//
// This is the template analog of lib/agents/mcp/bind.ts + actions.ts: the SAME
// resolve→store→discover→cache→merge flow, but persisting onto the
// agent_templates blueprint instead of the agents one. It REUSES #2's pure
// helpers verbatim (buildConnectorBinding / mergeConnectorBinding /
// withRediscoveredTools / removeConnectorBinding) — the only template-specific
// thing here is the load/save seam (loadBlueprint / saveConnectors) which the
// caller wires to getAgentTemplate + updateAgentTemplate.
//
// WHY a plain module (NOT "use server"): per check-use-server.sh a "use server"
// file may export only async functions — it can't carry the TemplateConnectorDeps
// type or be driven directly by template-mcp.spec.ts with injected deps. So the
// interesting logic lives HERE (unit-tested with no DB / network) and the thin
// "use server" wrappers (template-mcp-server.ts) do only auth + wire the real
// encrypted-secret store + the inline MCP client + the template DB read/write.
//
// SECURITY: identical guarantees to the agent path — the apiKey is handed to
// deps.storeSecret (AES-GCM workspaceSecrets, keyed by the BUILDER org workspace)
// and NEVER written to the blueprint nor returned/logged; a BYO endpoint is
// HTTPS-validated (inside buildConnectorBinding) BEFORE the key is stored or any
// discovery runs.

import {
  buildConnectorBinding,
  mergeConnectorBinding,
  removeConnectorBinding,
  withRediscoveredTools,
  type BindConnectorInput,
} from "@/lib/agents/mcp/bind";
import {
  resolveConnectorEndpoint,
  type ConnectorBinding,
  type McpToolSchema,
} from "@/lib/agents/mcp/connectors";
import type { AgentBlueprint } from "@/db/schema/agents";

/** Injected seams so the composition is unit-testable with no DB / network. The
 *  thin "use server" wrappers supply the real implementations (encrypted-secret
 *  store + inline MCP client + getAgentTemplate/updateAgentTemplate). */
export type TemplateConnectorDeps = {
  /** Load the template's current blueprint (org-guarded by the caller). Returns
   *  null when the template is missing / not owned by the caller. */
  loadBlueprint: () => Promise<AgentBlueprint | null>;
  /** Persist the new connectors array onto the template blueprint. */
  saveConnectors: (connectors: ConnectorBinding[]) => Promise<void>;
  /** Store the bearer key ENCRYPTED for (builder workspace, serviceName). */
  storeSecret: (args: {
    workspaceId: string;
    serviceName: string;
    value: string;
  }) => Promise<void>;
  /** Discover an MCP server's tools (createMcpClient(endpoint, bearer).listTools()). */
  discoverTools: (args: { endpoint: string; bearer: string }) => Promise<McpToolSchema[]>;
  /** Read the stored bearer for a serviceName (used by refresh). */
  getSecret: (args: { workspaceId: string; serviceName: string }) => Promise<string | null>;
  /** Best-effort delete of a stored bearer (used by unbind). */
  removeSecret: (args: { workspaceId: string; serviceName: string }) => Promise<void>;
};

export type BindTemplateConnectorResult =
  | { ok: true; connectorId: string; toolCount: number }
  | { ok: false; error: string };

/**
 * Bind (or re-bind) an MCP connector onto a template's blueprint: store the key
 * encrypted, discover the server's tools, cache them (default-enabled or the
 * passed subset), and merge onto blueprint.connectors (append/replace by id).
 * Reuses #2's buildConnectorBinding + mergeConnectorBinding.
 */
export async function bindTemplateConnector(
  input: {
    orgId: string;
    templateId: string;
    connector: BindConnectorInput;
    apiKey: string;
    enabledTools?: string[];
  },
  deps: TemplateConnectorDeps,
): Promise<BindTemplateConnectorResult> {
  if (!input.apiKey || input.apiKey.trim().length === 0) {
    return { ok: false, error: "api_key_required" };
  }

  const blueprint = await deps.loadBlueprint();
  if (!blueprint) return { ok: false, error: "template_not_found" };

  let binding: ConnectorBinding;
  try {
    binding = await buildConnectorBinding({
      orgId: input.orgId,
      connector: input.connector,
      apiKey: input.apiKey.trim(),
      enabledTools: input.enabledTools,
      // Reuse the SAME bind deps shape; the secret write is keyed to the builder
      // org workspace (input.orgId) so the key is shared with the agent path.
      deps: {
        storeSecret: deps.storeSecret,
        discoverTools: deps.discoverTools,
      },
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const connectors = mergeConnectorBinding(blueprint.connectors, binding);
  await deps.saveConnectors(connectors);

  return { ok: true, connectorId: binding.id, toolCount: binding.tools?.length ?? 0 };
}

export type TemplateConnectorMutationResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Unbind a connector: drop it from blueprint.connectors and best-effort delete
 * its stored key (a leftover secret is inert, but we clean it up).
 */
export async function unbindTemplateConnector(
  input: { orgId: string; templateId: string; connectorId: string },
  deps: TemplateConnectorDeps,
): Promise<TemplateConnectorMutationResult> {
  const blueprint = await deps.loadBlueprint();
  if (!blueprint) return { ok: false, error: "template_not_found" };

  const existing = blueprint.connectors ?? [];
  const target = existing.find((b) => b.id === input.connectorId);
  const connectors = removeConnectorBinding(existing, input.connectorId);
  await deps.saveConnectors(connectors);

  // Composio bindings have no stored secret (the per-workspace Composio key is
  // shared) — only vetted/byo bindings own a secret to drop.
  if (target && target.kind !== "composio") {
    try {
      await deps.removeSecret({ workspaceId: input.orgId, serviceName: target.serviceName });
    } catch {
      // non-fatal — the binding is already gone, the orphan secret is inert.
    }
  }

  return { ok: true };
}

/**
 * Toggle the enabled tools on a bound connector — no re-discovery, just replaces
 * enabledTools (the cached schemas are preserved verbatim). Used by the picker's
 * per-tool checkboxes.
 */
export async function setTemplateConnectorTools(
  input: {
    orgId: string;
    templateId: string;
    connectorId: string;
    enabledTools: string[];
  },
  deps: TemplateConnectorDeps,
): Promise<TemplateConnectorMutationResult> {
  const blueprint = await deps.loadBlueprint();
  if (!blueprint) return { ok: false, error: "template_not_found" };

  const existing = blueprint.connectors ?? [];
  const binding = existing.find((b) => b.id === input.connectorId);
  if (!binding) return { ok: false, error: "connector_not_bound" };

  const updated: ConnectorBinding = { ...binding, enabledTools: input.enabledTools };
  const connectors = mergeConnectorBinding(existing, updated);
  await deps.saveConnectors(connectors);

  return { ok: true };
}

export type RefreshTemplateConnectorResult =
  | { ok: true; toolCount: number }
  | { ok: false; error: string };

/**
 * Refresh a connector: re-discover the server's tools using the stored key and
 * re-cache them, preserving the operator's enabled selection where those tools
 * still exist (#2's withRediscoveredTools).
 */
export async function refreshTemplateConnector(
  input: { orgId: string; templateId: string; connectorId: string },
  deps: TemplateConnectorDeps,
): Promise<RefreshTemplateConnectorResult> {
  const blueprint = await deps.loadBlueprint();
  if (!blueprint) return { ok: false, error: "template_not_found" };

  const existing = blueprint.connectors ?? [];
  const binding = existing.find((b) => b.id === input.connectorId);
  if (!binding) return { ok: false, error: "connector_not_bound" };
  // Composio bindings refresh via the live session, not this stored-bearer path.
  if (binding.kind === "composio") {
    return { ok: false, error: "composio_connector_refresh_unsupported" };
  }

  let endpoint: string;
  try {
    endpoint = resolveConnectorEndpoint(binding); // HTTPS-guarded
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const bearer = await deps.getSecret({
    workspaceId: input.orgId,
    serviceName: binding.serviceName,
  });
  if (!bearer) return { ok: false, error: "connector_key_missing" };

  let tools: McpToolSchema[];
  try {
    tools = await deps.discoverTools({ endpoint, bearer });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const refreshed = withRediscoveredTools(binding, tools);
  const connectors = mergeConnectorBinding(existing, refreshed);
  await deps.saveConnectors(connectors);

  return { ok: true, toolCount: tools.length };
}
