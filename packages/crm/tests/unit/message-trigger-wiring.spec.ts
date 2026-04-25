// Tests for the production wiring after PR 2 C1 + C2 swap-in.
// All four DispatchContext slots wired to production:
//   - store: DrizzleMessageTriggerStore
//   - loadSpec: archetype-registry resolver
//   - startRun: real runtime.startRun
//   - loopGuardCheck: makeProductionLoopGuardCheck
//
// These tests verify the wiring constructs typecheck-correct
// callbacks. Real DB integration is exercised via the integration
// harness (C4) + E2E test (C5).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { buildProductionDispatchContext } from "../../src/lib/agents/message-trigger-wiring";

const FAKE_ORG = "org_test";

describe("buildProductionDispatchContext — fully production-wired", () => {
  test("loadSpec resolves a known archetype from the registry", async () => {
    const ctx = buildProductionDispatchContext({} as never, FAKE_ORG);
    const spec = await ctx.loadSpec("weather-aware-booking");
    assert.ok(spec);
  });

  test("loadSpec throws on unknown archetype", async () => {
    const ctx = buildProductionDispatchContext({} as never, FAKE_ORG);
    await assert.rejects(
      () => ctx.loadSpec("does-not-exist"),
      /unknown archetype|not found/i,
    );
  });

  test("startRun is a function (real runtime invocation tested in E2E)", () => {
    const ctx = buildProductionDispatchContext({} as never, FAKE_ORG);
    assert.equal(typeof ctx.startRun, "function");
  });

  test("loopGuardCheck is a function (real DB query tested in E2E)", () => {
    const ctx = buildProductionDispatchContext({} as never, FAKE_ORG);
    assert.equal(typeof ctx.loopGuardCheck, "function");
  });

  test("store is the production DrizzleMessageTriggerStore", () => {
    const ctx = buildProductionDispatchContext({} as never, FAKE_ORG);
    assert.ok(ctx.store);
    assert.equal(typeof ctx.store.insert, "function");
    assert.equal(typeof ctx.store.listEnabledForWorkspaceChannel, "function");
    assert.equal(typeof ctx.store.recordFire, "function");
  });
});
