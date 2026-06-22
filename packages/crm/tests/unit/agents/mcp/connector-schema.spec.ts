// connectorBindingSchema / connectorBindingsSchema — Task 3.
//
// These Zod schemas live in the PURE connectors.ts module (not the "use server"
// actions file) so they're directly unit-testable AND composable into
// BlueprintPatchSchema without violating check-use-server.sh. The actions file
// imports `connectorBindingsSchema` and adds it to BlueprintPatchSchema; that
// thin wiring is covered structurally (the schema itself — the logic — is
// proven here, as prior builds did for "use server" actions).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  connectorBindingSchema,
  connectorBindingsSchema,
  MAX_CONNECTORS,
  MAX_ENABLED_TOOLS,
} from "../../../../src/lib/agents/mcp/connectors";

describe("connectorBindingSchema accepts valid bindings", () => {
  test("a vetted Postiz binding (no endpoint) parses", () => {
    const parsed = connectorBindingSchema.safeParse({
      id: "postiz",
      kind: "vetted",
      serviceName: "postiz",
      enabledTools: ["schedulePost", "listChannels"],
      tools: [
        { name: "schedulePost", description: "Schedule a post", inputSchema: { type: "object" } },
      ],
      discoveredAt: new Date().toISOString(),
    });
    assert.equal(parsed.success, true, parsed.success ? "" : JSON.stringify(parsed.error.issues));
  });

  test("a BYO binding with an HTTPS endpoint parses", () => {
    const parsed = connectorBindingSchema.safeParse({
      id: "my-mcp",
      kind: "byo",
      serviceName: "byo_my-mcp",
      endpoint: "https://my.mcp.example.com/mcp",
      enabledTools: [],
    });
    assert.equal(parsed.success, true, parsed.success ? "" : JSON.stringify(parsed.error.issues));
  });
});

describe("connectorBindingSchema rejects invalid bindings", () => {
  test("a BYO binding with a non-HTTPS endpoint is rejected", () => {
    const parsed = connectorBindingSchema.safeParse({
      id: "evil",
      kind: "byo",
      serviceName: "byo_evil",
      endpoint: "http://insecure.example.com/mcp",
      enabledTools: [],
    });
    assert.equal(parsed.success, false);
  });

  test("a vetted binding carrying an unexpected endpoint key is rejected (.strict)", () => {
    const parsed = connectorBindingSchema.safeParse({
      id: "postiz",
      kind: "vetted",
      serviceName: "postiz",
      endpoint: "https://api.postiz.com/mcp", // not allowed on the vetted variant
      enabledTools: [],
    });
    assert.equal(parsed.success, false);
  });

  test("an over-long enabledTools array is rejected", () => {
    const parsed = connectorBindingSchema.safeParse({
      id: "postiz",
      kind: "vetted",
      serviceName: "postiz",
      enabledTools: Array.from({ length: MAX_ENABLED_TOOLS + 1 }, (_, i) => `tool_${i}`),
    });
    assert.equal(parsed.success, false);
  });

  test("an unknown discriminator kind is rejected", () => {
    const parsed = connectorBindingSchema.safeParse({
      id: "x",
      kind: "mystery",
      serviceName: "x",
      enabledTools: [],
    });
    assert.equal(parsed.success, false);
  });
});

describe("connectorBindingsSchema bounds the array", () => {
  test("accepts a mixed vetted + byo array", () => {
    const parsed = connectorBindingsSchema.safeParse([
      { id: "postiz", kind: "vetted", serviceName: "postiz", enabledTools: ["schedulePost"] },
      {
        id: "byo1",
        kind: "byo",
        serviceName: "byo_byo1",
        endpoint: "https://x.example.com/mcp",
        enabledTools: [],
      },
    ]);
    assert.equal(parsed.success, true, parsed.success ? "" : JSON.stringify(parsed.error.issues));
  });

  test("rejects more than MAX_CONNECTORS bindings", () => {
    const many = Array.from({ length: MAX_CONNECTORS + 1 }, (_, i) => ({
      id: `c${i}`,
      kind: "vetted" as const,
      serviceName: `svc_${i}`,
      enabledTools: [],
    }));
    const parsed = connectorBindingsSchema.safeParse(many);
    assert.equal(parsed.success, false);
  });
});
