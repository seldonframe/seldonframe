// Tests for workflow.external_state.evaluated event emission.
// SLICE 6 PR 2 C4 per audit §4.5 + G-6-6 A.
//
// makeBranchObservabilityHook(storage, now) returns an onBranchEvaluated
// callback that appends workflow.external_state.evaluated events (for
// external_state branches) or workflow.branch.evaluated events (for
// predicate branches; included for symmetry + future archetype-run
// surface).
//
// Secrets never appear in the payload — resolved values live only in
// the dispatcher's in-memory request. Verified explicitly.

import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { makeBranchObservabilityHook } from "../../src/lib/workflow/branch-observability";
import type { EventLogInput, RuntimeStorage } from "../../src/lib/workflow/types";

// ---------------------------------------------------------------------
// In-memory storage fake
// ---------------------------------------------------------------------

function makeFakeStorage(): RuntimeStorage & { emitted: EventLogInput[] } {
  const emitted: EventLogInput[] = [];
  return {
    emitted,
    async appendEventLog(input: EventLogInput) {
      emitted.push(input);
      return `evt_${emitted.length}`;
    },
    // Unused by the observability hook — noop implementations keep
    // TypeScript happy.
    async createRun() { return "x"; },
    async getRun() { return null; },
    async updateRun() {},
    async appendStepResult() {},
    async findUnresolvedWaitsForEvent() { return []; },
    async registerWait() { return "w"; },
    async claimWait() { return null; },
    async findDueWaits() { return []; },
    async resumeWaitById() {},
  } as unknown as RuntimeStorage & { emitted: EventLogInput[] };
}

const FIXED_NOW = new Date("2026-04-24T12:00:00Z");

// ---------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------

describe("makeBranchObservabilityHook — external_state events", () => {
  let storage: ReturnType<typeof makeFakeStorage>;

  beforeEach(() => {
    storage = makeFakeStorage();
  });

  test("emits workflow.external_state.evaluated on external_state branches", async () => {
    const hook = makeBranchObservabilityHook({
      storage,
      orgId: "org_acme",
      now: () => FIXED_NOW,
    });
    hook({
      runId: "run_test",
      stepId: "check_weather",
      conditionType: "external_state",
      url: "https://api.weather.com/v2/current",
      method: "GET",
      responseStatus: 200,
      matched: true,
      elapsedMs: 145,
    });

    // Hook fires async via microtask — await a tick.
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(storage.emitted.length, 1);
    const evt = storage.emitted[0];
    assert.equal(evt.eventType, "workflow.external_state.evaluated");
    assert.equal(evt.orgId, "org_acme");
    assert.equal(evt.payload.runId, "run_test");
    assert.equal(evt.payload.stepId, "check_weather");
    assert.equal(evt.payload.url, "https://api.weather.com/v2/current");
    assert.equal(evt.payload.method, "GET");
    assert.equal(evt.payload.responseStatus, 200);
    assert.equal(evt.payload.matched, true);
    assert.equal(evt.payload.elapsedMs, 145);
  });

  test("emits event with error field when evaluation failed", async () => {
    const hook = makeBranchObservabilityHook({
      storage,
      orgId: "org_acme",
      now: () => FIXED_NOW,
    });
    hook({
      runId: "run_test",
      stepId: "check_inventory",
      conditionType: "external_state",
      url: "https://api.shopify.com/products",
      method: "GET",
      responseStatus: 500,
      matched: false,
      elapsedMs: 3200,
      error: "http 500 response",
    });
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(storage.emitted.length, 1);
    const evt = storage.emitted[0];
    assert.equal(evt.payload.matched, false);
    assert.equal(evt.payload.error, "http 500 response");
  });

  test("emits workflow.branch.evaluated on predicate branches", async () => {
    const hook = makeBranchObservabilityHook({
      storage,
      orgId: "org_acme",
      now: () => FIXED_NOW,
    });
    hook({
      runId: "run_test",
      stepId: "route_vip",
      conditionType: "predicate",
      matched: true,
      elapsedMs: 0,
    });
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(storage.emitted.length, 1);
    const evt = storage.emitted[0];
    assert.equal(evt.eventType, "workflow.branch.evaluated");
    assert.equal(evt.payload.conditionType, "predicate");
    assert.equal(evt.payload.matched, true);
    // No url/method/responseStatus for predicate branches.
    assert.equal(evt.payload.url, undefined);
    assert.equal(evt.payload.method, undefined);
    assert.equal(evt.payload.responseStatus, undefined);
  });

  test("storage failure is swallowed (observability must not fail the branch)", async () => {
    const failingStorage = {
      ...makeFakeStorage(),
      async appendEventLog() {
        throw new Error("db is down");
      },
    } as unknown as RuntimeStorage;
    const hook = makeBranchObservabilityHook({
      storage: failingStorage,
      orgId: "org_acme",
      now: () => FIXED_NOW,
    });
    // Must not throw.
    hook({
      runId: "run_test",
      stepId: "s1",
      conditionType: "external_state",
      url: "https://api",
      method: "GET",
      responseStatus: 200,
      matched: true,
      elapsedMs: 100,
    });
    // Let the microtask run + catch.
    await new Promise((resolve) => setImmediate(resolve));
    // No assertion target beyond "didn't throw"; success = test reaches here.
    assert.ok(true);
  });
});

describe("makeBranchObservabilityHook — secret safety", () => {
  test("payload never includes auth headers / bodies", async () => {
    const storage = makeFakeStorage();
    const hook = makeBranchObservabilityHook({
      storage,
      orgId: "org_acme",
      now: () => FIXED_NOW,
    });
    // Hook only receives the allowlist fields (runId/stepId/url/method/
    // responseStatus/matched/elapsedMs/error?). Request headers/bodies
    // never reach the hook — dispatchBranch only passes the allowlist.
    // This test pins the contract: the payload shape matches the
    // allowlist + nothing more.
    hook({
      runId: "run_test",
      stepId: "s1",
      conditionType: "external_state",
      url: "https://api.example.com/users/123",
      method: "POST",
      responseStatus: 200,
      matched: true,
      elapsedMs: 100,
    });
    await new Promise((resolve) => setImmediate(resolve));
    const payload = storage.emitted[0].payload;
    const allowlist = new Set([
      "runId",
      "stepId",
      "conditionType",
      "url",
      "method",
      "responseStatus",
      "matched",
      "elapsedMs",
      "error",
    ]);
    for (const key of Object.keys(payload)) {
      assert.ok(
        allowlist.has(key),
        `payload key "${key}" is not in the allowlist — secret leak risk`,
      );
    }
  });
});
