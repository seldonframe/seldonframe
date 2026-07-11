// T6 — the pure stage-completion derivation (agent lifecycle ladder shell).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  deriveLifecycleStages,
  isConnectedStageComplete,
  type LifecycleStageInput,
} from "@/app/(dashboard)/studio/agents/[id]/lifecycle/stage-derivation";

function baseInput(overrides: Partial<LifecycleStageInput> = {}): LifecycleStageInput {
  return {
    hasTemplate: true,
    evalPass: false,
    requiredToolkitCount: 0,
    connectedToolkitCount: 0,
    supervisedRunSucceeded: false,
    hasDeploymentOrListing: false,
    ...overrides,
  };
}

describe("isConnectedStageComplete", () => {
  test("zero required toolkits → vacuously complete", () => {
    assert.equal(
      isConnectedStageComplete({ requiredToolkitCount: 0, connectedToolkitCount: 0 }),
      true,
    );
  });

  test("required > connected → not complete", () => {
    assert.equal(
      isConnectedStageComplete({ requiredToolkitCount: 2, connectedToolkitCount: 1 }),
      false,
    );
  });

  test("connected meets required → complete", () => {
    assert.equal(
      isConnectedStageComplete({ requiredToolkitCount: 2, connectedToolkitCount: 2 }),
      true,
    );
  });
});

describe("deriveLifecycleStages", () => {
  test("returns all five stages in fixed order", () => {
    const stages = deriveLifecycleStages(baseInput());
    assert.deepEqual(
      stages.map((s) => s.id),
      ["learned", "verified", "connected", "run", "sell"],
    );
  });

  test("nothing done yet → only Learned complete (template exists)", () => {
    const stages = deriveLifecycleStages(baseInput());
    const byId = Object.fromEntries(stages.map((s) => [s.id, s.complete]));
    assert.deepEqual(byId, {
      learned: true,
      verified: false,
      connected: true, // vacuous — no toolkits required
      run: false,
      sell: false,
    });
  });

  test("everything done → all five complete", () => {
    const stages = deriveLifecycleStages(
      baseInput({
        evalPass: true,
        requiredToolkitCount: 2,
        connectedToolkitCount: 2,
        supervisedRunSucceeded: true,
        hasDeploymentOrListing: true,
      }),
    );
    assert.ok(stages.every((s) => s.complete));
  });

  test("required toolkits present but under-connected → Connected stage incomplete only", () => {
    const stages = deriveLifecycleStages(
      baseInput({
        evalPass: true,
        requiredToolkitCount: 3,
        connectedToolkitCount: 1,
        supervisedRunSucceeded: true,
        hasDeploymentOrListing: true,
      }),
    );
    const byId = Object.fromEntries(stages.map((s) => [s.id, s.complete]));
    assert.equal(byId.connected, false);
    assert.equal(byId.verified, true);
    assert.equal(byId.run, true);
    assert.equal(byId.sell, true);
  });

  test("hasTemplate false → Learned reads incomplete (defensive; page never renders this state today)", () => {
    const stages = deriveLifecycleStages(baseInput({ hasTemplate: false }));
    assert.equal(stages[0].complete, false);
  });
});
