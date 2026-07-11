// T9 — the Connected stage's pure required-toolkit derivation.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  requiredToolkitSlugs,
  countConnectedRequiredToolkits,
} from "@/app/(dashboard)/studio/agents/[id]/lifecycle/connected-toolkits";
import type { ConnectorBinding } from "@/lib/agents/mcp/connectors";

function composioBinding(toolkits: string[]): ConnectorBinding {
  return {
    id: "c1",
    kind: "composio",
    enabledToolkits: toolkits,
    enabledTools: [],
  };
}

describe("requiredToolkitSlugs", () => {
  test("empty/missing connectors → []", () => {
    assert.deepEqual(requiredToolkitSlugs(null), []);
    assert.deepEqual(requiredToolkitSlugs(undefined), []);
    assert.deepEqual(requiredToolkitSlugs([]), []);
  });

  test("composio bindings contribute their toolkits, normalized + deduped", () => {
    const connectors: ConnectorBinding[] = [
      composioBinding(["gmail", "GMAIL", " gmail "]),
      composioBinding(["slack"]),
    ];
    assert.deepEqual(requiredToolkitSlugs(connectors), ["gmail", "slack"]);
  });

  test("a NON-catalog toolkit still contributes (a youtube-only agent must never render 'Nothing to connect')", () => {
    const connectors: ConnectorBinding[] = [composioBinding(["youtube", "synthflow_ai"])];
    assert.deepEqual(requiredToolkitSlugs(connectors), ["youtube", "synthflow_ai"]);
  });

  test("vetted/byo bindings never contribute (no toolkits field)", () => {
    const connectors: ConnectorBinding[] = [
      { id: "v1", kind: "vetted", serviceName: "postiz", enabledTools: ["x"] },
      { id: "b1", kind: "byo", serviceName: "custom", endpoint: "https://x.example/mcp", enabledTools: ["y"] },
    ];
    assert.deepEqual(requiredToolkitSlugs(connectors), []);
  });
});

describe("countConnectedRequiredToolkits", () => {
  test("counts only the intersection", () => {
    assert.equal(
      countConnectedRequiredToolkits(["gmail", "slack", "notion"], new Set(["gmail", "notion"])),
      2,
    );
  });

  test("no required toolkits → 0", () => {
    assert.equal(countConnectedRequiredToolkits([], new Set(["gmail"])), 0);
  });
});
