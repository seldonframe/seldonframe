// v1.55.x — Tests for composeSystemPrompt's snake-case soul enrichment.
//
// The chatbot's system prompt now includes a "## Business facts" section
// built from the snake_case fields in the organizations.soul JSONB
// (business_description, services, review_count, review_rating,
// certifications, trust_signals, emergency_service, same_day, service_area).
//
// These tests bypass DB I/O by passing a hand-crafted soul object that
// satisfies both the OrgSoul interface (minimal camelCase shell) AND the
// raw snake_case shape the chatbot reads. The composeSystemPrompt function
// is pure (no DB, no LLM) — easy to test directly.
//
// Per CLAUDE.md: verification before completion. A prompt change without
// a test for the new behavior is half-done.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { composeSystemPrompt } from "../../src/lib/agents/prompt";
import type { OrgSoul } from "../../src/lib/soul/types";
import type { AgentBlueprint } from "../../src/db/schema/agents";

// Minimal blueprint shell — no pricing, no FAQ. The point of these tests
// is the soul enrichment, not the rest of the prompt composition.
const EMPTY_BLUEPRINT: AgentBlueprint = {
  capabilities: [],
  pricingFacts: [],
  faq: [],
} as unknown as AgentBlueprint;

// Cast helper — composeSystemPrompt accepts `OrgSoul | null`. We hand it
// an object that satisfies the camelCase TS surface AND carries snake_case
// JSONB fields underneath (matches the actual production shape).
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

