// Tests for the BLOCK.md renderer — the BlockSpec → markdown text
// template. PR 1 C2 per SLICE 2 audit §3.4.
//
// Strategy: assert on exact substrings + round-trip through
// parseBlockMd (from SLICE 1 PR 1). If parseBlockMd rejects the
// output, the renderer is broken.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { parseBlockMd } from "../../../src/lib/blocks/block-md";
import { renderBlockMd } from "../../../src/lib/scaffolding/render/block-md";
import type { BlockSpec } from "../../../src/lib/scaffolding/spec";

function minimalSpec(): BlockSpec {
  return {
    slug: "notes",
    title: "Notes",
    description: "Simple note-taking block for internal notes on contacts.",
    triggerPhrases: ["Add a notes block", "Install notes"],
    frameworks: ["universal"],
    produces: [],
    consumes: [],
    tools: [],
    subscriptions: [],
    entities: [],
    customer_surfaces: { display: [], actions: [] },
  };
}

describe("renderBlockMd — frontmatter + header", () => {
  test("includes frontmatter with id, scope, frameworks, status=draft", () => {
    const out = renderBlockMd(minimalSpec());
    assert.match(out, /^---\n/);
    assert.match(out, /\nid: notes\n/);
    assert.match(out, /\nscope: universal\n/);
    assert.match(out, /\nstatus: draft\n/);
    assert.match(out, /\nframeworks: universal\n/);
  });

  test("includes title + description in the header block", () => {
    const out = renderBlockMd(minimalSpec());
    assert.match(out, /# BLOCK: Notes\n/);
    assert.match(out, /\*\*Description\*\*\n/);
    assert.match(out, /Simple note-taking block/);
  });

  test("renders trigger phrases as bulleted list", () => {
    const out = renderBlockMd(minimalSpec());
    assert.match(out, /\*\*Trigger Phrases\*\*\n/);
    assert.match(out, /- "Add a notes block"/);
    assert.match(out, /- "Install notes"/);
  });
});

describe("renderBlockMd — composition contract", () => {
  test("includes produces, consumes, verbs, compose_with lines", () => {
    const out = renderBlockMd(minimalSpec());
    assert.match(out, /## Composition Contract\n/);
    assert.match(out, /\nproduces: \[\]\n/);
    assert.match(out, /\nconsumes: \[\]\n/);
    assert.match(out, /\nverbs: \[\]\n/);
    assert.match(out, /\ncompose_with: \[crm\]\n/);
  });

  test("renders produces entries as JSON objects", () => {
    const spec: BlockSpec = {
      ...minimalSpec(),
      produces: [
        { name: "note.created", fields: [{ name: "noteId", type: "string", nullable: false }] },
      ],
    };
    const out = renderBlockMd(spec);
    assert.match(out, /produces: \[\{"event":"note\.created"\}\]/);
  });

  test("infers verbs from tool names", () => {
    const spec: BlockSpec = {
      ...minimalSpec(),
      tools: [
        { name: "create_note", description: "x", args: [], returns: [], emits: [] },
        { name: "list_notes", description: "x", args: [], returns: [], emits: [] },
      ],
    };
    const out = renderBlockMd(spec);
    assert.match(out, /\nverbs: \[create, list\]\n/);
  });

  test("empty TOOLS markers are ALWAYS present, even for tool-less blocks", () => {
    const out = renderBlockMd(minimalSpec());
    assert.match(out, /<!-- TOOLS:START -->/);
    assert.match(out, /<!-- TOOLS:END -->/);
    // Between markers: an empty JSON array ready for emit:blocks to populate.
    assert.match(out, /<!-- TOOLS:START -->\n\[\]\n<!-- TOOLS:END -->/);
  });
});

describe("renderBlockMd — subscriptions section", () => {
  test("subscriptions section OMITTED when spec.subscriptions is empty", () => {
    const out = renderBlockMd(minimalSpec());
    assert.ok(!out.includes("## Subscriptions"));
    assert.ok(!out.includes("SUBSCRIPTIONS:START"));
  });

  test("subscriptions section RENDERED when spec has entries", () => {
    const spec: BlockSpec = {
      ...minimalSpec(),
      subscriptions: [
        {
          event: "caldiy-booking:booking.created",
          handlerName: "logNoteOnBookingCreate",
          description: "Log a note when a booking is created",
          idempotencyKey: "{{id}}",
        },
      ],
    };
    const out = renderBlockMd(spec);
    assert.match(out, /## Subscriptions\n/);
    assert.match(out, /<!-- SUBSCRIPTIONS:START -->/);
    assert.match(out, /<!-- SUBSCRIPTIONS:END -->/);
    assert.match(out, /"event":"caldiy-booking:booking\.created"/);
    assert.match(out, /"handler":"logNoteOnBookingCreate"/);
  });
});

describe("renderBlockMd — round-trip through parseBlockMd", () => {
  test("empty spec parses cleanly without malformed flags", () => {
    const out = renderBlockMd(minimalSpec());
    const parsed = parseBlockMd(out);
    assert.ok(
      !parsed.composition.mixedShapeFields.includes("__tools_malformed__"),
      "TOOLS block not malformed",
    );
    assert.ok(
      !parsed.composition.mixedShapeFields.includes("__subscriptions_malformed__"),
      "Subscriptions block not malformed",
    );
    assert.deepEqual(parsed.composition.produces, []);
  });

  test("populated spec round-trips — produces + subscriptions + auto-populated consumes", () => {
    const spec: BlockSpec = {
      ...minimalSpec(),
      produces: [{ name: "note.created", fields: [] }],
      subscriptions: [
        {
          event: "caldiy-booking:booking.created",
          handlerName: "logNoteOnBookingCreate",
          description: "x",
          idempotencyKey: "{{id}}",
        },
      ],
    };
    const out = renderBlockMd(spec);
    const parsed = parseBlockMd(out);
    assert.deepEqual(parsed.composition.produces, ["note.created"]);
    assert.equal(parsed.composition.subscriptions?.length, 1);
    // Auto-populate consumes (audit §3.4) adds booking.created via
    // the subscription's source-block prefix.
    assert.ok(parsed.composition.consumes.includes("booking.created"));
  });
});
