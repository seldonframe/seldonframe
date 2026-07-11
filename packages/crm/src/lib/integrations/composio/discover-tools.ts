// Composio live tool discovery — widens ANY Composio toolkit (not just the
// 8-toolkit curated catalog) to real, bindable tools.
//
// `catalog.ts`'s `defaultToolsForToolkits` only covers the curated catalog —
// any other toolkit (youtube, synthflow_ai, …) resolves to zero tools. This
// module is the live-discovery fallback: for a `kind:"composio"` binding
// that has never been discovered (`enabledTools.length === 0 &&
// !discoveredAt` — the never-discovered resting state; an explicit disable
// sets `discoveredAt` with an empty allowlist and is left untouched), fill
// `enabledTools` from catalog defaults first (free, pure), then live
// discovery via the Composio SDK for any toolkit with no catalog defaults.
//
// FAIL-SOFT EVERYWHERE: no key, an SDK error, or a per-toolkit rejection
// never throws and never blocks the fill for other toolkits/bindings. The
// Composio API key is resolved (via `composioForOrg`) and handed to the SDK;
// it is never logged or persisted on the binding.
//
// PLAIN MODULE — server-only (imports `composioForOrg`, a Node-runtime SDK
// wrapper), but not "use server": exports sync/pure helpers alongside the
// async ones, which Server Actions forbid. Callers in "use server" files
// import this module directly (it's fine for a non-action module to be
// imported by one) rather than re-exporting it as an action.

import type { ConnectorBinding, McpToolSchema } from "@/lib/agents/mcp/connectors";
import { MAX_ENABLED_TOOLS, MAX_CACHED_TOOLS } from "@/lib/agents/mcp/connectors";
import { defaultToolsForToolkits } from "./catalog";
import { composioForOrg } from "./client";

/** Conservative per-toolkit discovery cap (a toolkit with fewer tools than
 *  this simply returns them all). */
export const TOOLKIT_DISCOVERY_TOOL_CAP = 20;

/** Injectable seam: list a toolkit's real tools for a workspace. The default
 *  (`discoverToolkitToolsLive`) hits the live Composio API; tests inject a
 *  fake so no network/SDK is touched. */
export type ToolkitToolLister = (
  orgId: string,
  toolkitSlug: string,
) => Promise<McpToolSchema[]>;

/** PURE: pick the discovery subset — prefer the important-filtered list when
 *  non-empty, else the full list — capped at `TOOLKIT_DISCOVERY_TOOL_CAP`
 *  either way. Exported so the important-first/fallback/cap logic is directly
 *  unit-testable without any SDK involvement. */
export function pickDiscoverySubset<T>(importantTools: T[], allTools: T[]): T[] {
  const important = Array.isArray(importantTools) ? importantTools : [];
  const all = Array.isArray(allTools) ? allTools : [];
  const base = important.length > 0 ? important : all;
  return base.slice(0, TOOLKIT_DISCOVERY_TOOL_CAP);
}

/** Raw shape of a Composio SDK `Tool` item, narrowed to what we read. */
type RawComposioTool = {
  slug?: unknown;
  description?: unknown;
  inputParameters?: unknown;
};

/** PURE: map raw Composio SDK tool items → `McpToolSchema[]`. Drops items
 *  without a usable slug; the schema's `name` IS the Composio tool slug (the
 *  wire name the runtime executes). Never throws — malformed items are
 *  simply skipped. */
export function normalizeDiscoveredTools(items: unknown): McpToolSchema[] {
  if (!Array.isArray(items)) return [];
  const out: McpToolSchema[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as RawComposioTool;
    const slug = typeof item.slug === "string" ? item.slug.trim() : "";
    if (!slug) continue;
    const description =
      typeof item.description === "string" && item.description.trim().length > 0
        ? item.description
        : `Composio tool ${slug}.`;
    const inputSchema =
      item.inputParameters && typeof item.inputParameters === "object"
        ? (item.inputParameters as Record<string, unknown>)
        : { type: "object", additionalProperties: true };
    out.push({ name: slug, description, inputSchema });
  }
  return out;
}

/**
 * Live discovery for one toolkit: important-first subset, falling back to the
 * full list (both capped at `TOOLKIT_DISCOVERY_TOOL_CAP`). No key → `[]`. ANY
 * SDK/shape error → `[]`. Never throws. Never logs the key.
 */
export async function discoverToolkitToolsLive(
  orgId: string,
  toolkitSlug: string,
): Promise<McpToolSchema[]> {
  try {
    const composio = await composioForOrg(orgId);
    if (!composio) return [];

    const important = await composio.tools
      .getRawComposioTools({
        toolkits: [toolkitSlug],
        important: true,
        limit: TOOLKIT_DISCOVERY_TOOL_CAP,
      })
      .catch(() => [] as unknown[]);
    const importantList = Array.isArray(important) ? important : [];

    let allList: unknown[] = [];
    if (importantList.length === 0) {
      const all = await composio.tools
        .getRawComposioTools({ toolkits: [toolkitSlug], limit: TOOLKIT_DISCOVERY_TOOL_CAP })
        .catch(() => [] as unknown[]);
      allList = Array.isArray(all) ? all : [];
    }

    const subset = pickDiscoverySubset(importantList, allList);
    return normalizeDiscoveredTools(subset);
  } catch {
    return [];
  }
}

type ComposioBinding = Extract<ConnectorBinding, { kind: "composio" }>;

/** True for the never-discovered resting state — the only state this module
 *  is allowed to widen. An explicit disable (`discoveredAt` set + empty
 *  allowlist) is the Studio editor's own action and must NOT be touched. */
