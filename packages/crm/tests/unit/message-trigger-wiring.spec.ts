// Tests for the production wiring (post PR 2 C1).
// SLICE 7 PR 1 C6 + PR 2 C1 swap-in.
//
// Wiring exposes buildProductionDispatchContext(client, orgId).
// PR 2 C1 wired the real loop guard. PR 2 C2 will wire real
// startRun + loadSpec.
//
// These tests pin the current stub posture so PR 2 C2 swap-in
// is a known contract change.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { buildProductionDispatchContext } from "../../src/lib/agents/message-trigger-wiring";

const FAKE_ORG = "org_test";

describe("buildProductionDispatchContext — current stub posture", () => {
  test("loadSpec throws (PR 2 C2 will wire real resolver)", async () => {
    const ctx = buildProductionDispatchContext({} as never, FAKE_ORG);
    await assert.rejects(
      () => ctx.loadSpec("any-archetype"),
      /PR 2 C2|archetype resolver/i,
    );
  });

  test("startRun returns a synthetic stub run id (PR 2 C2 swaps to real)", async () => {
    const ctx = buildProductionDispatchContext({} as never, FAKE_ORG);
    const runId = await ctx.startRun({
      orgId: "org_a",
      archetypeId: "test-arch",
      spec: { name: "x", description: "y", trigger: { type: "message" }, variables: {}, steps: [] } as never,
      triggerEventId: "fire_1",
      triggerPayload: {},
    });
    assert.match(runId, /^pr2c1-stub-test-arch-/);
  });

  test("loopGuardCheck is the production wrapper (typecheck — accepts inputs)", () => {
    const ctx = buildProductionDispatchContext({} as never, FAKE_ORG);
    // Just check it's a function — invoking would hit the DB.
    assert.equal(typeof ctx.loopGuardCheck, "function");
  });

  test("store is a real DrizzleMessageTriggerStore", () => {
    const ctx = buildProductionDispatchContext({} as never, FAKE_ORG);
    assert.ok(ctx.store);
    assert.equal(typeof ctx.store.insert, "function");
    assert.equal(typeof ctx.store.listEnabledForWorkspaceChannel, "function");
    assert.equal(typeof ctx.store.recordFire, "function");
  });
});
