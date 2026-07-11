// TDD for T4 (page restructure) — the accordion's pure render logic:
//   - defaultOpenStageId: which stage opens by default (first incomplete).
//   - deriveLifecycleStageSummaries: the one-line "key fact" shown on a
//     collapsed stage's summary row.
// Both are pure functions of already-loaded page data — no I/O, no React.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  deriveLifecycleStages,
  defaultOpenStageId,
  deriveLifecycleStageSummaries,
  type LifecycleStage,
} from "./stage-derivation";

function stages(overrides: Partial<Record<string, boolean>> = {}): LifecycleStage[] {
  const all = deriveLifecycleStages({
    hasTemplate: true,
    evalPass: overrides.verified ?? false,
    requiredToolkitCount: 1,
    connectedToolkitCount: overrides.connected ? 1 : 0,
    supervisedRunSucceeded: overrides.run ?? false,
    hasDeploymentOrListing: overrides.sell ?? false,
  });
  return all;
}

// ─── defaultOpenStageId ────────────────────────────────────────────────────

test("defaultOpenStageId: opens the FIRST incomplete stage", () => {
  const s = stages({ verified: false, connected: false, run: false, sell: false });
  assert.equal(defaultOpenStageId(s), "verified"); // learned is always complete
});

test("defaultOpenStageId: skips completed stages to find the next incomplete one", () => {
  const s = stages({ verified: true, connected: true, run: false, sell: false });
  assert.equal(defaultOpenStageId(s), "run");
});

test("defaultOpenStageId: all complete -> opens the LAST stage (sell)", () => {
  const s = stages({ verified: true, connected: true, run: true, sell: true });
  assert.equal(defaultOpenStageId(s), "sell");
});

// ─── deriveLifecycleStageSummaries ─────────────────────────────────────────

test("summaries: no eval run yet, no required toolkits, no run yet, not deployed", () => {
  const out = deriveLifecycleStageSummaries({
    requiredToolkitCount: 0,
    connectedToolkitCount: 0,
    evalPassRate: null,
    supervisedRunStatus: null,
    hasDeploymentOrListing: false,
    hasRecording: true,
  });
  assert.equal(out.learned, "Learned from your recording");
  assert.equal(out.verified, "Not run yet");
  assert.equal(out.connected, "No apps required");
  assert.equal(out.run, "Not run yet");
  assert.equal(out.sell, "Not deployed yet");
});

test("summaries: built from a description (no recording)", () => {
  const out = deriveLifecycleStageSummaries({
    requiredToolkitCount: 0,
    connectedToolkitCount: 0,
    evalPassRate: null,
    supervisedRunStatus: null,
    hasDeploymentOrListing: false,
    hasRecording: false,
  });
  assert.equal(out.learned, "Built from your description");
});

test("summaries: partial toolkit connection, eval rate, failed run, live listing", () => {
  const out = deriveLifecycleStageSummaries({
    requiredToolkitCount: 2,
    connectedToolkitCount: 1,
    evalPassRate: 100,
    supervisedRunStatus: "failed",
    hasDeploymentOrListing: true,
    hasRecording: true,
  });
  assert.equal(out.verified, "evals 100%");
  assert.equal(out.connected, "1/2 apps connected");
  assert.equal(out.run, "Last run failed");
  assert.equal(out.sell, "Live");
});

test("summaries: all required toolkits connected", () => {
  const out = deriveLifecycleStageSummaries({
    requiredToolkitCount: 2,
    connectedToolkitCount: 2,
    evalPassRate: 80,
    supervisedRunStatus: "succeeded",
    hasDeploymentOrListing: false,
    hasRecording: true,
  });
  assert.equal(out.connected, "All apps connected");
  assert.equal(out.run, "Last run succeeded");
});

test("summaries: run in progress", () => {
  const out = deriveLifecycleStageSummaries({
    requiredToolkitCount: 0,
    connectedToolkitCount: 0,
    evalPassRate: null,
    supervisedRunStatus: "running",
    hasDeploymentOrListing: false,
    hasRecording: true,
  });
  assert.equal(out.run, "Run in progress");
});
