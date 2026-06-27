// P2.1-T3 — computeToolConnectionStatuses / labelForBinding / unconnectedTools.
//
// The editor's "connect the tools" CTA needs, per bound connector, whether the
// account is connected for the org + a human label. The connection CHECK is
// INJECTED (the server action wires the real predicate; here we pass a fake), so
// these tests are pure — no DB, no network.
//
// Covered:
//   • labelForBinding — vetted → catalog label; composio → first toolkit's label;
//     byo → its id.
//   • computeToolConnectionStatuses — maps each binding to {connected}, in order,
//     deduped; a check that THROWS for a binding is treated as not-connected
//     (fail-closed) without aborting the list.
//   • unconnectedTools — the filter the banner renders from.
//
// To run:
//   cd packages/crm
//   node_modules/.bin/tsx --test tests/unit/agents/mcp/tool-connection.spec.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  computeToolConnectionStatuses,
  labelForBinding,
  unconnectedTools,
} from "../../../../src/lib/agents/mcp/tool-connection";
import type { ConnectorBinding } from "../../../../src/lib/agents/mcp/connectors";

const postiz: ConnectorBinding = {
  id: "postiz",
  kind: "vetted",
  serviceName: "postiz",
  enabledTools: ["create_post"],
};

const slack: ConnectorBinding = {
  id: "composio-slack",
  kind: "composio",
  enabledToolkits: ["slack"],
  enabledTools: ["SLACK_SEND_MESSAGE"],
};

const byo: ConnectorBinding = {
  id: "byo_my_server",
  kind: "byo",
  serviceName: "byo_my_server",
  endpoint: "https://my-mcp.example.com/mcp",
  enabledTools: ["do_thing"],
};

// ── labelForBinding ─────────────────────────────────────────────────────────────

describe("labelForBinding", () => {
  test("vetted → its catalog label", () => {
    // Postiz's VETTED_CONNECTORS label.
    assert.equal(labelForBinding(postiz), "Postiz (social publishing)");
  });

  test("composio → the first enabled toolkit's catalog label", () => {
    assert.equal(labelForBinding(slack), "Slack");
  });

  test("byo → its id (the operator's own slug)", () => {
    assert.equal(labelForBinding(byo), "byo_my_server");
  });

  test("composio with an unknown slug → the slug itself (never throws)", () => {
    const weird: ConnectorBinding = {
      id: "composio-x",
      kind: "composio",
      enabledToolkits: ["not_a_real_toolkit"],
      enabledTools: [],
    };
    assert.equal(labelForBinding(weird), "not_a_real_toolkit");
  });
});

// ── computeToolConnectionStatuses ───────────────────────────────────────────────

describe("computeToolConnectionStatuses", () => {
  test("empty / null bindings → []", async () => {
    assert.deepEqual(await computeToolConnectionStatuses([], async () => true), []);
    assert.deepEqual(await computeToolConnectionStatuses(null, async () => true), []);
    assert.deepEqual(
      await computeToolConnectionStatuses(undefined, async () => true),
      [],
    );
  });

  test("maps each binding to its connected flag, in order", async () => {
    // Postiz connected, Slack NOT.
    const connectedIds = new Set(["postiz"]);
    const statuses = await computeToolConnectionStatuses(
      [postiz, slack],
      async (b) => connectedIds.has(b.id),
    );

    assert.equal(statuses.length, 2);
    assert.deepEqual(
      statuses.map((s) => [s.label, s.connected]),
      [
        ["Postiz (social publishing)", true],
        ["Slack", false],
      ],
    );
    // composio key is the toolkit slug; vetted key is the binding id.
    assert.equal(statuses[0].key, "postiz");
    assert.equal(statuses[1].key, "slack");
    assert.equal(statuses[0].kind, "vetted");
    assert.equal(statuses[1].kind, "composio");
  });

  test("a check that THROWS for a binding → not connected (fail-closed), list continues", async () => {
    const statuses = await computeToolConnectionStatuses(
      [postiz, slack],
      async (b) => {
        if (b.id === "postiz") throw new Error("composio key lookup blew up");
        return true; // slack connected
      },
    );

    assert.equal(statuses.length, 2);
    assert.equal(statuses[0].connected, false, "the throwing binding is NOT connected");
    assert.equal(statuses[1].connected, true, "the rest of the list still resolves");
  });

  test("dedupes by key (two composio bindings on the same toolkit collapse)", async () => {
    const slackDup: ConnectorBinding = {
      id: "composio-slack-2",
      kind: "composio",
      enabledToolkits: ["slack"],
      enabledTools: [],
    };
    const statuses = await computeToolConnectionStatuses(
      [slack, slackDup],
      async () => false,
    );
    assert.equal(statuses.length, 1, "same toolkit slug → one row");
    assert.equal(statuses[0].key, "slack");
  });
});

// ── unconnectedTools ────────────────────────────────────────────────────────────

describe("unconnectedTools", () => {
  test("returns only the not-connected entries", async () => {
    const statuses = await computeToolConnectionStatuses(
      [postiz, slack, byo],
      async (b) => b.id === "postiz", // only Postiz connected
    );
    const missing = unconnectedTools(statuses);
    assert.deepEqual(
      missing.map((s) => s.label),
      ["Slack", "byo_my_server"],
    );
  });

  test("all connected → []", async () => {
    const statuses = await computeToolConnectionStatuses(
      [postiz, slack],
      async () => true,
    );
    assert.deepEqual(unconnectedTools(statuses), []);
  });
});
