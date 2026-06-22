// Connector registry + binding types (pure — no DB / network).
//
// This is the catalog + resolution layer for the MCP connector feature. A
// connector "binding" lives on an agent's blueprint (blueprint.connectors[],
// jsonb — no migration). At runtime the seam (getToolsForCapabilities) maps a
// binding's cached, enabled tools through wrap-tool into AgentTools. At bind
// time the action resolves the endpoint here, stores the bearer key encrypted
// under `serviceName`, discovers the tools, and caches them on the binding.
//
// Two kinds:
//   - "vetted": a connector SeldonFrame ships and trusts. The endpoint is baked
//     into VETTED_CONNECTORS (the operator never types a URL — just an API key).
//     v1 vetted = Postiz (social publishing). Adding a vetted connector = one
//     entry here, no other code.
//   - "byo": the operator pastes any hosted MCP endpoint + a bearer key. The
//     endpoint MUST be HTTPS (rejected otherwise — see resolveConnectorEndpoint).
//
// SECURITY: HTTPS-only is enforced for BYO endpoints at resolve time, so even a
// stale/poisoned binding can never be dialed over http://. Vetted endpoints are
// hard-coded HTTPS. The bearer key NEVER lives here — only the `serviceName`
// pointer into the encrypted workspaceSecrets store.

/** A tool schema as discovered from an MCP server (mirrors the client's
 *  McpToolDescriptor). Cached on a binding so the runtime never has to do a
 *  live tools/list per turn. */
export type McpToolSchema = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

/** A per-agent connector binding stored on AgentBlueprint.connectors. */
export type ConnectorBinding =
  | {
      id: string;
      kind: "vetted";
      /** Encrypted-secret service name holding the bearer key. */
      serviceName: string;
      /** Allowlist — only these tool names are wrapped into AgentTools. */
      enabledTools: string[];
      /** Tools discovered at bind/refresh time (cached, not live). */
      tools?: McpToolSchema[];
      /** ISO 8601 timestamp of the last successful discovery. */
      discoveredAt?: string;
    }
  | {
      id: string;
      kind: "byo";
      serviceName: string;
      /** Operator-supplied MCP endpoint. MUST be https://. */
      endpoint: string;
      enabledTools: string[];
      tools?: McpToolSchema[];
      discoveredAt?: string;
    };

/** A vetted connector definition — the shipped catalog entry. */
export type VettedConnector = {
  id: string;
  label: string;
  endpoint: string;
  authType: "bearer";
  /** Default encrypted-secret service name for this connector. */
  secretService: string;
};

/** The shipped, trusted connectors. v1: Postiz only. */
export const VETTED_CONNECTORS: readonly VettedConnector[] = [
  {
    id: "postiz",
    label: "Postiz (social publishing)",
    endpoint: "https://api.postiz.com/mcp",
    authType: "bearer",
    secretService: "postiz",
  },
] as const;

/** Look up a vetted connector by id (undefined if not vetted). */
export function getVettedConnector(id: string): VettedConnector | undefined {
  return VETTED_CONNECTORS.find((c) => c.id === id);
}

function assertHttpsEndpoint(endpoint: string): string {
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new Error(`Invalid MCP endpoint URL: ${endpoint}`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`MCP endpoint must use https:// (got ${parsed.protocol}//…)`);
  }
  return endpoint;
}

/**
 * Resolve a binding to its concrete MCP endpoint.
 *   - vetted → the registry endpoint (throws if the id isn't vetted).
 *   - byo → the operator endpoint, after asserting HTTPS.
 */
export function resolveConnectorEndpoint(binding: ConnectorBinding): string {
  if (binding.kind === "vetted") {
    const vetted = getVettedConnector(binding.id);
    if (!vetted) {
      throw new Error(`Unknown vetted connector id: ${binding.id}`);
    }
    // Vetted endpoints are hard-coded HTTPS; assert anyway as defense-in-depth.
    return assertHttpsEndpoint(vetted.endpoint);
  }
  // byo
  return assertHttpsEndpoint(binding.endpoint);
}

/** The encrypted-secret service name for a binding (key for getSecretValue). */
export function connectorSecretService(binding: ConnectorBinding): string {
  return binding.serviceName;
}
