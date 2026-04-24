// Tests for the new BranchStep primitive.
// SLICE 6 PR 1 C1 per audit §3.1 + gate G-6-7 + G-6-8.
//
// C1 ships:
//   1. BranchStepSchema with type="branch", 2-way successors
//      (on_match_next, on_no_match_next), condition as
//      ConditionSchema discriminated union.
//   2. ConditionSchema — C1 populates the "predicate" branch only;
//      C2 adds "external_state" as the second branch.
//   3. Graph-ref validator extension: both next-pointers on a branch
//      step must resolve to declared step ids.
//   4. Cycle detection: walk all paths from root; reject cyclic
//      step graphs at synthesis time (G-6-8 A).
//
// Cross-ref Zod validator calibration (L-17 2-datapoint rule applied):
// Expected multiplier for this commit ~2.5-3.0x.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  validateAgentSpec,
  type BlockRegistry,
  type EventRegistry,
} from "../../src/lib/agents/validator";

const emptyBlockRegistry: BlockRegistry = {
  tools: new Map(),
  producesByBlock: new Map(),
};
const emptyEventRegistry: EventRegistry = { events: [] };

function baseSpec(steps: unknown[]): unknown {
  return {
    id: "test",
    name: "t",
    description: "t",
    trigger: { type: "event", event: "test.event" },
    variables: {},
    steps,
  };
}

function issuesOn(spec: unknown, pathPrefix: string) {
  const res = validateAgentSpec(
    spec,
    emptyBlockRegistry,
    { events: [{ type: "test.event", fields: {} }] } as EventRegistry,
  );
  return res.filter((i) => i.path === pathPrefix || i.path.startsWith(`${pathPrefix}.`));
}

// ---------------------------------------------------------------------
// 1. BranchStepSchema happy paths
// ---------------------------------------------------------------------

describe("BranchStepSchema — accepts happy-path internal-predicate branch", () => {
  test("branch with predicate condition + both next pointers", () => {
    const spec = baseSpec([
      {
        id: "b1",
        type: "branch",
        condition: {
          type: "predicate",
          predicate: { kind: "field_equals", field: "tier", value: "VIP" },
        },
        on_match_next: "yes",
        on_no_match_next: "no",
      },
      { id: "yes", type: "wait", seconds: 1, next: null },
      { id: "no", type: "wait", seconds: 1, next: null },
    ]);
    const res = validateAgentSpec(spec, emptyBlockRegistry, { events: [{ type: "test.event", fields: {} }] });
    const stepIssues = res.filter((i) => i.stepId === "b1");
    assert.equal(stepIssues.length, 0, `unexpected issues: ${JSON.stringify(stepIssues)}`);
  });

  test("branch with nullable terminal successor (on_match_next = null)", () => {
    const spec = baseSpec([
      {
        id: "b1",
        type: "branch",
        condition: {
          type: "predicate",
          predicate: { kind: "field_exists", field: "id" },
        },
        on_match_next: null,
        on_no_match_next: "retry",
      },
      { id: "retry", type: "wait", seconds: 1, next: null },
    ]);
    const res = validateAgentSpec(spec, emptyBlockRegistry, { events: [{ type: "test.event", fields: {} }] });
    const stepIssues = res.filter((i) => i.stepId === "b1");
    assert.equal(stepIssues.length, 0);
  });

  test("branch with both successors null (both terminal)", () => {
    const spec = baseSpec([
      {
        id: "b1",
        type: "branch",
        condition: {
          type: "predicate",
          predicate: { kind: "field_exists", field: "x" },
        },
        on_match_next: null,
        on_no_match_next: null,
      },
    ]);
    const res = validateAgentSpec(spec, emptyBlockRegistry, { events: [{ type: "test.event", fields: {} }] });
    const stepIssues = res.filter((i) => i.stepId === "b1");
    assert.equal(stepIssues.length, 0);
  });

  test("branch with same next on both sides (no-op branch)", () => {
    const spec = baseSpec([
      {
        id: "b1",
        type: "branch",
        condition: {
          type: "predicate",
          predicate: { kind: "field_exists", field: "x" },
        },
        on_match_next: "common",
        on_no_match_next: "common",
      },
      { id: "common", type: "wait", seconds: 1, next: null },
    ]);
    const res = validateAgentSpec(spec, emptyBlockRegistry, { events: [{ type: "test.event", fields: {} }] });
    const stepIssues = res.filter((i) => i.stepId === "b1");
    assert.equal(stepIssues.length, 0);
  });
});

// ---------------------------------------------------------------------
// 2. Schema-shape rejections
// ---------------------------------------------------------------------

