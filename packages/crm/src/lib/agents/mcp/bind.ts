// bind — pure composition for binding/unbinding an MCP connector to an agent.
//
// WHY a separate pure module (not the "use server" actions file): the bind FLOW
// (resolve endpoint → store key encrypted → discover tools → cache + enable onto
// the blueprint) is the interesting logic, and it must be unit-testable with
// injected discover + secret-store (no DB, no network). A "use server" file can
// only export async functions, so the composer can't be a re-exported const
// there. Keeping it here lets bind.spec.ts drive it directly; the thin
// "use server" action (actions.ts) wires the real deps + the blueprint DB write.
//
// SECURITY: the apiKey is handed to deps.storeSecret (the AES-GCM
// workspaceSecrets store) and NEVER written to the blueprint — the blueprint
// only carries the `serviceName` pointer + the (non-secret) discovered tool
// schemas. A BYO endpoint is HTTPS-validated (via resolveConnectorEndpoint)
// BEFORE the key is stored or any discovery runs, so a malformed/insecure
// endpoint can't cause a secret write or an http:// dial.

import {
  resolveConnectorEndpoint,
  getVettedConnector,
  type ConnectorBinding,
  type McpToolSchema,
} from "./connectors";

/** What the caller is binding. For a vetted connector only the id is needed
 *  (endpoint comes from the registry); for BYO the operator supplies the HTTPS
 *  endpoint. `serviceName` is the encrypted-secret key. */
export type BindConnectorInput =
  | { kind: "vetted"; id: string; serviceName: string }
  | { kind: "byo"; id: string; serviceName: string; endpoint: string };

/** Injected side effects for the bind composer. Defaults (in actions.ts) wire
 *  the real encrypted-secret store + the inline MCP client's listTools. */
export type BindDeps = {
  /** Persist the bearer key ENCRYPTED for (workspace, serviceName). */
  storeSecret: (args: { workspaceId: string; serviceName: string; value: string }) => Promise<void>;
  /** Discover the server's tools (typically createMcpClient(endpoint, bearer).listTools()). */
  discoverTools: (args: { endpoint: string; bearer: string }) => Promise<McpToolSchema[]>;
};

/**
 * Resolve + store + discover, producing the ConnectorBinding to persist on the
 * agent's blueprint. Pure of I/O except through `deps`.
 *
 * Order matters for security: endpoint resolution (HTTPS guard for BYO) happens
 * FIRST and throws on a bad endpoint — so neither the secret store nor discovery
 * runs for an invalid/insecure endpoint.
 */
export async function buildConnectorBinding(args: {
  orgId: string;
  connector: BindConnectorInput;
  apiKey: string;
  /** Optional allowlist; default = enable every discovered tool. */
  enabledTools?: string[];
  deps: BindDeps;
}): Promise<ConnectorBinding> {
  const { orgId, connector, apiKey, deps } = args;

  // Build a provisional binding so resolveConnectorEndpoint can validate it
  // (vetted id must exist; BYO endpoint must be HTTPS). This throws BEFORE any
  // secret write / discovery.
  const provisional: ConnectorBinding =
    connector.kind === "vetted"
      ? { id: connector.id, kind: "vetted", serviceName: connector.serviceName, enabledTools: [] }
      : {
          id: connector.id,
          kind: "byo",
          serviceName: connector.serviceName,
          endpoint: connector.endpoint,
          enabledTools: [],
        };

  // Defense-in-depth: also confirm a vetted id is real (resolveConnectorEndpoint
  // already throws for an unknown vetted id, but be explicit).
  if (connector.kind === "vetted" && !getVettedConnector(connector.id)) {
    throw new Error(`Unknown vetted connector id: ${connector.id}`);
  }

  const endpoint = resolveConnectorEndpoint(provisional); // HTTPS-guarded

  // Store the key encrypted, THEN discover.
  await deps.storeSecret({ workspaceId: orgId, serviceName: connector.serviceName, value: apiKey });
  const tools = await deps.discoverTools({ endpoint, bearer: apiKey });

  const enabledTools =
    args.enabledTools && args.enabledTools.length > 0
      ? args.enabledTools
      : tools.map((t) => t.name);

  const discoveredAt = new Date().toISOString();

  if (connector.kind === "vetted") {
    return {
      id: connector.id,
      kind: "vetted",
      serviceName: connector.serviceName,
      enabledTools,
      tools,
      discoveredAt,
    };
  }
  return {
    id: connector.id,
    kind: "byo",
    serviceName: connector.serviceName,
    endpoint: connector.endpoint,
    enabledTools,
    tools,
    discoveredAt,
  };
}

/** Append `incoming` to `existing`, replacing any binding with the same id
 *  (re-bind / refresh). Pure. */
export function mergeConnectorBinding(
  existing: ConnectorBinding[] | undefined,
  incoming: ConnectorBinding,
): ConnectorBinding[] {
  const without = (existing ?? []).filter((b) => b.id !== incoming.id);
  return [...without, incoming];
}

/** Drop the binding with `id` (used by unbind). Pure. */
export function removeConnectorBinding(
  existing: ConnectorBinding[] | undefined,
  id: string,
): ConnectorBinding[] {
  return (existing ?? []).filter((b) => b.id !== id);
}

/** Re-enable a subset on an existing binding (used by refresh to preserve the
 *  operator's enabled choices while re-caching schemas). Pure. */
export function withRediscoveredTools(
  binding: ConnectorBinding,
  tools: McpToolSchema[],
  enabledTools?: string[],
): ConnectorBinding {
  const enabled =
    enabledTools && enabledTools.length > 0
      ? enabledTools
      : // Preserve still-valid previous choices; if none, enable all.
        binding.enabledTools.filter((n) => tools.some((t) => t.name === n));
  const nextEnabled = enabled.length > 0 ? enabled : tools.map((t) => t.name);
  return { ...binding, tools, enabledTools: nextEnabled, discoveredAt: new Date().toISOString() };
}
