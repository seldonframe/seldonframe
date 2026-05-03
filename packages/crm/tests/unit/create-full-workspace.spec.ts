// Unit tests for the Atomic Workspace Creation orchestrator.
//
// These cover the pure-function parts: input validation,
// classification chain (services + description → personality),
// timezone inference per the spec's example cases. The full
// pipeline (DB writes, HTTP rendering, post-create assertions)
// runs end-to-end in the integration suite — gated to a real DB
// and not part of this node:test harness.
//
// Run: node --test --import tsx packages/crm/tests/unit/create-full-workspace.spec.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { classifyBusinessTypeFromSoul } from "@/lib/page-schema/classify-business";
import { selectCRMPersonality } from "@/lib/crm/personality";
import { inferTimezone } from "@/lib/workspace/infer-timezone";

/**
 * Compose the same classifier-soul shape createFullWorkspace builds
 * from CreateFullWorkspaceInput. Keeping this as a test-only helper
 * so we exercise the actual classification chain end-to-end without
 * hitting the DB.
 */
function classifyFromInput(
  services: string[],
  business_description: string
): string {
  const soul = {
    business_name: "Test",
    soul_description: business_description,
    offerings: services.map((name) => ({ name })),
  };
  const businessType = classifyBusinessTypeFromSoul(soul);
  // Same industry hint construction as createFullWorkspace —
  // services + description joined so the personality bank's
  // more-specific keywords ("law firm", "design agency") win
  // before the businessType fallback chain.
  const industryHint = [services.join(" "), business_description]
    .filter(Boolean)
    .join(" ");
  const personality = selectCRMPersonality(businessType, industryHint);
  return personality.vertical;
}

// ─── Classification (the keyword chain) ──────────────────────────────────────

describe("createFullWorkspace classification", () => {
  test("HVAC in Phoenix → hvac personality", () => {
    const vertical = classifyFromInput(
      ["AC repair", "heating installation", "duct cleaning"],
      "Residential and commercial HVAC in Phoenix"
    );
    assert.equal(vertical, "hvac");
  });

  test("Plumbing → hvac personality (shared local-service bucket)", () => {
    const vertical = classifyFromInput(
      ["Drain cleaning", "Water heater repair"],
      "Family-owned residential plumbing in Austin"
    );
    assert.equal(vertical, "hvac");
  });

  test("Pacific Coast Heating → hvac (regression: 'heating' alone)", () => {
    // The bug from the demo test — "Pacific Coast Heating & Air"
    // landed in coaching personality because "heating" wasn't in the
    // local_service keywords. Locked in here so it can't regress.
    const vertical = classifyFromInput(
      [],
      "Pacific Coast Heating & Air — residential service in San Diego"
    );
    assert.equal(vertical, "hvac");
  });

  test("Law firm → legal personality", () => {
    const vertical = classifyFromInput(
      ["estate planning", "family law", "real estate closings"],
      "Boutique law firm in Manhattan"
    );
    assert.equal(vertical, "legal");
  });

  test("Dental practice → dental personality", () => {
    const vertical = classifyFromInput(
      ["cleanings", "checkups", "consultations"],
      "Family dental practice in Brooklyn"
    );
    assert.equal(vertical, "dental");
  });

  test("Coaching → coaching personality", () => {
    const vertical = classifyFromInput(
      ["1:1 coaching", "group programs"],
      "Executive coaching for tech founders"
    );
    assert.equal(vertical, "coaching");
  });

  test("Marketing agency → agency personality", () => {
    const vertical = classifyFromInput(
      ["brand strategy", "web design", "campaigns"],
      "Boutique branding agency for early-stage startups"
    );
    assert.equal(vertical, "agency");
  });

  test("v1.2.0: Unknown business → general default (was coaching)", () => {
    const vertical = classifyFromInput(
      ["custom-poured candles", "scent classes"],
      "Small-batch candle maker — every batch poured by hand."
    );
    // v1.2.0: BUSINESS_TYPE_FALLBACK rerouted from coaching → general.
    // A candle maker that doesn't match any specific vertical now ships
    // GENERAL personality (Customer/Job/Quote terminology, "Book a free
    // quote" CTAs) instead of coaching ("Discovery call / Engagement").
    // (Note: avoid the word "studio" — that triggers the agency bucket
    // via "design studio" / "production studio" patterns.)
    assert.equal(vertical, "general");
  });
});

