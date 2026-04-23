// Integration test for the NL → BlockSpec → files pipeline end-to-
// end. Shipped in SLICE 2 PR 2 C4. Exercises every module committed
// in C1-C3 + the orchestrator from PR 1 C6:
//
//   classifyIntent (PR 2 C3)
//     → [if tier 2] renderNLPrompt (PR 2 C2)
//       → [stub LLM returns BlockSpec]
//         → BlockSpecSchema.safeParse (PR 1 C1)
//           → scaffoldBlock orchestrator (PR 1 C6)
//             → writer (PR 1 C4)
//             → validate (PR 1 C5) — stubbed in-process here
//   addEventsToSeldonUnion (PR 2 C1) — exercised separately
//
// The actual LLM call is a stub: tests can't run Claude, so the
// integration verifies the PLUMBING surrounding the LLM call. In
// practice, the skill (SKILL.md) instructs Claude Code to do the
// translation, and the orchestrator validates the returned shape.

import { describe, test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { classifyIntent } from "../../../src/lib/scaffolding/nl/intent-classifier";
import { renderNLPrompt } from "../../../src/lib/scaffolding/nl/prompt-template";
import { EXAMPLE_SPECS } from "../../../src/lib/scaffolding/nl/example-specs";
import { loadReferencePatterns } from "../../../src/lib/scaffolding/nl/reference-patterns";
import { scaffoldBlock } from "../../../src/lib/scaffolding/orchestrator";
import { addEventsToSeldonUnion } from "../../../src/lib/scaffolding/ast-event-union";
import { BlockSpecSchema } from "../../../src/lib/scaffolding/spec";

const REPO_ROOT = path.resolve(__dirname, "../../../../..");
const cleanups: string[] = [];
afterEach(() => {
  for (const d of cleanups) rmSync(d, { recursive: true, force: true });
  cleanups.length = 0;
});

function tmpRoot(): string {
  const d = mkdtempSync(path.join(tmpdir(), "scaffold-integration-"));
  cleanups.push(d);
  return d;
}

// Stub LLM — returns a prepared spec based on the NL intent. In
// production Claude Code would run the prompt + parse its response.
function stubLLM(intent: string): unknown {
  if (intent.includes("feedback")) {
    return {
      slug: "client-feedback",
      title: "Client Feedback",
      description: "Collect ratings and comments from clients after project completion.",
      triggerPhrases: ["Add a feedback block", "Install client feedback"],
      frameworks: ["universal"],
      produces: [
        {
          name: "feedback.submitted",
          fields: [
            { name: "feedbackId", type: "string", nullable: false },
            { name: "contactId", type: "string", nullable: false },
            { name: "rating", type: "integer", nullable: false },
          ],
        },
      ],
      consumes: [],
      tools: [
        {
          name: "submit_feedback",
          description: "Submit a feedback entry from a client.",
          args: [
            { name: "contactId", type: "string", nullable: false, required: true },
            { name: "rating", type: "integer", nullable: false, required: true },
            { name: "comment", type: "string", nullable: true, required: false },
          ],
          returns: [
            { name: "feedbackId", type: "string", nullable: false, required: true },
          ],
          emits: ["feedback.submitted"],
        },
      ],
      subscriptions: [],
    };
  }
  return null;
}

describe("SLICE 2 integration — tier 2 happy path", () => {
  test("NL → classify → prompt → stub LLM → scaffold lands valid files", async () => {
    const intent = "Build me a client feedback block that collects ratings + comments after each project completes.";
    const root = tmpRoot();

    // 1. Pre-classify.
    const classification = classifyIntent(intent);
    assert.equal(classification.tier, 2);

    // 2. Build the prompt (the skill would hand this to Claude).
    const patterns = loadReferencePatterns(REPO_ROOT);
    const prompt = renderNLPrompt({
      nlIntent: intent,
      referencePatterns: patterns,
      examples: EXAMPLE_SPECS,
    });
    // Sanity check on the prompt Claude sees.
    assert.match(prompt, /Builder intent/);
    assert.match(prompt, /feedback/i);
    assert.ok(prompt.length > 1000, "prompt has substance");

    // 3. Stub LLM returns a spec.
    const rawSpec = stubLLM(intent);
    assert.ok(rawSpec, "stub LLM produced a spec");

    // 4. Validate before scaffolding (orchestrator does this too,
    // but we surface it here to show the full chain).
    const parsed = BlockSpecSchema.safeParse(rawSpec);
    assert.ok(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.issues));

    // 5. Scaffold.
    const result = await scaffoldBlock({
      spec: rawSpec,
      blocksDir: path.join(root, "src/blocks"),
      testsDir: path.join(root, "tests/unit/blocks"),
      validate: async () => {},
    });

    assert.ok(existsSync(path.join(root, "src/blocks/client-feedback.block.md")));
    assert.ok(existsSync(path.join(root, "src/blocks/client-feedback.tools.ts")));
    assert.ok(existsSync(path.join(root, "tests/unit/blocks/client-feedback.spec.ts")));

    const blockMd = readFileSync(path.join(root, "src/blocks/client-feedback.block.md"), "utf8");
    assert.match(blockMd, /produces: \[\{"event":"feedback\.submitted"\}\]/);

    const toolsTs = readFileSync(path.join(root, "src/blocks/client-feedback.tools.ts"), "utf8");
    assert.match(toolsTs, /export const submitFeedback: ToolDefinition/);
    assert.match(toolsTs, /rating: z\.number\(\)\.int\(\),/);
    assert.match(toolsTs, /comment: z\.string\(\)\.nullable\(\)\.optional\(\)/);

    // Scaffold result shape.
    assert.ok(result.created.length >= 3);
  });
});

