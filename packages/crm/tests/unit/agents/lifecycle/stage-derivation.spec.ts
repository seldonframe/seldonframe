// T6 — the pure stage-completion derivation (agent lifecycle ladder shell).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  deriveLifecycleStages,
  isConnectedStageComplete,
  defaultOpenStageId,
  deriveLifecycleStageSummaries,
  type LifecycleStage,
  type LifecycleStageInput,
} from "@/app/(dashboard)/studio/agents/[id]/lifecycle/stage-derivation";

function baseInput(overrides: Partial<LifecycleStageInput> = {}): LifecycleStageInput {
  return {
    hasTemplate: true,
    evalPass: false,
    requiredToolkitCount: 0,
    connectedToolkitCount: 0,
    supervisedRunSucceeded: false,
    supervisedRunExempt: false,
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

  // F-D (2026-07-11, opus-review gate regression): a tool-free template's
  // Run stage counts as complete without ever running.
  test("supervisedRunExempt=true → Run stage complete even though supervisedRunSucceeded is false", () => {
    const stages = deriveLifecycleStages(
      baseInput({ evalPass: true, supervisedRunSucceeded: false, supervisedRunExempt: true }),
    );
    const run = stages.find((s) => s.id === "run")!;
    assert.equal(run.complete, true);
  });

  test("supervisedRunExempt=false, never run → Run stage stays incomplete (strict rule unchanged)", () => {
    const stages = deriveLifecycleStages(
      baseInput({ evalPass: true, supervisedRunSucceeded: false, supervisedRunExempt: false }),
    );
    const run = stages.find((s) => s.id === "run")!;
    assert.equal(run.complete, false);
  });
});

// ─── T4: one-stage-open accordion — pure render logic ──────────────────────
//
// The page restructure (Max: "page way too long") turns the ladder chips
// into the accordion's nav: clicking a chip opens that stage and collapses
// every other stage to a one-line summary row. These two pure functions are
// the render logic behind that.

function stagesFor(overrides: Partial<Record<string, boolean>> = {}): LifecycleStage[] {
  return deriveLifecycleStages(
    baseInput({
      evalPass: overrides.verified ?? false,
      requiredToolkitCount: 1,
      connectedToolkitCount: overrides.connected ? 1 : 0,
      supervisedRunSucceeded: overrides.run ?? false,
      supervisedRunExempt: overrides.exempt ?? false,
      hasDeploymentOrListing: overrides.sell ?? false,
    }),
  );
}

describe("defaultOpenStageId", () => {
  test("opens the FIRST incomplete stage", () => {
    const s = stagesFor({ verified: false, connected: false, run: false, sell: false });
    assert.equal(defaultOpenStageId(s), "verified"); // learned is always complete
  });

  test("skips completed stages to find the next incomplete one", () => {
    const s = stagesFor({ verified: true, connected: true, run: false, sell: false });
    assert.equal(defaultOpenStageId(s), "run");
  });

  test("all complete -> opens the LAST stage (sell)", () => {
    const s = stagesFor({ verified: true, connected: true, run: true, sell: true });
    assert.equal(defaultOpenStageId(s), "sell");
  });

  test("F-D: a tool-free template (exempt) with everything else done -> opens sell, not run", () => {
    const s = stagesFor({ verified: true, connected: true, run: false, exempt: true, sell: false });
    assert.equal(defaultOpenStageId(s), "sell");
  });
});

describe("deriveLifecycleStageSummaries", () => {
  test("no eval run yet, no required toolkits, no run yet, not deployed", () => {
    const out = deriveLifecycleStageSummaries({
      requiredToolkitCount: 0,
      connectedToolkitCount: 0,
      evalPassRate: null,
      supervisedRunStatus: null,
      supervisedRunExempt: false,
      hasDeploymentOrListing: false,
      hasRecording: true,
    });
    assert.equal(out.learned, "Learned from your recording");
    assert.equal(out.verified, "Not run yet");
    assert.equal(out.connected, "No apps required");
    assert.equal(out.run, "Not run yet");
    assert.equal(out.sell, "Not deployed yet");
  });

  test("built from a description (no recording)", () => {
    const out = deriveLifecycleStageSummaries({
      requiredToolkitCount: 0,
      connectedToolkitCount: 0,
      evalPassRate: null,
      supervisedRunStatus: null,
      supervisedRunExempt: false,
      hasDeploymentOrListing: false,
      hasRecording: false,
    });
    assert.equal(out.learned, "Built from your description");
  });

  test("partial toolkit connection, eval rate, failed run, live listing", () => {
    const out = deriveLifecycleStageSummaries({
      requiredToolkitCount: 2,
      connectedToolkitCount: 1,
      evalPassRate: 100,
      supervisedRunStatus: "failed",
      supervisedRunExempt: false,
      hasDeploymentOrListing: true,
      hasRecording: true,
    });
    assert.equal(out.verified, "evals 100%");
    assert.equal(out.connected, "1/2 apps connected");
    assert.equal(out.run, "Last run failed");
    assert.equal(out.sell, "Live");
  });

  test("all required toolkits connected", () => {
    const out = deriveLifecycleStageSummaries({
      requiredToolkitCount: 2,
      connectedToolkitCount: 2,
      evalPassRate: 80,
      supervisedRunStatus: "succeeded",
      supervisedRunExempt: false,
      hasDeploymentOrListing: false,
      hasRecording: true,
    });
    assert.equal(out.connected, "All apps connected");
    assert.equal(out.run, "Last run succeeded");
  });

  test("run in progress", () => {
    const out = deriveLifecycleStageSummaries({
      requiredToolkitCount: 0,
      connectedToolkitCount: 0,
      evalPassRate: null,
      supervisedRunStatus: "running",
      supervisedRunExempt: false,
      hasDeploymentOrListing: false,
      hasRecording: true,
    });
    assert.equal(out.run, "Run in progress");
  });

  test("F-D: supervisedRunExempt overrides the run summary to explain WHY, regardless of status", () => {
    const out = deriveLifecycleStageSummaries({
      requiredToolkitCount: 0,
      connectedToolkitCount: 0,
      evalPassRate: 100,
      supervisedRunStatus: null,
      supervisedRunExempt: true,
      hasDeploymentOrListing: false,
      hasRecording: true,
    });
    assert.equal(out.run, "No connected apps to supervise");
  });
});
