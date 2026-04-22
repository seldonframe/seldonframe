// Unit tests for lib/events/parse-registry.ts — extracts the
// SeldonEvent union into a JSON registry for PR 2's agent-spec
// validator. Ships with C7 per Max's "tests alongside code" directive.
//
// Coverage:
//   - extractSeldonEventBody finds the union and terminates correctly.
//   - splitVariants handles brace-nested `data: {...}` blocks.
//   - parseVariant extracts type + fields.
//   - parseFields handles primitives, nullable (| null), nested
//     Record<string, unknown>, and ; inside angle brackets.
//   - buildEventRegistry end-to-end against real SeldonEvent source.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  buildEventRegistry,
  extractSeldonEventBody,
  parseFields,
  parseVariant,
  serializeRegistry,
  splitVariants,
} from "../../src/lib/events/parse-registry";

const EVENTS_SOURCE_PATH = path.resolve(__dirname, "../../../core/src/events/index.ts");
const REGISTRY_JSON_PATH = path.resolve(__dirname, "../../../core/src/events/event-registry.json");

// ---------------------------------------------------------------------
// extractSeldonEventBody
// ---------------------------------------------------------------------

describe("extractSeldonEventBody", () => {
  test("returns null when the union isn't present", () => {
    assert.equal(extractSeldonEventBody("export type Other = string;"), null);
  });

  test("extracts the union body up to the terminating semicolon", () => {
    const source = `export type SeldonEvent =\n  | { type: "a.b"; data: { x: string } }\n  | { type: "c.d"; data: {} };\n`;
    const body = extractSeldonEventBody(source);
    assert.ok(body);
    assert.ok(body!.includes('"a.b"'));
    assert.ok(body!.includes('"c.d"'));
  });

  test("isn't fooled by nested braces / semicolons in data shapes", () => {
    const source = `export type SeldonEvent = | { type: "x"; data: { map: Record<string, unknown>; note: string } };`;
    const body = extractSeldonEventBody(source);
    assert.ok(body);
    assert.ok(body!.includes("Record<string, unknown>"));
  });
});

// ---------------------------------------------------------------------
// splitVariants
// ---------------------------------------------------------------------

describe("splitVariants", () => {
  test("splits a two-variant body", () => {
    const variants = splitVariants(`| { type: "a.b"; data: { x: string } } | { type: "c.d"; data: { y: number } }`);
    assert.equal(variants.length, 2);
  });

  test("does not split inside nested braces", () => {
    const variants = splitVariants(
      `| { type: "x"; data: { inner: { a: string; b: number } } } | { type: "y"; data: {} }`
    );
    assert.equal(variants.length, 2);
  });
});

// ---------------------------------------------------------------------
// parseVariant
// ---------------------------------------------------------------------

describe("parseVariant", () => {
  test("extracts type + flat fields", () => {
    const parsed = parseVariant(`{ type: "contact.created"; data: { contactId: string } }`);
    assert.equal(parsed?.type, "contact.created");
    assert.equal(parsed?.fields.contactId.rawType, "string");
    assert.equal(parsed?.fields.contactId.nullable, false);
  });

  test("detects | null as nullable", () => {
    const parsed = parseVariant(`{ type: "x.y"; data: { foo: string | null } }`);
    assert.equal(parsed?.fields.foo.nullable, true);
  });

  test("returns null when the variant has no type string", () => {
    assert.equal(parseVariant(`{ data: { x: string } }`), null);
  });

  test("tolerates an empty data block", () => {
    const parsed = parseVariant(`{ type: "x.y"; data: {} }`);
    assert.equal(parsed?.type, "x.y");
    assert.deepEqual(parsed?.fields, {});
  });
});

// ---------------------------------------------------------------------
// parseFields
// ---------------------------------------------------------------------

describe("parseFields", () => {
  test("splits fields on top-level semicolons", () => {
    const fields = parseFields("a: string; b: number; c: boolean");
    assert.deepEqual(Object.keys(fields), ["a", "b", "c"]);
  });

  test("keeps generic-bracket contents intact (no split on ; inside <...>)", () => {
    const fields = parseFields("map: Record<string, unknown>; note: string");
    assert.equal(fields.map.rawType, "Record<string, unknown>");
    assert.equal(fields.note.rawType, "string");
  });

  test("handles | null and | undefined", () => {
    const fields = parseFields("a: string | null; b: number | undefined");
    assert.equal(fields.a.nullable, true);
    assert.equal(fields.b.nullable, true);
  });

  test("returns empty for an empty data shape", () => {
    assert.deepEqual(parseFields(""), {});
  });
});

// ---------------------------------------------------------------------
// buildEventRegistry — end-to-end against the real SeldonEvent source
// ---------------------------------------------------------------------

describe("buildEventRegistry — real SeldonEvent source", () => {
  const source = readFileSync(EVENTS_SOURCE_PATH, "utf8");
  const registry = buildEventRegistry(source);

  test("parses at least 40 events (currently 45; flexible lower-bound)", () => {
    assert.ok(
      registry.events.length >= 40,
      `expected >= 40 events, got ${registry.events.length}`,
    );
  });

  test("includes booking.rescheduled (added in 2a.3)", () => {
    const event = registry.events.find((e) => e.type === "booking.rescheduled");
    assert.ok(event, "booking.rescheduled should be in registry");
    assert.equal(event!.fields.appointmentId.rawType, "string");
    assert.equal(event!.fields.previousStartsAt.rawType, "string");
    assert.equal(event!.fields.newStartsAt.rawType, "string");
    assert.equal(event!.fields.contactId.nullable, true);
  });

  test("includes core CRM events", () => {
    for (const name of ["contact.created", "contact.updated", "deal.stage_changed"]) {
      const event = registry.events.find((e) => e.type === name);
      assert.ok(event, `${name} should be in registry`);
    }
  });

  test("every event has a fields object (may be empty but present)", () => {
    for (const event of registry.events) {
      assert.equal(typeof event.fields, "object");
    }
  });

  test("every event type matches the dot-notation pattern (2+ segments allowed)", () => {
    for (const event of registry.events) {
      assert.match(event.type, /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/);
    }
  });
});

// ---------------------------------------------------------------------
// serializeRegistry — deterministic + committed file stays aligned
// ---------------------------------------------------------------------

describe("serializeRegistry + committed JSON", () => {
  test("serialization is deterministic (same input → byte-identical output)", () => {
    const source = readFileSync(EVENTS_SOURCE_PATH, "utf8");
    const registry = buildEventRegistry(source);
    assert.equal(serializeRegistry(registry), serializeRegistry(registry));
  });

  test("committed event-registry.json matches freshly-emitted output", () => {
    const source = readFileSync(EVENTS_SOURCE_PATH, "utf8");
    const registry = buildEventRegistry(source);
    const fresh = serializeRegistry(registry);
    const committed = readFileSync(REGISTRY_JSON_PATH, "utf8");
    assert.equal(committed, fresh, "committed registry is out of date — run `pnpm emit:event-registry`");
  });
});
