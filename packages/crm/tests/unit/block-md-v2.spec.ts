// Unit tests for lib/blocks/block-md.ts — Scope 3 Step 2b.1 PR 1 C5.
// Covers parser extension for v2 coexistence, tools-block parsing,
// intentionally-invisible marker handling, and validator warnings.
// Ships alongside the parser changes per Max's "tests alongside code"
// directive.
//
// Existing v1 parser unit tests: NONE pre-2b.1 (confirmed via Glob —
// no *.test.* under packages/crm/src before this slice). v1 regression
// coverage therefore ships HERE: feed the 7 shipped core blocks + 11
// recipe blocks through parseBlockMd and assert the existing behavior
// is intact.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import {
  parseBlockMd,
  validateCompositionContract,
} from "../../src/lib/blocks/block-md";

const BLOCKS_DIR = path.resolve(__dirname, "../../src/blocks");

function readBlock(name: string): string {
  return readFileSync(path.join(BLOCKS_DIR, `${name}.block.md`), "utf8");
}

// ---------------------------------------------------------------------
// v1 regression — the 7 core blocks still on legacy shape parse
// exactly as they did pre-2b.1. Guards against silent drift when the
// parser gets reworked.
// ---------------------------------------------------------------------

describe("core blocks — v1 parse + v2 parse coexistence", () => {
  // CRM migrated to v2 in Scope 3 Step 2b.1 PR 3 (2026-04-22) as the
  // pattern-validator. Booking migrated as first 2b.2 block (2026-04-22,
  // risk-front-loaded — highest archetype coverage). The remaining 5
  // core blocks stay on v1 until their 2b.2 migrations.
  const cases: Array<{ name: string; produces: number; composeMin: number; isV2: boolean }> = [
    { name: "crm", produces: 3, composeMin: 7, isV2: true },
    { name: "caldiy-booking", produces: 5, composeMin: 6, isV2: true },
    { name: "email", produces: 9, composeMin: 6, isV2: false },
    { name: "sms", produces: 7, composeMin: 6, isV2: false },
    { name: "payments", produces: 14, composeMin: 5, isV2: false },
    { name: "formbricks-intake", produces: 2, composeMin: 5, isV2: false },
    { name: "landing-pages", produces: 5, composeMin: 7, isV2: false },
  ];

  for (const { name, produces, composeMin, isV2 } of cases) {
    test(`${name}: produces = ${produces}, composeWith >= ${composeMin}, isV2 = ${isV2}`, () => {
      const parsed = parseBlockMd(readBlock(name));
      assert.equal(parsed.composition.produces.length, produces);
      assert.ok(
        parsed.composition.composeWith.length >= composeMin,
        `expected composeWith length >= ${composeMin}, got ${parsed.composition.composeWith.length}`,
      );
      assert.equal(parsed.composition.isV2, isV2);
      assert.equal(parsed.intentionallyInvisible, false);
    });
  }
});

describe("validator — v1 blocks get legacy_contract; v2 blocks don't", () => {
  for (const name of ["crm", "caldiy-booking"]) {
    test(`${name} (v2-migrated) does NOT surface legacy_contract`, () => {
      const parsed = parseBlockMd(readBlock(name));
      const warnings = validateCompositionContract(parsed);
      const codes = warnings.map((w) => w.code);
      assert.ok(!codes.includes("legacy_contract"), `expected no legacy_contract on v2 ${name}; got: ${codes.join(", ")}`);
      assert.ok(!codes.includes("empty_contract"));
      assert.ok(!codes.includes("mixed_v1_v2"));
      assert.ok(!codes.includes("malformed_tools"));
    });
  }

  for (const name of ["email", "sms", "payments", "formbricks-intake", "landing-pages"]) {
    test(`${name} (still on v1) surfaces exactly one legacy_contract warning and no errors`, () => {
      const parsed = parseBlockMd(readBlock(name));
      const warnings = validateCompositionContract(parsed);
      const codes = warnings.map((w) => w.code);
      assert.equal(codes.filter((c) => c === "legacy_contract").length, 1);
      assert.ok(!codes.includes("empty_contract"));
      assert.ok(!codes.includes("mixed_v1_v2"));
      assert.ok(!codes.includes("malformed_tools"));
    });
  }
});

