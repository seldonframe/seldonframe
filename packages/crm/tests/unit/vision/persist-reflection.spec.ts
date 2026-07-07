import { test } from "node:test";
import assert from "node:assert/strict";

import { persistReflection, type ReflectionInput } from "../../../src/lib/vision/persist-reflection";

function baseInput(overrides: Partial<ReflectionInput> = {}): ReflectionInput {
  return {
    orgId: "org-1",
    surface: "copilot",
    instruction: "make the hero bigger",
    triggerTool: "update_section_field",
    verdict: { pass: true, gaps: [] },
    ...overrides,
  };
}

test("truncates a >200-char instruction to <=200 chars in the persisted row", async () => {
  const longInstruction = "x".repeat(500);
  const rows: Array<Record<string, unknown>> = [];
  await persistReflection(baseInput({ instruction: longInstruction }), {
    insert: async (row) => {
      rows.push(row);
    },
  });

  assert.equal(rows.length, 1);
  const summary = rows[0].instructionSummary as string;
  assert.ok(summary.length <= 200, `expected <=200 chars, got ${summary.length}`);
});

test("maps verdict.skipped undefined to null and passes gaps through", async () => {
  const rows: Array<Record<string, unknown>> = [];
  await persistReflection(
    baseInput({ verdict: { pass: false, gaps: ["missing hero image", "low contrast"] } }),
    {
      insert: async (row) => {
        rows.push(row);
      },
    }
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].skipped, null);
  assert.deepEqual(rows[0].gaps, ["missing hero image", "low contrast"]);
  assert.equal(rows[0].pass, false);
});

test("preserves verdict.skipped when present", async () => {
  const rows: Array<Record<string, unknown>> = [];
  await persistReflection(
    baseInput({ verdict: { pass: false, gaps: [], skipped: "timeout" } }),
    {
      insert: async (row) => {
        rows.push(row);
      },
    }
  );

  assert.equal(rows[0].skipped, "timeout");
});

test("fail-soft: does not throw when deps.insert throws", async () => {
  await assert.doesNotReject(
    persistReflection(baseInput(), {
      insert: async () => {
        throw new Error("db unavailable");
      },
    })
  );
});
