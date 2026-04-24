// Tests for scaffoldBlock — the orchestrator that stitches BlockSpec
// validation + template rendering + file writing + validation gate.
// PR 1 C6 per audit §8 (PR 1 scope).

import { describe, test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { scaffoldBlock } from "../../../src/lib/scaffolding/orchestrator";
import type { BlockSpec } from "../../../src/lib/scaffolding/spec";

const cleanups: string[] = [];
afterEach(() => {
  for (const d of cleanups) rmSync(d, { recursive: true, force: true });
  cleanups.length = 0;
});

function tmpRoot(): string {
  const d = mkdtempSync(path.join(tmpdir(), "orchestrator-test-"));
  cleanups.push(d);
  return d;
}

function minimalSpec(overrides: Partial<BlockSpec> = {}): BlockSpec {
  return {
    slug: "notes-test",
    title: "Notes Test",
    description: "Test block for the orchestrator.",
    triggerPhrases: ["Install notes test"],
    frameworks: ["universal"],
    produces: [],
    consumes: [],
    tools: [],
    subscriptions: [],
    entities: [],
    customer_surfaces: { display: [], actions: [] },
    ...overrides,
  };
}

describe("scaffoldBlock — happy path", () => {
  test("writes BLOCK.md + tools.ts + test stub for a minimal spec", async () => {
    const root = tmpRoot();
    const result = await scaffoldBlock({
      spec: minimalSpec(),
      blocksDir: path.join(root, "src/blocks"),
      testsDir: path.join(root, "tests/unit/blocks"),
      validate: async () => {},
    });

    assert.ok(result.created.length >= 3, `expected >=3 files; got ${result.created.length}`);
    assert.ok(existsSync(path.join(root, "src/blocks/notes-test.block.md")));
    assert.ok(existsSync(path.join(root, "src/blocks/notes-test.tools.ts")));
    assert.ok(existsSync(path.join(root, "tests/unit/blocks/notes-test.spec.ts")));
  });

  test("writes subscription handler file when spec declares subscriptions", async () => {
    const root = tmpRoot();
    const spec = minimalSpec({
      subscriptions: [
        {
          event: "caldiy-booking:booking.created",
          handlerName: "onBookingCreate",
          description: "Log on booking",
          idempotencyKey: "{{id}}",
        },
      ],
    });
    const result = await scaffoldBlock({
      spec,
      blocksDir: path.join(root, "src/blocks"),
      testsDir: path.join(root, "tests/unit/blocks"),
      validate: async () => {},
    });
    const handlerPath = path.join(root, "src/blocks/notes-test/subscriptions/onBookingCreate.ts");
    assert.ok(existsSync(handlerPath));
    const content = readFileSync(handlerPath, "utf8");
    assert.match(content, /export const onBookingCreate: SubscriptionHandler/);
    assert.ok(result.created.includes(handlerPath));
  });
});

describe("scaffoldBlock — spec validation", () => {
  test("invalid spec throws BEFORE writing any files", async () => {
    const root = tmpRoot();
    const bad = minimalSpec({ slug: "crm" }); // reserved slug
    let thrown: unknown = null;
    try {
      await scaffoldBlock({
        spec: bad,
        blocksDir: path.join(root, "src/blocks"),
        testsDir: path.join(root, "tests/unit/blocks"),
        validate: async () => {},
      });
    } catch (e) {
      thrown = e;
    }
    assert.ok(thrown instanceof Error);
    // No files written.
    assert.ok(!existsSync(path.join(root, "src/blocks/crm.block.md")));
  });
});

describe("scaffoldBlock — validation gate failure", () => {
  test("validate throws → files remain on disk + orphan report surfaces", async () => {
    const root = tmpRoot();
    let thrown: unknown = null;
    try {
      await scaffoldBlock({
        spec: minimalSpec(),
        blocksDir: path.join(root, "src/blocks"),
        testsDir: path.join(root, "tests/unit/blocks"),
        validate: async () => {
          throw new Error("fake tsc failure");
        },
      });
    } catch (e) {
      thrown = e;
    }
    assert.ok(thrown instanceof Error);
    assert.match((thrown as Error).message, /fake tsc failure/);
    // Orphan files stay.
    assert.ok(existsSync(path.join(root, "src/blocks/notes-test.block.md")));
  });
});

describe("scaffoldBlock — dry run", () => {
  test("dryRun=true writes nothing + returns the would-create list", async () => {
    const root = tmpRoot();
    const result = await scaffoldBlock({
      spec: minimalSpec(),
      blocksDir: path.join(root, "src/blocks"),
      testsDir: path.join(root, "tests/unit/blocks"),
      validate: async () => { throw new Error("validate should not run"); },
      dryRun: true,
    });
    assert.ok(result.dryRun);
    assert.ok(result.created.length >= 3);
    assert.ok(!existsSync(path.join(root, "src/blocks/notes-test.block.md")));
  });
});

describe("scaffoldBlock — reserved path safety (audit §1.3 reserved slugs)", () => {
  test("reserved slug in spec throws before any write", async () => {
    const root = tmpRoot();
    for (const slug of ["crm", "caldiy-booking", "email"]) {
      let thrown: unknown = null;
      try {
        await scaffoldBlock({
          spec: minimalSpec({ slug }),
          blocksDir: path.join(root, "src/blocks"),
          testsDir: path.join(root, "tests/unit/blocks"),
          validate: async () => {},
        });
      } catch (e) {
        thrown = e;
      }
      assert.ok(thrown instanceof Error, `expected "${slug}" to be rejected`);
    }
  });
});
