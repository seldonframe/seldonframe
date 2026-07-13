// Pure display-logic helper for the /integrations MCP-connector card. The
// server component reads a secret's raw stored value and calls this to get
// booleans/labels/counts ONLY — the envelope (and any plain bearer) never
// crosses into client-rendered props.

import { parseTokenEnvelope } from "./oauth";

export type McpConnectorStatus = {
  connected: boolean;
  levelLabel?: string;
  toolCount?: number;
};

/**
 * Describe a stored MCP connector secret for display.
 *   - null/undefined              → disconnected.
 *   - a plain (non-`{`) string    → connected, no level/count (legacy bearer).
 *   - a `{...}` OAuth envelope    → connected; `levelLabel` = "Full access"
 *     when `scope` contains "write", else "Read only" when scope is present
 *     (absent scope → no levelLabel); `toolCount` = discovered_tools_count
 *     when present.
 *   - a `{...}` that fails to parse → disconnected (fail-safe: an unusable
 *     secret must never display as "Connected").
 */
export function describeMcpConnectorStatus(raw: string | null | undefined): McpConnectorStatus {
  if (raw === null || raw === undefined) return { connected: false };

  if (!raw.trimStart().startsWith("{")) {
    return { connected: true };
  }

  const envelope = parseTokenEnvelope(raw);
  if (!envelope) return { connected: false };

  const result: McpConnectorStatus = { connected: true };
  if (envelope.scope) {
    result.levelLabel = envelope.scope.includes("write") ? "Full access" : "Read only";
  }
  if (typeof envelope.discovered_tools_count === "number") {
    result.toolCount = envelope.discovered_tools_count;
  }
  return result;
}
