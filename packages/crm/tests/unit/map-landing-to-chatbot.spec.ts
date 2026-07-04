// Tests for mapLandingContentToChatbot — the pure helper that seeds the
// first-run chatbot from the R1 landing payload already generated for the
// same workspace-creation request. Fixes the "hollow chatbot" bug: an
// auto-created AI receptionist that shipped with faq:[] and a generic
// greeting, i.e. it knew nothing and never answered.
//
// Key-shape ground truth (see r1-payload-prompt.ts / lib/agents/store.ts):
//   - R1 payload FAQ items:      { id, question, answer }
//   - AgentBlueprint.faq wants:  { q, a, source }
//   - R1 payload services:      { id, name, description } — NO price field
//     anywhere in the pipeline, so pricingFacts is expected to come back
//     empty for real R1 payloads today; the mapper still defensively reads
//     an optional price/currency in case a future payload version adds one.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { mapLandingContentToChatbot } from "../../src/lib/landing/map-landing-to-chatbot";
import type { R1LandingPayload } from "../../src/lib/landing/r1-payload-prompt";

function buildFixturePayload(): R1LandingPayload {
  return {
    hero: {
      archetype: "trusted-local-pro",
      eyebrow: "El Paso, TX",
      headline: "Cool air, fast",
      subhead: "Same-day AC repair across El Paso",
      ctaPrimary: { label: "Book now", href: "/book" },
    },
    services: {
      archetype: "trusted-local-pro",
      heading: "Our services",
      services: [
        { id: "s1", name: "AC Repair", description: "Fast diagnostics and repair." },
        { id: "s2", name: "AC Installation", description: "New system installs." },
        { id: "s3", name: "Furnace Repair", description: "Heating repair, all makes." },
        { id: "s4", name: "Duct Cleaning", description: "Whole-home duct service." },
        { id: "s5", name: "Maintenance Plans", description: "Seasonal tune-ups." },
        { id: "s6", name: "Emergency Service", description: "24/7 emergency dispatch." },
      ],
    },
    testimonials: {
      archetype: "trusted-local-pro",
      heading: "What customers say",
      testimonials: [],
    },
    faq: {
      archetype: "trusted-local-pro",
      heading: "Frequently asked questions",
      items: [
        { id: "f1", question: "Do you offer same-day service?", answer: "Yes, same-day AC repair is available across El Paso." },
        { id: "f2", question: "Are you licensed and insured?", answer: "Yes, we are fully licensed and insured in Texas." },
        { id: "f3", question: "What areas do you serve?", answer: "We serve El Paso and surrounding communities." },
        { id: "f4", question: "Do you offer financing?", answer: "Yes, financing options are available for installs." },
        { id: "f5", question: "What brands do you service?", answer: "We service all major HVAC brands." },
      ],
    },
    footer: {
      archetype: "trusted-local-pro",
      businessName: "PeakAir SD",
      phone: "555-010-2000",
    },
  } as unknown as R1LandingPayload;
}

describe("mapLandingContentToChatbot — real 5-FAQ/6-service payload", () => {
  test("maps all 5 FAQ items with question/answer -> q/a and source: extracted", () => {
    const mapped = mapLandingContentToChatbot(buildFixturePayload(), "PeakAir SD");
    assert.equal(mapped.faq.length, 5);
    assert.deepEqual(mapped.faq[0], {
      q: "Do you offer same-day service?",
      a: "Yes, same-day AC repair is available across El Paso.",
      source: "extracted",
    });
    for (const entry of mapped.faq) {
      assert.equal(entry.source, "extracted");
      assert.ok(entry.q.length > 0);
      assert.ok(entry.a.length > 0);
    }
  });

  test("yields empty pricingFacts for real R1 payloads (no price field in the pipeline)", () => {
    const mapped = mapLandingContentToChatbot(buildFixturePayload(), "PeakAir SD");
    assert.deepEqual(mapped.pricingFacts, []);
  });

  test("defensively maps pricingFacts when a service DOES carry a price (future-proofing)", () => {
    const payload = buildFixturePayload();
    (payload.services.services[0] as unknown as { price: number; currency: string }).price = 129;
    (payload.services.services[0] as unknown as { price: number; currency: string }).currency = "USD";
    const mapped = mapLandingContentToChatbot(payload, "PeakAir SD");
    assert.deepEqual(mapped.pricingFacts, [{ label: "AC Repair", amount: 129, currency: "USD" }]);
  });

  test("crafts a business-specific greeting mentioning the business name and inferred niche", () => {
    const mapped = mapLandingContentToChatbot(buildFixturePayload(), "PeakAir SD");
    assert.ok(mapped.greeting.includes("PeakAir SD"), mapped.greeting);
    assert.notEqual(mapped.greeting, "Hi! How can I help you today?");
  });
});

describe("mapLandingContentToChatbot — no landing payload (skipped/failed R1 step)", () => {
  test("returns empty faq, empty pricingFacts, and the generic default greeting", () => {
    const mapped = mapLandingContentToChatbot(null, "Acme Plumbing");
    assert.deepEqual(mapped.faq, []);
    assert.deepEqual(mapped.pricingFacts, []);
    assert.equal(mapped.greeting, "Hi! How can I help you today?");
  });

  test("also handles undefined payload the same way", () => {
    const mapped = mapLandingContentToChatbot(undefined, "Acme Plumbing");
    assert.deepEqual(mapped.faq, []);
    assert.equal(mapped.greeting, "Hi! How can I help you today?");
  });
});

describe("mapLandingContentToChatbot — malformed payload defensiveness", () => {
  test("drops FAQ items missing question or answer instead of throwing", () => {
    const payload = buildFixturePayload();
    payload.faq.items = [
      { id: "f1", question: "", answer: "some answer" },
      { id: "f2", question: "real question", answer: "" },
      { id: "f3", question: "good one", answer: "good answer" },
    ] as R1LandingPayload["faq"]["items"];
    const mapped = mapLandingContentToChatbot(payload, "Acme");
    assert.equal(mapped.faq.length, 1);
    assert.equal(mapped.faq[0].q, "good one");
  });

  test("tolerates a missing services array", () => {
    const payload = buildFixturePayload();
    (payload.services as unknown as { services: unknown }).services = undefined;
    const mapped = mapLandingContentToChatbot(payload, "Acme");
    assert.deepEqual(mapped.pricingFacts, []);
  });
});
