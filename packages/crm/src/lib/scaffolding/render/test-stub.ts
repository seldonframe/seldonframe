// Test stub — one test.todo per declared tool, or a single
// block-level todo when the block has no tools.
//
// Shipped in SLICE 2 PR 1 Commit 3 per audit G-6. `test.todo(...)`
// is Node's built-in — it lists the test in the run output as
// "todo" without failing. The builder swaps `test.todo` → `test`
// once they've filled in the implementation.

import type { BlockSpec } from "../spec";

export function renderTestStub(spec: BlockSpec): string {
  const header = [
    `// ${spec.title} — scaffolded test stubs.`,
    "//",
    "// Each test.todo becomes a visible checklist in pnpm test:unit",
    "// output. Replace test.todo with a real test when the",
    "// corresponding tool implementation lands.",
    "",
    'import { describe, test } from "node:test";',
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    'import assert from "node:assert/strict";',
    "",
  ].join("\n");

  if (spec.tools.length === 0) {
    return [
      header,
      `describe("${spec.slug} — block smoke", () => {`,
      "  test.todo(",
      `    "${spec.slug} exports at least one tool or subscription — " +`,
      `      "TODO: add a smoke test once the block declares its surface.",`,
      "  );",
      "});",
      "",
    ].join("\n");
  }

  const blocks = spec.tools.map((tool) => {
    return [
      `describe("${spec.slug} — ${tool.name}", () => {`,
      "  test.todo(",
      `    "${tool.name} accepts a valid args shape and returns the expected returns shape — " +`,
      `      "TODO: fill using the pattern in packages/crm/tests/unit/crm-tools.spec.ts",`,
      "  );",
      "});",
    ].join("\n");
  });

  return [header, blocks.join("\n\n"), ""].join("\n");
}
