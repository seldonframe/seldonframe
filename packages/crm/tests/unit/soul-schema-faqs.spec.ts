import { test } from "node:test";
import assert from "node:assert/strict";
import { soulV4Schema } from "@/lib/soul-compiler/schema";

const BASE_SOUL = {
  business_name: "Dallas Plumbing",
  audience_type: "service" as const,
  base_framework: "agency" as const,
  tagline: "Dallas's trusted plumber",
  soul_description: "Family-owned plumbing serving Dallas since 1988.",
  pipeline_stages: [
    { name: "Lead", description: "New inquiry" },
    { name: "Quoted", description: "Estimate sent" },
    { name: "Scheduled", description: "Appointment booked" },
    { name: "Completed", description: "Work done" },
  ],
  intake_form_fields: [],
  booking_config: {
    enabled: true,
    default_duration_minutes: 60,
    buffer_minutes: 15,
    services: [{ name: "Drain repair", price: 150, description: "Standard drain" }],
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

test("soul schema: accepts soul WITHOUT faqs field (backward compat)", () => {
  const result = soulV4Schema.safeParse(BASE_SOUL);
  assert.equal(result.success, true);
});

test("soul schema: accepts soul WITH valid faqs array", () => {
  const soul = {
    ...BASE_SOUL,
    faqs: [
      { q: "Do you do emergencies?", a: "Yes, 24/7.", sourceUrl: "https://dallasplumbing.com/faq" },
    ],
  };
  const result = soulV4Schema.safeParse(soul);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.faqs?.length, 1);
    assert.equal(result.data.faqs?.[0].q, "Do you do emergencies?");
  }
});

test("soul schema: rejects faqs entry with missing q", () => {
  const soul = {
    ...BASE_SOUL,
    faqs: [{ a: "Yes", sourceUrl: "https://dallasplumbing.com/faq" }],
  };
  const result = soulV4Schema.safeParse(soul);
  assert.equal(result.success, false);
});

test("soul schema: rejects faqs entry with non-URL sourceUrl", () => {
  const soul = {
    ...BASE_SOUL,
    faqs: [{ q: "Q?", a: "A.", sourceUrl: "not-a-url" }],
  };
  const result = soulV4Schema.safeParse(soul);
  assert.equal(result.success, false);
});

test("soul schema: q under 3 chars is rejected", () => {
  const soul = {
    ...BASE_SOUL,
    faqs: [{ q: "Q?", a: "A long enough answer.", sourceUrl: "https://example.com" }],
  };
  const result = soulV4Schema.safeParse(soul);
  assert.equal(result.success, false);
});
