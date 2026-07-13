// Circle vetted-connector registry entry + the shared tool-schema clamp
// (TDD). Circle is the first `authType:"oauth"` vetted connector — this test
// locks the registry shape + verifies `boundMcpToolSchema` enforces the same
// bounds as `connectorBindingSchema` (mcpToolSchemaSchema: name ≤128,
// description ≤4000) so a discovered tool can never fail persistence.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  getVettedConnector,
  boundMcpToolSchema,
  type McpToolSchema,
} from "../../../../src/lib/agents/mcp/connectors";

describe("Circle vetted connector entry", () => {
  test("getVettedConnector(\"circle\") returns oauth authType + 2 access levels", () => {
    const circle = getVettedConnector("circle");
    assert.ok(circle, "circle must be a vetted connector");
    assert.equal(circle!.authType, "oauth");
    assert.equal(circle!.endpoint, "https://app.circle.so/api/mcp");
    assert.equal(circle!.secretService, "circle");
    assert.ok(circle!.accessLevels);
    assert.equal(circle!.accessLevels!.length, 2);
    assert.deepEqual(circle!.accessLevels![0], { label: "Read only", scopes: ["read"] });
    assert.deepEqual(circle!.accessLevels![1], { label: "Full access", scopes: ["read", "write"] });
  });

  test("existing bearer connectors (postiz/rube) keep authType \"bearer\"", () => {
    assert.equal(getVettedConnector("postiz")?.authType, "bearer");
    assert.equal(getVettedConnector("rube")?.authType, "bearer");
  });
});

describe("boundMcpToolSchema", () => {
  test("drops a tool with a name over 128 chars", () => {
    const schema: McpToolSchema = {
      name: "x".repeat(129),
      description: "fine",
      inputSchema: { type: "object" },
    };
    assert.equal(boundMcpToolSchema(schema), null);
  });

  test("clamps a description over 4000 chars, keeps the name", () => {
    const schema: McpToolSchema = {
      name: "listMembers",
      description: "y".repeat(5000),
      inputSchema: { type: "object" },
    };
    const bounded = boundMcpToolSchema(schema);
    assert.ok(bounded);
    assert.equal(bounded!.name, "listMembers");
    assert.equal(bounded!.description.length, 4000);
  });

  test("passes a normal schema through byte-identical (aside from object identity)", () => {
    const schema: McpToolSchema = {
      name: "listMembers",
      description: "List community members",
      inputSchema: { type: "object", properties: { spaceId: { type: "string" } } },
    };
    const bounded = boundMcpToolSchema(schema);
    assert.deepEqual(bounded, schema);
  });

  test("drops a blank/empty name", () => {
    const schema: McpToolSchema = { name: "   ", description: "d", inputSchema: {} };
    assert.equal(boundMcpToolSchema(schema), null);
  });
});