describe("SLICE 2 integration — tier 3 short-circuit", () => {
  test("destructive intent halts BEFORE prompt build / LLM call", () => {
    const intent = "Build me a block that deletes all contacts older than 90 days.";
    const classification = classifyIntent(intent);
    assert.equal(classification.tier, 3);

    // Skill would relay the suggestedAction and refuse to call the
    // LLM. Nothing further happens in the pipeline.
    assert.match(classification.suggestedAction, /refuse|confirm|dangerous/i);
  });
});

describe("SLICE 2 integration — tier 1 short-circuit", () => {
  test("empty intent halts BEFORE prompt build", () => {
    const classification = classifyIntent("");
    assert.equal(classification.tier, 1);
    assert.match(classification.suggestedAction, /clarif|ask/i);
  });
});

describe("SLICE 2 integration — AST editor applied to the SeldonEvent union", () => {
  test("scaffolded spec with new events → AST editor appends them idempotently", () => {
    const source = [
      "export type SeldonEvent =",
      '  | { type: "contact.created"; data: { contactId: string } };',
      "",
    ].join("\n");

    const spec = stubLLM("feedback") as Parameters<typeof BlockSpecSchema.parse>[0];
    const parsed = BlockSpecSchema.parse(spec);

    const firstRun = addEventsToSeldonUnion(source, parsed);
    assert.ok(firstRun.astPath, "AST path");
    assert.deepEqual(firstRun.added, ["feedback.submitted"]);
    assert.match(firstRun.source, /\| \{ type: "feedback\.submitted"; data: \{[^}]*rating: number[^}]*\} \}/);

    const secondRun = addEventsToSeldonUnion(firstRun.source, parsed);
    assert.deepEqual(secondRun.added, [], "idempotent — second run adds nothing");
    assert.equal(secondRun.source, firstRun.source);
  });
});

describe("SLICE 2 integration — prompt embeds real references", () => {
  test("rendered prompt includes the notes reference anatomy from disk", () => {
    const patterns = loadReferencePatterns(REPO_ROOT);
    const prompt = renderNLPrompt({
      nlIntent: "anything",
      referencePatterns: patterns,
      examples: EXAMPLE_SPECS,
    });
    // `notes` anatomy loaded in PR 1 C7 should appear.
    assert.match(prompt, /notes: Notes/i);
    // Both example NL intents should appear.
    for (const ex of EXAMPLE_SPECS) {
      // The first 30 chars of the intent are enough to uniquely
      // identify the example in the rendered prompt.
      const snippet = ex.nlIntent.slice(0, 30);
      assert.ok(
        prompt.includes(snippet),
        `prompt should include example intent snippet "${snippet}"`,
      );
    }
  });
});
