// Email-agent slice (Part A2) — Tests for composeSystemPrompt's voice-profile
// injection: when a `voiceProfileNote` is supplied, it renders as its OWN
// section ("## Write in the operator's voice"), distinct from the generic
// `brainNotes` "Patterns we've learned" section, so the model treats it as a
// style directive, not a fact. Mirrors compose-system-prompt-hours.spec.ts.

import { test } from "node:test";
import assert from "node:assert/strict";

import { composeSystemPrompt } from "../../src/lib/agents/prompt";
import type { AgentBlueprint } from "../../src/db/schema/agents";

const EMPTY_BLUEPRINT: AgentBlueprint = {
  capabilities: [],
  pricingFacts: [],
  faq: [],
} as unknown as AgentBlueprint;

test("voiceProfileNote present -> renders a distinct 'Write in the operator's voice' section", async () => {
  const prompt = await composeSystemPrompt({
    orgName: "Test Co",
    soul: null,
    blueprint: EMPTY_BLUEPRINT,
    archetype: "website-chatbot",
    voiceProfileNote: "Tone: warm, concise. Always sign off with 'Best, Pat'.",
  });
  assert.match(prompt, /## Write in the operator's voice/);
  assert.match(prompt, /Always sign off with 'Best, Pat'/);
});

test("voiceProfileNote absent -> no-op, section is not present", async () => {
  const prompt = await composeSystemPrompt({
    orgName: "Test Co",
    soul: null,
    blueprint: EMPTY_BLUEPRINT,
    archetype: "website-chatbot",
  });
  assert.doesNotMatch(prompt, /## Write in the operator's voice/);
});

test("voiceProfileNote is distinct from the generic brainNotes section", async () => {
  const prompt = await composeSystemPrompt({
    orgName: "Test Co",
    soul: null,
    blueprint: EMPTY_BLUEPRINT,
    archetype: "website-chatbot",
    brainNotes: ["Customers usually ask about pricing first."],
    voiceProfileNote: "Tone: warm, concise.",
  });
  assert.match(prompt, /## Patterns we've learned from past conversations/);
  assert.match(prompt, /## Write in the operator's voice/);
  // the two sections carry their own distinct bodies, not merged into one.
  const learnedIdx = prompt.indexOf("## Patterns we've learned");
  const voiceIdx = prompt.indexOf("## Write in the operator's voice");
  assert.ok(learnedIdx >= 0 && voiceIdx >= 0 && learnedIdx !== voiceIdx);
});
