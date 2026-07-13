// Email-agent slice (Part B1) — dispatchComposioEventToDeployments: fan a
// fired composio.* event (e.g. composio.gmail.new_message) out to the
// record-compiled deployments whose trigger matches, running each via the
// injected agentic-turn seam (prod = runStatelessAgentTurn, testMode:false —
// the same seam the action-only event-agent path uses). Idempotent per
// (deploymentId, messageId) so a webhook redelivery never double-runs.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dispatchComposioEventToDeployments,
  type ComposioEventDeploymentMatch,
  type DispatchComposioEventDeps,
} from "../../../src/lib/deployments/composio-event-dispatch";

const ORG = "org_1";
const EVENT = "composio.gmail.new_message";

function match(overrides: Partial<ComposioEventDeploymentMatch> = {}): ComposioEventDeploymentMatch {
  return {
    deploymentId: "dep_1",
    orgId: ORG,
    agentKey: "tmpl_1",
    channel: "email",
    blueprint: { capabilities: [] } as never,
    ...overrides,
  };
}

function fakeDeps(overrides: Partial<DispatchComposioEventDeps> = {}): DispatchComposioEventDeps {
  return {
    listMatchingDeployments: async () => [match()],
    runAgenticTurn: async () => ({ ok: true }),
    isAlreadyProcessed: async () => false,
    markProcessed: async () => {},
    ...overrides,
  };
}

test("match fires runAgenticTurn for the deployment", async () => {
  const calls: unknown[] = [];
  const deps = fakeDeps({
    runAgenticTurn: async (args) => {
      calls.push(args);
      return { ok: true };
    },
  });

  const r = await dispatchComposioEventToDeployments(deps, {
    orgId: ORG,
    eventType: EVENT,
    payload: { messageId: "msg_1" },
  });

  assert.equal(r.attempted, 1);
  assert.deepEqual(r.started, ["dep_1"]);
  assert.deepEqual(r.skipped, []);
  assert.equal(calls.length, 1);
});

test("no matching deployments -> attempted:0", async () => {
  const deps = fakeDeps({ listMatchingDeployments: async () => [] });
  const r = await dispatchComposioEventToDeployments(deps, {
    orgId: ORG,
    eventType: EVENT,
    payload: {},
  });
  assert.deepEqual(r, { attempted: 0, started: [], skipped: [] });
});

test("redelivery with the same messageId is skipped (idempotent)", async () => {
  let calls = 0;
  const deps = fakeDeps({
    isAlreadyProcessed: async (deploymentId, messageId) => {
      assert.equal(deploymentId, "dep_1");
      assert.equal(messageId, "msg_1");
      return true;
    },
    runAgenticTurn: async () => {
      calls += 1;
      return { ok: true };
    },
  });

  const r = await dispatchComposioEventToDeployments(deps, {
    orgId: ORG,
    eventType: EVENT,
    payload: { messageId: "msg_1" },
  });

  assert.equal(calls, 0);
  assert.deepEqual(r.skipped, ["dep_1"]);
  assert.deepEqual(r.started, []);
});

test("missing messageId -> still runs (defensive) but does not mark/dedupe", async () => {
  let markCalled = false;
  const deps = fakeDeps({
    markProcessed: async () => {
      markCalled = true;
    },
  });

  const r = await dispatchComposioEventToDeployments(deps, {
    orgId: ORG,
    eventType: EVENT,
    payload: {},
  });

  assert.deepEqual(r.started, ["dep_1"]);
  assert.equal(markCalled, false);
});

test("per-deployment error is isolated — one bad deployment never blocks the rest", async () => {
  const deps = fakeDeps({
    listMatchingDeployments: async () => [match({ deploymentId: "dep_bad" }), match({ deploymentId: "dep_ok" })],
    runAgenticTurn: async (args) => {
      if (args.deploymentId === "dep_bad") throw new Error("boom");
      return { ok: true };
    },
  });

  const r = await dispatchComposioEventToDeployments(deps, {
    orgId: ORG,
    eventType: EVENT,
    payload: { messageId: "msg_2" },
  });

  assert.deepEqual(r.started.sort(), ["dep_bad", "dep_ok"].sort());
  // dep_bad threw inside runAgenticTurn — dispatch never throws, and dep_ok still ran.
});

test("listMatchingDeployments throwing -> never throws, returns empty result", async () => {
  const deps = fakeDeps({
    listMatchingDeployments: async () => {
      throw new Error("db down");
    },
  });
  const r = await dispatchComposioEventToDeployments(deps, {
    orgId: ORG,
    eventType: EVENT,
    payload: {},
  });
  assert.deepEqual(r, { attempted: 0, started: [], skipped: [] });
});

test("marks processed after a successful run (so the next redelivery is skipped)", async () => {
  const marked: Array<{ deploymentId: string; messageId: string }> = [];
  const deps = fakeDeps({
    markProcessed: async (deploymentId, messageId) => {
      marked.push({ deploymentId, messageId });
    },
  });
  await dispatchComposioEventToDeployments(deps, {
    orgId: ORG,
    eventType: EVENT,
    payload: { messageId: "msg_3" },
  });
  assert.deepEqual(marked, [{ deploymentId: "dep_1", messageId: "msg_3" }]);
});
