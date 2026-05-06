// ============================================================================
// v1.12.0 — composite-block tree validation (Zod + structural rules)
// ============================================================================
//
// Tests for the composite primitive vocabulary: 12 node kinds, depth cap,
// children-per-container caps, length caps, heading-level descent, voice
// (avoidWords) warnings.
//
// First-principles reminder: a "block" is a tree of low-level primitives
// (section/row/col/card + heading/text/image/list/button/stat/embed/
// divider/spacer). The agent composes; the server validates the
// composition + renders. New block types (comparison, pricing, gallery,
// "how it works") need NO server-side type-per-block work — they're
// just trees the agent builds.
//
// This spec covers the PURE validation logic (Zod schema + structural
// validators). Render output is in composite-block-render.spec.ts.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CompositeNodeSchema,
  validateCompositeTree,
  scanForVoiceViolations,
  MAX_TREE_DEPTH,
  MAX_SECTION_CHILDREN,
  MAX_ROW_CHILDREN,
  MAX_CARD_CHILDREN,
  MAX_LIST_ITEMS,
} from "@/lib/page-blocks/composite/schema";
import type { CompositeNode } from "@/lib/page-blocks/composite/schema";

// ─── basic Zod parse — each primitive kind ─────────────────────────────────

test("CompositeNodeSchema accepts a minimal section", () => {
  const r = CompositeNodeSchema.safeParse({
    kind: "section",
    children: [],
  });
  assert.equal(r.success, true);
});

test("CompositeNodeSchema accepts a heading at level 1, 2, 3", () => {
  for (const level of [1, 2, 3]) {
    const r = CompositeNodeSchema.safeParse({ kind: "heading", level, text: "X" });
    assert.equal(r.success, true, `expected level ${level} to parse`);
  }
});

test("CompositeNodeSchema rejects heading level 4+", () => {
  const r = CompositeNodeSchema.safeParse({ kind: "heading", level: 4, text: "X" });
  assert.equal(r.success, false);
});

test("CompositeNodeSchema accepts a text node with optional emphasis", () => {
  const r1 = CompositeNodeSchema.safeParse({ kind: "text", text: "hello" });
  assert.equal(r1.success, true);
  const r2 = CompositeNodeSchema.safeParse({ kind: "text", text: "hello", emphasis: "muted" });
  assert.equal(r2.success, true);
  const r3 = CompositeNodeSchema.safeParse({ kind: "text", text: "hello", emphasis: "huge" });
  assert.equal(r3.success, false);
});

test("CompositeNodeSchema accepts list with all four styles", () => {
  for (const style of ["bullet", "check", "x", "number"]) {
    const r = CompositeNodeSchema.safeParse({
      kind: "list",
      style,
      items: ["a", "b"],
    });
    assert.equal(r.success, true, `expected style=${style} to parse`);
  }
});

test("CompositeNodeSchema accepts button with each action kind", () => {
  for (const action of [
    { kind: "navigate", href: "/about" },
    { kind: "book" },
    { kind: "intake" },
    { kind: "phone" },
  ]) {
    const r = CompositeNodeSchema.safeParse({ kind: "button", label: "Go", action });
    assert.equal(r.success, true, `expected action.kind=${action.kind} to parse`);
  }
});

test("CompositeNodeSchema rejects button with unknown action kind", () => {
  const r = CompositeNodeSchema.safeParse({
    kind: "button",
    label: "Go",
    action: { kind: "summon-demon" },
  });
  assert.equal(r.success, false);
});

test("CompositeNodeSchema accepts embed with each known ref", () => {
  for (const ref of ["services", "faq", "testimonials", "hours", "phone"]) {
    const r = CompositeNodeSchema.safeParse({ kind: "embed", ref });
    assert.equal(r.success, true, `expected ref=${ref} to parse`);
  }
});

test("CompositeNodeSchema rejects embed with unknown ref", () => {
  const r = CompositeNodeSchema.safeParse({ kind: "embed", ref: "secret-data" });
  assert.equal(r.success, false);
});

test("CompositeNodeSchema rejects unknown node kind", () => {
  const r = CompositeNodeSchema.safeParse({ kind: "iframe", url: "http://hostile.example" });
  assert.equal(r.success, false);
});

// ─── nested structures parse ───────────────────────────────────────────────

