// v1.56.0 — Tests for composeSystemPrompt's business_hours render.
//
// soul.business_hours is the canonical source for "what are your hours?"
// answers. When business_hours_assumed is true, the chatbot disclaims
// the line ("assumed standard hours — confirm with caller before
// quoting") instead of presenting them as ground truth.
//
// Mirrors the style of compose-system-prompt-soul.spec.ts (same
// minimal blueprint, same soulWith() helper) so the two files read
// as siblings.
//
// Run: node --import tsx --test packages/crm/tests/unit/compose-system-prompt-hours.spec.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { composeSystemPrompt } from "../../src/lib/agents/prompt";
import type { OrgSoul } from "../../src/lib/soul/types";
import type { AgentBlueprint } from "../../src/db/schema/agents";

const EMPTY_BLUEPRINT: AgentBlueprint = {
  capabilities: [],
  pricingFacts: [],
  faq: [],
} as unknown as AgentBlueprint;

function soulWith(extras: Record<string, unknown>): OrgSoul {
  return {
    businessName: "Test Co",
    businessDescription: "",
    industry: "",
    offerType: "",
    entityLabels: {
      contact: { singular: "Contact", plural: "Contacts" },
      deal: { singular: "Deal", plural: "Deals" },
      activity: { singular: "Activity", plural: "Activities" },
      pipeline: { singular: "Pipeline", plural: "Pipelines" },
      intakeForm: { singular: "Intake", plural: "Intakes" },
    },
    pipeline: { name: "Pipeline", stages: [] },
    suggestedFields: { contact: [], deal: [] },
    contactStatuses: [],
    voice: { style: "", vocabulary: [], avoidWords: [], samplePhrases: [] },
    priorities: [],
    aiContext: "",
    suggestedIntakeForm: { name: "Intake", fields: [] },
    branding: { primaryColor: "#000", accentColor: "#fff", mood: "" },
    rawInput: { processDescription: "", painPoint: "", clientDescription: "" },
    ...extras,
  } as unknown as OrgSoul;
}

const MON_FRI_9_5 = {
  monday: { enabled: true, start: "09:00", end: "17:00" },
  tuesday: { enabled: true, start: "09:00", end: "17:00" },
  wednesday: { enabled: true, start: "09:00", end: "17:00" },
  thursday: { enabled: true, start: "09:00", end: "17:00" },
  friday: { enabled: true, start: "09:00", end: "17:00" },
  saturday: { enabled: false, start: "00:00", end: "00:00" },
  sunday: { enabled: false, start: "00:00", end: "00:00" },
};

describe("composeSystemPrompt — business_hours render", () => {
  test("renders **Hours:** line when soul.business_hours is present", async () => {
    const soul = soulWith({ business_hours: MON_FRI_9_5 });
    const prompt = await composeSystemPrompt({
      orgName: "Test Co",
      soul,
      blueprint: EMPTY_BLUEPRINT,
      archetype: "website-chatbot",
    });
    assert.ok(
      prompt.includes("**Hours:**"),
      "should render the hours fact line",
    );
    assert.ok(
      prompt.includes("Mon-Fri 9-5"),
      "should render summarizeWeeklyHours output verbatim",
    );
  });

  test("appends '(assumed ...)' suffix when business_hours_assumed is true", async () => {
    const soul = soulWith({
      business_hours: MON_FRI_9_5,
      business_hours_assumed: true,
    });
    const prompt = await composeSystemPrompt({
      orgName: "Test Co",
      soul,
      blueprint: EMPTY_BLUEPRINT,
      archetype: "website-chatbot",
    });
    assert.ok(
      prompt.includes("**Hours:** Mon-Fri 9-5"),
      "should still render the summary",
    );
    assert.ok(
      prompt.includes("(assumed standard hours — confirm with caller before quoting)"),
      "should append the assumed-hours disclaimer",
    );
  });

  test("omits hours line entirely when no business_hours field", async () => {
    const soul = soulWith({
      // No business_hours field, but include another field so the
      // Business facts section itself still renders (otherwise the
      // assertion would be ambiguous between "no section" and "no
      // hours line").
      business_description: "Test Co serves the metro area.",
    });
    const prompt = await composeSystemPrompt({
      orgName: "Test Co",
      soul,
      blueprint: EMPTY_BLUEPRINT,
      archetype: "website-chatbot",
    });
    assert.ok(
      prompt.includes("## Business facts"),
      "business-facts section should still render via business_description",
    );
    assert.ok(
      !prompt.includes("**Hours:**"),
      "should NOT render the hours line when business_hours is absent",
    );
  });
});
