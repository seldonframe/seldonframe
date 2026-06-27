// P2.1-T3 — "connect the tools" surfacing.
//
// A generated agent BINDS external tools onto its blueprint (Postiz to post to
// social, Google Calendar to book, …) before the workspace has actually CONNECTED
// those accounts in Integrations. At runtime the orchestrator's money-safe gate
// (run-event-agent-deps.ts `isToolConnected`) refuses to fire an unconnected tool
// and records `tool_not_connected` — but the editor never TELLS the operator which
// tool to go connect. This module computes that: for each bound binding, is the
// account connected, and what's its human label — so the editor can render a clear
// "Connect <tool> in Integrations →" row for each unconnected one.
//
// PURE — no DB / network / "use server". The connection CHECK is injected (the
// server action wires the real composio-key + encrypted-secret predicates, the
// SAME ones the runtime uses); the LABELS resolve from the static catalogs
// (VETTED_CONNECTORS + COMPOSIO_TOOLKITS). Never throws.

import type { ConnectorBinding } from "@/lib/agents/mcp/connectors";
import { getVettedConnector } from "@/lib/agents/mcp/connectors";
import { getComposioToolkit } from "@/lib/integrations/composio/catalog";

/** One bound tool's connection status, for the editor's connect-the-tools UI. */
export type ToolConnectionStatus = {
  /** A stable key for the row (the binding id, or the toolkit slug for composio). */
  key: string;
  /** Human label, e.g. "Postiz (social publishing)" / "Slack" / a BYO endpoint. */
  label: string;
  /** The binding kind — drives the chip copy/icon (vetted/byo vs. composio). */
  kind: ConnectorBinding["kind"];
  /** True iff the account/key is actually connected for the org (can be invoked). */
  connected: boolean;
};

/** The first non-blank enabled toolkit slug on a composio binding, or null. Pure. */
function firstToolkitSlug(toolkits: readonly string[]): string | null {
  for (const s of toolkits) {
    if (typeof s === "string" && s.trim()) return s;
  }
  return null;
}

/** The stable dedupe key for a binding: the toolkit slug for composio (so two
 *  bindings on the same app collapse), else the binding id. Pure. */
function keyForBinding(binding: ConnectorBinding): string {
  if (binding.kind === "composio") {
    return firstToolkitSlug(binding.enabledToolkits) ?? binding.id;
  }
  return binding.id;
}

/**
 * A human label for a binding. Vetted → its catalog label; composio → the FIRST
 * enabled toolkit's catalog label (a composio binding usually wraps one app at a
 * time in this product); byo → its id (the operator's own slug). Pure; tolerant of
 * an unknown/empty slug (falls back to the id, then a generic "Tool").
 */
export function labelForBinding(binding: ConnectorBinding): string {
  if (binding.kind === "vetted") {
    return getVettedConnector(binding.id)?.label ?? binding.id;
  }
  if (binding.kind === "composio") {
    const slug = firstToolkitSlug(binding.enabledToolkits);
    if (slug) {
      return getComposioToolkit(slug)?.label ?? slug;
    }
    return binding.id || "Tool";
  }
  // byo — the operator's own endpoint; the id is the human-facing slug.
  return binding.id || "Tool";
}

/**
 * Compute the connection status of every bound tool, in binding order, deduped by
 * `key`. The per-binding connection check is INJECTED — the server action passes
 * the real predicate (composio key present / encrypted bearer secret present),
 * mirroring the runtime gate; a unit test passes a fake. A check that THROWS for a
 * binding is treated as NOT connected (fail-closed — same posture as the runtime),
 * never aborting the whole list.
 *
 * @param bindings   the agent blueprint's connector bindings.
 * @param isConnected per-binding async predicate (true ⟺ usable for this org).
 */
export async function computeToolConnectionStatuses(
  bindings: readonly ConnectorBinding[] | null | undefined,
  isConnected: (binding: ConnectorBinding) => Promise<boolean>,
): Promise<ToolConnectionStatus[]> {
  if (!Array.isArray(bindings) || bindings.length === 0) return [];

  const out: ToolConnectionStatus[] = [];
  const seen = new Set<string>();

  for (const binding of bindings) {
    if (!binding || typeof binding !== "object") continue;
    const key = keyForBinding(binding);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    let connected = false;
    try {
      connected = await isConnected(binding);
    } catch {
      connected = false; // fail-closed
    }

    out.push({
      key,
      label: labelForBinding(binding),
      kind: binding.kind,
      connected,
    });
  }

  return out;
}

/** The unconnected subset of computeToolConnectionStatuses — the tools the editor
 *  must prompt the operator to connect. Convenience filter; pure. */
export function unconnectedTools(
  statuses: readonly ToolConnectionStatus[],
): ToolConnectionStatus[] {
  return statuses.filter((s) => !s.connected);
}
