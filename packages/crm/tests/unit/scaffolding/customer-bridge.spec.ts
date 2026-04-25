// Orchestrator-integration tests for the scaffold → customer UI bridge.
// SLICE 4b PR 2 C3 per audit §14.
//
// Mirrors admin-bridge.spec.ts integration coverage: dry-run paths +
// full-write paths for customer_surfaces. Ensures:
//   - display entries emit customer/<pluralSlug>.view.tsx
//   - action entries with opt_in:true emit customer/<tool>.form.tsx
//   - no customer files emitted when customer_surfaces empty
//   - file plan ordering stable (admin files first, customer files after)

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";

import { scaffoldBlock } from "../../../src/lib/scaffolding/orchestrator";
import type { BlockSpec } from "../../../src/lib/scaffolding/spec";

function baseSpec(): BlockSpec {
  return {
    slug: "notes",
    title: "Notes",
    description: "Notes block with customer surfaces.",
    triggerPhrases: ["Add notes"],
    frameworks: ["universal"],
    produces: [{ name: "note.created", fields: [] }],
    consumes: [],
    tools: [
      {
        name: "create_note",
        description: "Create a note.",
        args: [
          { name: "body", type: "string", nullable: false, required: true },
          { name: "priority", type: "integer", nullable: false, required: false },
        ],
        returns: [{ name: "noteId", type: "string", nullable: false, required: true }],
        emits: ["note.created"],
      },
    ],
    subscriptions: [],
    entities: [
      {
        name: "note",
        pluralSlug: "notes",
        fields: [
          { name: "body", type: "string", nullable: false, required: true },
          { name: "pinned", type: "boolean", nullable: false, required: false },
        ],
      },
    ],
    customer_surfaces: { display: [], actions: [] },
  };
}

function makeTempDirs() {
  const base = mkdtempSync(path.join(tmpdir(), "scaffold-customer-"));
  return {
    base,
    blocksDir: path.join(base, "blocks"),
    testsDir: path.join(base, "tests"),
  };
}

// ---------------------------------------------------------------------
// 1. Empty customer_surfaces → no customer files emitted (backward-compat)
// ---------------------------------------------------------------------

describe("scaffoldBlock — empty customer_surfaces emits only admin files", () => {
  test("dry-run with empty customer_surfaces emits no customer paths", async () => {
    const { blocksDir, testsDir } = makeTempDirs();
    const result = await scaffoldBlock({
      spec: baseSpec(),
      blocksDir,
      testsDir,
      validate: async () => undefined,
      dryRun: true,
    });
    const paths = result.created.map((p) => p.replace(/\\/g, "/"));
    assert.ok(!paths.some((p) => p.includes("/customer/")),
      `expected no customer paths; got: ${paths.join(", ")}`);
  });
});

// ---------------------------------------------------------------------
// 2. display entries → view.tsx emitted per entry
// ---------------------------------------------------------------------

