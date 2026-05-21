import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { composeProposalHtml } from "@/lib/proposals/compose-html";
import { DEFAULT_PROPOSAL_TEMPLATE } from "@/lib/proposals/generate-html";

describe("composeProposalHtml", () => {
  const baseInput = {
    prospectName: "Roofs by Shiloh",
    prospectFirstName: "Shiloh",
    monthlyPriceCents: 49700,
    setupFeeCents: 0,
    scopeItems: [{ label: "Booking page" }, { label: "AI chatbot" }],
    agencyTemplate: DEFAULT_PROPOSAL_TEMPLATE,
    brandColor: "#7c3aed",
  };

  test("includes the prospect name in the heading", () => {
    const html = composeProposalHtml(baseInput);
    assert.ok(html.includes("Roofs by Shiloh"));
  });

  test("uses the operator's intro override when provided", () => {
    const html = composeProposalHtml({
      ...baseInput,
      introOverride: "We talked last week at the trade show.",
    });
    assert.ok(html.includes("We talked last week at the trade show"));
  });

  test("falls back to the agency template when no override is given", () => {
    const html = composeProposalHtml(baseInput);
    // Default intro mentions the first name (Shiloh) via {{prospectFirstName}} substitution
    assert.ok(html.includes("Shiloh"));
  });

  test("renders scope items as a <ul>", () => {
    const html = composeProposalHtml(baseInput);
    assert.ok(html.includes("<ul>"));
    assert.ok(html.includes("Booking page"));
    assert.ok(html.includes("AI chatbot"));
  });

  test("escapes HTML in operator inputs to prevent XSS", () => {
    const html = composeProposalHtml({
      ...baseInput,
      introOverride: "<script>alert(1)</script>",
    });
    assert.ok(!html.includes("<script>alert(1)</script>"));
    assert.ok(html.includes("&lt;script&gt;"));
  });
});