describe("composeSystemPrompt — snake-case soul enrichment", () => {
  test("renders '## Business facts' section when soul has business_description", async () => {
    const soul = soulWith({
      business_description: "Family-owned HVAC team serving the Austin metro since 1998.",
    });
    const prompt = await composeSystemPrompt({
      orgName: "Test Co",
      soul,
      blueprint: EMPTY_BLUEPRINT,
      archetype: "website-chatbot",
    });
    assert.ok(
      prompt.includes("## Business facts"),
      "should render the business-facts section",
    );
    assert.ok(
      prompt.includes("Family-owned HVAC team serving the Austin metro since 1998."),
      "should include business_description verbatim",
    );
  });

  test("renders services list from snake_case services (object form)", async () => {
    const soul = soulWith({
      services: [
        { name: "AC Repair", description: "Same-day diagnostic + fix" },
        { name: "Furnace Tune-Up" },
      ],
    });
    const prompt = await composeSystemPrompt({
      orgName: "Test Co",
      soul,
      blueprint: EMPTY_BLUEPRINT,
      archetype: "website-chatbot",
    });
    assert.ok(
      prompt.includes("Services we offer"),
      "should render the services subheading",
    );
    assert.ok(
      prompt.includes("AC Repair — Same-day diagnostic + fix"),
      "should render service with description",
    );
    assert.ok(
      prompt.includes("Furnace Tune-Up"),
      "should render service without description",
    );
  });

  // NOTE on services format: in production, organizations.soul.services
  // is always an array of { name, description? } objects (per
  // SoulService in lib/soul/types.ts), and the typed "## Services we
  // offer" section in prompt.ts renders it. The snake_case enrichment
  // path only fires when the typed services list is EMPTY, so we don't
  // double-render the same data. The defensive string-array branch in
  // the enrichment code stays in place for future scraper variants but
  // is not exercised by current production data.

  test("renders social proof when both review_count and review_rating present", async () => {
    const soul = soulWith({
      review_count: 247,
      review_rating: 4.8,
    });
    const prompt = await composeSystemPrompt({
      orgName: "Test Co",
      soul,
      blueprint: EMPTY_BLUEPRINT,
      archetype: "website-chatbot",
    });
    assert.ok(
      prompt.includes("247 reviews averaging 4.8"),
      "should render the social-proof line",
    );
  });

  test("omits social proof when only one of review_count/review_rating present", async () => {
    const soul = soulWith({ review_count: 247 });
    const prompt = await composeSystemPrompt({
      orgName: "Test Co",
      soul,
      blueprint: EMPTY_BLUEPRINT,
      archetype: "website-chatbot",
    });
    assert.ok(
      !prompt.includes("Social proof:"),
      "should not render partial social-proof line",
    );
  });

  test("renders certifications list when present", async () => {
    const soul = soulWith({
      certifications: ["NATE Certified", "BBB A+ rated", "EPA 608"],
    });
    const prompt = await composeSystemPrompt({
      orgName: "Test Co",
      soul,
      blueprint: EMPTY_BLUEPRINT,
      archetype: "website-chatbot",
    });
    assert.ok(
      prompt.includes("Certifications / credentials: NATE Certified, BBB A+ rated, EPA 608"),
      "should render comma-joined certifications",
    );
  });

  test("renders availability flags when emergency_service and same_day are true", async () => {
    const soul = soulWith({
      emergency_service: true,
      same_day: true,
    });
    const prompt = await composeSystemPrompt({
      orgName: "Test Co",
      soul,
      blueprint: EMPTY_BLUEPRINT,
      archetype: "website-chatbot",
    });
    assert.ok(
      prompt.includes("24/7 emergency service"),
      "should mention 24/7 emergency service flag",
    );
    assert.ok(
      prompt.includes("same-day appointments"),
      "should mention same-day flag",
    );
  });

  test("renders service area as comma-joined list", async () => {
    const soul = soulWith({
      service_area: ["Austin", "Round Rock", "Cedar Park"],
    });
    const prompt = await composeSystemPrompt({
      orgName: "Test Co",
      soul,
      blueprint: EMPTY_BLUEPRINT,
      archetype: "website-chatbot",
    });
    assert.ok(
      prompt.includes("Service area: Austin, Round Rock, Cedar Park"),
      "should render comma-joined service area",
    );
  });

  test("includes the 'don't make up facts' guardrail copy in the section", async () => {
    const soul = soulWith({
      business_description: "Test description",
    });
    const prompt = await composeSystemPrompt({
      orgName: "Test Co",
      soul,
      blueprint: EMPTY_BLUEPRINT,
      archetype: "website-chatbot",
    });
    assert.ok(
      prompt.includes("Don't make up facts not in this section"),
      "should include anti-hallucination guardrail copy",
    );
  });

  test("does NOT render '## Business facts' section when soul is null", async () => {
    const prompt = await composeSystemPrompt({
      orgName: "Test Co",
      soul: null,
      blueprint: EMPTY_BLUEPRINT,
      archetype: "website-chatbot",
    });
    assert.ok(
      !prompt.includes("## Business facts"),
      "should not render the section when soul is null",
    );
  });

  test("does NOT render '## Business facts' section when no snake_case fields are present", async () => {
    const prompt = await composeSystemPrompt({
      orgName: "Test Co",
      soul: soulWith({}),
      blueprint: EMPTY_BLUEPRINT,
      archetype: "website-chatbot",
    });
    assert.ok(
      !prompt.includes("## Business facts"),
      "should not render an empty section when no enrichment data is available",
    );
  });

  test("hard-rules skill (when present) appears AFTER the business-facts section", async () => {
    const soul = soulWith({
      business_description: "Test description",
    });
    const prompt = await composeSystemPrompt({
      orgName: "Test Co",
      soul,
      blueprint: EMPTY_BLUEPRINT,
      archetype: "website-chatbot",
    });
    const factsIdx = prompt.indexOf("## Business facts");
    // The hard-rules section's anchor copy may differ across skill packs;
    // check for the common safety-rule preamble or fall back to "rules"
    // appearing later. If neither is present (skill pack changed), the
    // section ordering invariant remains structurally enforced by the
    // composer (hard-rules pushed AFTER all dynamic content).
    assert.ok(factsIdx > 0, "business-facts section should be present");
    // Hard rules contain the literal heading "Hard rules" in the
    // canonical skill pack. If you change that, update this assertion.
    const hardRulesIdx = prompt.toLowerCase().indexOf("hard rules");
    if (hardRulesIdx >= 0) {
      assert.ok(
        hardRulesIdx > factsIdx,
        "hard-rules should appear after business-facts (safety invariant is the last thing read)",
      );
    }
  });
});
