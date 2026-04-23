// Tests for the NL parser scaffolding layer — reference-pattern
// loader + example-spec library + prompt-template renderer. Shipped
// in SLICE 2 PR 2 C2 per audit §3.1 + G-1 (SKILL-only invocation).
//
// What this layer does + doesn't do:
//   - Does: assemble a deterministic prompt Claude Code consumes
//     when translating NL intent → BlockSpec JSON.
//   - Does: expose reference patterns (existing-block excerpts +
//     curated NL/spec example pairs) so Claude has concrete
//     anatomy to pattern against.
//   - Does NOT: invoke Claude. The skill's runtime uses Claude
//     Code's own LLM via SKILL.md instructions; this code sits
//     below that layer.
//   - Does NOT: validate NL quality. Validation happens when the
//     resulting BlockSpec hits BlockSpecSchema.safeParse in the
//     orchestrator (PR 1 C1).

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import {
  extractBlockAnatomyExcerpt,
  loadReferencePatterns,
  type BlockAnatomyExcerpt,
} from "../../../src/lib/scaffolding/nl/reference-patterns";
import { EXAMPLE_SPECS } from "../../../src/lib/scaffolding/nl/example-specs";
import { renderNLPrompt } from "../../../src/lib/scaffolding/nl/prompt-template";
import { BlockSpecSchema } from "../../../src/lib/scaffolding/spec";

// From .../packages/crm/tests/unit/scaffolding/ → crm package root
// is 3 levels up; repo root is 5 levels up.
const CRM_ROOT = path.resolve(__dirname, "../../..");
const REPO_ROOT = path.resolve(__dirname, "../../../../..");
const NOTES_BLOCK_MD = path.join(CRM_ROOT, "src/blocks/notes.block.md");

describe("extractBlockAnatomyExcerpt", () => {
  test("extracts title + description + composition contract from a BLOCK.md path", () => {
    // The notes block was scaffolded in PR 1 C7 — use it as a test
    // fixture so the reference loader runs against real output.
    const excerpt = extractBlockAnatomyExcerpt(NOTES_BLOCK_MD);
    assert.ok(excerpt, "expected notes.block.md to be present for this test");
    assert.equal(excerpt.slug, "notes");
    assert.equal(excerpt.title, "Notes");
    assert.match(excerpt.description, /note-taking/i);
    assert.match(excerpt.compositionContract, /produces:/);
    assert.match(excerpt.compositionContract, /consumes:/);
    assert.match(excerpt.compositionContract, /verbs:/);
    assert.match(excerpt.compositionContract, /compose_with:/);
  });

  test("returns null for a file that doesn't exist", () => {
    const excerpt = extractBlockAnatomyExcerpt("/nonexistent/path.block.md");
    assert.equal(excerpt, null);
  });
});

describe("loadReferencePatterns", () => {
  test("loads the default reference set + every excerpt has populated fields", () => {
    const patterns = loadReferencePatterns(REPO_ROOT);
    assert.ok(patterns.length >= 2, "at least 2 reference patterns");
    for (const p of patterns) {
      assert.ok(p.slug.length > 0, `slug non-empty for ${JSON.stringify(p)}`);
      assert.ok(p.title.length > 0, `title non-empty for ${p.slug}`);
      assert.ok(p.compositionContract.length > 0, `contract non-empty for ${p.slug}`);
    }
  });

  test("includes at least one block with subscriptions (anatomy for reactive blocks)", () => {
    const patterns = loadReferencePatterns(REPO_ROOT);
    assert.ok(
      patterns.some((p) => p.subscriptionsSection !== null),
      "at least one reference has a Subscriptions section — anatomy for reactive blocks",
    );
  });
});

describe("EXAMPLE_SPECS — canonical NL → BlockSpec pairs", () => {
  test("every example has both nlIntent and blockSpec", () => {
    assert.ok(EXAMPLE_SPECS.length >= 2, "at least 2 examples");
    for (const ex of EXAMPLE_SPECS) {
      assert.ok(ex.nlIntent.length > 10, "NL intent non-trivial");
      assert.ok(ex.blockSpec, "blockSpec present");
    }
  });

  test("every example's blockSpec validates against BlockSpecSchema", () => {
    for (const ex of EXAMPLE_SPECS) {
      const result = BlockSpecSchema.safeParse(ex.blockSpec);
      assert.ok(
        result.success,
        `example "${ex.nlIntent.slice(0, 40)}" produced invalid spec: ${
          result.success ? "" : JSON.stringify(result.error.issues)
        }`,
      );
    }
  });

  test("examples cover both tool-only and tool+subscription cases", () => {
    const hasToolOnly = EXAMPLE_SPECS.some(
      (ex) => ex.blockSpec.tools.length > 0 && ex.blockSpec.subscriptions.length === 0,
    );
    const hasSubscriptions = EXAMPLE_SPECS.some(
      (ex) => ex.blockSpec.subscriptions.length > 0,
    );
    assert.ok(hasToolOnly, "at least one tool-only example");
    assert.ok(hasSubscriptions, "at least one subscription example");
  });
});

describe("renderNLPrompt", () => {
  test("embeds user intent + examples + reference anatomies + BlockSpec schema hints", () => {
    const patterns: BlockAnatomyExcerpt[] = [
      {
        slug: "notes",
        title: "Notes",
        description: "note-taking",
        compositionContract: "produces: [{\"event\":\"note.created\"}]\n",
        subscriptionsSection: null,
      },
    ];
    const prompt = renderNLPrompt({
      nlIntent: "build me a feedback block that collects ratings",
      referencePatterns: patterns,
      examples: EXAMPLE_SPECS.slice(0, 1),
    });
    assert.match(prompt, /build me a feedback block/);
    assert.match(prompt, /## Reference patterns/);
    assert.match(prompt, /notes:/);
    assert.match(prompt, /## Example: /);
    assert.match(prompt, /## BlockSpec schema hints/);
    assert.match(prompt, /kebab-case/);
  });

  test("prompt lists every reserved slug so Claude avoids them", () => {
    const prompt = renderNLPrompt({
      nlIntent: "anything",
      referencePatterns: [],
      examples: [],
    });
    for (const reserved of [
      "crm",
      "caldiy-booking",
      "email",
      "sms",
      "payments",
      "formbricks-intake",
      "landing-pages",
    ]) {
      assert.match(prompt, new RegExp(`\\b${reserved.replace("-", "\\-")}\\b`));
    }
  });

  test("empty examples list produces a prompt without the examples section", () => {
    const prompt = renderNLPrompt({
      nlIntent: "x",
      referencePatterns: [],
      examples: [],
    });
    assert.ok(!prompt.includes("## Example:"), "no examples section when empty");
  });
});