describe("BranchStepSchema — rejects malformed shapes", () => {
  test("rejects missing on_match_next", () => {
    const spec = baseSpec([
      {
        id: "b1",
        type: "branch",
        condition: {
          type: "predicate",
          predicate: { kind: "field_exists", field: "x" },
        },
        on_no_match_next: null,
      },
    ]);
    const res = validateAgentSpec(spec, emptyBlockRegistry, { events: [{ type: "test.event", fields: {} }] });
    assert.ok(res.length > 0);
  });

  test("rejects missing on_no_match_next", () => {
    const spec = baseSpec([
      {
        id: "b1",
        type: "branch",
        condition: {
          type: "predicate",
          predicate: { kind: "field_exists", field: "x" },
        },
        on_match_next: null,
      },
    ]);
    const res = validateAgentSpec(spec, emptyBlockRegistry, { events: [{ type: "test.event", fields: {} }] });
    assert.ok(res.length > 0);
  });

  test("rejects missing condition", () => {
    const spec = baseSpec([
      {
        id: "b1",
        type: "branch",
        on_match_next: null,
        on_no_match_next: null,
      },
    ]);
    const res = validateAgentSpec(spec, emptyBlockRegistry, { events: [{ type: "test.event", fields: {} }] });
    assert.ok(res.length > 0);
  });

  test("rejects condition with unknown type discriminator", () => {
    const spec = baseSpec([
      {
        id: "b1",
        type: "branch",
        condition: { type: "__unknown__", x: 1 },
        on_match_next: null,
        on_no_match_next: null,
      },
    ]);
    const res = validateAgentSpec(spec, emptyBlockRegistry, { events: [{ type: "test.event", fields: {} }] });
    assert.ok(res.length > 0);
  });

  test("rejects predicate condition with malformed predicate shape", () => {
    const spec = baseSpec([
      {
        id: "b1",
        type: "branch",
        condition: {
          type: "predicate",
          predicate: { kind: "__unknown_predicate_kind__" },
        },
        on_match_next: null,
        on_no_match_next: null,
      },
    ]);
    const res = validateAgentSpec(spec, emptyBlockRegistry, { events: [{ type: "test.event", fields: {} }] });
    assert.ok(res.length > 0);
  });

  test("accepts external_state condition (shipped in C2)", () => {
    const spec = baseSpec([
      {
        id: "b1",
        type: "branch",
        condition: {
          type: "external_state",
          http: { url: "https://api.example.com" },
          response_path: "data.x",
          operator: "equals",
          expected: true,
        },
        on_match_next: null,
        on_no_match_next: null,
      },
    ]);
    const res = validateAgentSpec(spec, emptyBlockRegistry, { events: [{ type: "test.event", fields: {} }] });
    const malformed = res.filter((i) => i.code === "spec_malformed" && i.stepId === "b1");
    assert.equal(malformed.length, 0, `expected external_state to validate post-C2; got ${JSON.stringify(malformed)}`);
  });
});

// ---------------------------------------------------------------------
// 3. Graph-ref validator extension (multi-successor)
// ---------------------------------------------------------------------

describe("BranchStep — graph-ref validator checks both successors", () => {
  test("rejects unknown step id in on_match_next", () => {
    const spec = baseSpec([
      {
        id: "b1",
        type: "branch",
        condition: {
          type: "predicate",
          predicate: { kind: "field_exists", field: "x" },
        },
        on_match_next: "nonexistent",
        on_no_match_next: null,
      },
    ]);
    const res = validateAgentSpec(spec, emptyBlockRegistry, { events: [{ type: "test.event", fields: {} }] });
    const issue = res.find((i) => i.code === "unknown_step_next" && i.stepId === "b1");
    assert.ok(issue, `expected unknown_step_next on b1; got ${JSON.stringify(res)}`);
  });

  test("rejects unknown step id in on_no_match_next", () => {
    const spec = baseSpec([
      {
        id: "b1",
        type: "branch",
        condition: {
          type: "predicate",
          predicate: { kind: "field_exists", field: "x" },
        },
        on_match_next: null,
        on_no_match_next: "nonexistent",
      },
    ]);
    const res = validateAgentSpec(spec, emptyBlockRegistry, { events: [{ type: "test.event", fields: {} }] });
    const issue = res.find((i) => i.code === "unknown_step_next" && i.stepId === "b1");
    assert.ok(issue);
  });

  test("reports both unknown_step_next issues when both sides are bad", () => {
    const spec = baseSpec([
      {
        id: "b1",
        type: "branch",
        condition: {
          type: "predicate",
          predicate: { kind: "field_exists", field: "x" },
        },
        on_match_next: "bad_a",
        on_no_match_next: "bad_b",
      },
    ]);
    const res = validateAgentSpec(spec, emptyBlockRegistry, { events: [{ type: "test.event", fields: {} }] });
    const issues = res.filter((i) => i.code === "unknown_step_next" && i.stepId === "b1");
    assert.equal(issues.length, 2);
  });
});

