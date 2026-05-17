// packages/crm/tests/unit/web-onboarding/web-fetch-extractor.spec.ts
// Mocks the Anthropic SDK module via tsx's loader-less object replacement:
// we inject a fake client into extractBusinessFactsFromUrl so we never hit the
// real Anthropic API in unit tests.
//
// FIXTURE PATCH (per dispatch instructions 2026-05-16): the first test's
// JSON payload now matches the REQUIRED_FIELDS_SCHEMA shape the Phase 4
// parser actually requires (business_name, city, state, phone, services,
// business_description). The old shape (description, audience_type) was
// rejected by parseExtraction() and made the test useless.
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  extractBusinessFactsFromUrl,
  WebFetchError,
} from "../../../src/lib/web-onboarding/web-fetch-extractor";

function makeFakeClient(messageResponse: { content: Array<{ type: string; text?: string }> }) {
  const calls: Array<Record<string, unknown>> = [];
  return {
    calls,
    client: {
      messages: {
        create: async (params: Record<string, unknown>) => {
          calls.push(params);
          return messageResponse;
        },
      },
    } as unknown,
  };
}

describe("extractBusinessFactsFromUrl", () => {
  test("returns parsed facts on a successful extraction", async () => {
    const text = JSON.stringify({
      business_name: "Acme",
      city: "Phoenix",
      state: "AZ",
      phone: "(602) 555-0100",
      services: ["Drain cleaning"],
      business_description: "Stuff and things",
    });
    const { client, calls } = makeFakeClient({ content: [{ type: "text", text }] });
    const result = await extractBusinessFactsFromUrl({
      url: "https://acme.com",
      byokKey: "sk-ant-test",
      anthropicClient: client,
    });
    assert.equal(result.business_name, "Acme");
    // Confirm we passed the web_fetch server tool and the model is the spec default.
    const call = calls[0] as { tools?: unknown[]; model?: string };
    // Tool spec MUST include both `type` and `name` per Anthropic docs.
    // Bug fix 2026-05-16: prior impl omitted `name` → API 400 silently
    // and we masked it as extraction_failed for every URL.
    assert.deepEqual(call.tools, [
      { type: "web_fetch_20250910", name: "web_fetch" },
    ]);
    assert.ok((call.model as string).startsWith("claude-sonnet-"));
  });

  test("throws WebFetchError(extraction_failed) when the model emits malformed JSON", async () => {
    const { client } = makeFakeClient({ content: [{ type: "text", text: "not json at all" }] });
    await assert.rejects(
      () =>
        extractBusinessFactsFromUrl({
          url: "https://acme.com",
          byokKey: "sk-ant-test",
          anthropicClient: client,
        }),
      (err: unknown) => err instanceof WebFetchError && err.reason === "extraction_failed"
    );
  });

  test("throws WebFetchError(credits_exhausted) when the SDK throws a 402-like error", async () => {
    const client = {
      messages: {
        create: async () => {
          const e = new Error("billing: credit limit exceeded");
          (e as unknown as { status?: number }).status = 402;
          throw e;
        },
      },
    } as unknown;
    await assert.rejects(
      () =>
        extractBusinessFactsFromUrl({
          url: "https://acme.com",
          byokKey: "sk-ant-test",
          anthropicClient: client,
        }),
      (err: unknown) => err instanceof WebFetchError && err.reason === "credits_exhausted"
    );
  });
});
