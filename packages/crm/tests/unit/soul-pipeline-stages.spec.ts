// Unit tests for normalizeSoulPipelineStages (B6).
//
// Pipeline re-seeding from Soul is a small, pure transformation: take a
// loose array of {name, order, description} and emit a strict
// PipelineStage[] with colors + probabilities filled in. The DB write
// path is exercised in integration tests; here we lock the math.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { normalizeSoulPipelineStages } from "@/lib/soul/apply-pipeline-stages";

describe("normalizeSoulPipelineStages — null and empty inputs", () => {
  test("returns null for non-array input", () => {
    assert.equal(normalizeSoulPipelineStages(null), null);
    assert.equal(normalizeSoulPipelineStages(undefined), null);
    assert.equal(normalizeSoulPipelineStages("not an array"), null);
    assert.equal(normalizeSoulPipelineStages({}), null);
  });

  test("returns null for empty array", () => {
    assert.equal(normalizeSoulPipelineStages([]), null);
  });

  test("returns null when every entry is missing a name", () => {
    assert.equal(
      normalizeSoulPipelineStages([{ order: 1 }, { description: "x" }]),
      null
    );
  });
});

describe("normalizeSoulPipelineStages — SeldonFrame case", () => {
  // The exact Soul we submitted for the SeldonFrame workspace.
  const soulStages = [
    { name: "Lead", order: 1, description: "Submitted intake" },
    { name: "Demo Scheduled", order: 2, description: "Booked demo" },
    { name: "Trial Active", order: 3, description: "Created workspace" },
    { name: "Growth Converted", order: 4, description: "Paid Growth" },
    { name: "Scale Converted", order: 5, description: "Paid Scale" },
    { name: "Churned", order: 6, description: "Canceled" },
  ];

  test("produces 6 stages preserving order", () => {
    const result = normalizeSoulPipelineStages(soulStages);
    assert.ok(result, "must not be null");
    assert.equal(result!.length, 6);
    assert.deepEqual(
      result!.map((s) => s.name),
      ["Lead", "Demo Scheduled", "Trial Active", "Growth Converted", "Scale Converted", "Churned"]
    );
  });

  test("Churned stage gets probability 0 (lost-class)", () => {
    const result = normalizeSoulPipelineStages(soulStages)!;
    const churned = result[result.length - 1];
    assert.equal(churned.name, "Churned");
    assert.equal(churned.probability, 0);
  });

  test("first stage probability = 10", () => {
    const result = normalizeSoulPipelineStages(soulStages)!;
    assert.equal(result[0].probability, 10);
  });

  test("close stage (Scale Converted) gets probability 100", () => {
    const result = normalizeSoulPipelineStages(soulStages)!;
    const scale = result.find((s) => s.name === "Scale Converted");
    assert.equal(scale?.probability, 100);
  });

  test("every stage gets a non-empty hex color", () => {
    const result = normalizeSoulPipelineStages(soulStages)!;
    for (const stage of result) {
      assert.match(stage.color, /^#[0-9a-f]{6}$/i, `stage ${stage.name} bad color`);
    }
  });
});

describe("normalizeSoulPipelineStages — order is honored", () => {
  test("entries sort by `order` field, not array position", () => {
    const stages = [
      { name: "C", order: 3 },
      { name: "A", order: 1 },
      { name: "B", order: 2 },
    ];
    const result = normalizeSoulPipelineStages(stages)!;
    assert.deepEqual(
      result.map((s) => s.name),
      ["A", "B", "C"]
    );
  });

  test("missing order falls back to array index", () => {
    const stages = [{ name: "First" }, { name: "Second" }, { name: "Third" }];
    const result = normalizeSoulPipelineStages(stages)!;
    assert.deepEqual(
      result.map((s) => s.name),
      ["First", "Second", "Third"]
    );
  });
});

describe("normalizeSoulPipelineStages — terminal-stage heuristics", () => {
  test("'Won' classifies as 100, 'Lost' as 0", () => {
    const result = normalizeSoulPipelineStages([
      { name: "Lead", order: 1 },
      { name: "Won", order: 2 },
      { name: "Lost", order: 3 },
    ])!;
    assert.equal(result.find((s) => s.name === "Won")?.probability, 100);
    assert.equal(result.find((s) => s.name === "Lost")?.probability, 0);
  });

  test("'Canceled' classifies as 0", () => {
    const result = normalizeSoulPipelineStages([
      { name: "Open", order: 1 },
      { name: "Closed Won", order: 2 },
      { name: "Canceled", order: 3 },
    ])!;
    assert.equal(result.find((s) => s.name === "Canceled")?.probability, 0);
  });
});

describe("normalizeSoulPipelineStages — explicit overrides", () => {
  test("operator-supplied color is preserved", () => {
    const result = normalizeSoulPipelineStages([
      { name: "A", order: 1, color: "#abc123" },
    ])!;
    assert.equal(result[0].color, "#abc123");
  });

  test("operator-supplied probability is preserved", () => {
    const result = normalizeSoulPipelineStages([
      { name: "A", order: 1, probability: 42 },
    ])!;
    assert.equal(result[0].probability, 42);
  });
});
