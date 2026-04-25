// Tests for deriveColumns — the Zod-schema-to-table-columns mapper
// used by <EntityTable>. SLICE 4a PR 1 C4 per audit §2.1.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";

import { deriveColumns } from "../../../src/lib/ui/derive-columns";

describe("deriveColumns — ZodObject top-level fields", () => {
  test("derives a column per top-level field in schema order", () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
      isActive: z.boolean(),
    });
    const cols = deriveColumns(schema);
    assert.deepEqual(
      cols.map((c) => c.key),
      ["name", "age", "isActive"],
    );
  });

  test("title falls back to camelCase → Title Case transform", () => {
    const schema = z.object({
      firstName: z.string(),
      emailAddress: z.string(),
      ssnLast4: z.string(),
    });
    const cols = deriveColumns(schema);
    assert.equal(cols[0].title, "First Name");
    assert.equal(cols[1].title, "Email Address");
    // All-caps runs are preserved as single words (SSN stays SSN).
    assert.equal(cols[2].title, "Ssn Last4");
  });

  test("type metadata reflects the Zod primitive", () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
      isActive: z.boolean(),
      meta: z.object({ x: z.string() }),
    });
    const cols = deriveColumns(schema);
    assert.equal(cols[0].type, "string");
    assert.equal(cols[1].type, "number");
    assert.equal(cols[2].type, "boolean");
    assert.equal(cols[3].type, "object");
  });

  test("nullable + optional fields unwrap to underlying type", () => {
    const schema = z.object({
      name: z.string().nullable(),
      age: z.number().optional(),
      both: z.string().nullable().optional(),
    });
    const cols = deriveColumns(schema);
    assert.equal(cols[0].type, "string");
    assert.equal(cols[1].type, "number");
    assert.equal(cols[2].type, "string");
  });
});

describe("deriveColumns — override API", () => {
  test("overrides merge onto auto-derived columns by key", () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
    });
    const cols = deriveColumns(schema, {
      overrides: {
        name: { title: "Full Name" },
      },
    });
    assert.equal(cols[0].title, "Full Name");
    assert.equal(cols[1].title, "Age");
  });

  test("overrides can hide a column", () => {
    const schema = z.object({
      name: z.string(),
      internal: z.string(),
    });
    const cols = deriveColumns(schema, {
      overrides: { internal: { hidden: true } },
    });
    assert.equal(cols.length, 1);
    assert.equal(cols[0].key, "name");
  });

  test("overrides can specify explicit order via `include`", () => {
    const schema = z.object({
      a: z.string(),
      b: z.string(),
      c: z.string(),
    });
    const cols = deriveColumns(schema, { include: ["c", "a"] });
    assert.deepEqual(
      cols.map((c) => c.key),
      ["c", "a"],
    );
  });
});

describe("deriveColumns — non-object schemas", () => {
  test("throws on a schema that isn't a ZodObject", () => {
    let thrown: unknown = null;
    try {
      deriveColumns(z.string() as unknown as z.ZodObject<Record<string, z.ZodTypeAny>>);
    } catch (e) {
      thrown = e;
    }
    assert.ok(thrown instanceof Error);
    assert.match((thrown as Error).message, /ZodObject/);
  });
});