// ---------------------------------------------------------------------
// Intentionally-invisible marker — the 11 recipe blocks must produce
// ZERO warnings per audit §7.5.
// ---------------------------------------------------------------------

describe("§7.5 stamped recipe blocks parse with zero warnings", () => {
  const recipeBlocks = readdirSync(BLOCKS_DIR)
    .filter((f) => f.endsWith(".block.md"))
    .filter((f) => {
      const content = readFileSync(path.join(BLOCKS_DIR, f), "utf8");
      return content.includes("Intentionally invisible to agent");
    });

  test(`discovers 11 marker-stamped recipe blocks`, () => {
    assert.equal(recipeBlocks.length, 11, `expected 11 stamped blocks, found ${recipeBlocks.length}`);
  });

  for (const file of recipeBlocks) {
    test(`${file} parses as intentionally invisible with zero warnings`, () => {
      const content = readFileSync(path.join(BLOCKS_DIR, file), "utf8");
      const parsed = parseBlockMd(content);
      assert.equal(parsed.intentionallyInvisible, true);
      const warnings = validateCompositionContract(parsed);
      assert.deepEqual(warnings, []);
    });
  }
});

// ---------------------------------------------------------------------
// v2 shape parsing — synthetic BLOCK.md fixtures covering the v2
// produces/consumes shapes + tools block.
// ---------------------------------------------------------------------

describe("v2 shape parsing", () => {
  const v2Block = `---
id: fake-v2-block
scope: universal
---
# BLOCK: Fake V2 Block

## Composition Contract

produces: [{"event": "contact.created"}, {"event": "contact.updated"}]
consumes: [{"kind": "event", "event": "form.submitted"}, {"kind": "soul_field", "soul_field": "workspace.soul.business_type", "type": "string"}]
verbs: [track, remember]
compose_with: [email, sms]

<!-- TOOLS:START -->
[
  {
    "name": "fake_create_contact",
    "description": "Create a fake contact.",
    "args": { "type": "object", "properties": { "name": { "type": "string" } }, "required": ["name"] },
    "returns": { "type": "object" },
    "emits": ["contact.created"]
  }
]
<!-- TOOLS:END -->
`;

  test("parses v2 produces as typed entries and flattens to event names", () => {
    const parsed = parseBlockMd(v2Block);
    assert.equal(parsed.composition.isV2, true);
    assert.equal(parsed.composition.producesTyped?.length, 2);
    assert.deepEqual(parsed.composition.produces, ["contact.created", "contact.updated"]);
  });

  test("parses v2 consumes as typed entries with kind discriminator", () => {
    const parsed = parseBlockMd(v2Block);
    assert.equal(parsed.composition.consumesTyped?.length, 2);
    assert.equal(parsed.composition.consumesTyped?.[0].kind, "event");
    assert.equal(parsed.composition.consumesTyped?.[1].kind, "soul_field");
  });

  test("parses <!-- TOOLS --> block into tools array", () => {
    const parsed = parseBlockMd(v2Block);
    assert.equal(parsed.composition.tools?.length, 1);
    assert.equal(parsed.composition.tools?.[0].name, "fake_create_contact");
    assert.deepEqual(parsed.composition.tools?.[0].emits, ["contact.created"]);
  });

  test("v2 blocks do NOT trigger the legacy_contract warning", () => {
    const parsed = parseBlockMd(v2Block);
    const warnings = validateCompositionContract(parsed);
    assert.ok(!warnings.some((w) => w.code === "legacy_contract"));
  });

  test("keeps verbs + compose_with on the v1 string-array shape (only produces/consumes gain typing)", () => {
    const parsed = parseBlockMd(v2Block);
    assert.deepEqual(parsed.composition.verbs, ["track", "remember"]);
    assert.deepEqual(parsed.composition.composeWith, ["email", "sms"]);
  });
});

