// Tests for the production wiring stub.
// SLICE 7 PR 1 C6 per audit §4.1.
//
// PR 1 wiring exposes buildProductionDispatchContext + the
// best-effort top-level dispatch wrapper. The wiring's PR 1 stubs:
//   - loadSpec throws (no archetype yet)
//   - startRun returns a synthetic id + logs
//   - loopGuardCheck always allows
//
// These tests pin the stub behavior so PR 2 swap-in is a known
// contract change, not a silent surprise.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { buildProductionDispatchContext } from "../../src/lib/agents/message-trigger-wiring";

// ---------------------------------------------------------------------
// 1. PR 1 stub posture — loadSpec throws, startRun returns synthetic id
// ---------------------------------------------------------------------

describe("buildProductionDispatchContext — PR 1 stub posture", () => {
  test("loadSpec throws with PR 1 stub message", async () => {
    // Pass a fake DB shape — PR 1 wiring constructs the store but
    // doesn't query during the stub-throw path.
    const ctx = buildProductionDispatchContext({} as never);
    await assert.rejects(
      () => ctx.loadSpec("any-archetype"),
      /PR 1 stub|message-typed archetype/i,
    );
  });

  test("startRun returns a synthetic stub run id", async () => {
    const ctx = buildProductionDispatchContext({} as never);
    const runId = await ctx.startRun({
      orgId: "org_a",
      archetypeId: "test-arch",
      spec: { name: "x", description: "y", trigger: { type: "message" }, variables: {}, steps: [] } as never,
      triggerEventId: "fire_1",
      triggerPayload: {},
    });
    assert.match(runId, /^pr1-stub-test-arch-/);
  });

  test("loopGuardCheck always allows in PR 1", async () => {
    const ctx = buildProductionDispatchContext({} as never);
    const result = await ctx.loopGuardCheck({
      trigger: { id: "t1" } as never,
      inbound: {} as never,
    });
    assert.equal(result.blocked, false);
  });

  test("store is a real DrizzleMessageTriggerStore (typecheck)", () => {
    const ctx = buildProductionDispatchContext({} as never);
    assert.ok(ctx.store);
    // The store has the storage contract methods.
    assert.equal(typeof ctx.store.insert, "function");
    assert.equal(typeof ctx.store.listEnabledForWorkspaceChannel, "function");
    assert.equal(typeof ctx.store.recordFire, "function");
  });
});
