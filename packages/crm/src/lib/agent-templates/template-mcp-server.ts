// #3 — template-scoped MCP connector actions (thin "use server" wrappers).
//
// These are the Studio "Connectors & Tools" picker's entry points. They do ONLY
// auth (the builder org guard) + wire the REAL encrypted-secret store + the
// inline MCP client + the agent_templates blueprint read/write around the pure
// composers in ./mcp-actions (which hold the resolve→store→discover→cache→merge
// logic, unit-tested in template-mcp.spec.ts). Per repo convention
// (check-use-server.sh) a "use server" file exports only async functions — so all
// the testable logic lives in ./mcp-actions and this file is structural wiring.
//
// SECURITY: org-guarded via getOrgId() + the template's builderOrgId === orgId
// check (mirrors saveAgentTemplateBlueprintAction). The apiKey is stored ENCRYPTED
// through lib/secrets storeSecret (keyed by the builder org workspace) and never
// persisted to the blueprint nor logged; the blueprint only gets the serviceName
// pointer + the discovered (non-secret) tool schemas. BYO endpoints are
// HTTPS-validated inside buildConnectorBinding before the key is stored.

"use server";

import { getOrgId } from "@/lib/auth/helpers";
import { assertWritable } from "@/lib/demo/server";
import { storeSecret, rotateSecret } from "@/lib/secrets";
import { revalidatePath } from "next/cache";
import { createMcpClient } from "@/lib/agents/mcp/client";
import { resolveConnectorBearer } from "@/lib/agents/mcp/resolve-bearer";
import type { BindConnectorInput } from "@/lib/agents/mcp/bind";
import type { ConnectorBinding } from "@/lib/agents/mcp/connectors";
import { isBindingConnectedForOrg } from "@/lib/agents/mcp/binding-connection";
import {
  computeToolConnectionStatuses,
  type ToolConnectionStatus,
} from "@/lib/agents/mcp/tool-connection";
import type { AgentBlueprint } from "@/db/schema/agents";
import { getAgentTemplate, updateAgentTemplate } from "./store";
import {
  bindTemplateConnector,
  unbindTemplateConnector,
  setTemplateConnectorTools,
  refreshTemplateConnector,
  setTemplateComposioToolkits,
  type TemplateConnectorDeps,
  type BindTemplateConnectorResult,
  type TemplateConnectorMutationResult,
  type RefreshTemplateConnectorResult,
  type SetComposioToolkitsResult,
} from "./mcp-actions";

/**
 * Build the real composition deps for a given template + builder org. The
 * load/save seam targets the agent_templates blueprint (getAgentTemplate +
 * updateAgentTemplate with a `connectors` patch); the secret + discovery seams
 * are the SAME encrypted store + inline MCP client the agent path uses. The
 * ownership guard (builderOrgId === orgId) is enforced in loadBlueprint so a
 * builder can never bind a connector onto another builder's template.
 */
function realTemplateConnectorDeps(args: {
  templateId: string;
  orgId: string;
}): TemplateConnectorDeps {
  return {
    loadBlueprint: async () => {
      const template = await getAgentTemplate(args.templateId);
      if (!template || template.builderOrgId !== args.orgId) return null;
      return (template.blueprint ?? {}) as AgentBlueprint;
    },
    saveConnectors: async (connectors: ConnectorBinding[]) => {
      // Persist via the template-blueprint merge path (connectors replaces the
      // array). updateAgentTemplate stamps updatedAt; it does NOT touch status.
      await updateAgentTemplate({
        id: args.templateId,
        patch: { connectors },
      });
    },
    storeSecret: async ({ workspaceId, serviceName, value }) => {
      await storeSecret({ workspaceId, serviceName, value });
    },
    discoverTools: async ({ endpoint, bearer }) => {
      return createMcpClient({ endpoint, bearer }).listTools();
    },
    getSecret: async ({ workspaceId, serviceName }) => {
      // Resolves through the OAuth-aware bearer resolver so a Circle-style
      // OAuth token envelope refreshes transparently at refresh-time
      // discovery; a plain vetted/byo bearer passes through unchanged.
      return resolveConnectorBearer(workspaceId, serviceName);
    },
    removeSecret: async ({ workspaceId, serviceName }) => {
      // rotateSecret deletes the row (and mints a fresh capture link we ignore).
      await rotateSecret({ workspaceId, serviceName });
    },
  };
}

/** Revalidate the template editor route after a connector mutation. */
function revalidateEditor(templateId: string): void {
  revalidatePath(`/studio/agents/${templateId}`);
}

/**
 * Bind (or re-bind) an MCP connector to a template (Studio picker → "Connect").
 * Org-guarded. Stores the key encrypted, discovers tools, merges onto the
 * template blueprint.
 */
