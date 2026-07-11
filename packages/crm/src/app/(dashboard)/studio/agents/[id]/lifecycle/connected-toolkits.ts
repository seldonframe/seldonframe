// Agent lifecycle slice (T9) — the Connected stage's REQUIRED toolkit list.
//
// Pure derivation: which Composio toolkits does this template's blueprint
// actually bind? Only `kind:"composio"` connector bindings carry toolkits
// (vetted/byo bindings point at a fixed non-Composio endpoint, so they never
// contribute here). De-duplicated, order-stable, catalog-filtered so a
// stray/unknown slug never renders a dead "Connect" row.

import { isCatalogToolkit } from "@/lib/integrations/composio/catalog";
import type { ConnectorBinding } from "@/lib/agents/mcp/connectors";

/** The distinct, catalog-known Composio toolkit slugs a template's connector
 *  bindings require. Pure; never throws on a malformed/empty array. */
export function requiredToolkitSlugs(connectors: ConnectorBinding[] | null | undefined): string[] {
  if (!Array.isArray(connectors)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const binding of connectors) {
    if (binding.kind !== "composio") continue;
    for (const slug of binding.enabledToolkits ?? []) {
      const norm = slug.trim().toLowerCase();
      if (!norm || seen.has(norm) || !isCatalogToolkit(norm)) continue;
      seen.add(norm);
      out.push(norm);
    }
  }
  return out;
}

/** How many of the required toolkits currently have an ACTIVE connection.
 *  `connectedSlugs` is the set of slugs the workspace's live connection list
 *  reports as connected — pass it pre-filtered to `connected === true`. */
export function countConnectedRequiredToolkits(
  required: string[],
  connectedSlugs: Set<string>,
): number {
  return required.filter((slug) => connectedSlugs.has(slug)).length;
}