function isUndiscovered(binding: ComposioBinding): boolean {
  return binding.enabledTools.length === 0 && !binding.discoveredAt;
}

/** Fill ONE composio binding: catalog defaults first (free, pure, never
 *  invokes the lister), then live discovery for any toolkit with no catalog
 *  defaults. Per-toolkit failure isolation — one toolkit's rejection never
 *  kills the fill for its siblings. A still-zero-tool outcome returns the
 *  ORIGINAL binding reference unchanged (no `discoveredAt` stamp), so the
 *  next authoring encounter retries. Never throws. */
async function fillOneComposioBinding(
  orgId: string,
  binding: ComposioBinding,
  lister: ToolkitToolLister,
): Promise<{ binding: ConnectorBinding; changed: boolean }> {
  const toolNames: string[] = [];
  const seenNames = new Set<string>();
  const cachedTools: McpToolSchema[] = [];
  const seenCached = new Set<string>();

  const addTool = (name: string): void => {
    if (!name || seenNames.has(name)) return;
    seenNames.add(name);
    toolNames.push(name);
  };
  const addCached = (schema: McpToolSchema): void => {
    if (seenCached.has(schema.name)) return;
    seenCached.add(schema.name);
    cachedTools.push(schema);
  };

  const toolkits = Array.isArray(binding.enabledToolkits) ? binding.enabledToolkits : [];
  for (const raw of toolkits) {
    const slug = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    if (!slug) continue;

    const catalogDefaults = defaultToolsForToolkits([slug]);
    if (catalogDefaults.length > 0) {
      for (const name of catalogDefaults) addTool(name);
      continue;
    }

    try {
      const discovered = await lister(orgId, slug);
      if (Array.isArray(discovered)) {
        for (const schema of discovered) {
          if (!schema || typeof schema.name !== "string" || !schema.name) continue;
          addTool(schema.name);
          addCached(schema);
        }
      }
    } catch {
      // Per-toolkit isolation: one toolkit's rejection never kills the fill
      // for its siblings (or the caller's other bindings).
    }
  }

  if (toolNames.length === 0) {
    return { binding, changed: false };
  }

  const cappedTools = toolNames.slice(0, MAX_ENABLED_TOOLS);
  const cappedCached = cachedTools.slice(0, MAX_CACHED_TOOLS);

  const nextBinding: ConnectorBinding = {
    ...binding,
    enabledTools: cappedTools,
    ...(cappedCached.length > 0 ? { tools: cappedCached } : {}),
    discoveredAt: new Date().toISOString(),
  };
  return { binding: nextBinding, changed: true };
}

/**
 * Fill every never-discovered `kind:"composio"` binding's `enabledTools` in
 * an array of connectors — catalog defaults first, live discovery (DI'd via
 * `deps.listToolkitTools`, default `discoverToolkitToolsLive`) only for
 * toolkits with no catalog defaults. Non-composio bindings and
 * already-resolved/explicitly-disabled composio bindings pass through
 * BYTE-IDENTICAL (same reference). Caps at `MAX_ENABLED_TOOLS` /
 * `MAX_CACHED_TOOLS`. Order-stable. Org-scoped by construction (orgId is
 * always the caller's authed org). Never throws — malformed input yields
 * `{ connectors: input-as-array-or-[], changed:false }`.
 */
export async function fillComposioBindingTools(
  orgId: string,
  connectors: ConnectorBinding[] | undefined | null,
  deps?: { listToolkitTools?: ToolkitToolLister },
): Promise<{ connectors: ConnectorBinding[]; changed: boolean }> {
  const input = Array.isArray(connectors) ? connectors : [];
  const lister = deps?.listToolkitTools ?? discoverToolkitToolsLive;

  let changed = false;
  const out: ConnectorBinding[] = [];

  for (const binding of input) {
    if (!binding || typeof binding !== "object" || binding.kind !== "composio") {
      out.push(binding);
      continue;
    }
    const composioBinding = binding as ComposioBinding;
    if (!isUndiscovered(composioBinding)) {
      out.push(binding);
      continue;
    }

    try {
      const result = await fillOneComposioBinding(orgId, composioBinding, lister);
      out.push(result.binding);
      if (result.changed) changed = true;
    } catch {
      // Defense-in-depth (fillOneComposioBinding already fails soft
      // per-toolkit) — a binding-level surprise never breaks the array fill.
      out.push(binding);
    }
  }

  return { connectors: out, changed };
}

/**
 * Persist-seam convenience: fill a blueprint's `connectors` in place of a
 * fresh copy — the one-line call both generate `defaultCreate` seams
 * (lib/agents/generate/actions.ts + app/api/v1/agents/generate/route.ts) make
 * before their `updateAgentTemplate` write. Extracted here (rather than
 * inlined in each near-duplicate `defaultCreate`, which are DB-bound and not
 * independently unit-testable) so THIS is the unit-tested seam; both
 * `defaultCreate`s stay one-line callers. Non-mutating: returns a new object
 * with `connectors` replaced by the filled array (`changed:false` still
 * yields a fresh shallow copy — cheap, and keeps the return type simple).
 * Never throws (delegates entirely to `fillComposioBindingTools`).
 */
export async function fillBlueprintConnectorsForPersist<
  T extends { connectors?: ConnectorBinding[] },
>(orgId: string, blueprint: T): Promise<T> {
  const { connectors } = await fillComposioBindingTools(orgId, blueprint.connectors);
  return { ...blueprint, connectors };
}
