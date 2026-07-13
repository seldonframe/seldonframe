// Email-agent slice (Part B1, Task 5) — the composio inbound-trigger bridge
// now fans EVERY composio.* event to BOTH dispatchers: the existing archetype
// dispatch (dispatchEventToDeployedAgents) AND the new record-compiled
// deployments dispatch (dispatchComposioEventToDeployments). Drives the
// extracted, DI'd handleComposioBridgeEvent directly with fakes — no bus, no
// DB (mirrors missed-call-textback.spec.ts's "DI'd core, no mock.module" note).

import { test } from "node:test";
import assert from "node:assert/strict";
import { handleComposioBridgeEvent, type ComposioBridgeDeps } from "../../../src/lib/events/listeners";
import type { AgentDispatchResult } from "../../../src/lib/agents/dispatcher";

/** A minimal, correctly-typed AgentDispatchResult — every
 *  `dispatchToArchetypes` fake below returns this instead of `void`, so no
 *  `as ComposioBridgeDeps[...]` cast is needed anywhere in this file
 *  (verify-gate FIX 5: those casts were masking a type mismatch). */
function emptyDispatchResult(): AgentDispatchResult {
  return { attempted: 0, started: [], failed: [], blockedByLimit: [] };
}

function fakeDeps(overrides: Partial<ComposioBridgeDeps> = {}): ComposioBridgeDeps {
  return {
    dispatchToArchetypes: async () => emptyDispatchResult(),
    dispatchToDeployments: async () => ({ attempted: 0, started: [], skipped: [] }),
    ...overrides,
  };
}

test("both dispatchers are called for a composio.* event with a resolvable orgId", async () => {
  let archetypeCalled = false;
  let deploymentsCalled: unknown = null;
  const deps = fakeDeps({
    dispatchToArchetypes: async () => {
      archetypeCalled = true;
      return emptyDispatchResult();
    },
    dispatchToDeployments: async (args) => {
      deploymentsCalled = args;
      return { attempted: 1, started: ["dep_1"], skipped: [] };
    },
  });

  await handleComposioBridgeEvent(deps, {
    type: "composio.gmail.new_message",
    data: { _composio: { orgId: "org_1" }, messageId: "msg_1" },
  });

  assert.equal(archetypeCalled, true);
  assert.deepEqual(deploymentsCalled, {
    orgId: "org_1",
    eventType: "composio.gmail.new_message",
    payload: { _composio: { orgId: "org_1" }, messageId: "msg_1" },
  });
});

test("non-composio events are ignored by both dispatchers", async () => {
  let called = false;
  const deps = fakeDeps({
    dispatchToArchetypes: async () => {
      called = true;
      return emptyDispatchResult();
    },
    dispatchToDeployments: async () => {
      called = true;
      return { attempted: 0, started: [], skipped: [] };
    },
  });

  await handleComposioBridgeEvent(deps, { type: "booking.created", data: {} });
  assert.equal(called, false);
});

test("no resolvable orgId -> neither dispatcher is called", async () => {
  let called = false;
  const deps = fakeDeps({
    dispatchToArchetypes: async () => {
      called = true;
      return emptyDispatchResult();
    },
    dispatchToDeployments: async () => {
      called = true;
      return { attempted: 0, started: [], skipped: [] };
    },
  });

  await handleComposioBridgeEvent(deps, { type: "composio.gmail.new_message", data: {} });
  assert.equal(called, false);
});

test("dispatchToDeployments throwing does NOT break the archetype dispatch (or the handler)", async () => {
  let archetypeCalled = false;
  const deps = fakeDeps({
    dispatchToArchetypes: async () => {
      archetypeCalled = true;
      return emptyDispatchResult();
    },
    dispatchToDeployments: async () => {
      throw new Error("deployments dispatch down");
    },
  });

  await assert.doesNotReject(
    handleComposioBridgeEvent(deps, {
      type: "composio.gmail.new_message",
      data: { _composio: { orgId: "org_1" } },
    }),
  );
  assert.equal(archetypeCalled, true);
});

test("dispatchToArchetypes throwing does NOT prevent the deployments dispatch from running", async () => {
  let deploymentsCalled = false;
  const deps = fakeDeps({
    dispatchToArchetypes: async () => {
      throw new Error("archetype dispatch down");
    },
    dispatchToDeployments: async () => {
      deploymentsCalled = true;
      return { attempted: 0, started: [], skipped: [] };
    },
  });

  await assert.doesNotReject(
    handleComposioBridgeEvent(deps, {
      type: "composio.gmail.new_message",
      data: { _composio: { orgId: "org_1" } },
    }),
  );
  assert.equal(deploymentsCalled, true);
});
