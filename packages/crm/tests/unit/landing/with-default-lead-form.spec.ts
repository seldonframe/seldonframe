// Tests for withDefaultLeadForm — pure helper that ensures every generated
// R1 payload ships with leadForm.enabled=true + hero.leadFormInHero=true.
// Fully offline — no network calls, no DB, no Anthropic.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { withDefaultLeadForm } from "../../../src/lib/landing/r1-landing-step";
import type { R1LandingPayload } from "../../../src/lib/landing/r1-payload-prompt";

// ── Minimal fixture ──────────────────────────────────────────────────────────

function makePayload(overrides: Partial<R1LandingPayload> = {}): R1LandingPayload {
  return {
    hero: {
      archetype: "bold-urgency",
      businessName: "Acme HVAC",
      tagline: "Fast HVAC Service",
      subhead: "Available 24/7 in Stockton, CA.",
      primaryCTA: { label: "Get a free estimate", href: "/book" },
      trustBadges: [{ label: "Licensed & Insured" }],
    },
    services: {
      archetype: "bold-urgency",
      heading: "Our Services",
      services: [
        { id: "s1", name: "AC Repair", description: "We fix AC." },
        { id: "s2", name: "Furnace Install", description: "We install furnaces." },
        { id: "s3", name: "Duct Cleaning", description: "Clean ducts." },
      ],
    },
    testimonials: {
      archetype: "bold-urgency",
      heading: "Reviews",
      testimonials: [{ id: "t1", quote: "Great!", name: "Jane D." }],
    },
    faq: {
      archetype: "bold-urgency",
      heading: "FAQ",
      items: [{ id: "f1", question: "24/7?", answer: "Yes." }],
    },
    footer: {
      archetype: "bold-urgency",
      businessName: "Acme HVAC",
      phone: "(209) 555-0100",
    },
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("withDefaultLeadForm", () => {
  test("sets leadForm.enabled=true when leadForm is absent", () => {
    const payload = makePayload(); // no leadForm
    withDefaultLeadForm(payload, ["AC Repair", "Furnace Install"]);
    assert.equal(payload.leadForm?.enabled, true);
  });

  test("sets hero.leadFormInHero=true", () => {
    const payload = makePayload();
    withDefaultLeadForm(payload, ["AC Repair", "Furnace Install"]);
    assert.equal(payload.hero.leadFormInHero, true);
  });

  test("needOptions are populated from the services list", () => {
    const payload = makePayload();
    withDefaultLeadForm(payload, ["AC Repair", "Furnace Install", "Duct Cleaning"]);
    assert.deepEqual(payload.leadForm?.needOptions, [
      "AC Repair",
      "Furnace Install",
      "Duct Cleaning",
    ]);
  });

  test("omits needOptions when services list is empty", () => {
    const payload = makePayload();
    withDefaultLeadForm(payload, []);
    assert.equal("needOptions" in (payload.leadForm ?? {}), false);
  });

  test("fills heading + subheading + needLabel with sensible defaults", () => {
    const payload = makePayload();
    withDefaultLeadForm(payload, ["AC Repair"]);
    assert.equal(typeof payload.leadForm?.heading, "string");
    assert.ok((payload.leadForm?.heading?.length ?? 0) > 0);
    assert.equal(typeof payload.leadForm?.subheading, "string");
    assert.equal(typeof payload.leadForm?.needLabel, "string");
  });

  test("preserves LLM-supplied heading if present", () => {
    const payload = makePayload({
      leadForm: { enabled: false, heading: "Custom quote request" },
    });
    withDefaultLeadForm(payload, ["AC Repair"]);
    assert.equal(payload.leadForm?.heading, "Custom quote request");
    // enabled must be true regardless of the LLM value.
    assert.equal(payload.leadForm?.enabled, true);
  });

  test("preserves LLM-supplied needOptions if present", () => {
    const payload = makePayload({
      leadForm: { enabled: false, needOptions: ["Emergency repair", "Routine service"] },
    });
    withDefaultLeadForm(payload, ["AC Repair", "Furnace Install"]);
    // LLM content wins over derived service list.
    assert.deepEqual(payload.leadForm?.needOptions, ["Emergency repair", "Routine service"]);
  });

  test("forces enabled=true even when LLM emitted enabled=false", () => {
    const payload = makePayload({ leadForm: { enabled: false } });
    withDefaultLeadForm(payload, []);
    assert.equal(payload.leadForm?.enabled, true);
  });

  test("returns the same payload reference (mutates in place)", () => {
    const payload = makePayload();
    const returned = withDefaultLeadForm(payload, []);
    assert.strictEqual(returned, payload);
  });

  test("does not overwrite pre-existing hero fields", () => {
    const payload = makePayload();
    const originalTagline = payload.hero.tagline;
    withDefaultLeadForm(payload, []);
    assert.equal(payload.hero.tagline, originalTagline);
    assert.equal(payload.hero.businessName, "Acme HVAC");
  });
});
