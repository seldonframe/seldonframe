// Vetted OAuth connector tool discovery + combined persist fill.
//
// Mirrors `fillComposioBindingTools` in
// lib/integrations/composio/discover-tools.ts LINE-FOR-LINE where
// applicable: same never-discovered marker guard
// (`enabledTools.length === 0 && !discoveredAt`), same pass-through
// byte-identical for non-targets, same never-throws + per-binding isolation,
// same caps (MAX_ENABLED_TOOLS/MAX_CACHED_TOOLS), same "zero tools → original
// reference, no stamp, retry next encounter" semantics.
//
// Target predicate: `kind === "vetted"` AND the registry's authType is
// "oauth" (Circle today). Bearer vetted connectors (postiz/rube) keep
// today's bind-time-only discovery — this module never widens their
// behavior.
//
// FAIL-SOFT EVERYWHERE: a Circle outage, an expired/unrefreshable token, or a
// malformed lister result never throws and never blocks the fill for other
// bindings — a Circle-side problem must never break agent generation.

import type { ConnectorBinding, McpToolSchema } from "./connectors";
import { MAX_ENABLED_TOOLS, MAX_CACHED_TOOLS, getVettedConnector, boundMcpToolSchema } from "./connectors";
import { resolveConnectorBearer } from "./resolve-bearer";
import { createMcpClient } from "./client";
import {
  fillComposioBindingTools,
  type ToolkitToolLister,
} from "@/lib/integrations/composio/discover-tools";

/** Conservative per-connector discovery cap (mirrors the composio twin's
 *  TOOLKIT_DISCOVERY_TOOL_CAP; kept as an independent constant so the two
 *  modules stay decoupled). */
const VETTED_DISCOVERY_TOOL_CAP = 20;

/** Injectable seam: list a vetted OAuth connector's real tools for a
 *  workspace. The default (`discoverVettedToolsLive`) resolves the stored
 *  bearer (OAuth-aware) and hits the live MCP server; tests inject a fake so
 *  no network/DB is touched. */
export type VettedToolLister = (orgId: string, connectorId: string) => Promise<McpToolSchema[]>;

/**
 * Live discovery for one vetted OAuth connector: resolve the bearer (no
 * bearer → `[]`, e.g. never connected or an unrefreshable token), build an
 * MCP client at the registry endpoint, list its tools, clamp each to the
 * persistable bounds, cap at VETTED_DISCOVERY_TOOL_CAP. ANY error → `[]`.
 * Never throws. Never logs the bearer.
 */
export async function discoverVettedToolsLive(
  orgId: string,
  connectorId: string,
): Promise<McpToolSchema[]> {
  try {
    const connector = getVettedConnector(connectorId);
    if (!connector) return [];
    const bearer = await resolveConnectorBearer(orgId, connector.secretService);
    if (!bearer) return [];

    const client = createMcpClient({ endpoint: connector.endpoint, bearer });
    const tools = await client.listTools();
    const bounded: McpToolSchema[] = [];
    for (const tool of tools) {
      const schema = boundMcpToolSchema({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      });
      if (schema) bounded.push(schema);
    }
    return bounded.slice(0, VETTED_DISCOVERY_TOOL_CAP);
  } catch {
    return [];
  }
}

type VettedBinding = Extract<ConnectorBinding, { kind: "vetted" }>;

/** True for the never-discovered resting state — mirrors composio's
 *  isUndiscovered. An explicit disable (discoveredAt set + empty allowlist)
 *  is the Studio editor's own action and must NOT be touched. */
function isUndiscovered(binding: VettedBinding): boolean {
  return binding.enabledTools.length === 0 && !binding.discoveredAt;
}

/** True only for a vetted binding whose registry entry is OAuth-authType
 *  (Circle today) — bearer vetted connectors (postiz/rube) are out of scope
 *  for this fill; they keep today's bind-time-only discovery. */
