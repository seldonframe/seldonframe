// ============================================================================
// v1.10.0 — regenerate_block context assembly (pure function)
// ============================================================================
//
// regenerate_block is a thin-harness MCP tool: the server bundles the
// IDE agent everything it needs to regenerate a v2 block (current props
// + workspace summary + brain patterns + the operator's new instructions),
// the agent's own LLM produces new props, and persist_block writes them.
//
// This test pins the bundle shape — what fields appear on what condition,
// whether new_instructions flows through, whether absent block_instance
// rows are handled (first-time generation case).
//
// Antifragility note: as LLMs improve, regeneration quality goes up
// without harness changes. The harness only assembles context; it does
// NOT make creative decisions.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRegenerateContext } from "@/lib/page-blocks/regenerate";

test("buildRegenerateContext returns first_generation status when block has no prior instance", () => {
  const result = buildRegenerateContext({
    blockName: "hero",
    blockInstance: null,
    workspaceSummary: {
      business_name: "Pacific Coast Heating & Air",
      industry: "hvac",
      services: [{ name: "AC Repair" }],
      voice: null,
    },
    brainPatterns: [],
    newInstructions: undefined,
  });

  assert.equal(result.block_name, "hero");
  assert.equal(result.status, "first_generation");
  assert.equal(result.current_props, null);
  assert.equal(result.current_generation_prompt, null);
  assert.deepEqual(result.customization_history, []);
  assert.equal(result.template_version, null);
});

test("buildRegenerateContext echoes the existing block instance fields when present", () => {
  const result = buildRegenerateContext({
    blockName: "hero",
    blockInstance: {
      props: { headline: "Reliable HVAC", subheadline: "24/7" },
      generation_prompt: "...the original prompt...",
      customizations: [
        { at: "2026-04-01T00:00:00Z", prompt: "make it warmer", actor: "operator", source: "claude-code" },
      ],
      template_version: "1.0.0",
    },
    workspaceSummary: {
      business_name: "Pacific Coast Heating & Air",
      industry: "hvac",
      services: [{ name: "AC Repair" }],
      voice: null,
    },
    brainPatterns: [],
    newInstructions: undefined,
  });

  assert.equal(result.status, "regenerate");
  assert.deepEqual(result.current_props, { headline: "Reliable HVAC", subheadline: "24/7" });
  assert.equal(result.current_generation_prompt, "...the original prompt...");
  assert.equal(result.customization_history.length, 1);
  assert.equal(result.customization_history[0].prompt, "make it warmer");
  assert.equal(result.template_version, "1.0.0");
});

test("buildRegenerateContext flows new_instructions through to the output and next_step", () => {
  const result = buildRegenerateContext({
    blockName: "hero",
    blockInstance: {
      props: { headline: "Old" },
      generation_prompt: "...",
      customizations: [],
      template_version: "1.0.0",
    },
    workspaceSummary: {
      business_name: "X",
      industry: null,
      services: [],
      voice: null,
    },
    brainPatterns: [],
    newInstructions: "make the headline more urgent",
  });

  assert.equal(result.new_instructions, "make the headline more urgent");
  // The next_step instructs the agent to apply the new instructions.
  // We don't pin exact wording (the harness can refine the prose
  // without breaking callers) but assert the operator's intent is
  // surfaced.
  assert.match(result.next_step, /new_instructions|new instructions/i);
});

test("buildRegenerateContext preserves brain_patterns ordering and shape", () => {
  const patterns = [
    { path: "patterns/by-vertical/hvac/hero-headline.md", body_preview: "Lead with response time…", confidence: 0.78 },
    { path: "patterns/by-vertical/hvac/services-grid.md", body_preview: "Group by urgency…", confidence: 0.65 },
  ];
  const result = buildRegenerateContext({
    blockName: "hero",
    blockInstance: null,
    workspaceSummary: {
      business_name: "X",
      industry: "hvac",
      services: [],
      voice: null,
    },
    brainPatterns: patterns,
    newInstructions: undefined,
  });

  assert.deepEqual(result.brain_patterns, patterns);
});

test("buildRegenerateContext preserves workspace_summary verbatim", () => {
  const summary = {
    business_name: "Sakura Nail Studio",
    industry: "beauty",
    services: [
      { name: "Manicure", description: "30 min" },
      { name: "Pedicure", description: "45 min" },
    ],
    voice: {
      style: "warm, friendly, never pushy",
      vocabulary: ["self-care", "treat yourself"],
      avoidWords: ["cheap", "deal"],
    },
  };
  const result = buildRegenerateContext({
    blockName: "services",
    blockInstance: null,
    workspaceSummary: summary,
    brainPatterns: [],
    newInstructions: undefined,
  });

  assert.deepEqual(result.workspace_summary, summary);
});

test("buildRegenerateContext next_step always tells the agent to call persist_block", () => {
  // Whether first-generation or regenerate, the closing move is
  // persist_block. The harness must not leave the agent guessing
  // about the next API call.
  const first = buildRegenerateContext({
    blockName: "hero",
    blockInstance: null,
    workspaceSummary: { business_name: "X", industry: null, services: [], voice: null },
    brainPatterns: [],
    newInstructions: undefined,
  });
  const regen = buildRegenerateContext({
    blockName: "hero",
    blockInstance: {
      props: {}, generation_prompt: "", customizations: [], template_version: "1.0.0",
    },
    workspaceSummary: { business_name: "X", industry: null, services: [], voice: null },
    brainPatterns: [],
    newInstructions: "punchier",
  });

  assert.match(first.next_step, /persist_block/);
  assert.match(regen.next_step, /persist_block/);
});
