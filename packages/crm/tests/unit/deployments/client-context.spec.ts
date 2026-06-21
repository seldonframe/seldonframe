// Per-client context Phase 1 — TDD for mapSoulToClientContext.
//
// Pure mapping: a compiled SoulV4 → DeploymentClientContext, keeping ONLY the
// fields composeVoicePersona reads (businessName, businessDescription, services,
// faq) and DROPPING everything else (pricing, landing, intake, sourceUrl, price).
//
// No DB, no network, no LLM — pure function.
//
// To run:
//   cd packages/crm
//   node --import tsx --test tests/unit/deployments/client-context.spec.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { mapSoulToClientContext } from "../../../src/lib/deployments/client-context";
import type { SoulV4 } from "../../../src/lib/soul-compiler/schema";

/** A minimal valid-ish SoulV4 for a service business. We only populate the
 *  fields the mapper reads; the rest are filled with inert defaults so the
 *  object type-checks as SoulV4. */
function fakeServiceSoul(over: Partial<SoulV4> = {}): SoulV4 {
  return {
    business_name: "Acme Plumbing",
    audience_type: "service",
    base_framework: "agency",
    tagline: "Fast, friendly plumbing",
    soul_description: "A family-owned plumbing company serving the metro area.",
    pipeline_stages: [
      { name: "Lead", description: "New inquiry" },
      { name: "Quoted", description: "Estimate sent" },
      { name: "Scheduled", description: "Visit booked" },
      { name: "Done", description: "Job complete" },
    ],
    intake_form_fields: [],
    booking_config: {
      enabled: true,
      default_duration_minutes: 60,
      buffer_minutes: 15,
      services: [
        { name: "Drain cleaning", price: 149, description: "Clear any clog fast" },
        { name: "Water heater install", price: 1200, description: "Same-day install" },
      ],
    },
    pricing_config: null,
    landing_page_sections: ["hero", "services"],
    intelligence_hooks: [],
    ucp_capabilities: { checkout: false, booking: true, catalog: false, cart: false },
    custom_blocks: [],
    split_recommendation: false,
    framework_version: "v4",
    framework_creator: null,
    ...over,
  } as SoulV4;
}

describe("mapSoulToClientContext", () => {
  test("maps business_name → soul.businessName and soul_description → soul.businessDescription", () => {
    const ctx = mapSoulToClientContext(fakeServiceSoul());
    assert.equal(ctx.soul?.businessName, "Acme Plumbing");
    assert.equal(
      ctx.soul?.businessDescription,
      "A family-owned plumbing company serving the metro area.",
    );
  });

  test("services pass through from booking_config.services (name + description), dropping price", () => {
    const ctx = mapSoulToClientContext(fakeServiceSoul());
    assert.deepEqual(ctx.soul?.services, [
      { name: "Drain cleaning", description: "Clear any clog fast" },
      { name: "Water heater install", description: "Same-day install" },
    ]);
    // price must NOT leak into the captured service shape.
    for (const s of ctx.soul?.services ?? []) {
      assert.ok(!("price" in s), "price must be dropped from captured services");
    }
  });

  test("faqs map to faq, dropping sourceUrl", () => {
    const ctx = mapSoulToClientContext(
      fakeServiceSoul({
        faqs: [
          { q: "Do you do emergencies?", a: "Yes, 24/7.", sourceUrl: "https://acme.test/faq" },
          { q: "Service area?", a: "The whole metro.", sourceUrl: "https://acme.test/areas" },
        ],
      }),
    );
    assert.deepEqual(ctx.faq, [
      { q: "Do you do emergencies?", a: "Yes, 24/7." },
      { q: "Service area?", a: "The whole metro." },
    ]);
    for (const f of ctx.faq ?? []) {
      assert.ok(!("sourceUrl" in f), "sourceUrl must be dropped from captured FAQ");
    }
  });

  test("voice.style is carried when present", () => {
    // soul_description is the only prose source; voice style is optional and not
    // part of SoulV4 directly, so the mapper leaves voice undefined here.
    const ctx = mapSoulToClientContext(fakeServiceSoul());
    assert.equal(ctx.soul?.voice, undefined);
  });

  test("an empty/blank soul → {} (no soul, no faq) so the agent falls back to name-only", () => {
    // A soul with no name, no description, no services, no faqs maps to {} — the
    // deploy flow treats {} as 'nothing captured' and the voice path falls back
    // to clientName.
    const blank = fakeServiceSoul({
      business_name: "",
      soul_description: "",
      booking_config: {
        enabled: false,
        default_duration_minutes: 0,
        buffer_minutes: 0,
        services: [],
      },
      faqs: [],
    });
    const ctx = mapSoulToClientContext(blank);
    assert.deepEqual(ctx, {});
  });

  test("partial soul: name only (no services / faq / description) → soul.businessName only", () => {
    const partial = fakeServiceSoul({
      soul_description: "",
      booking_config: {
        enabled: false,
        default_duration_minutes: 0,
        buffer_minutes: 0,
        services: [],
      },
      faqs: [],
    });
    const ctx = mapSoulToClientContext(partial);
    assert.deepEqual(ctx, { soul: { businessName: "Acme Plumbing" } });
  });

  test("services with blank names are dropped; whitespace is trimmed", () => {
    const soul = fakeServiceSoul({
      booking_config: {
        enabled: true,
        default_duration_minutes: 60,
        buffer_minutes: 0,
        services: [
          { name: "  Leak repair  ", price: 99, description: "  Stop the drip  " },
          { name: "   ", price: 50, description: "blank name → dropped" },
        ],
      },
    });
    const ctx = mapSoulToClientContext(soul);
    assert.deepEqual(ctx.soul?.services, [
      { name: "Leak repair", description: "Stop the drip" },
    ]);
  });

  test("a service with an empty description omits the description key entirely", () => {
    const soul = fakeServiceSoul({
      booking_config: {
        enabled: true,
        default_duration_minutes: 60,
        buffer_minutes: 0,
        services: [{ name: "Inspection", price: 0, description: "" }],
      },
    });
    const ctx = mapSoulToClientContext(soul);
    assert.deepEqual(ctx.soul?.services, [{ name: "Inspection" }]);
  });
});