function isOauthVetted(binding: ConnectorBinding): binding is VettedBinding {
  if (binding.kind !== "vetted") return false;
  return getVettedConnector(binding.id)?.authType === "oauth";
}

async function fillOneVettedBinding(
  orgId: string,
  binding: VettedBinding,
  lister: VettedToolLister,
): Promise<{ binding: ConnectorBinding; changed: boolean }> {
  let discovered: McpToolSchema[];
  try {
    discovered = await lister(orgId, binding.id);
  } catch {
    return { binding, changed: false };
  }

  const toolNames: string[] = [];
  const cachedTools: McpToolSchema[] = [];
  const seen = new Set<string>();
  for (const raw of Array.isArray(discovered) ? discovered : []) {
    const bounded = boundMcpToolSchema(raw);
    if (!bounded || seen.has(bounded.name)) continue;
    seen.add(bounded.name);
    toolNames.push(bounded.name);
    cachedTools.push(bounded);
  }

  if (toolNames.length === 0) {
    return { binding, changed: false };
  }

  const nextBinding: ConnectorBinding = {
    ...binding,
    enabledTools: toolNames.slice(0, MAX_ENABLED_TOOLS),
    tools: cachedTools.slice(0, MAX_CACHED_TOOLS),
    discoveredAt: new Date().toISOString(),
  };
  return { binding: nextBinding, changed: true };
}

/**
 * Fill every never-discovered `kind:"vetted"` OAuth-authType connector
 * binding's `enabledTools` in an array of connectors (DI'd via
 * `deps.listVettedTools`, default `discoverVettedToolsLive`). Non-vetted,
 * bearer-authType vetted, and already-resolved/explicitly-disabled bindings
 * pass through BYTE-IDENTICAL (same reference). Caps at MAX_ENABLED_TOOLS /
 * MAX_CACHED_TOOLS. Order-stable. Never throws.
 */
export async function fillVettedMcpBindingTools(
  orgId: string,
  connectors: ConnectorBinding[] | undefined | null,
  deps?: { listVettedTools?: VettedToolLister },
): Promise<{ connectors: ConnectorBinding[]; changed: boolean }> {
  const input = Array.isArray(connectors) ? connectors : [];
  const lister = deps?.listVettedTools ?? discoverVettedToolsLive;

  let changed = false;
  const out: ConnectorBinding[] = [];

  for (const binding of input) {
    if (!binding || typeof binding !== "object" || !isOauthVetted(binding)) {
      out.push(binding);
      continue;
    }
    if (!isUndiscovered(binding)) {
      out.push(binding);
      continue;
    }
    try {
      const result = await fillOneVettedBinding(orgId, binding, lister);
      out.push(result.binding);
      if (result.changed) changed = true;
    } catch {
      out.push(binding);
    }
  }

  return { connectors: out, changed };
}

/**
 * Combined persist-seam fill: runs the composio fill (existing) THEN the
 * vetted-OAuth fill (this module) — `changed` is the OR of both. This is the
 * single call both discover-tools.ts's `fillBlueprintConnectorsForPersist`
 * and the other 3 direct call sites now use in place of
 * `fillComposioBindingTools` alone, so a workspace's Circle binding gets
 * discovered at the exact same persist seams a Composio toolkit does.
 */
export async function fillAllBindingTools(
  orgId: string,
  connectors: ConnectorBinding[] | undefined | null,
  deps?: { listToolkitTools?: ToolkitToolLister; listVettedTools?: VettedToolLister },
): Promise<{ connectors: ConnectorBinding[]; changed: boolean }> {
  const composioResult = await fillComposioBindingTools(orgId, connectors, {
    listToolkitTools: deps?.listToolkitTools,
  });
  const vettedResult = await fillVettedMcpBindingTools(orgId, composioResult.connectors, {
    listVettedTools: deps?.listVettedTools,
  });
  return {
    connectors: vettedResult.connectors,
    changed: composioResult.changed || vettedResult.changed,
  };
}
