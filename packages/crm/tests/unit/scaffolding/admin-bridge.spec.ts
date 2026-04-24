// Tests for the scaffold → UI bridge. SLICE 4a PR 2 C5 per audit §2.1.
//
// Covers:
//   1. BlockSpec.entities schema extension (additive, optional).
//   2. renderAdminSchemaTs — Zod schema source for an entity.
//   3. renderAdminPageTsx — Next admin page source using <BlockListPage>.
//   4. Orchestrator file-plan integration — admin files only emitted
//      when entities are declared.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";

import {
  BlockSpecSchema,
  type BlockSpec,
} from "../../../src/lib/scaffolding/spec";
import { renderAdminSchemaTs } from "../../../src/lib/scaffolding/render/admin-schema-ts";
import { renderAdminPageTsx } from "../../../src/lib/scaffolding/render/admin-page-tsx";
import { scaffoldBlock } from "../../../src/lib/scaffolding/orchestrator";

function minimalSpec(): BlockSpec {
  return {
    slug: "notes",
    title: "Notes",
    description: "Notes block.",
    triggerPhrases: ["Add notes"],
    frameworks: ["universal"],
    produces: [],
    consumes: [],
    tools: [],
    subscriptions: [],
    entities: [],
  };
}

function specWithNoteEntity(): BlockSpec {
  return {
    ...minimalSpec(),
    entities: [
      {
        name: "note",
        pluralSlug: "notes",
        fields: [
          { name: "body", type: "string", nullable: false, required: true },
          { name: "priority", type: "integer", nullable: false, required: false },
          { name: "archived", type: "boolean", nullable: false, required: false },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------
// 1. Schema extension
// ---------------------------------------------------------------------

describe("BlockSpecSchema — entities extension", () => {
  test("accepts a spec with an entities entry", () => {
    const result = BlockSpecSchema.safeParse(specWithNoteEntity());
    assert.ok(result.success, result.success ? "" : JSON.stringify(result.error.issues));
  });

  test("defaults entities to [] when omitted (backward-compat)", () => {
    const spec: Omit<BlockSpec, "entities"> = minimalSpec();
    delete (spec as Partial<BlockSpec>).entities;
    const result = BlockSpecSchema.safeParse(spec);
    assert.ok(result.success, result.success ? "" : JSON.stringify(result.error.issues));
    assert.ok(result.success && Array.isArray(result.data.entities));
    assert.equal(result.success && result.data.entities.length, 0);
  });

  test("rejects an entity with non-camelCase name", () => {
    const spec = specWithNoteEntity();
    spec.entities[0].name = "Note";
    const result = BlockSpecSchema.safeParse(spec);
    assert.ok(!result.success, "expected rejection of non-camelCase entity name");
  });

  test("rejects an entity with non-kebab pluralSlug", () => {
    const spec = specWithNoteEntity();
    spec.entities[0].pluralSlug = "Notes";
    const result = BlockSpecSchema.safeParse(spec);
    assert.ok(!result.success);
  });

  test("rejects an entity with empty fields array", () => {
    const spec = specWithNoteEntity();
    spec.entities[0].fields = [];
    const result = BlockSpecSchema.safeParse(spec);
    assert.ok(!result.success);
  });

  test("rejects entity field with non-camelCase name", () => {
    const spec = specWithNoteEntity();
    spec.entities[0].fields[0].name = "Body";
    const result = BlockSpecSchema.safeParse(spec);
    assert.ok(!result.success);
  });
});

// ---------------------------------------------------------------------
// 2. renderAdminSchemaTs
// ---------------------------------------------------------------------

describe("renderAdminSchemaTs", () => {
  test("renders a Zod schema module for the entity", () => {
    const src = renderAdminSchemaTs(specWithNoteEntity().entities[0]);
    assert.match(src, /import \{ z \} from "zod";/);
    assert.match(src, /export const NoteSchema = z\.object\(\{/);
    // Body: required string → z.string()
    assert.match(src, /body: z\.string\(\),/);
    // priority: integer, optional → z.number().int().optional()
    assert.match(src, /priority: z\.number\(\)\.int\(\)\.optional\(\),/);
    // archived: boolean, optional
    assert.match(src, /archived: z\.boolean\(\)\.optional\(\),/);
  });

  test("applies .nullable() + .optional() in the right order", () => {
    const src = renderAdminSchemaTs({
      name: "ticket",
      pluralSlug: "tickets",
      fields: [{ name: "resolvedAt", type: "string", nullable: true, required: false }],
    });
    // .nullable() before .optional()
    assert.match(src, /resolvedAt: z\.string\(\)\.nullable\(\)\.optional\(\),/);
  });

  test("exports an inferred type alias", () => {
    const src = renderAdminSchemaTs(specWithNoteEntity().entities[0]);
    assert.match(src, /export type Note = z\.infer<typeof NoteSchema>;/);
  });
});

// ---------------------------------------------------------------------
// 3. renderAdminPageTsx
// ---------------------------------------------------------------------

describe("renderAdminPageTsx", () => {
  test("imports BlockListPage + the sibling schema", () => {
    const src = renderAdminPageTsx(specWithNoteEntity().entities[0]);
    assert.match(src, /import \{ BlockListPage \} from "@\/components\/ui-composition\/block-list-page";/);
    assert.match(src, /import \{ NoteSchema[^}]*\} from "\.\/note\.schema";/);
  });

  test("renders an async default export page function", () => {
    const src = renderAdminPageTsx(specWithNoteEntity().entities[0]);
    assert.match(src, /export default async function NotesPage\(\)/);
  });

  test("uses BlockListPage with the right title + schema + rows", () => {
    const src = renderAdminPageTsx(specWithNoteEntity().entities[0]);
    assert.match(src, /<BlockListPage/);
    assert.match(src, /title="Notes"/);
    assert.match(src, /schema=\{NoteSchema\}/);
    assert.match(src, /rows=\{rows\}/);
  });

  test("ships a TODO pointing the builder at the data loader", () => {
    const src = renderAdminPageTsx(specWithNoteEntity().entities[0]);
    assert.match(src, /TODO.*load/i);
    // Placeholder rows: empty array fallback so the page compiles.
    assert.match(src, /const rows(\s*:\s*[^=]+)?\s*=\s*\[\]/);
  });
});

// ---------------------------------------------------------------------
// 4. Orchestrator file-plan integration
// ---------------------------------------------------------------------

describe("scaffoldBlock — admin files only emitted for entities", () => {
  function makeTempDirs() {
    const base = mkdtempSync(path.join(tmpdir(), "scaffold-admin-"));
    const blocksDir = path.join(base, "blocks");
    const testsDir = path.join(base, "tests");
    return { base, blocksDir, testsDir };
  }

  test("dry-run with entities includes admin schema + page paths", async () => {
    const { blocksDir, testsDir } = makeTempDirs();
    const result = await scaffoldBlock({
      spec: specWithNoteEntity(),
      blocksDir,
      testsDir,
      validate: async () => undefined,
      dryRun: true,
    });
    const paths = result.created.map((p) => p.replace(/\\/g, "/"));
    assert.ok(paths.some((p) => p.endsWith("notes/admin/note.schema.ts")),
      `expected admin/note.schema.ts; got: ${paths.join(", ")}`);
    assert.ok(paths.some((p) => p.endsWith("notes/admin/notes.page.tsx")),
      `expected admin/notes.page.tsx; got: ${paths.join(", ")}`);
  });

  test("dry-run with NO entities does not emit admin files", async () => {
    const { blocksDir, testsDir } = makeTempDirs();
    const result = await scaffoldBlock({
      spec: minimalSpec(),
      blocksDir,
      testsDir,
      validate: async () => undefined,
      dryRun: true,
    });
    const paths = result.created.map((p) => p.replace(/\\/g, "/"));
    assert.ok(!paths.some((p) => p.includes("/admin/")),
      `expected no admin/ paths; got: ${paths.join(", ")}`);
  });

  test("full run writes admin files that compile-pass when read back", async () => {
    const { base, blocksDir, testsDir } = makeTempDirs();
    try {
      const result = await scaffoldBlock({
        spec: specWithNoteEntity(),
        blocksDir,
        testsDir,
        validate: async () => undefined,
      });
      const schemaPath = result.created.find((p) => p.endsWith(".schema.ts"));
      const pagePath = result.created.find((p) => p.endsWith(".page.tsx"));
      assert.ok(schemaPath, "expected schema file written");
      assert.ok(pagePath, "expected page file written");
      const schemaContent = readFileSync(schemaPath!, "utf8");
      const pageContent = readFileSync(pagePath!, "utf8");
      assert.match(schemaContent, /NoteSchema/);
      assert.match(pageContent, /NotesPage/);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});
