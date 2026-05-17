// packages/crm/tests/unit/web-onboarding/markdown-extractor.spec.ts
//
// Uses DI seams (fetchImpl + anthropicClient) so no network / Anthropic
// calls during tests. All 5 tests cover the error-surface contract that
// the SSE route depends on.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  extractBusinessFactsFromUrl,
  WebFetchError,
} from "../../../src/lib/web-onboarding/markdown-extractor";

// Sample HTML sized so the resulting Markdown comfortably exceeds the
// MIN_MD_CHARS (200) threshold — otherwise the extractor would short-
// circuit on "no meaningful content" before reaching the LLM step.
const SAMPLE_HTML = `
  <html><body>
    <header>
      <a href="tel:602-555-0100">(602) 555-0100</a>
      <a href="mailto:hello@acme-plumbing.com">hello@acme-plumbing.com</a>
    </header>
    <h1>Acme Plumbing</h1>
    <h2>Our Services</h2>
    <ul>
      <li>Drain cleaning and hydro-jetting</li>
      <li>Water heater repair and replacement</li>
      <li>Slab leak detection and repair</li>
      <li>Sewer line camera inspection</li>
      <li>Emergency 24/7 plumbing</li>
    </ul>
    <h2>About Us</h2>
    <p>Acme Plumbing is a family-owned plumbing company serving Phoenix, AZ and the greater Maricopa County area since 1998. Licensed, bonded, and insured. Same-day service available for emergencies.</p>
    <h2>Service Area</h2>
    <p>Phoenix, Scottsdale, Tempe, Mesa, Chandler, Glendale, and surrounding communities.</p>
    <footer>
      <address>123 Main St, Phoenix, AZ 85001</address>
      <p>Family-owned since 1998. BBB A+ rated. 412 five-star reviews.</p>
    </footer>
  </body></html>
`;

function makeFakeFetch(init: {
  status?: number;
  contentType?: string;
  body?: string;
}): typeof fetch {
  return (async () =>
    new Response(init.body ?? "", {
      status: init.status ?? 200,
      headers: { "content-type": init.contentType ?? "text/html; charset=utf-8" },
    })) as typeof fetch;
}

function makeFakeAnthropic(messageResponse: {
  content: Array<{ type: string; text?: string }>;
}) {
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

function makeThrowingAnthropic(status: number, message: string) {
  return {
    messages: {
      create: async () => {
        const err = new Error(message);
        (err as unknown as { status?: number }).status = status;
        throw err;
      },
    },
  } as unknown;
}

describe("extractBusinessFactsFromUrl (markdown-extractor)", () => {
  test("happy path: fetch -> MD -> mocked Anthropic returns valid JSON", async () => {
    const validFacts = {
      business_name: "Acme Plumbing",
      city: "Phoenix",
      state: "AZ",
      phone: "(602) 555-0100",
      services: ["Drain cleaning", "Water heater repair"],
      business_description: "Family-owned plumbing serving Phoenix since 1998.",
    };
    const fakeFetch = makeFakeFetch({ body: SAMPLE_HTML });
    const { client, calls } = makeFakeAnthropic({
      content: [{ type: "text", text: JSON.stringify(validFacts) }],
    });

    const result = await extractBusinessFactsFromUrl({
      url: "https://acme.com",
      byokKey: "sk-ant-test",
      fetchImpl: fakeFetch,
      anthropicClient: client,
    });

    assert.equal(result.business_name, "Acme Plumbing");
    assert.equal(result.services.length, 2);

    // Confirm: no `tools` field — provider-agnostic prompt, not the
    // Anthropic-specific web_fetch tool path.
    const call = calls[0] as { tools?: unknown; system?: string; messages?: unknown[] };
    assert.equal(call.tools, undefined, "must NOT send any tools");
    assert.ok(call.system, "must set system prompt");
    // The MD content (drained from sample HTML) should be in the user msg.
    const userMsg = (call.messages as Array<{ content: string }>)[0]?.content ?? "";
    assert.ok(userMsg.includes("Acme Plumbing"), "MD content in user message");
    assert.ok(userMsg.includes("URL: https://acme.com"), "URL in user message");
  });

  test("fetch returns 404 -> WebFetchError(extraction_failed) with Fetch failed: http_error_404", async () => {
    const fakeFetch = makeFakeFetch({ status: 404 });
    const { client } = makeFakeAnthropic({ content: [{ type: "text", text: "{}" }] });
    await assert.rejects(
      () =>
        extractBusinessFactsFromUrl({
          url: "https://acme.com/missing",
          byokKey: "sk-ant-test",
          fetchImpl: fakeFetch,
          anthropicClient: client,
        }),
      (err: unknown) =>
        err instanceof WebFetchError &&
        err.reason === "extraction_failed" &&
        err.message.includes("Fetch failed: http_error_404"),
    );
  });

  test("near-empty page (MD < 200 chars) -> WebFetchError(extraction_failed)", async () => {
    // A minimal page below the MIN_MD_CHARS threshold (200) — JS-only
    // SPA shell, anti-bot challenge, blank doc.
    const fakeFetch = makeFakeFetch({ body: "<html><body><p>Loading</p></body></html>" });
    const { client } = makeFakeAnthropic({ content: [{ type: "text", text: "{}" }] });
    await assert.rejects(
      () =>
        extractBusinessFactsFromUrl({
          url: "https://spa.example",
          byokKey: "sk-ant-test",
          fetchImpl: fakeFetch,
          anthropicClient: client,
        }),
      (err: unknown) =>
        err instanceof WebFetchError &&
        err.reason === "extraction_failed" &&
        err.message.includes("no meaningful content"),
    );
  });

  test("Anthropic 401 -> WebFetchError(anthropic_unauthorized)", async () => {
    const fakeFetch = makeFakeFetch({ body: SAMPLE_HTML });
    const client = makeThrowingAnthropic(401, "unauthorized");
    await assert.rejects(
      () =>
        extractBusinessFactsFromUrl({
          url: "https://acme.com",
          byokKey: "sk-ant-bad",
          fetchImpl: fakeFetch,
          anthropicClient: client,
        }),
      (err: unknown) =>
        err instanceof WebFetchError && err.reason === "anthropic_unauthorized",
    );
  });

  test("LLM returns prose, not JSON -> parse fails -> WebFetchError(extraction_failed)", async () => {
    const fakeFetch = makeFakeFetch({ body: SAMPLE_HTML });
    const { client } = makeFakeAnthropic({
      content: [
        {
          type: "text",
          text: "I extracted the business facts from the Markdown. Here are my findings...",
        },
      ],
    });
    await assert.rejects(
      () =>
        extractBusinessFactsFromUrl({
          url: "https://acme.com",
          byokKey: "sk-ant-test",
          fetchImpl: fakeFetch,
          anthropicClient: client,
        }),
      (err: unknown) =>
        err instanceof WebFetchError && err.reason === "extraction_failed",
    );
  });
});