test("CompositeNodeSchema accepts a 2-card row inside a section (the 'comparison' pattern)", () => {
  const tree: unknown = {
    kind: "section",
    eyebrow: "Why us",
    headline: "With us vs. doing it yourself",
    children: [
      {
        kind: "row",
        cols: 2,
        children: [
          {
            kind: "card",
            children: [
              { kind: "heading", level: 3, text: "With Cypress & Pine" },
              {
                kind: "list",
                style: "check",
                items: ["Same-day service", "Licensed & insured", "12 yrs experience"],
              },
            ],
          },
          {
            kind: "card",
            variant: "muted",
            children: [
              { kind: "heading", level: 3, text: "Doing it yourself" },
              {
                kind: "list",
                style: "x",
                items: ["Tools you don't own", "No insurance", "Hours on YouTube"],
              },
            ],
          },
        ],
      },
    ],
  };
  const r = CompositeNodeSchema.safeParse(tree);
  assert.equal(r.success, true);
});

// ─── validateCompositeTree — structural rules beyond Zod ───────────────────

test("validateCompositeTree rejects trees deeper than MAX_TREE_DEPTH", () => {
  // section > row > card > row > card > ... — too deep.
  // MAX_TREE_DEPTH=4 means the deepest leaf is at depth 4 from the root.
  // A row at depth 4 with children at depth 5 should reject.
  const tooDeep: CompositeNode = {
    kind: "section",
    children: [
      {
        kind: "row",
        cols: 2,
        children: [
          {
            kind: "card",
            children: [
              {
                kind: "row",
                cols: 2,
                children: [
                  // This card is at depth 5 — over the cap.
                  { kind: "card", children: [{ kind: "text", text: "deep" }] } as unknown as CompositeNode,
                  { kind: "card", children: [{ kind: "text", text: "deep" }] } as unknown as CompositeNode,
                ],
              } as unknown as CompositeNode,
            ],
          },
          {
            kind: "card",
            children: [{ kind: "text", text: "shallow" }],
          },
        ],
      },
    ],
  };
  const r = validateCompositeTree(tooDeep);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.ok(r.errors.some((e) => /depth/i.test(e)));
});

test("validateCompositeTree rejects section with > MAX_SECTION_CHILDREN children", () => {
  const tree: CompositeNode = {
    kind: "section",
    children: Array.from({ length: MAX_SECTION_CHILDREN + 1 }, () => ({
      kind: "text",
      text: "X",
    })) as unknown as CompositeNode[],
  };
  const r = validateCompositeTree(tree);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.ok(r.errors.some((e) => /section.*children|too many/i.test(e)));
});

test("validateCompositeTree rejects row with > MAX_ROW_CHILDREN", () => {
  const tree: CompositeNode = {
    kind: "section",
    children: [
      {
        kind: "row",
        cols: 4,
        children: Array.from({ length: MAX_ROW_CHILDREN + 1 }, () => ({
          kind: "text",
          text: "X",
        })) as unknown as CompositeNode[],
      },
    ],
  };
  const r = validateCompositeTree(tree);
  assert.equal(r.ok, false);
});

test("validateCompositeTree rejects card with > MAX_CARD_CHILDREN", () => {
  const tree: CompositeNode = {
    kind: "section",
    children: [
      {
        kind: "card",
        children: Array.from({ length: MAX_CARD_CHILDREN + 1 }, () => ({
          kind: "text",
          text: "X",
        })) as unknown as CompositeNode[],
      },
    ],
  };
  const r = validateCompositeTree(tree);
  assert.equal(r.ok, false);
});

test("validateCompositeTree rejects list with > MAX_LIST_ITEMS", () => {
  const tree: CompositeNode = {
    kind: "section",
    children: [
      {
        kind: "list",
        style: "bullet",
        items: Array.from({ length: MAX_LIST_ITEMS + 1 }, (_, i) => `item ${i}`),
      },
    ],
  };
  const r = validateCompositeTree(tree);
  assert.equal(r.ok, false);
});

test("validateCompositeTree rejects heading-level jumps (h1 → h3)", () => {
  // Within ONE composite section, headings should descend without skipping.
  // Going from h1 directly to h3 is an a11y red flag.
  const tree: CompositeNode = {
    kind: "section",
    children: [
      { kind: "heading", level: 1, text: "Top" },
      { kind: "heading", level: 3, text: "Skipped h2" },
    ],
  };
  const r = validateCompositeTree(tree);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.ok(r.errors.some((e) => /heading/i.test(e)));
});

