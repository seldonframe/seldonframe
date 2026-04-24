// Tests for addEventsToSeldonUnion — the AST-located splice editor
// that adds new event variants to the SeldonEvent union in
// packages/core/src/events/index.ts. Shipped in SLICE 2 PR 2 C1 per
// audit §3.7 + G-2.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { addEventsToSeldonUnion } from "../../../src/lib/scaffolding/ast-event-union";

const MIN_UNION = `
import type { EventEnvelope } from "./envelope";

export type SeldonEvent =
  | { type: "contact.created"; data: { contactId: string } }
  | { type: "contact.updated"; data: { contactId: string } };
`;

describe("addEventsToSeldonUnion — happy path (AST)", () => {
  test("appends one new variant before the terminating semicolon", () => {
    const spec = makeSpec([
      { name: "note.created", fields: [{ name: "noteId", type: "string", nullable: false }] },
    ]);
    const result = addEventsToSeldonUnion(MIN_UNION, spec);
    assert.ok(result.astPath, "AST path should succeed on well-formed source");
    assert.deepEqual(result.added, ["note.created"]);
    assert.match(result.source, /\| \{ type: "note\.created"; data: \{ noteId: string \} \}/);
    // Existing variants preserved.
    assert.match(result.source, /\| \{ type: "contact\.created"; data: \{ contactId: string \} \}/);
    assert.match(result.source, /\| \{ type: "contact\.updated"; data: \{ contactId: string \} \}/);
  });

  test("renders nullable fields as `| null` in the variant", () => {
    const spec = makeSpec([
      {
        name: "note.created",
        fields: [
          { name: "noteId", type: "string", nullable: false },
          { name: "contactId", type: "string", nullable: true },
        ],
      },
    ]);
    const result = addEventsToSeldonUnion(MIN_UNION, spec);
    assert.match(result.source, /\{ noteId: string; contactId: string \| null \}/);
  });

  test("renders empty-fields event as `data: {}`", () => {
    const spec = makeSpec([{ name: "pulse.fired", fields: [] }]);
    const result = addEventsToSeldonUnion(MIN_UNION, spec);
    assert.match(result.source, /\| \{ type: "pulse\.fired"; data: \{\} \}/);
  });

  test("appends multiple events in order", () => {
    const spec = makeSpec([
      { name: "a.one", fields: [] },
      { name: "a.two", fields: [] },
      { name: "a.three", fields: [] },
    ]);
    const result = addEventsToSeldonUnion(MIN_UNION, spec);
    assert.deepEqual(result.added, ["a.one", "a.two", "a.three"]);
    // Order preserved.
    const idxOne = result.source.indexOf("a.one");
    const idxTwo = result.source.indexOf("a.two");
    const idxThree = result.source.indexOf("a.three");
    assert.ok(idxOne < idxTwo && idxTwo < idxThree);
  });
});

describe("addEventsToSeldonUnion — idempotent", () => {
  test("running twice doesn't duplicate — second run has added=[]", () => {
    const spec = makeSpec([{ name: "note.created", fields: [] }]);
    const first = addEventsToSeldonUnion(MIN_UNION, spec);
    const second = addEventsToSeldonUnion(first.source, spec);
    assert.deepEqual(first.added, ["note.created"]);
    assert.deepEqual(second.added, [], "second run is a no-op");
    assert.equal(second.source, first.source, "source unchanged on re-run");
  });

  test("partial overlap — only truly-new events added", () => {
    const spec = makeSpec([
      { name: "contact.created", fields: [] }, // already exists
      { name: "note.created", fields: [] }, // new
    ]);
    const result = addEventsToSeldonUnion(MIN_UNION, spec);
    assert.deepEqual(result.added, ["note.created"]);
  });
});

describe("addEventsToSeldonUnion — preserves formatting", () => {
  test("trailing content after `;` is preserved", () => {
    const sourceWithTrailing = MIN_UNION + "\nexport const x = 1;\n";
    const spec = makeSpec([{ name: "note.created", fields: [] }]);
    const result = addEventsToSeldonUnion(sourceWithTrailing, spec);
    assert.match(result.source, /export const x = 1;/);
  });

  test("comments between variants are preserved", () => {
    const source = `
export type SeldonEvent =
  // a comment
  | { type: "contact.created"; data: { contactId: string } }
  // another comment
  | { type: "contact.updated"; data: { contactId: string } };
`;
    const spec = makeSpec([{ name: "note.created", fields: [] }]);
    const result = addEventsToSeldonUnion(source, spec);
    assert.match(result.source, /\/\/ a comment/);
    assert.match(result.source, /\/\/ another comment/);
    assert.match(result.source, /\| \{ type: "note\.created"; data: \{\} \}/);
  });
});

describe("addEventsToSeldonUnion — validation failures", () => {
  test("SeldonEvent declaration missing from source → throws", () => {
    const noUnion = "export const x = 1;";
    const spec = makeSpec([{ name: "note.created", fields: [] }]);
    let thrown: unknown = null;
    try {
      addEventsToSeldonUnion(noUnion, spec);
    } catch (e) {
      thrown = e;
    }
    assert.ok(thrown instanceof Error);
    assert.match((thrown as Error).message, /SeldonEvent/);
  });
});

describe("addEventsToSeldonUnion — text-splice fallback", () => {
  test("syntactically-broken source → AST fails, fallback handles simple append", () => {
    // Malformed source (mismatched braces) — ts.createSourceFile can
    // still parse but the normal AST walk won't find a clean
    // TypeAliasDeclaration. The fallback should still find the
    // `export type SeldonEvent = ...;` pattern and append.
    // In practice, this scenario is rare; the test pins the behavior.
    const brokenButRecoverable = `
export type SeldonEvent =
  | { type: "x.a"; data: { foo: string } }
  | { type: "x.b"; data: { bar: number } };

// Below: extraneous syntax that makes some AST walks error out,
// but the SeldonEvent block itself is well-formed.
const z = ;
`;
    const spec = makeSpec([{ name: "note.created", fields: [] }]);
    // Should still land the event — either via AST (if ts is
    // permissive, which it often is) or via fallback.
    const result = addEventsToSeldonUnion(brokenButRecoverable, spec);
    assert.deepEqual(result.added, ["note.created"]);
    assert.match(result.source, /\| \{ type: "note\.created"; data: \{\} \}/);
  });
});

// Helpers
function makeSpec(produces: Array<{ name: string; fields: Array<{ name: string; type: "string" | "number" | "boolean" | "integer"; nullable: boolean }> }>) {
  return {
    slug: "x",
    title: "X",
    description: "x",
    triggerPhrases: [],
    frameworks: ["universal"],
    produces,
    consumes: [],
    tools: [],
    subscriptions: [],
    entities: [],
  };
}
