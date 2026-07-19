// Pure display-logic helper for the /integrations MCP-connector card (TDD).
// The server component reads a secret's stored value and must turn it into
// booleans/labels/counts ONLY — never pass the raw envelope (or a plain
// bearer) to the client. This is the one function that decision lives in, so
// it's unit-tested directly rather than rendering the whole dashboard page.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { describeMcpConnectorStatus } from "../../../../src/lib/agents/mcp/connector-status";
import type { TokenEnvelope } from "../../../../src/lib/agents/mcp/oauth";

describe("describeMcpConnectorStatus", () => {
  test("null → disconnected", () => {
    assert.deepEqual(describeMcpConnectorStatus(null), { connected: false });
  });

  test("a plain-bearer string (not an OAuth envelope) → connected, no level/count", () => {
    assert.deepEqual(describeMcpConnectorStatus("plain-bearer-key-123"), { connected: true });
  });

  test("an envelope with scope \"read\" → Read only + tool count when present", () => {
    const envelope: TokenEnvelope = {
      v: 1,
      kind: "oauth",
      access_token: "fake-access-token-NOT-REAL",
      token_endpoint: "https://app.circle.so/oauth/token",
      client_id: "circle-client-1",
      obtained_at: 0,
      scope: "read",
      discovered_tools_count: 12,
    };
    assert.deepEqual(describeMcpConnectorStatus(JSON.stringify(envelope)), {
      connected: true,
      levelLabel: "Read only",
      toolCount: 12,
    });
  });

  test("an envelope with scope containing \"write\" → Full access", () => {
    const envelope: TokenEnvelope = {
      v: 1,
      kind: "oauth",
      access_token: "fake-access-token-NOT-REAL",
      token_endpoint: "https://app.circle.so/oauth/token",
      client_id: "circle-client-1",
      obtained_at: 0,
      scope: "read write",
    };
    const result = describeMcpConnectorStatus(JSON.stringify(envelope));
    assert.equal(result.connected, true);
    assert.equal(result.levelLabel, "Full access");
    assert.equal(result.toolCount, undefined);
  });

  test("an envelope with no scope → no levelLabel", () => {
    const envelope: TokenEnvelope = {
      v: 1,
      kind: "oauth",
      access_token: "fake-access-token-NOT-REAL",
      token_endpoint: "https://app.circle.so/oauth/token",
      client_id: "circle-client-1",
      obtained_at: 0,
    };
    const result = describeMcpConnectorStatus(JSON.stringify(envelope));
    assert.equal(result.connected, true);
    assert.equal(result.levelLabel, undefined);
  });

  test("malformed JSON (starts with `{` but unparseable) → disconnected (fail-safe display)", () => {
    assert.deepEqual(describeMcpConnectorStatus("{not valid json"), { connected: false });
  });
});
