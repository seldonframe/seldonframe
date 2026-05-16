// packages/crm/tests/unit/web-onboarding/extraction-parser.spec.ts
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { parseExtraction } from "../../../src/lib/web-onboarding/extraction-parser";

const validJson = JSON.stringify({
  business_name: "Acme Plumbing",
  city: "Phoenix",
  state: "AZ",
  phone: "(602) 555-0100",
  services: ["Drain cleaning", "Water heater repair", "Leak detection"],
  business_description: "Family-owned residential and commercial plumbing serving Phoenix since 1998.",
  review_count: 412,
  review_rating: 4.8,
  emergency_service: true,
  service_area: ["Phoenix", "Scottsdale", "Tempe"],
});

describe("parseExtraction", () => {
  test("parses a clean JSON payload with all required fields", () => {
    const result = parseExtraction(validJson);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.business_name, "Acme Plumbing");
      assert.equal(result.data.services.length, 3);
      assert.equal(result.data.city, "Phoenix");
    }
  });

  test("parses JSON wrapped in a ```json fenced block", () => {
    const result = parseExtraction("```json\n" + validJson + "\n```");
    assert.equal(result.ok, true);
  });

  test("parses JSON wrapped in an unlabelled ``` fenced block", () => {
    const result = parseExtraction("```\n" + validJson + "\n```");
    assert.equal(result.ok, true);
  });

  test("returns extraction_failed on malformed JSON", () => {
    const result = parseExtraction("{ business_name: 'no quotes' ");
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "extraction_failed");
    }
  });

  test("returns extraction_failed when a required field is missing (no business_name)", () => {
    const result = parseExtraction(JSON.stringify({
      city: "Phoenix",
      state: "AZ",
      phone: "(602) 555-0100",
      services: ["x"],
      business_description: "y",
    }));
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "extraction_failed");
    }
  });

  test("returns extraction_failed when services is not an array", () => {
    const result = parseExtraction(JSON.stringify({
      business_name: "x", city: "x", state: "x", phone: "x",
      services: "not an array",
      business_description: "x",
    }));
    assert.equal(result.ok, false);
  });

  test("returns extraction_failed when the model emitted _error", () => {
    const result = parseExtraction(JSON.stringify({ _error: "fetch_failed" }));
    assert.equal(result.ok, false);
  });
});
