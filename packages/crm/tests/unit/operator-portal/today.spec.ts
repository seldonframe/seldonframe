// tests/unit/operator-portal/today.spec.ts
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { isClosedStage, getPipelineRollup, type PipelineRollupDeps } from "../../../src/lib/operator-portal/today";

describe("isClosedStage", () => {
  test("probability=100 is closed (Won)", async () => {
    assert.equal(await isClosedStage({ name: "Won", probability: 100 }), true);
  });

  test("probability=0 + name contains 'lost' is closed", async () => {
    assert.equal(await isClosedStage({ name: "Lost", probability: 0 }), true);
    assert.equal(await isClosedStage({ name: "LOST", probability: 0 }), true);
    assert.equal(await isClosedStage({ name: "Closed-Lost", probability: 0 }), true);
  });

  test("probability=0 but name does NOT contain 'lost' is open (e.g. 'Lead')", async () => {
    assert.equal(await isClosedStage({ name: "Lead", probability: 0 }), false);
  });

  test("probability=50 is open", async () => {
    assert.equal(await isClosedStage({ name: "Proposal", probability: 50 }), false);
  });
});

describe("getPipelineRollup", () => {
  const stages = [
    { name: "Lead", color: "#gray", probability: 10 },
    { name: "Proposal", color: "#blue", probability: 50 },
    { name: "Won", color: "#green", probability: 100 },
    { name: "Lost", color: "#red", probability: 0 },
  ];

  const makeDeps = (
    dealsOverride: Array<{ stage: string; value: string }>,
    stagesOverride = stages
  ): PipelineRollupDeps => ({
    fetchDeals: async (_orgId) => dealsOverride,
    fetchPipelineStages: async (_orgId) => stagesOverride,
  });

  test("sums value of open-stage deals only", async () => {
    const deps = makeDeps([
      { stage: "Lead", value: "1000.00" },
      { stage: "Proposal", value: "2000.00" },
      { stage: "Won", value: "500.00" },     // closed — excluded
      { stage: "Lost", value: "300.00" },    // closed — excluded
    ]);
    const result = await getPipelineRollup("org-1", deps);
    assert.equal(result.totalOpenValue, 3000);
  });

  test("per-stage breakdown excludes closed stages", async () => {
    const deps = makeDeps([
      { stage: "Lead", value: "1000.00" },
      { stage: "Won", value: "500.00" },
    ]);
    const result = await getPipelineRollup("org-1", deps);
    assert.equal(result.byStage.length, 1);
    assert.equal(result.byStage[0]?.name, "Lead");
    assert.equal(result.byStage[0]?.totalValue, 1000);
    assert.equal(result.byStage[0]?.count, 1);
  });

  test("returns zero total when all deals are closed", async () => {
    const deps = makeDeps([
      { stage: "Won", value: "500.00" },
      { stage: "Lost", value: "300.00" },
    ]);
    const result = await getPipelineRollup("org-1", deps);
    assert.equal(result.totalOpenValue, 0);
    assert.equal(result.byStage.length, 0);
  });

  test("handles empty deals list", async () => {
    const deps = makeDeps([]);
    const result = await getPipelineRollup("org-1", deps);
    assert.equal(result.totalOpenValue, 0);
    assert.equal(result.byStage.length, 0);
  });

  test("unknown stage (not in pipeline) is treated as open", async () => {
    const deps = makeDeps([
      { stage: "CustomStage", value: "750.00" },
    ]);
    const result = await getPipelineRollup("org-1", deps);
    // CustomStage not found in pipeline stages; default to open (probability not known → not closed)
    assert.equal(result.totalOpenValue, 750);
  });
});
