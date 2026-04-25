// Tests for `deriveFields` — SLICE 4a PR 2 C2 per audit §2.1.
//
// Pure logic, no rendering. Covers widget inference per Zod type,
// required/optional/nullable/default handling, label derivation,
// include+overrides API, and error path on non-ZodObject input.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";

import { deriveFields } from "../../../src/lib/ui/derive-fields";

describe("deriveFields — field order", () => {
  test("preserves schema key order", () => {
    const schema = z.object({
      firstName: z.string(),
      lastName: z.string(),
      age: z.number(),
    });
    const fields = deriveFields(schema);
    assert.deepEqual(fields.map((f) => f.key), ["firstName", "lastName", "age"]);
  });
});

describe("deriveFields — widget inference", () => {
  test("ZodString → text", () => {
    const fields = deriveFields(z.object({ name: z.string() }));
    assert.equal(fields[0].widget, "text");
  });

  test("ZodNumber → number", () => {
    const fields = deriveFields(z.object({ age: z.number() }));
    assert.equal(fields[0].widget, "number");
  });

  test("ZodBoolean → checkbox", () => {
    const fields = deriveFields(z.object({ active: z.boolean() }));
    assert.equal(fields[0].widget, "checkbox");
  });

  test("ZodEnum → select with options from enum values", () => {
    const fields = deriveFields(
      z.object({ role: z.enum(["admin", "member"]) }),
    );
    assert.equal(fields[0].widget, "select");
    assert.deepEqual(fields[0].options, ["admin", "member"]);
  });

  test("ZodDate → date", () => {
    const fields = deriveFields(z.object({ joinedAt: z.date() }));
    assert.equal(fields[0].widget, "date");
  });

  test("ZodString().email() → email", () => {
    const fields = deriveFields(z.object({ email: z.string().email() }));
    assert.equal(fields[0].widget, "email");
  });

  test("ZodString().url() → url", () => {
    const fields = deriveFields(z.object({ site: z.string().url() }));
    assert.equal(fields[0].widget, "url");
  });

  test("unknown / unsupported type falls through to text", () => {
    const fields = deriveFields(z.object({ tags: z.array(z.string()) }));
    assert.equal(fields[0].widget, "text");
  });
});

describe("deriveFields — required / optional", () => {
  test("plain field is required", () => {
    const fields = deriveFields(z.object({ name: z.string() }));
    assert.equal(fields[0].required, true);
  });

  test(".optional() → required=false", () => {
    const fields = deriveFields(z.object({ name: z.string().optional() }));
    assert.equal(fields[0].required, false);
  });

  test(".nullable() → required=false", () => {
    const fields = deriveFields(z.object({ name: z.string().nullable() }));
    assert.equal(fields[0].required, false);
  });

  test(".default(x) → required=false", () => {
    const fields = deriveFields(
      z.object({ active: z.boolean().default(false) }),
    );
    assert.equal(fields[0].required, false);
  });
});

describe("deriveFields — defaults", () => {
  test(".default(value) extracts defaultValue", () => {
    const fields = deriveFields(z.object({ count: z.number().default(5) }));
    assert.equal(fields[0].defaultValue, 5);
  });

  test("no default → defaultValue is undefined", () => {
    const fields = deriveFields(z.object({ count: z.number() }));
    assert.equal(fields[0].defaultValue, undefined);
  });

  test("widget inference unwraps .default() to the inner type", () => {
    const fields = deriveFields(z.object({ active: z.boolean().default(false) }));
    assert.equal(fields[0].widget, "checkbox");
  });
});

describe("deriveFields — labels", () => {
  test("camelCase → Title Case", () => {
    const fields = deriveFields(z.object({ firstName: z.string() }));
    assert.equal(fields[0].label, "First Name");
  });

  test("single-word key → capitalised", () => {
    const fields = deriveFields(z.object({ email: z.string() }));
    assert.equal(fields[0].label, "Email");
  });
});

describe("deriveFields — include", () => {
  test("include controls subset + order", () => {
    const fields = deriveFields(
      z.object({ a: z.string(), b: z.string(), c: z.string() }),
      { include: ["c", "a"] },
    );
    assert.deepEqual(fields.map((f) => f.key), ["c", "a"]);
  });

  test("unknown include key is skipped silently", () => {
    const fields = deriveFields(
      z.object({ a: z.string() }),
      { include: ["a", "nonexistent"] },
    );
    assert.deepEqual(fields.map((f) => f.key), ["a"]);
  });
});

describe("deriveFields — overrides", () => {
  test("widget override (text → textarea)", () => {
    const fields = deriveFields(
      z.object({ notes: z.string() }),
      { overrides: { notes: { widget: "textarea" } } },
    );
    assert.equal(fields[0].widget, "textarea");
  });

  test("label override", () => {
    const fields = deriveFields(
      z.object({ firstName: z.string() }),
      { overrides: { firstName: { label: "Given Name" } } },
    );
    assert.equal(fields[0].label, "Given Name");
  });

  test("hidden override — field omitted", () => {
    const fields = deriveFields(
      z.object({ id: z.string(), name: z.string() }),
      { overrides: { id: { hidden: true } } },
    );
    assert.equal(fields.length, 1);
    assert.equal(fields[0].key, "name");
  });

  test("options override on string field creates select", () => {
    const fields = deriveFields(
      z.object({ color: z.string() }),
      { overrides: { color: { widget: "select", options: ["red", "blue"] } } },
    );
    assert.equal(fields[0].widget, "select");
    assert.deepEqual(fields[0].options, ["red", "blue"]);
  });

  test("placeholder override", () => {
    const fields = deriveFields(
      z.object({ name: z.string() }),
      { overrides: { name: { placeholder: "e.g. Alice Smith" } } },
    );
    assert.equal(fields[0].placeholder, "e.g. Alice Smith");
  });
});

describe("deriveFields — errors", () => {
  test("throws on non-ZodObject schema", () => {
    assert.throws(
      () => deriveFields(z.string() as unknown as z.ZodObject<Record<string, z.ZodTypeAny>>),
      /ZodObject/,
    );
  });
});