export async function bindTemplateConnectorAction(input: {
  templateId: string;
  connector: BindConnectorInput;
  apiKey: string;
  enabledTools?: string[];
}): Promise<BindTemplateConnectorResult> {
  assertWritable();
  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  const result = await bindTemplateConnector(
    {
      orgId,
      templateId: input.templateId,
      connector: input.connector,
      apiKey: input.apiKey,
      enabledTools: input.enabledTools,
    },
    realTemplateConnectorDeps({ templateId: input.templateId, orgId }),
  );
  if (result.ok) revalidateEditor(input.templateId);
  return result;
}

/** Unbind a connector from a template (Studio picker → "Remove"). Org-guarded. */
export async function unbindTemplateConnectorAction(input: {
  templateId: string;
  connectorId: string;
}): Promise<TemplateConnectorMutationResult> {
  assertWritable();
  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  const result = await unbindTemplateConnector(
    { orgId, templateId: input.templateId, connectorId: input.connectorId },
    realTemplateConnectorDeps({ templateId: input.templateId, orgId }),
  );
  if (result.ok) revalidateEditor(input.templateId);
  return result;
}

/** Toggle a connector's enabled tools (Studio picker → per-tool checkboxes). */
export async function setTemplateConnectorToolsAction(input: {
  templateId: string;
  connectorId: string;
  enabledTools: string[];
}): Promise<TemplateConnectorMutationResult> {
  assertWritable();
  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  const result = await setTemplateConnectorTools(
    {
      orgId,
      templateId: input.templateId,
      connectorId: input.connectorId,
      enabledTools: input.enabledTools,
    },
    realTemplateConnectorDeps({ templateId: input.templateId, orgId }),
  );
  if (result.ok) revalidateEditor(input.templateId);
  return result;
}

/** Re-discover + re-cache a connector's tools (Studio picker → "Refresh"). */
export async function refreshTemplateConnectorAction(input: {
  templateId: string;
  connectorId: string;
}): Promise<RefreshTemplateConnectorResult> {
  assertWritable();
  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  const result = await refreshTemplateConnector(
    { orgId, templateId: input.templateId, connectorId: input.connectorId },
    realTemplateConnectorDeps({ templateId: input.templateId, orgId }),
  );
  if (result.ok) revalidateEditor(input.templateId);
  return result;
}

/**
 * Set the agent's Composio toolkit selection (Studio "Composio apps" picker).
 * Writes ONE `kind:"composio"` binding (or removes it when the selection is
 * empty). Org-guarded; reuses the template load/save seam — no secret, no
 * discovery (Composio tools resolve live from the workspace session at runtime).
 */
export async function setTemplateComposioToolkitsAction(input: {
  templateId: string;
  toolkits: string[];
  enabledTools?: string[];
}): Promise<SetComposioToolkitsResult> {
  assertWritable();
  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  const result = await setTemplateComposioToolkits(
    {
      orgId,
      templateId: input.templateId,
      toolkits: input.toolkits,
      enabledTools: input.enabledTools,
    },
    realTemplateConnectorDeps({ templateId: input.templateId, orgId }),
  );
  if (result.ok) revalidateEditor(input.templateId);
  return result;
}

export type ConnectedToolsActionResult =
  | { ok: true; tools: ToolConnectionStatus[] }
  | { ok: false; error: "unauthorized" | "not_found" };

/**
 * P2.1-T3 — report the connection status of every tool the TEMPLATE binds, so the
 * editor can surface a "Connect <tool> in Integrations →" CTA for each bound-but-
 * UNCONNECTED tool (a generated social agent that says "Connect Postiz to go
 * live"). Org-guarded: the template must belong to the operator's org.
 *
 * The per-binding connection check is the SHARED money-safe predicate
 * (isBindingConnectedForOrg) — the EXACT one the runtime's tool-fire gate uses —
 * so what the editor flags as unconnected is precisely what the runtime would
 * refuse to fire. The labels resolve from the static catalogs (pure). Returns the
 * FULL list (connected + not) so the caller can decide what to show.
 */
export async function connectedToolsAction(input: {
  templateId: string;
}): Promise<ConnectedToolsActionResult> {
  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  const template = await getAgentTemplate(input.templateId);
  if (!template || template.builderOrgId !== orgId) {
    return { ok: false, error: "not_found" };
  }

  const bindings = (template.blueprint?.connectors ?? []) as ConnectorBinding[];
  const tools = await computeToolConnectionStatuses(bindings, (binding) =>
    isBindingConnectedForOrg(orgId, binding),
  );
  return { ok: true, tools };
}
