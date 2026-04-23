// Tests for the scaffold validation gate orchestrator + pure parser
// check. PR 1 C5 per audit §5 + G-5 resolution.
//
// Non-pure checks (tsc + emit:blocks:check) spawn child processes;
// they're covered by C7's end-to-end smoke-test block run, not by
// unit tests here (would be flaky + slow).

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  createValidationGate,
  parserCheck,
  type ValidationCheck,
} from "../../../src/lib/scaffolding/validate";

describe("createValidationGate — orchestration", () => {
  test("runs every check in order; all pass → success", async () => {
    const order: string[] = [];
    const checks: ValidationCheck[] = [
      { name: "a", run: async () => { order.push("a"); } },
      { name: "b", run: async () => { order.push("b"); } },
      { name: "c", run: async () => { order.push("c"); } },
    ];
    const gate = createValidationGate(checks);
    await gate.run([]);
    assert.deepEqual(order, ["a", "b", "c"]);
  });

  test("first failing check halts the chain + annotates the error with the step name", async () => {
    const order: string[] = [];
    const checks: ValidationCheck[] = [
      { name: "a", run: async () => { order.push("a"); } },
      { name: "b", run: async () => { throw new Error("b exploded"); } },
      { name: "c", run: async () => { order.push("c"); } },
    ];
    const gate = createValidationGate(checks);

    let thrown: unknown = null;
    try {
      await gate.run([]);
    } catch (e) {
      thrown = e;
    }

    assert.ok(thrown instanceof Error);
    assert.match((thrown as Error).message, /validation step "b" failed: b exploded/);
    assert.deepEqual(order, ["a"], "c never ran");
  });

  test("empty checks list → trivial success", async () => {
    const gate = createValidationGate([]);
    await gate.run([]);
  });
});

describe("parserCheck — parseBlockMd round-trip", () => {
  test("well-formed BLOCK.md passes", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "validate-test-"));
    const blockPath = path.join(dir, "sample.block.md");
    writeFileSync(
      blockPath,
      "# BLOCK: Sample\n\n## Composition Contract\n\nproduces: []\nconsumes: []\nverbs: []\ncompose_with: [crm]\n\n<!-- TOOLS:START -->\n[]\n<!-- TOOLS:END -->\n",
    );
    try {
      const check = parserCheck();
      await check.run([blockPath]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("malformed TOOLS block → throws with descriptive message", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "validate-test-"));
    const blockPath = path.join(dir, "sample.block.md");
    writeFileSync(
      blockPath,
      "# BLOCK: Sample\n\n## Composition Contract\n\nproduces: []\n\n<!-- TOOLS:START -->\nnot valid json\n<!-- TOOLS:END -->\n",
    );
    const check = parserCheck();
    let thrown: unknown = null;
    try {
      await check.run([blockPath]);
    } catch (e) {
      thrown = e;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    assert.ok(thrown instanceof Error);
    assert.match((thrown as Error).message, /__tools_malformed__/);
  });

  test("ignores non-BLOCK.md files in the created list", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "validate-test-"));
    const toolsPath = path.join(dir, "sample.tools.ts");
    writeFileSync(toolsPath, "// a tools.ts file — parser shouldn't touch this");
    try {
      const check = parserCheck();
      await check.run([toolsPath]); // no BLOCK.md → skip, no error
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
