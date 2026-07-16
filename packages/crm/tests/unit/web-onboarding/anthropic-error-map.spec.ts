// packages/crm/tests/unit/web-onboarding/anthropic-error-map.spec.ts
//
// The shared Anthropic-SDK-error → WebFetchError mapping used by BOTH
// markdown-extractor.ts and paste-extractor.ts. This bug class (a mapping
// fixed in one extractor but not the other) is exactly why the mapping is
// one function — these tests pin the full status/message contract once.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { mapAnthropicSdkError } from "../../../src/lib/web-onboarding/anthropic-error-map";
import { WebFetchError } from "../../../src/lib/web-onboarding/web-fetch-extractor";

function sdkError(status: number | undefined, message: string): Error {
  const err = new Error(message);
  (err as unknown as { status?: number }).status = status;
  return err;
}

describe("mapAnthropicSdkError", () => {
  test("401 and 403 -> anthropic_unauthorized", () => {
    for (const status of [401, 403]) {
      const mapped = mapAnthropicSdkError(sdkError(status, "unauthorized"));
      assert.ok(mapped instanceof WebFetchError);
      assert.equal(mapped.reason, "anthropic_unauthorized", `status ${status}`);
    }
  });

  test("402 and 429 -> credits_exhausted", () => {
    for (const status of [402, 429]) {
      const mapped = mapAnthropicSdkError(sdkError(status, "rate limited"));
      assert.equal(mapped.reason, "credits_exhausted", `status ${status}`);
    }
  });

  // 2026-07-16 — the live gap: Anthropic sends the out-of-credits error as
  // HTTP 400 invalid_request_error, not 402/429.
  test("400 with 'credit balance is too low' in the message -> credits_exhausted (case-insensitive)", () => {
    const mapped = mapAnthropicSdkError(
      sdkError(
        400,
        '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}',
      ),
    );
    assert.equal(mapped.reason, "credits_exhausted");

    const mappedUpper = mapAnthropicSdkError(
      sdkError(400, "Your CREDIT BALANCE IS TOO LOW to access the Anthropic API."),
    );
    assert.equal(mappedUpper.reason, "credits_exhausted");
  });

  test("400 with any other message -> internal_error (a genuine bad request stays a bug signal)", () => {
    const mapped = mapAnthropicSdkError(sdkError(400, "max_tokens must be positive"));
    assert.equal(mapped.reason, "internal_error");
    assert.equal(mapped.message, "max_tokens must be positive");
  });

  test("500 / missing status / non-Error throw -> internal_error", () => {
    assert.equal(mapAnthropicSdkError(sdkError(500, "overloaded")).reason, "internal_error");
    assert.equal(mapAnthropicSdkError(sdkError(undefined, "socket hang up")).reason, "internal_error");
    const fromString = mapAnthropicSdkError("boom");
    assert.equal(fromString.reason, "internal_error");
    assert.equal(fromString.message, "Anthropic SDK call failed.");
  });
});
