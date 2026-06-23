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
//     Vetted = Postiz (social) + Rube (Composio, 500+ apps via one key).
//     Adding a vetted connector = one entry here, no other code.
//   - "byo": the operator pastes any hosted MCP endpoint + a bearer key. The
//     endpoint MUST be HTTPS (rejected otherwise — see resolveConnectorEndpoint).
//
// SECURITY: HTTPS-only is enforced for BYO endpoints at resolve time, so even a
// stale/poisoned binding can never be dialed over http://. Vetted endpoints are
// hard-coded HTTPS. The bearer key NEVER lives here — only the `serviceName`
// pointer into the encrypted workspaceSecrets store.

import { z } from "zod";

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

/** The shipped, trusted connectors. Postiz (social) + Rube (Composio's
 *  universal MCP — 500+ apps behind one bearer key; Composio owns each app's
 *  OAuth, so SeldonFrame never touches CASA). Adding a vetted connector = one
 *  entry here, no other code (the Studio picker reads this list). */
export const VETTED_CONNECTORS: readonly VettedConnector[] = [
  {
    id: "postiz",
    label: "Postiz (social publishing)",
    endpoint: "https://api.postiz.com/mcp",
    authType: "bearer",
    secretService: "postiz",
  },
  {
    // Rube by Composio — a single hosted MCP server fronting 500+ apps (Gmail,
    // Slack, Notion, GitHub, Google Calendar, HubSpot…). The builder generates
    // a bearer token at rube.app → Use Rube → MCP URL → Generate token, and
    // pastes it like any vetted key; Composio manages each app's OAuth on its
    // side. Streamable HTTP — which our inline MCP client already speaks.
    id: "rube",
    label: "Rube — 500+ apps (Composio)",
    endpoint: "https://rube.app/mcp",
    authType: "bearer",
    secretService: "rube",
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

// ─── validation (Zod) ────────────────────────────────────────────────────────
//
// These live HERE (a pure module, not the "use server" actions file) so they
// are (a) directly unit-testable and (b) importable into BlueprintPatchSchema
// without tripping the "use server can only export async functions" rule
// (check-use-server.sh). Bounds keep the blueprint jsonb from growing without
// limit: at most MAX_CONNECTORS bindings, each capping enabledTools and the
// cached tool schemas.

/** Caps. A workspace binds a handful of connectors; an MCP server exposes tens
 *  of tools at most. Bounding both keeps blueprint jsonb small + predictable. */
export const MAX_CONNECTORS = 16;
export const MAX_ENABLED_TOOLS = 64;
export const MAX_CACHED_TOOLS = 128;

const mcpToolSchemaSchema = z
  .object({
    name: z.string().min(1).max(128),
    description: z.string().max(4000),
    inputSchema: z.record(z.string(), z.unknown()),
  })
  .strict();

/** A single connector binding. `.strict()` so unknown keys are rejected (no
 *  smuggling extra fields into the blueprint). BYO requires an HTTPS endpoint;
 *  vetted must NOT carry one (the registry owns it). */
export const connectorBindingSchema: z.ZodType<ConnectorBinding> = z
  .discriminatedUnion("kind", [
    z
      .object({
        id: z.string().min(1).max(64),
        kind: z.literal("vetted"),
        serviceName: z.string().min(1).max(128),
        enabledTools: z.array(z.string().min(1).max(128)).max(MAX_ENABLED_TOOLS),
        tools: z.array(mcpToolSchemaSchema).max(MAX_CACHED_TOOLS).optional(),
        discoveredAt: z.string().optional(),
      })
      .strict(),
    z
      .object({
        id: z.string().min(1).max(64),
        kind: z.literal("byo"),
        serviceName: z.string().min(1).max(128),
        endpoint: z
          .string()
          .url()
          .refine((u) => u.startsWith("https://"), {
            message: "BYO MCP endpoint must use https://",
          }),
        enabledTools: z.array(z.string().min(1).max(128)).max(MAX_ENABLED_TOOLS),
        tools: z.array(mcpToolSchemaSchema).max(MAX_CACHED_TOOLS).optional(),
        discoveredAt: z.string().optional(),
      })
      .strict(),
  ]) as z.ZodType<ConnectorBinding>;

/** The full `blueprint.connectors` array, length-bounded. */
export const connectorBindingsSchema = z
  .array(connectorBindingSchema)
  .max(MAX_CONNECTORS);