describe("scaffoldBlock — display surfaces emit *.view.tsx", () => {
  test("dry-run with one display entry emits one customer/*.view.tsx", async () => {
    const { blocksDir, testsDir } = makeTempDirs();
    const spec = baseSpec();
    spec.customer_surfaces = {
      display: [{ entity: "note", filter: "{{customer_id}}", fields: ["body", "pinned"] }],
      actions: [],
    };
    const result = await scaffoldBlock({
      spec,
      blocksDir,
      testsDir,
      validate: async () => undefined,
      dryRun: true,
    });
    const paths = result.created.map((p) => p.replace(/\\/g, "/"));
    assert.ok(paths.some((p) => p.endsWith("notes/customer/notes.view.tsx")),
      `expected notes/customer/notes.view.tsx; got: ${paths.join(", ")}`);
    // Still no action form.
    assert.ok(!paths.some((p) => p.endsWith(".form.tsx")));
  });

  test("full write with display entry produces a file that imports the sibling admin schema", async () => {
    const { base, blocksDir, testsDir } = makeTempDirs();
    try {
      const spec = baseSpec();
      spec.customer_surfaces = {
        display: [{ entity: "note", filter: "*", fields: ["body"] }],
        actions: [],
      };
      const result = await scaffoldBlock({
        spec,
        blocksDir,
        testsDir,
        validate: async () => undefined,
      });
      const viewPath = result.created.find((p) => p.endsWith(".view.tsx"));
      assert.ok(viewPath, "expected view file written");
      const content = readFileSync(viewPath!, "utf8");
      assert.match(content, /CustomerDataView/);
      assert.match(content, /NoteSchema/);
      // Filter preserved as TODO.
      assert.match(content, /filter/);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------
// 3. actions entries → form.tsx emitted per opt-in entry
// ---------------------------------------------------------------------

describe("scaffoldBlock — action surfaces emit *.form.tsx", () => {
  test("dry-run with one action entry emits one customer/*.form.tsx", async () => {
    const { blocksDir, testsDir } = makeTempDirs();
    const spec = baseSpec();
    spec.customer_surfaces = {
      display: [],
      actions: [{ tool: "create_note", opt_in: true }],
    };
    const result = await scaffoldBlock({
      spec,
      blocksDir,
      testsDir,
      validate: async () => undefined,
      dryRun: true,
    });
    const paths = result.created.map((p) => p.replace(/\\/g, "/"));
    assert.ok(paths.some((p) => p.endsWith("notes/customer/create_note.form.tsx")),
      `expected notes/customer/create_note.form.tsx; got: ${paths.join(", ")}`);
  });

  test("full write with action entry produces a file with inline schema", async () => {
    const { base, blocksDir, testsDir } = makeTempDirs();
    try {
      const spec = baseSpec();
      spec.customer_surfaces = {
        display: [],
        actions: [{ tool: "create_note", opt_in: true, rate_limit: "5/hour" }],
      };
      const result = await scaffoldBlock({
        spec,
        blocksDir,
        testsDir,
        validate: async () => undefined,
      });
      const formPath = result.created.find((p) => p.endsWith(".form.tsx"));
      assert.ok(formPath);
      const content = readFileSync(formPath!, "utf8");
      assert.match(content, /CustomerActionForm/);
      assert.match(content, /CreateNoteArgsSchema/);
      assert.match(content, /rateLimitHint="5\/hour"/);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------
// 4. Combined display + actions emit both
// ---------------------------------------------------------------------

describe("scaffoldBlock — mixed display + actions", () => {
  test("dry-run with both surfaces emits all four customer file types in stable order", async () => {
    const { blocksDir, testsDir } = makeTempDirs();
    const spec = baseSpec();
    spec.customer_surfaces = {
      display: [{ entity: "note", filter: "*", fields: ["body"] }],
      actions: [{ tool: "create_note", opt_in: true }],
    };
    const result = await scaffoldBlock({
      spec,
      blocksDir,
      testsDir,
      validate: async () => undefined,
      dryRun: true,
    });
    const paths = result.created.map((p) => p.replace(/\\/g, "/"));
    // Admin files first (BLOCK.md, tools.ts, test stub, admin schema + page).
    // Customer files AFTER admin files.
    const firstAdminIdx = paths.findIndex((p) => p.includes("/admin/"));
    const firstCustomerIdx = paths.findIndex((p) => p.includes("/customer/"));
    assert.ok(firstAdminIdx > -1 && firstCustomerIdx > -1);
    assert.ok(firstAdminIdx < firstCustomerIdx, "customer files must emit after admin files");
    // View before form (display entries before action entries).
    const viewIdx = paths.findIndex((p) => p.endsWith(".view.tsx"));
    const formIdx = paths.findIndex((p) => p.endsWith(".form.tsx"));
    assert.ok(viewIdx > -1 && formIdx > -1);
    assert.ok(viewIdx < formIdx, "display views must emit before action forms");
  });
});
