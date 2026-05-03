// v1.3.0 — Personality generator unit tests.
//
// Tests focus on the pure pieces (cache key derivation, prompt
// builder, JSON-extraction loop) since the integration with the
// Anthropic API + DB requires fixtures we don't have in unit-test
// scope. The end-to-end resolve flow is exercised by integration
// tests + production observability (the personality_resolved log
// line, cache_hit ratio metric).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { deriveBusinessTypeKey } from "@/lib/crm/personality-generator";

describe("deriveBusinessTypeKey — cache key derivation", () => {
  test("roofing services produce a roof-flavored key", () => {
    const key = deriveBusinessTypeKey({
      business_name: "Ironclad Roofing",
      services: ["Roof repair", "Storm damage", "Gutter installation"],
      business_description: "Family-owned roofing contractor in Tampa.",
    });
    assert.match(key, /roof/);
  });

  test("med spa services produce a botox/medspa-flavored key", () => {
    const key = deriveBusinessTypeKey({
      business_name: "Elevated Med Spa",
      services: ["Botox", "Filler", "Microneedling", "HydraFacial"],
      business_description: "Luxury aesthetics studio.",
    });
    assert.match(key, /(botox|aesthetic|microneed|hydrafacial)/);
  });

  test("dental services produce a dental-flavored key", () => {
    const key = deriveBusinessTypeKey({
      business_name: "Bright Smile Family Dental",
      services: ["Cleanings", "Whitening", "Invisalign"],
      business_description: "Family and cosmetic dentistry in Austin.",
    });
    assert.match(key, /(dental|whiten|invisalign|smile|cosmetic)/);
  });

  test("pet grooming services produce a non-generic key", () => {
    const key = deriveBusinessTypeKey({
      business_name: "Paws & Claws Salon",
      services: ["Bath & brush", "Nail trim", "De-shedding"],
      business_description: "Full-service pet grooming for dogs and cats.",
    });
    // Long-tail niche — the key shouldn't degrade to "general"
    assert.notEqual(key, "general");
    assert.ok(key.length >= 4);
  });

  test("photography services produce a non-generic key", () => {
    const key = deriveBusinessTypeKey({
      business_name: "Hudson Valley Photography",
      services: ["Wedding photography", "Portrait sessions", "Event coverage"],
      business_description: "Wedding and portrait photographer.",
    });
    assert.notEqual(key, "general");
    assert.match(key, /(photo|wedding|portrait)/);
  });

  test("empty input falls back to 'general'", () => {
    const key = deriveBusinessTypeKey({
      business_name: "X",
      services: [],
    });
    assert.equal(key, "general");
  });

  test("only stopwords + generic verbs → 'general'", () => {
    const key = deriveBusinessTypeKey({
      business_name: "Y",
      services: ["repair", "install", "service"],
      business_description: "the and for with and or",
    });
    assert.equal(key, "general");
  });

  test("key is stable: same input → same key", () => {
    const a = deriveBusinessTypeKey({
      business_name: "A",
      services: ["Pet grooming", "Dog wash"],
      business_description: "Mobile pet grooming service.",
    });
    const b = deriveBusinessTypeKey({
      business_name: "B",
      services: ["Pet grooming", "Dog wash"],
      business_description: "Mobile pet grooming service.",
    });
    assert.equal(a, b);
  });

  test("key is hyphen-only — no spaces or special chars", () => {
    const key = deriveBusinessTypeKey({
      business_name: "Test Co!",
      services: ["Custom-poured candles", "Scent classes"],
      business_description: "Small-batch candle maker.",
    });
    assert.match(key, /^[a-z-]+$/);
  });

  test("key is bounded to 64 chars", () => {
    const key = deriveBusinessTypeKey({
      business_name: "Test",
      services: [
        "Comprehensive enterprise architecture consulting",
        "Strategic transformation programs",
        "Operational excellence frameworks",
      ],
      business_description:
        "Multi-decade enterprise transformation and operational excellence specialists.",
    });
    assert.ok(key.length <= 64);
  });

  test("two different niches produce different keys (not collision)", () => {
    const roofing = deriveBusinessTypeKey({
      business_name: "X",
      services: ["Roof repair"],
      business_description: "Roofing contractor.",
    });
    const dental = deriveBusinessTypeKey({
      business_name: "Y",
      services: ["Cleanings", "Whitening"],
      business_description: "Family dentistry.",
    });
    assert.notEqual(roofing, dental);
  });
});
