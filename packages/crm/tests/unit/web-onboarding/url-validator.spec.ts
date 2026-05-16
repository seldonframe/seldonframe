// packages/crm/tests/unit/web-onboarding/url-validator.spec.ts
// Spec §"URL validation": /^https?:\/\/[a-z0-9.-]+(\.[a-z]{2,})/i after trim.
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { validateCreateFromUrlInput } from "../../../src/lib/web-onboarding/url-validator";

describe("validateCreateFromUrlInput", () => {
  test("accepts a valid http URL after trim", () => {
    const result = validateCreateFromUrlInput("  http://acme.com  ");
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.url, "http://acme.com");
    }
  });

  test("accepts a valid https URL with path", () => {
    const result = validateCreateFromUrlInput("https://acme-digital.io/about");
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.url, "https://acme-digital.io/about");
    }
  });

  test("rejects a non-http(s) scheme", () => {
    const result = validateCreateFromUrlInput("ftp://acme.com");
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "invalid_url");
    }
  });

  test("rejects a URL missing a TLD", () => {
    const result = validateCreateFromUrlInput("http://acme");
    assert.equal(result.ok, false);
  });

  test("rejects an empty / whitespace-only input", () => {
    assert.equal(validateCreateFromUrlInput("").ok, false);
    assert.equal(validateCreateFromUrlInput("   ").ok, false);
  });
});
