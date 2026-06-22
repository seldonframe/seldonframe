// Connector registry + types — pure, TDD.
//
// The registry is the single source of truth for:
//   - which MCP connectors are "vetted" (shipped, endpoint baked in) — v1: Postiz
//   - how to resolve a binding to its concrete endpoint (vetted id → registry,
//     byo → the operator-supplied HTTPS endpoint)
//   - which encrypted-secret service name holds a binding's bearer key
//
// All pure (no DB / network), so these tests just assert the lookups + the
// HTTPS guard for BYO endpoints.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  VETTED_CONNECTORS,
  getVettedConnector,
  resolveConnectorEndpoint,
  connectorSecretService,
  type ConnectorBinding,
} from "../../../../src/lib/agents/mcp/connectors";

describe("VETTED_CONNECTORS", () => {
  test("contains Postiz with the hosted endpoint + bearer auth", () => {
    const postiz = VETTED_CONNECTORS.find((c) => c.id === "postiz");
    assert.ok(postiz, "postiz must be a vetted connector");
    assert.equal(postiz!.endpoint, "https://api.postiz.com/mcp");
    assert.equal(postiz!.authType, "bearer");
    assert.equal(postiz!.secretService, "postiz");
  });

  test("getVettedConnector(id) returns the entry or undefined", () => {
    assert.equal(getVettedConnector("postiz")?.id, "postiz");
    assert.equal(getVettedConnector("does-not-exist"), undefined);
  });
});

describe("resolveConnectorEndpoint", () => {
  test("vetted binding → the registry endpoint", () => {
    const binding: ConnectorBinding = {
      id: "postiz",
      kind: "vetted",
      serviceName: "postiz",
      enabledTools: ["schedulePost"],
    };
    assert.equal(resolveConnectorEndpoint(binding), "https://api.postiz.com/mcp");
  });

  test("byo binding → the operator-supplied HTTPS endpoint", () => {
    const binding: ConnectorBinding = {
      id: "my-tool",
      kind: "byo",
      serviceName: "byo_my-tool",
      endpoint: "https://my.mcp.example.com/mcp",
      enabledTools: [],
    };
    assert.equal(resolveConnectorEndpoint(binding), "https://my.mcp.example.com/mcp");
  });

  test("byo binding with a non-HTTPS endpoint → throws (security)", () => {
    const binding: ConnectorBinding = {
      id: "evil",
      kind: "byo",
      serviceName: "byo_evil",
      endpoint: "http://insecure.example.com/mcp",
      enabledTools: [],
    };
    assert.throws(() => resolveConnectorEndpoint(binding), /https/i);
  });

  test("unknown vetted id → throws (no endpoint to resolve)", () => {
    const binding = {
      id: "ghost",
      kind: "vetted",
      serviceName: "ghost",
      enabledTools: [],
    } as ConnectorBinding;
    assert.throws(() => resolveConnectorEndpoint(binding), /ghost|unknown|vetted/i);
  });
});

describe("connectorSecretService", () => {
  test("returns the binding's serviceName (used by getSecretValue)", () => {
    const vetted: ConnectorBinding = {
      id: "postiz",
      kind: "vetted",
      serviceName: "postiz",
      enabledTools: [],
    };
    assert.equal(connectorSecretService(vetted), "postiz");

    const byo: ConnectorBinding = {
      id: "x",
      kind: "byo",
      serviceName: "byo_x",
      endpoint: "https://x.example.com/mcp",
      enabledTools: [],
    };
    assert.equal(connectorSecretService(byo), "byo_x");
  });
});
