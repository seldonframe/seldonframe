// End-to-end smoke test for the scaffold → UI bridge.
// SLICE 4a PR 2 C6 per audit §2.1.
//
// Strategy:
//   1. scaffoldBlock into a repo-local path so TypeScript path aliases
//      (@/components/ui-composition/block-list-page) resolve.
//   2. Dynamic-import the generated admin page module via tsx's
//      loader — this proves the generated file is valid TypeScript
//      AND that its imports resolve at runtime (not just
//      structurally).
//   3. Call the page's default export (async server component) and
//      renderToString the returned element.
//   4. Assert the rendered HTML contains the expected title +
//      EntityTable empty-state copy (rows default to [] in the
//      scaffolded template).
//   5. Clean up the smoke directory on both success + failure so
//      subsequent runs start from a clean slate.

import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { rmSync, existsSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { renderToString } from "react-dom/server";

import { scaffoldBlock } from "../../../src/lib/scaffolding/orchestrator";
import type { BlockSpec } from "../../../src/lib/scaffolding/spec";

// Fixed repo-local path so @/ aliases resolve. Gitignored via the
// leading underscore convention + explicit cleanup in before/after.
const SMOKE_DIR = path.resolve(
  process.cwd(),
  "tests",
  "_scaffold-smoke",
);
const SMOKE_SLUG = "smoke-notes";

function smokeSpec(): BlockSpec {
  return {
    slug: SMOKE_SLUG,
    title: "Smoke Notes",
    description: "End-to-end smoke block for the SLICE 4a scaffold bridge.",
    triggerPhrases: ["Install smoke notes"],
    frameworks: ["universal"],
    produces: [],
    consumes: [],
    tools: [],
    subscriptions: [],
    entities: [
      {
        name: "note",
        pluralSlug: "smoke-notes",
        fields: [
          { name: "body", type: "string", nullable: false, required: true },
          { name: "priority", type: "integer", nullable: false, required: false },
          { name: "archived", type: "boolean", nullable: false, required: false },
        ],
      },
    ],
  };
}

function cleanSmokeDir() {
  if (existsSync(SMOKE_DIR)) {
    rmSync(SMOKE_DIR, { recursive: true, force: true });
  }
}

describe("scaffold → UI bridge — end-to-end smoke", () => {
  before(() => {
    cleanSmokeDir();
    mkdirSync(SMOKE_DIR, { recursive: true });
  });

  after(() => {
    cleanSmokeDir();
  });

  test("scaffolded admin page compiles + renders end-to-end with EntityTable empty state", async () => {
    const blocksDir = path.join(SMOKE_DIR, "blocks");
    const testsDir = path.join(SMOKE_DIR, "tests");

    const result = await scaffoldBlock({
      spec: smokeSpec(),
      blocksDir,
      testsDir,
      validate: async () => undefined,
    });

    const pagePath = result.created.find((p) => p.endsWith(".page.tsx"));
    const schemaPath = result.created.find((p) => p.endsWith(".schema.ts"));
    assert.ok(pagePath, "expected generated page file");
    assert.ok(schemaPath, "expected generated schema file");

    // Dynamic import via tsx loader — fails if generated TS is invalid
    // or if the imports (@/components/ui-composition/block-list-page,
    // ./note.schema) don't resolve.
    const pageModule = await import(pathToFileURL(pagePath!).href);
    const PageComponent = pageModule.default as () => Promise<React.ReactElement>;
    assert.equal(
      typeof PageComponent,
      "function",
      "scaffolded page must default-export a function",
    );

    const element = await PageComponent();
    const html = renderToString(element);

    // The scaffolded page renders BlockListPage with title="Smoke Notes"
    // + schema=NoteSchema + rows=[]. EntityTable's empty-state default
    // text is "No records yet."
    assert.match(html, /Smoke Notes/);
    assert.match(html, /No records yet/);
    assert.match(html, /<main[\s>]/);

    // Sanity check: the scaffolded schema module exports a NoteSchema
    // that's actually a ZodObject we can introspect.
    const schemaModule = await import(pathToFileURL(schemaPath!).href);
    assert.ok(schemaModule.NoteSchema, "schema module must export NoteSchema");
    const shape = (schemaModule.NoteSchema as { shape?: Record<string, unknown> }).shape;
    assert.ok(shape, "NoteSchema must be a ZodObject with a .shape");
    assert.ok("body" in shape);
    assert.ok("priority" in shape);
    assert.ok("archived" in shape);
  });
});