test("validateCompositeTree allows valid heading descent (h1 → h2 → h3)", () => {
  const tree: CompositeNode = {
    kind: "section",
    children: [
      { kind: "heading", level: 1, text: "Top" },
      {
        kind: "row",
        cols: 2,
        children: [
          {
            kind: "card",
            children: [{ kind: "heading", level: 2, text: "Side A" }],
          },
          {
            kind: "card",
            children: [{ kind: "heading", level: 2, text: "Side B" }],
          },
        ],
      },
    ],
  };
  const r = validateCompositeTree(tree);
  assert.equal(r.ok, true);
});

test("validateCompositeTree accepts the canonical 'comparison' pattern", () => {
  const tree: CompositeNode = {
    kind: "section",
    eyebrow: "Why us",
    headline: "With us vs. DIY",
    children: [
      {
        kind: "row",
        cols: 2,
        children: [
          {
            kind: "card",
            children: [
              { kind: "heading", level: 3, text: "With Cypress & Pine" },
              { kind: "list", style: "check", items: ["A", "B", "C"] },
            ],
          },
          {
            kind: "card",
            variant: "muted",
            children: [
              { kind: "heading", level: 3, text: "DIY" },
              { kind: "list", style: "x", items: ["X", "Y", "Z"] },
            ],
          },
        ],
      },
    ],
  };
  const r = validateCompositeTree(tree);
  assert.equal(r.ok, true);
});

// ─── voice scanner ─────────────────────────────────────────────────────────
//
// Soul declares avoidWords ("synergy", "leverage", "cheap" for premium
// brands, etc.). The scanner walks all text-bearing nodes, finds matches,
// returns a list of warnings. NOT errors — the agent self-corrects on
// retry. Mirrors the existing block-validator pattern.

test("scanForVoiceViolations returns a violation when an avoidWord appears in heading", () => {
  const tree: CompositeNode = {
    kind: "section",
    headline: "Total synergy delivered",
    children: [],
  };
  const r = scanForVoiceViolations(tree, ["synergy"]);
  assert.ok(r.length > 0);
  assert.ok(r[0].word === "synergy");
});

test("scanForVoiceViolations matches case-insensitively and word-boundary", () => {
  const tree: CompositeNode = {
    kind: "section",
    children: [
      { kind: "heading", level: 2, text: "Synergy is our motto" },
      { kind: "text", text: "We synergize daily." },
    ],
  };
  // Should match "Synergy" but not "synergize" (different word).
  const r = scanForVoiceViolations(tree, ["synergy"]);
  assert.equal(r.length, 1);
});

test("scanForVoiceViolations scans list items, button labels, stat labels", () => {
  const tree: CompositeNode = {
    kind: "section",
    children: [
      { kind: "list", style: "bullet", items: ["proactive synergy", "win-win"] },
      { kind: "button", label: "Leverage now", action: { kind: "book" } },
      { kind: "stat", value: "100%", label: "synergy rate" },
    ],
  };
  const r = scanForVoiceViolations(tree, ["synergy", "leverage", "win-win"]);
  // synergy appears twice (item + stat), win-win once, leverage once = 4
  assert.equal(r.length, 4);
});

test("scanForVoiceViolations returns empty when no matches", () => {
  const tree: CompositeNode = {
    kind: "section",
    headline: "Same-day HVAC service in Vancouver",
    children: [{ kind: "text", text: "Family-owned and family-trusted." }],
  };
  const r = scanForVoiceViolations(tree, ["synergy", "leverage"]);
  assert.equal(r.length, 0);
});

test("scanForVoiceViolations returns empty when avoidWords is empty", () => {
  const tree: CompositeNode = {
    kind: "section",
    headline: "synergy synergy synergy",
    children: [],
  };
  const r = scanForVoiceViolations(tree, []);
  assert.equal(r.length, 0);
});

// ─── length caps ───────────────────────────────────────────────────────────

test("CompositeNodeSchema rejects headline absurdly long", () => {
  const r = CompositeNodeSchema.safeParse({
    kind: "section",
    headline: "x".repeat(1000),
    children: [],
  });
  assert.equal(r.success, false);
});

test("CompositeNodeSchema rejects text absurdly long", () => {
  const r = CompositeNodeSchema.safeParse({
    kind: "text",
    text: "x".repeat(2000),
  });
  assert.equal(r.success, false);
});

test("CompositeNodeSchema rejects button label absurdly long", () => {
  const r = CompositeNodeSchema.safeParse({
    kind: "button",
    label: "x".repeat(200),
    action: { kind: "book" },
  });
  assert.equal(r.success, false);
});
