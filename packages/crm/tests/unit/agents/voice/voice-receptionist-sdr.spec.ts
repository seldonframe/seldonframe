// Task A4 — TDD tests for voice-receptionist-sdr skill + registry entry.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

describe("voice-receptionist-sdr — registry", () => {
  test("getSkillsForArchetype('voice-receptionist') includes voice-receptionist-sdr", async () => {
    const { getSkillsForArchetype } = await import(
      "../../../../src/lib/agents/skills/registry"
    );
    const skills = getSkillsForArchetype("voice-receptionist");
    const ids = skills.map((s) => s.id);
    assert.ok(
      ids.includes("voice-receptionist-sdr"),
      `Expected 'voice-receptionist-sdr' in registry for voice-receptionist; got: ${ids.join(", ")}`,
    );
  });

  test("voice-receptionist skills do NOT include website-chatbot-sdr", async () => {
    const { getSkillsForArchetype } = await import(
      "../../../../src/lib/agents/skills/registry"
    );
    const skills = getSkillsForArchetype("voice-receptionist");
    const ids = skills.map((s) => s.id);
    assert.ok(
      !ids.includes("website-chatbot-sdr"),
      "'website-chatbot-sdr' must NOT appear in voice-receptionist skills",
    );
  });
});

describe("voice-receptionist-sdr — skill prose", () => {
  test("prose includes look_up_availability", async () => {
    const sdr = (
      await import("../../../../src/lib/agents/skills/voice-receptionist/sdr")
    ).default;
    assert.ok(
      /look_up_availability/.test(sdr),
      "Skill should mention look_up_availability",
    );
  });

  test("prose includes label", async () => {
    const sdr = (
      await import("../../../../src/lib/agents/skills/voice-receptionist/sdr")
    ).default;
    assert.ok(/\blabel\b/.test(sdr), "Skill should mention 'label'");
  });

  test("prose includes escalate_to_human", async () => {
    const sdr = (
      await import("../../../../src/lib/agents/skills/voice-receptionist/sdr")
    ).default;
    assert.ok(
      /escalate_to_human/.test(sdr),
      "Skill should mention escalate_to_human",
    );
  });

  test("prose instructs short, natural, spoken sentences", async () => {
    const sdr = (
      await import("../../../../src/lib/agents/skills/voice-receptionist/sdr")
    ).default;
    assert.ok(
      /short,\s+natural,\s+spoken\s+sentences/i.test(sdr),
      "Skill should instruct 'short, natural, spoken sentences'",
    );
  });
});
