// Agent Loop — L5 Self-Improving Generator — Task 2: bindToolsForIntent.
//
// The SEAM between a classified AgentIntent (parse-intent.ts) and the EXTERNAL
// connectors its sentence implies. The generator already wires SF's NATIVE tools
// from the skill; this layer adds the third-party ones the operator named in
// plain English ("post to Instagram", "log every lead to Notion") by running the
// T1 keyword catalog (tool-catalog.ts) over the intent's promptHint and mapping
// each hit onto a REAL ConnectorBinding.
//
// Each produced binding is byte-for-byte what a HAND-bound connector produces, so
// it's indistinguishable from one added via the Studio editor / bind action:
//   • vetted (postiz)  → { id:"postiz", kind:"vetted", serviceName:"postiz",
//                          enabledTools:[] }. Matches bind.ts' provisional vetted
//                          binding; serviceName = VETTED_CONNECTORS[id].secretService
//                          (= "postiz" for Postiz).
//   • composio entries → { id:<toolkitSlug>, kind:"composio",
//                          enabledToolkits:[toolkitSlug], enabledTools:[] }. The
//                          id + toolkit are the REAL Composio slug (catalog.ts) —
//                          e.g. a "Google Sheet" sentence binds "googledrive".
//
// `enabledTools` is left EMPTY here (no live tools/list at generate time): the
// bind action discovers + caches the per-tool allowlist when the operator
// actually connects the key (bind.ts buildConnectorBinding). An empty allowlist
// is the same valid resting state a connector sits in before its first discovery.
//
// WARNINGS are intentionally always `[]` in this PURE layer. The useful warning
// ("connect Notion to enable this") needs to know which toolkits the WORKSPACE
// has authorized — that's I/O (the live Composio session) and belongs in the
// action/wire layer (T3). The field is kept in the return type so the action can
// fill it without changing this contract.
//
// PURE — no SDK / network / clock / env / "use server". NEVER throws: an
// undefined intent, a non-string promptHint, or a no-tool sentence all yield
// { connectors: [], warnings: [] }. Safe from a Server Component, action, route
// handler, the runtime, or a test.

import type { AgentIntent } from "@/lib/agents/generate/parse-intent";
import {
  findToolsByKeywords,
  TOOL_CATALOG,
  type ToolCatalogEntry,
} from "@/lib/agents/generate/tool-catalog";
import type { ConnectorBinding } from "@/lib/agents/mcp/connectors";

/** What bindToolsForIntent returns. `connectors` are ready to merge onto
 *  blueprint.connectors; `warnings` is reserved for the action layer (always
 *  empty here — no I/O in this pure module). */
export type BoundTools = {
  connectors: ConnectorBinding[];
  warnings: string[];
};

/**
 * Map a catalog entry onto a valid ConnectorBinding in its resting (pre-discovery)
 * state, or `null` if the entry can't be turned into a real binding (a composio
 * entry missing its toolkit slug — which never happens for the shipped catalog,
 * but we degrade gracefully rather than emit an invalid binding).
 *
 *   • vetted   → the hand-bound provisional shape (id + serviceName + empty
 *                allowlist). serviceName === the catalog id for the shipped
 *                vetted entry (Postiz), which is exactly its `secretService`.
 *   • composio → id + enabledToolkits = [the real slug], empty allowlist.
 */
function bindingForEntry(entry: ToolCatalogEntry): ConnectorBinding | null {
  if (entry.connectorKind === "vetted") {
    return {
      id: entry.id,
      kind: "vetted",
      // VETTED_CONNECTORS[id="postiz"].secretService === "postiz" === entry.id.
      serviceName: entry.id,
      enabledTools: [],
    };
  }
  if (entry.connectorKind === "composio") {
    const slug = entry.toolkitSlug;
    // A composio catalog entry without a real toolkit slug can't bind — skip it
    // rather than emit an invalid { enabledToolkits: [undefined] } binding.
    if (!slug) return null;
    return {
      id: slug,
      kind: "composio",
      enabledToolkits: [slug],
      enabledTools: [],
    };
  }
  // Unknown connector kind — not bindable from this pure layer.
  return null;
}

/**
 * Turn a classified intent into the external connector bindings its sentence
 * implies. Runs the T1 keyword catalog over the intent's `promptHint`, maps each
 * hit to a valid ConnectorBinding, and DEDUPES by `kind`+`id` (so two keywords
 * for the same tool — "Instagram" + "Facebook" → one Postiz binding — and the
 * googlesheets/googledrive id collapse both yield a single binding).
 *
 * `warnings` is always `[]` here (see module header — the workspace-authorization
 * check that produces "connect X to enable" is I/O and lives in the action layer).
 *
 * PURE; never throws. Undefined / empty / non-string promptHint → empty result.
 */
export function bindToolsForIntent(intent: AgentIntent): BoundTools {
  const sentence =
    intent && typeof intent.promptHint === "string" ? intent.promptHint : "";

  const hits = findToolsByKeywords(sentence);

  const connectors: ConnectorBinding[] = [];
  const seen = new Set<string>();

  for (const entry of hits) {
    const binding = bindingForEntry(entry);
    if (!binding) continue;
    const key = `${binding.kind}:${binding.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    connectors.push(binding);
  }

  return { connectors, warnings: [] };
}

// ─── bindToolIds — the EXPLICIT-id binder (for the authored composer) ─────────

/** The catalog indexed by its stable `id` (built once from TOOL_CATALOG). The
 *  authored generator declares tools as explicit ids ("postiz", "gmail", …)
 *  rather than via a sentence, so it looks them up here. */
const CATALOG_BY_ID: ReadonlyMap<string, ToolCatalogEntry> = new Map(
  TOOL_CATALOG.map((entry) => [entry.id, entry]),
);

/**
 * Map an EXPLICIT list of catalog tool ids → their ConnectorBindings, reusing the
 * SAME entry→binding logic (`bindingForEntry`) as the keyword path, so an authored
 * agent's bindings are byte-for-byte identical to a hand-bound / keyword-bound one
 * (vetted → Postiz's provisional shape; composio → enabledToolkits). Unknown ids
 * are dropped, results are DEDUPED by kind+id, and the caller's order is preserved.
 *
 * This is the id-keyed sibling of {@link bindToolsForIntent} (which is sentence-
 * keyed): the authored generator (compose-authored.ts) declares `tools: string[]`
 * as catalog ids, so it binds via ids — no promptHint to keyword-match.
 *
 * PURE; never throws. A non-array / empty input yields `[]`.
 */
export function bindToolIds(ids: string[]): ConnectorBinding[] {
  if (!Array.isArray(ids)) return [];

  const connectors: ConnectorBinding[] = [];
  const seen = new Set<string>();

  for (const rawId of ids) {
    if (typeof rawId !== "string") continue;
    const entry = CATALOG_BY_ID.get(rawId.trim());
    if (!entry) continue;
    const binding = bindingForEntry(entry);
    if (!binding) continue;
    const key = `${binding.kind}:${binding.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    connectors.push(binding);
  }

  return connectors;
}
