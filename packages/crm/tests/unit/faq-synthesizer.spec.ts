import { test } from "node:test";
import assert from "node:assert/strict";
import { synthesizeFaqsFromSoul } from "@/lib/soul-compiler/faq-synthesizer";
import type { SoulV4 } from "@/lib/soul-compiler/schema";

const TEST_SOUL: SoulV4 = {
  business_name: "Dallas Plumbing",
  audience_type: "service",
  base_framework: "agency",
  tagline: "Trusted Dallas plumbing",
  soul_description: "Family-owned plumber serving Dallas since 1988.",
  pipeline_stages: [
    { name: "Lead", description: "" },
    { name: "Quoted", description: "" },
    { name: "Scheduled", description: "" },
    { name: "Completed", description: "" },
  ],
  intake_form_fields: [],
  booking_config: {
    enabled: true,
    default_duration_minutes: 60,
    buffer_minutes: 15,
    services: [{ name: "Drain repair", price: 150, description: "Standard drain unclog" }],
  },
  pricing_config: null,
  landing_page_sections: ["hero", "services"],
  intelligence_hooks: [],
  ucp_capabilities: { checkout: false, booking: true, catalog: false, cart: false },
  custom_blocks: [],
  split_recommendation: false,
  custom_domain_suggestion: null,
  framework_version: "v4",
  framework_creator: "seldonframe",
};

function makeMockClient(response: string) {
  return {
    messages: {
      create: async () => ({
        content: [{ type: "text", text: response }],
      }),
    },
  };
}

test("faq-synthesizer: returns parsed Q&A pairs", async () => {
  const mockResponse = JSON.stringify([
    { q: "Do you do same-day service?", a: "Typically yes for emergencies." },
    { q: "Are you licensed?", a: "Usually we maintain all required licenses." },
  ]);

  const result = await synthesizeFaqsFromSoul({
    soul: TEST_SOUL,
    apiKey: "sk-test",
    targetCount: 2,
    _testClient: makeMockClient(mockResponse) as any,
  });

  assert.equal(result.length, 2);
  assert.equal(result[0].q, "Do you do same-day service?");
});

test("faq-synthesizer: targetCount: 0 makes no LLM call", async () => {
  let called = false;
  const mockClient = {
    messages: {
      create: async () => {
        called = true;
        return { content: [{ type: "text", text: "[]" }] };
      },
    },
  };

  const result = await synthesizeFaqsFromSoul({
    soul: TEST_SOUL,
    apiKey: "sk-test",
    targetCount: 0,
    _testClient: mockClient as any,
  });

  assert.deepEqual(result, []);
  assert.equal(called, false, "should short-circuit with no Claude call");
});

test("faq-synthesizer: malformed JSON returns empty", async () => {
  const result = await synthesizeFaqsFromSoul({
    soul: TEST_SOUL,
    apiKey: "sk-test",
    targetCount: 3,
    _testClient: makeMockClient("garbage not json") as any,
  });

  assert.deepEqual(result, []);
});

test("faq-synthesizer: filters out entries missing q or a", async () => {
  const mockResponse = JSON.stringify([
    { q: "Q1?", a: "Typically yes." },
    { q: "Q2?" }, // missing a
    { a: "Usually" }, // missing q
    { q: "Q4?", a: "Generally fine." },
  ]);

  const result = await synthesizeFaqsFromSoul({
    soul: TEST_SOUL,
    apiKey: "sk-test",
    targetCount: 4,
    _testClient: makeMockClient(mockResponse) as any,
  });

  assert.equal(result.length, 2);
  assert.equal(result[0].q, "Q1?");
  assert.equal(result[1].q, "Q4?");
});

test("faq-synthesizer: accepts existingFaqs for dedup context", async () => {
  const mockResponse = JSON.stringify([{ q: "Different question?", a: "Typically yes." }]);

  const result = await synthesizeFaqsFromSoul({
    soul: TEST_SOUL,
    apiKey: "sk-test",
    targetCount: 1,
    existingFaqs: [{ q: "Existing question?", a: "Existing answer." }],
    _testClient: makeMockClient(mockResponse) as any,
  });

  assert.equal(result.length, 1);
});