// ─── Timezone inference ──────────────────────────────────────────────────────

describe("createFullWorkspace timezone inference", () => {
  test("Phoenix, AZ → America/Phoenix (no DST)", () => {
    assert.equal(inferTimezone("AZ", "Phoenix", "Phoenix, AZ"), "America/Phoenix");
  });

  test("San Diego, CA → America/Los_Angeles", () => {
    assert.equal(
      inferTimezone("CA", "San Diego", "San Diego, CA"),
      "America/Los_Angeles"
    );
  });

  test("New York, NY → America/New_York", () => {
    assert.equal(
      inferTimezone("NY", "New York", "New York, NY"),
      "America/New_York"
    );
  });

  test("Portland, OR → America/Los_Angeles (Pacific)", () => {
    assert.equal(inferTimezone("OR", "Portland", "Portland, OR"), "America/Los_Angeles");
  });

  test("Toronto, ON → America/Toronto", () => {
    assert.equal(inferTimezone("ON", "Toronto", "Toronto, ON"), "America/Toronto");
  });

  test("Free-text location in business description", () => {
    // Operator gives city/state in description rather than as fields.
    // The orchestrator's chained inferTimezone call should pick it up.
    assert.equal(
      inferTimezone(null, null, null, null, "Family-owned HVAC in San Diego."),
      "America/Los_Angeles"
    );
  });

  test("Unknown location returns null (caller falls back to default)", () => {
    assert.equal(inferTimezone("Globally distributed", "Earth", null), null);
  });

  test("Full state name resolves", () => {
    assert.equal(inferTimezone("California"), "America/Los_Angeles");
  });

  test("Lowercase state code resolves", () => {
    assert.equal(inferTimezone("ca"), "America/Los_Angeles");
  });
});

// ─── Spec parity (the example fixtures from the spec) ────────────────────────

describe("createFullWorkspace — spec parity", () => {
  test("HVAC fixture (spec): personality=hvac, timezone=America/Phoenix", () => {
    // Spec fixture: Test HVAC Co, Phoenix AZ
    const vertical = classifyFromInput(
      ["AC repair", "heating installation", "duct cleaning"],
      "Residential and commercial HVAC in Phoenix"
    );
    const tz = inferTimezone("AZ", "Phoenix", "Phoenix, AZ");
    assert.equal(vertical, "hvac");
    assert.equal(tz, "America/Phoenix");
  });

  test("Legal fixture (spec): personality=legal, timezone=America/New_York", () => {
    // Spec fixture: Park Avenue Law, NYC
    const vertical = classifyFromInput(
      ["estate planning", "family law", "real estate closings"],
      "Boutique law firm in Manhattan"
    );
    const tz = inferTimezone("NY", "New York", "New York, NY");
    assert.equal(vertical, "legal");
    assert.equal(tz, "America/New_York");
  });

  test("v1.2.0: Default fixture: unknown vertical → general default + Pacific timezone", () => {
    // Spec fixture inspired: Artisan Candle Shop, Portland OR (with
    // wording adjusted to avoid the agency-bucket "studio" keyword).
    const vertical = classifyFromInput(
      ["custom-poured candles", "scent classes"],
      "Small-batch candle maker in Portland."
    );
    const tz = inferTimezone("OR", "Portland", "Portland, OR");
    // v1.2.0: fallback rerouted from coaching → general.
    assert.equal(vertical, "general");
    assert.equal(tz, "America/Los_Angeles");
  });
});