// ---------------------------------------------------------------------
// 4. Cycle detection
// ---------------------------------------------------------------------

describe("Graph cycle detection (G-6-8 A)", () => {
  test("rejects self-referencing branch (cycle of length 1)", () => {
    const spec = baseSpec([
      {
        id: "b1",
        type: "branch",
        condition: {
          type: "predicate",
          predicate: { kind: "field_exists", field: "x" },
        },
        on_match_next: "b1",
        on_no_match_next: null,
      },
    ]);
    const res = validateAgentSpec(spec, emptyBlockRegistry, { events: [{ type: "test.event", fields: {} }] });
    const cycle = res.find((i) => i.code === "graph_cycle");
    assert.ok(cycle, `expected graph_cycle; got ${JSON.stringify(res)}`);
  });

  test("rejects mutual-reference cycle (A → B → A)", () => {
    const spec = baseSpec([
      {
        id: "a",
        type: "branch",
        condition: {
          type: "predicate",
          predicate: { kind: "field_exists", field: "x" },
        },
        on_match_next: "b",
        on_no_match_next: null,
      },
      {
        id: "b",
        type: "branch",
        condition: {
          type: "predicate",
          predicate: { kind: "field_exists", field: "y" },
        },
        on_match_next: "a",
        on_no_match_next: null,
      },
    ]);
    const res = validateAgentSpec(spec, emptyBlockRegistry, { events: [{ type: "test.event", fields: {} }] });
    assert.ok(res.some((i) => i.code === "graph_cycle"));
  });

  test("rejects long cycle (A → B → C → D → A)", () => {
    const spec = baseSpec([
      { id: "a", type: "wait", seconds: 1, next: "b" },
      { id: "b", type: "wait", seconds: 1, next: "c" },
      { id: "c", type: "wait", seconds: 1, next: "d" },
      { id: "d", type: "wait", seconds: 1, next: "a" },
    ]);
    const res = validateAgentSpec(spec, emptyBlockRegistry, { events: [{ type: "test.event", fields: {} }] });
    assert.ok(res.some((i) => i.code === "graph_cycle"));
  });

  test("ALLOWS diamond shape (A → B, A → C, both → D) — not a cycle", () => {
    const spec = baseSpec([
      {
        id: "a",
        type: "branch",
        condition: {
          type: "predicate",
          predicate: { kind: "field_exists", field: "x" },
        },
        on_match_next: "b",
        on_no_match_next: "c",
      },
      { id: "b", type: "wait", seconds: 1, next: "d" },
      { id: "c", type: "wait", seconds: 1, next: "d" },
      { id: "d", type: "wait", seconds: 1, next: null },
    ]);
    const res = validateAgentSpec(spec, emptyBlockRegistry, { events: [{ type: "test.event", fields: {} }] });
    const cycles = res.filter((i) => i.code === "graph_cycle");
    assert.equal(cycles.length, 0, `diamond should be valid; got cycles: ${JSON.stringify(cycles)}`);
  });

  test("ALLOWS linear chain A → B → C → null (no cycle)", () => {
    const spec = baseSpec([
      { id: "a", type: "wait", seconds: 1, next: "b" },
      { id: "b", type: "wait", seconds: 1, next: "c" },
      { id: "c", type: "wait", seconds: 1, next: null },
    ]);
    const res = validateAgentSpec(spec, emptyBlockRegistry, { events: [{ type: "test.event", fields: {} }] });
    assert.equal(res.filter((i) => i.code === "graph_cycle").length, 0);
  });
});

// ---------------------------------------------------------------------
// 5. Existing archetype invariant — no false positives
// ---------------------------------------------------------------------

describe("BranchStep introduction — existing archetype fixtures still valid (invariant)", () => {
  test("minimal spec with a wait step still passes (no branch)", () => {
    const spec = baseSpec([{ id: "s1", type: "wait", seconds: 1, next: null }]);
    const res = validateAgentSpec(spec, emptyBlockRegistry, { events: [{ type: "test.event", fields: {} }] });
    // Trigger references test.event which is in the registry; other
    // issues would be unrelated. Assert no graph_cycle / no
    // unknown_step_next / no unsupported_step_type.
    assert.equal(res.filter((i) =>
      i.code === "graph_cycle" ||
      i.code === "unknown_step_next" ||
      i.code === "unsupported_step_type"
    ).length, 0);
  });
});
