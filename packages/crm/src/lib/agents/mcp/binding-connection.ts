// P2.1-T3 — the SHARED money-safe connection predicate for a connector binding.
//
// "Is this bound tool actually CONNECTED for the org?" — i.e. can it really be
// invoked. There are exactly TWO answers depending on the binding kind, and they
// must be IDENTICAL everywhere we ask:
//   • the runtime gate (run-event-agent-deps.ts `isToolConnected`) — a live post
//     fires ONLY when this returns true; otherwise it records tool_not_connected
//     and NEVER fakes a post.
//   • the editor's "connect the tools" surfacing (the connectedToolsAction below
//     it) — so the editor tells the operator to connect EXACTLY the tools the
//     runtime would refuse to fire.
//
// Extracted here so both call sites share one definition (no drift between "the
// editor says it's connected" and "the runtime will actually fire it").
//
// This is a plain lib module (NOT "use server"): it dynamically imports the
// secret + composio-key seams so it stays importable from both the listener-loaded
// deps file and a server action. Soft-fails to NOT-connected (false) on any error
// — the same fail-closed posture the runtime relies on.

import type { ConnectorBinding } from "@/lib/agents/mcp/connectors";

/**
 * True iff `binding` can actually be invoked for `orgId`:
 *   • composio → the workspace has a usable Composio key (resolveComposioKey
 *     source !== "none") — the same fail-closed gate getToolsForCapabilities uses
 *     to decide whether a composio binding's tools are even exposed.
 *   • vetted / byo → its bearer secret is stored (getSecretValue non-null — the
 *     EXACT thing wrap-tool needs to dial the MCP server). `serviceName` is the
 *     encrypted-secret key on the binding.
 * Soft-fails to false on a bad shape or any thrown error. NEVER throws.
 */
export async function isBindingConnectedForOrg(
  orgId: string,
  binding: ConnectorBinding,
): Promise<boolean> {
  try {
    if (!binding || typeof binding !== "object") return false;
    if (binding.kind === "composio") {
      const { resolveComposioKey } = await import(
        "@/lib/integrations/composio/keys"
      );
      const { source } = await resolveComposioKey(orgId);
      return source !== "none";
    }
    // vetted / byo — the bearer secret must be present.
    const serviceName =
      typeof binding.serviceName === "string" ? binding.serviceName.trim() : "";
    if (!serviceName) return false;
    const { getSecretValue } = await import("@/lib/secrets");
    const secret = await getSecretValue({
      workspaceId: orgId,
      serviceName,
      skipAccessCheck: true,
    });
    return typeof secret === "string" && secret.length > 0;
  } catch (err) {
    console.warn(
      `[binding-connection] isBindingConnectedForOrg failed for ${
        binding?.id ?? "?"
      }:`,
      err instanceof Error ? err.message : String(err),
    );
    return false;
  }
}
