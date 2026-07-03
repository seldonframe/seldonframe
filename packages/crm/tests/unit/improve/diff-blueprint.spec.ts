// Improve verb + trust rail (2026-07-02) — Task 12: the field-diff helper
// backing the Studio improve panel.
//
// TDD focus: `diffBlueprintFields(before, after)` is a PURE, string-
// serializing diff between the agent's CURRENT blueprint and a proposed
// PATCH (`Partial<AgentBlueprint>` — never the full blueprint). Per the
// brief's interface + step list:
//   - only fields PRESENT in the patch are considered at all (a field the
//     patch doesn't touch never appears, even if it exists on `before`);
//   - a patch field whose value is deep-equal to the current value is
//     OMITTED (unchanged fields don't clutter the diff);
//   - a patch field whose value differs is included as
//     `{ field, before, after }`, both sides STRING-serialized;
//   - array/object values are JSON-serialized compactly (no pretty-print
//     whitespace) so the panel can render them as one-line diff rows;
//   - primitives (string/boolean/number) render as their plain string form,
//     not JSON-quoted (so `"Hello"` reads as `Hello`, not `"Hello"`);
//   - undefined/missing `before` field (patch adds a field the blueprint
//     never had) reads as an empty-string before side, not "undefined".

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { diffBlueprintFields } from "@/lib/agents/improve/diff-blueprint";
import type { AgentBlueprint } from "@/db/schema/agents";

function blueprint(overrides: Partial<AgentBlueprint> = {}): AgentBlueprint {
  return {
    greeting: "Hi, thanks for calling!",
    capabilities: ["look_up_availability", "book_appointment"],
    voice: "alloy",
    ...overrides,
  };
}

describe("diffBlueprintFields", () => {
  test("changed string field is included, before/after as plain strings", () => {
    const before = blueprint({ greeting: "Hi, thanks for calling!" });
    const after: Partial<AgentBlueprint> = { greeting: "Hello! How can I help?" };

    const diff = diffBlueprintFields(before, after);

    assert.deepEqual(diff, [
      {
        field: "greeting",
        before: "Hi, thanks for calling!",
        after: "Hello! How can I help?",
      },
    ]);
  });

  test("unchanged field present in the patch is OMITTED entirely", () => {
    const before = blueprint({ greeting: "Same greeting" });
    const after: Partial<AgentBlueprint> = { greeting: "Same greeting" };

    const diff = diffBlueprintFields(before, after);

    assert.deepEqual(diff, []);
  });

  test("a field the patch doesn't touch never appears, even if it differs conceptually", () => {
    const before = blueprint({ greeting: "Hi!", voice: "alloy" });
    // Patch only touches greeting — voice must be absent from the diff even
    // though it's a real field on `before`.
    const after: Partial<AgentBlueprint> = { greeting: "Hello!" };

    const diff = diffBlueprintFields(before, after);

    assert.equal(diff.length, 1);
    assert.equal(diff[0]?.field, "greeting");
    assert.ok(!diff.some((d) => d.field === "voice"));
  });

  test("array field value is JSON-serialized compactly (no pretty-print whitespace)", () => {
    const before = blueprint({ capabilities: ["look_up_availability"] });
    const after: Partial<AgentBlueprint> = {
      capabilities: ["look_up_availability", "escalate_to_human"],
    };

    const diff = diffBlueprintFields(before, after);

    assert.deepEqual(diff, [
      {
        field: "capabilities",
        before: '["look_up_availability"]',
        after: '["look_up_availability","escalate_to_human"]',
      },
    ]);
  });

  test("array of objects (faq) is JSON-serialized compactly", () => {
    const before = blueprint({ faq: [{ q: "Hours?", a: "9-5" }] });
    const after: Partial<AgentBlueprint> = {
      faq: [
        { q: "Hours?", a: "9-5" },
        { q: "Parking?", a: "Free lot out back" },
      ],
    };

    const diff = diffBlueprintFields(before, after);

    assert.equal(diff.length, 1);
    assert.equal(diff[0]?.field, "faq");
    assert.equal(diff[0]?.before, '[{"q":"Hours?","a":"9-5"}]');
    assert.equal(
      diff[0]?.after,
      '[{"q":"Hours?","a":"9-5"},{"q":"Parking?","a":"Free lot out back"}]',
    );
  });

  test("plain object field (toneOverrides) is JSON-serialized compactly", () => {
    const before = blueprint({ toneOverrides: { warmth: 0.5 } });
    const after: Partial<AgentBlueprint> = { toneOverrides: { warmth: 0.8, formality: 0.2 } };

    const diff = diffBlueprintFields(before, after);

    assert.deepEqual(diff, [
      {
        field: "toneOverrides",
        before: '{"warmth":0.5}',
        after: '{"warmth":0.8,"formality":0.2}',
      },
    ]);
  });

  test("boolean field renders as plain 'true'/'false', not JSON-quoted", () => {
    const before = blueprint({ postCallMetaPitch: false });
    const after: Partial<AgentBlueprint> = { postCallMetaPitch: true };

    const diff = diffBlueprintFields(before, after);

    assert.deepEqual(diff, [
      { field: "postCallMetaPitch", before: "false", after: "true" },
    ]);
  });

  test("missing `before` field (patch adds a field the blueprint never had) reads as empty string", () => {
    const before = blueprint(); // no notifyPhone key at all
    const after: Partial<AgentBlueprint> = { notifyPhone: "+15551234567" };

    const diff = diffBlueprintFields(before, after);

    assert.deepEqual(diff, [
      { field: "notifyPhone", before: "", after: "+15551234567" },
    ]);
  });

  test("multiple changed fields are all included, each its own row", () => {
    const before = blueprint({ greeting: "Hi!", voice: "alloy" });
    const after: Partial<AgentBlueprint> = { greeting: "Hello!", voice: "echo" };

    const diff = diffBlueprintFields(before, after);

    assert.equal(diff.length, 2);
    assert.deepEqual(
      diff.map((d) => d.field).sort(),
      ["greeting", "voice"],
    );
  });

  test("empty patch produces an empty diff", () => {
    const before = blueprint();
    const after: Partial<AgentBlueprint> = {};

    const diff = diffBlueprintFields(before, after);

    assert.deepEqual(diff, []);
  });

  test("is PURE — never mutates either input", () => {
    const before = blueprint({ greeting: "Hi!" });
    const after: Partial<AgentBlueprint> = { greeting: "Hello!", capabilities: ["a", "b"] };
    const beforeSnapshot = JSON.stringify(before);
    const afterSnapshot = JSON.stringify(after);

    diffBlueprintFields(before, after);

    assert.equal(JSON.stringify(before), beforeSnapshot);
    assert.equal(JSON.stringify(after), afterSnapshot);
  });
});