// ---------------------------------------------------------------------
// Mixed-v1-v2 rejection — audit §3 rule 3.
// ---------------------------------------------------------------------

describe("mixed-shape rejection", () => {
  const mixedBlock = `---
id: fake-mixed
scope: universal
---
# BLOCK: Fake Mixed

## Composition Contract

produces: ["contact.created", {"event": "contact.updated"}]
verbs: [track]
compose_with: [email]
`;

  test("parser flags mixed_v1_v2 for produces with string + object entries", () => {
    const parsed = parseBlockMd(mixedBlock);
    assert.ok(parsed.composition.mixedShapeFields.includes("produces"));
  });

  test("validator surfaces a mixed_v1_v2 warning", () => {
    const parsed = parseBlockMd(mixedBlock);
    const warnings = validateCompositionContract(parsed);
    assert.ok(warnings.some((w) => w.code === "mixed_v1_v2" && w.message.includes("produces")));
  });
});

// ---------------------------------------------------------------------
// Tools block — malformed JSON + tool-emits-not-in-produces.
// ---------------------------------------------------------------------

describe("TOOLS block validation", () => {
  const malformedJson = `---
id: fake
scope: universal
---
# BLOCK: Fake

## Composition Contract

produces: [contact.created]
verbs: [track]
compose_with: [email]

<!-- TOOLS:START -->
not valid JSON [}
<!-- TOOLS:END -->
`;

  test("malformed TOOLS JSON surfaces malformed_tools warning", () => {
    const parsed = parseBlockMd(malformedJson);
    const warnings = validateCompositionContract(parsed);
    assert.ok(warnings.some((w) => w.code === "malformed_tools"));
  });

  const emitMismatchBlock = `---
id: fake
scope: universal
---
# BLOCK: Fake

## Composition Contract

produces: [{"event": "contact.created"}]
consumes: []
verbs: [track]
compose_with: [email]

<!-- TOOLS:START -->
[
  {
    "name": "fake_tool",
    "description": "x",
    "args": {},
    "returns": {},
    "emits": ["contact.deleted"]
  }
]
<!-- TOOLS:END -->
`;

  test("tool_emits_not_in_produces fires when a tool claims an event the block doesn't produce", () => {
    const parsed = parseBlockMd(emitMismatchBlock);
    const warnings = validateCompositionContract(parsed);
    const match = warnings.find((w) => w.code === "tool_emits_not_in_produces");
    assert.ok(match, "expected tool_emits_not_in_produces warning");
    assert.ok(match!.message.includes("contact.deleted"));
    assert.ok(match!.message.includes("fake_tool"));
  });

  test("well-formed v2 block with matching emits has zero v2-specific warnings", () => {
    const ok = emitMismatchBlock.replace('"contact.deleted"', '"contact.created"');
    const parsed = parseBlockMd(ok);
    const warnings = validateCompositionContract(parsed);
    const codes = warnings.map((w) => w.code);
    assert.ok(!codes.includes("tool_emits_not_in_produces"));
    assert.ok(!codes.includes("malformed_tools"));
    assert.ok(!codes.includes("mixed_v1_v2"));
    assert.ok(!codes.includes("legacy_contract"), "v2 block should not get legacy_contract");
  });
});

// ---------------------------------------------------------------------
// Empty contract (still triggered when no marker + no fields).
// ---------------------------------------------------------------------

describe("empty contract handling", () => {
  test("block with no contract section AND no invisibility marker surfaces empty_contract", () => {
    const empty = `---
id: no-contract
---
# BLOCK: No Contract

some prose with no contract section.
`;
    const parsed = parseBlockMd(empty);
    const warnings = validateCompositionContract(parsed);
    assert.ok(warnings.some((w) => w.code === "empty_contract"));
  });
});
