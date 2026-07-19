// Connector registry + binding types (pure — no DB / network).
//
// This is the catalog + resolution layer for the MCP connector feature. A
// connector "binding" lives on an agent's blueprint (blueprint.connectors[],
// jsonb — no migration). At runtime the seam (getToolsForCapabilities) maps a
// binding's cached, enabled tools through wrap-tool into AgentTools. At bind
// time the action resolves the endpoint here, stores the bearer key encrypted
// under `serviceName`, discovers the tools, and caches them on the binding.
//
// Three kinds:
//   - "vetted": a connector SeldonFrame ships and trusts. The endpoint is baked
//     into VETTED_CONNECTORS (the operator never types a URL — just an API key).
//     Vetted = Postiz (social) + Rube (Composio, 500+ apps via one key).
//     Adding a vetted connector = one entry here, no other code.
//   - "byo": the operator pastes any hosted MCP endpoint + a bearer key. The
//     endpoint MUST be HTTPS (rejected otherwise — see resolveConnectorEndpoint).
//   - "composio": a per-workspace MANAGED Composio session. Unlike vetted/byo it
//     carries neither an endpoint nor a stored secret — the MCP URL and its
//     `x-api-key` header are resolved LIVE from the workspace session at runtime
//     (lib/integrations/composio). It declares `enabledToolkits` (which Composio
//     apps) + `enabledTools` (the per-tool allowlist).
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
    }
  | {
      // Composio — a per-workspace MANAGED session (not a stored bearer). The
      // binding carries NO endpoint and NO secret: both the MCP URL and its
      // `x-api-key` header are resolved live from the workspace's Composio
      // session at runtime (lib/integrations/composio). `enabledToolkits` is the
      // set of Composio toolkits this agent may use (gmail, slack, …);
      // `enabledTools` is the per-tool allowlist (namespaced `composio__<tool>`).
      id: string;
      kind: "composio";
      /** Composio toolkit slugs enabled for this agent (drives the session). */
      enabledToolkits: string[];
      /** Allowlist — only these tool names are wrapped into AgentTools. */
      enabledTools: string[];
      /** Tools discovered at bind/refresh time (cached, not live). */
      tools?: McpToolSchema[];
      discoveredAt?: string;
    };

/** A user-pickable OAuth consent level (Circle's own "Read only / Full
 *  access" split maps 1:1 to its `scopes_supported: ["read","write"]`). */
export type VettedConnectorAccessLevel = { label: string; scopes: string[] };

/** A vetted connector definition — the shipped catalog entry. `authType`
 *  distinguishes the two credential rails: "bearer" (operator pastes a key,
 *  e.g. Postiz/Rube) vs "oauth" (the connect flow discovers the auth server,
 *  registers a DCR client, and runs the PKCE code flow — e.g. Circle). */
export type VettedConnector = {
  id: string;
  label: string;
  endpoint: string;
  authType: "bearer" | "oauth";
  /** Default encrypted-secret service name for this connector. */
  secretService: string;
  /** OAuth connectors only: user-pickable consent levels (default = first
   *  entry, i.e. the least-privileged option). */
  accessLevels?: VettedConnectorAccessLevel[];
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
  {
    // Circle.so — official remote MCP (Streamable HTTP + OAuth; verified live
    // 2026-07-13: RFC 8414 metadata at the issuer root, DCR at /oauth/register,
    // PKCE S256, scopes read/write map to Circle's "Read only / Full access").
    // NOTE: every tool call = 1 Circle Admin-API request against the
    // community's monthly quota (5k/mo on Business) — keep agents read-lean.
    id: "circle",
    label: "Circle (community platform)",
    endpoint: "https://app.circle.so/api/mcp",
    authType: "oauth",
    secretService: "circle",
    accessLevels: [
      { label: "Read only", scopes: ["read"] },
      { label: "Full access", scopes: ["read", "write"] },
    ],
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
  if (binding.kind === "composio") {
    // Composio endpoints are resolved live from the session, never from the
    // binding — this function must not be called for a composio binding.
    throw new Error(
      "Composio connector endpoints are resolved from the live session, not the binding",
    );
  }
  // byo
  return assertHttpsEndpoint(binding.endpoint);
}

/** The encrypted-secret service name for a binding (key for getSecretValue).
 *  Composio bindings have no stored secret (the key is resolved per-workspace),
 *  so this throws for them — they take the live-session path instead. */
export function connectorSecretService(binding: ConnectorBinding): string {
  if (binding.kind === "composio") {
    throw new Error("Composio connector bindings have no stored secret service");
  }
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

/** Bounds mirrored 1:1 from `mcpToolSchemaSchema` above (name ≤128, desc
 *  ≤4000). `lib/integrations/composio/discover-tools.ts` carries a
 *  pre-existing local twin of this same clamp (`boundToolSchema`, kept there
 *  deliberately per this slice's zero-edit constraint on that file — unify
 *  post-merge). Clamp one MCP tool schema to the persistable bounds so a
 *  discovered tool can never fail `connectorBindingSchema` at save time: an
 *  oversized `name` can't be truncated without becoming a different, wrong
 *  tool name, so it's dropped (`null`); an oversized `description` is
 *  clamped (slice) since truncating prose loses nothing load-bearing. */
export function boundMcpToolSchema(schema: McpToolSchema): McpToolSchema | null {
  if (!schema || typeof schema.name !== "string") return null;
  const name = schema.name.trim();
  if (!name || name.length > 128) return null;
  const description =
    typeof schema.description === "string" && schema.description.length > 4000
      ? schema.description.slice(0, 4000)
      : schema.description;
  return { ...schema, name, description };
}

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
    z
      .object({
        // Composio managed-session binding — no endpoint, no secret. Bounds the
        // toolkit allowlist too so the blueprint jsonb stays small.
        id: z.string().min(1).max(64),
        kind: z.literal("composio"),
        enabledToolkits: z.array(z.string().min(1).max(64)).max(MAX_CONNECTORS),
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
