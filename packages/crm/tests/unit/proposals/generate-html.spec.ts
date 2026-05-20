// packages/crm/tests/unit/proposals/generate-html.spec.ts
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { buildProposalPrompt } from "@/lib/proposals/generate-html";

describe("buildProposalPrompt", () => {
  const input = {
    agencyName: "Max Agency",
    agencyBrandColor: "#7c3aed",
    prospectName: "Roofs by Shiloh",
    prospectFirstName: "Shiloh",
    prospectServices: ["residential roofing", "storm damage"],
    monthlyPriceCents: 49700,
    template: {
      subject: "Booking system for {{prospectName}}",
      introCopy: "We help home-service businesses fill their calendar.",
      scopeCopy: "Booking page, CRM, AI chatbot, intake forms.",
      timelineCopy: "Live within 24 hours of acceptance.",
      termsCopy: "Month-to-month. Cancel anytime.",
    },
  };

  test("includes prospect name in the system instruction", () => {
    const prompt = buildProposalPrompt(input);
    assert.ok(prompt.includes("Roofs by Shiloh"));
  });

  test("includes the agency template copy", () => {
    const prompt = buildProposalPrompt(input);
    assert.ok(prompt.includes("We help home-service businesses"));
  });

  test("renders the price as USD", () => {
    const prompt = buildProposalPrompt(input);
    assert.ok(prompt.includes("$497"));
  });

  test("substitutes prospect template variables", () => {
    const prompt = buildProposalPrompt(input);
    assert.ok(prompt.includes("Booking system for Roofs by Shiloh"));
  });

  test("includes the brand color in the rendering instructions", () => {
    const prompt = buildProposalPrompt(input);
    assert.ok(prompt.includes("#7c3aed"));
  });

  test("includes service list in personalization context", () => {
    const prompt = buildProposalPrompt(input);
    assert.ok(prompt.includes("residential roofing"));
    assert.ok(prompt.includes("storm damage"));
  });
});
