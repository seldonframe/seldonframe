// ICP-3 (Phase 2, carry-forward) — the chat-assistant archetype alias.
//
// The Agent Builder's chat templates carry archetype "chat-assistant" on their
// blueprint. The runtime's skill packs + personas are keyed on "website-chatbot".
// canonicalArchetype + getSkillsForArchetype must map "chat-assistant" to the
// website-chatbot pack so a generated chat agent gets temporal-reasoning, the
// SDR funnel, AND the hard-rules safety invariants — not an empty skill set.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  canonicalArchetype,
  getSkillsForArchetype,
} from "../../../src/lib/agents/skills/registry";

describe("canonicalArchetype", () => {
  test("maps chat-assistant -> website-chatbot", () => {
    assert.equal(canonicalArchetype("chat-assistant"), "website-chatbot");
  });

  test("leaves voice-receptionist unchanged", () => {
    assert.equal(canonicalArchetype("voice-receptionist"), "voice-receptionist");
  });

  test("leaves an unknown archetype unchanged (no crash)", () => {
    assert.equal(canonicalArchetype("something-else"), "something-else");
  });
});

describe("getSkillsForArchetype(chat-assistant)", () => {
  const ids = getSkillsForArchetype("chat-assistant").map((s) => s.id);

  test("is non-empty (the bug was an empty skill set)", () => {
    assert.ok(ids.length > 0);
  });

  test("includes the hard-rules safety skill", () => {
    assert.ok(
      ids.includes("hard-rules"),
      `expected hard-rules in [${ids.join(", ")}]`,
    );
  });

  test("matches the website-chatbot pack exactly", () => {
    assert.deepEqual(ids, getSkillsForArchetype("website-chatbot").map((s) => s.id));
  });
});
