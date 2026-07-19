// packages/crm/tests/unit/web-onboarding/markdown-extractor.spec.ts
//
// Uses DI seams (firecrawlClient + anthropicClient) so no network /
// Firecrawl / Anthropic calls during tests. All 5 tests cover the
// error-surface contract that the SSE route depends on.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  extractBusinessFactsFromUrl,
  WebFetchError,
} from "../../../src/lib/web-onboarding/markdown-extractor";
import type { FirecrawlClientLike } from "../../../src/lib/web-onboarding/firecrawl-scrape";

// Markdown body comfortably above firecrawl-scrape's MIN_MARKDOWN_CHARS
// (200) floor — otherwise the extractor short-circuits on "empty_content"
// before reaching the LLM step.
const SAMPLE_MARKDOWN =
  "# Acme Plumbing\n\n" +
  "Phone: (602) 555-0100  \n" +
  "Email: hello@acme-plumbing.com\n\n" +
  "## Our Services\n\n" +
  "- Drain cleaning and hydro-jetting\n" +
  "- Water heater repair and replacement\n" +
  "- Slab leak detection and repair\n" +
  "- Sewer line camera inspection\n" +
  "- Emergency 24/7 plumbing\n\n" +
  "## About Us\n\n" +
  "Acme Plumbing is a family-owned plumbing company serving Phoenix, AZ " +
  "and the greater Maricopa County area since 1998. Licensed, bonded, " +
  "and insured. Same-day service available for emergencies.\n\n" +
  "## Service Area\n\n" +
  "Phoenix, Scottsdale, Tempe, Mesa, Chandler, Glendale.\n\n" +
  "123 Main St, Phoenix, AZ 85001. Family-owned since 1998. BBB A+ rated.\n";

function makeFakeFirecrawl(impl: (url: string) => Promise<unknown>): FirecrawlClientLike {
  return {
    scrape: async (url) => impl(url),
  };
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
  test("happy path: Firecrawl -> MD -> mocked Anthropic returns valid JSON", async () => {
    const validFacts = {
      business_name: "Acme Plumbing",
      city: "Phoenix",
      state: "AZ",
      phone: "(602) 555-0100",
      services: ["Drain cleaning", "Water heater repair"],
      business_description: "Family-owned plumbing serving Phoenix since 1998.",
    };
    const firecrawl = makeFakeFirecrawl(async () => ({
      markdown: SAMPLE_MARKDOWN,
      metadata: { sourceURL: "https://acme.com/", title: "Acme Plumbing", statusCode: 200 },
    }));
    const { client, calls } = makeFakeAnthropic({
      content: [{ type: "text", text: JSON.stringify(validFacts) }],
    });

    const result = await extractBusinessFactsFromUrl({
      url: "https://acme.com",
      byokKey: "sk-ant-test",
      firecrawlClient: firecrawl,
      anthropicClient: client,
    });

    assert.equal(result.business_name, "Acme Plumbing");
    assert.equal(result.services.length, 2);

    // Confirm: no `tools` field — provider-agnostic prompt, not the
    // Anthropic-specific web_fetch tool path.
    const call = calls[0] as { tools?: unknown; system?: string; messages?: unknown[] };
    assert.equal(call.tools, undefined, "must NOT send any tools");
    assert.ok(call.system, "must set system prompt");
    // The MD content (from Firecrawl) should be in the user msg.
    const userMsg = (call.messages as Array<{ content: string }>)[0]?.content ?? "";
    assert.ok(userMsg.includes("Acme Plumbing"), "MD content in user message");
    assert.ok(userMsg.includes("URL: https://acme.com"), "URL in user message");
  });

  test("Firecrawl throws -> WebFetchError(extraction_failed) with 'Firecrawl fetch failed' prefix", async () => {
    const firecrawl = makeFakeFirecrawl(async () => {
      throw new Error("Cloudflare challenge: status 403");
    });
    const { client } = makeFakeAnthropic({ content: [{ type: "text", text: "{}" }] });
    await assert.rejects(
      () =>
        extractBusinessFactsFromUrl({
          url: "https://acme.com/missing",
          byokKey: "sk-ant-test",
          firecrawlClient: firecrawl,
          anthropicClient: client,
        }),
      (err: unknown) =>
        err instanceof WebFetchError &&
        err.reason === "extraction_failed" &&
        err.message.includes("Firecrawl fetch failed: fetch_failed"),
    );
  });

  test("near-empty markdown (< 200 chars) -> WebFetchError(extraction_failed)", async () => {
    // JS-only SPA shell / anti-bot challenge / blank doc — Firecrawl
    // returns markdown but well below the MIN_MARKDOWN_CHARS floor.
    const firecrawl = makeFakeFirecrawl(async () => ({
      markdown: "# Loading\n\nEnable JavaScript.",
      metadata: { sourceURL: "https://spa.example/", statusCode: 200 },
    }));
    const { client } = makeFakeAnthropic({ content: [{ type: "text", text: "{}" }] });
    await assert.rejects(
      () =>
        extractBusinessFactsFromUrl({
          url: "https://spa.example",
          byokKey: "sk-ant-test",
          firecrawlClient: firecrawl,
          anthropicClient: client,
        }),
      (err: unknown) =>
        err instanceof WebFetchError &&
        err.reason === "extraction_failed" &&
        err.message.includes("empty_content"),
    );
  });

  test("Anthropic 401 -> WebFetchError(anthropic_unauthorized)", async () => {
    const firecrawl = makeFakeFirecrawl(async () => ({
      markdown: SAMPLE_MARKDOWN,
      metadata: { sourceURL: "https://acme.com/", statusCode: 200 },
    }));
    const client = makeThrowingAnthropic(401, "unauthorized");
    await assert.rejects(
      () =>
        extractBusinessFactsFromUrl({
          url: "https://acme.com",
          byokKey: "sk-ant-bad",
          firecrawlClient: firecrawl,
          anthropicClient: client,
        }),
      (err: unknown) =>
        err instanceof WebFetchError && err.reason === "anthropic_unauthorized",
    );
  });

  // 2026-07-16 — Anthropic reports "Your credit balance is too low to access
  // the Anthropic API" as HTTP 400 (invalid_request_error), NOT 402/429, so
  // it used to fall through to internal_error and the /try UI lied with
  // "Something broke on our end. Give it another try." (observed live on
  // flowtechac.com). It must map to credits_exhausted like the 402/429 cases.
  test("Anthropic 400 'credit balance is too low' -> WebFetchError(credits_exhausted)", async () => {
    const firecrawl = makeFakeFirecrawl(async () => ({
      markdown: SAMPLE_MARKDOWN,
      metadata: { sourceURL: "https://acme.com/", statusCode: 200 },
    }));
    const client = makeThrowingAnthropic(
      400,
      '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}',
    );
    await assert.rejects(
      () =>
        extractBusinessFactsFromUrl({
          url: "https://acme.com",
          byokKey: "sk-ant-test",
          firecrawlClient: firecrawl,
          anthropicClient: client,
        }),
      (err: unknown) =>
        err instanceof WebFetchError && err.reason === "credits_exhausted",
    );
  });

  test("LLM returns prose, not JSON -> parse fails -> WebFetchError(extraction_failed)", async () => {
    const firecrawl = makeFakeFirecrawl(async () => ({
      markdown: SAMPLE_MARKDOWN,
      metadata: { sourceURL: "https://acme.com/", statusCode: 200 },
    }));
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
          firecrawlClient: firecrawl,
          anthropicClient: client,
        }),
      (err: unknown) =>
        err instanceof WebFetchError && err.reason === "extraction_failed",
    );
  });
});

// 2026-07-14 — Contact-page fallback (extraction-failed honesty + contact
// fallback design). When the first extraction attempt fails to parse (the
// `_error` sentinel or malformed JSON — the common case is a required field
// like `phone` living on a /contact page the homepage scrape never saw), the
// extractor retries once against the homepage MD + up to 2 same-host
// contact-shaped candidate pages before giving up.
describe("extractBusinessFactsFromUrl — contact-page fallback", () => {
  const HOMEPAGE_MARKDOWN =
    SAMPLE_MARKDOWN.replace("Phone: (602) 555-0100  \n", "") +
    "\n\n[Contact us](/contact)\n[About](/about)\n";

  const CONTACT_MARKDOWN =
    "# Contact Acme Plumbing\n\n" +
    "Phone: (602) 555-0100\n" +
    "Email: hello@acme-plumbing.com\n\n" +
    "123 Main St, Phoenix, AZ 85001. Call us any time, 24/7 emergency service " +
    "available. We serve the greater Phoenix metro area.\n";

  const validFacts = {
    business_name: "Acme Plumbing",
    city: "Phoenix",
    state: "AZ",
    phone: "(602) 555-0100",
    services: ["Drain cleaning", "Water heater repair"],
    business_description: "Family-owned plumbing serving Phoenix since 1998.",
  };

  test("first attempt _error -> candidate scraped -> second attempt succeeds -> facts returned; second LLM message contains both MDs; Firecrawl called with the candidate URL", async () => {
    const scrapedUrls: string[] = [];
    const firecrawl = makeFakeFirecrawl(async (url) => {
      scrapedUrls.push(url);
      if (url === "https://acme.com/") {
        return {
          markdown: HOMEPAGE_MARKDOWN,
          metadata: { sourceURL: "https://acme.com/", statusCode: 200 },
        };
      }
      if (url === "https://acme.com/contact") {
        return {
          markdown: CONTACT_MARKDOWN,
          metadata: { sourceURL: "https://acme.com/contact", statusCode: 200 },
        };
      }
      throw new Error("unexpected scrape URL: " + url);
    });

    let call = 0;
    const calls: Array<Record<string, unknown>> = [];
    const client = {
      messages: {
        create: async (params: Record<string, unknown>) => {
          calls.push(params);
          call += 1;
          if (call === 1) {
            return { content: [{ type: "text", text: JSON.stringify({ _error: "extraction_failed" }) }] };
          }
          return { content: [{ type: "text", text: JSON.stringify(validFacts) }] };
        },
      },
    } as unknown;

    const result = await extractBusinessFactsFromUrl({
      url: "https://acme.com/",
      byokKey: "sk-ant-test",
      firecrawlClient: firecrawl,
      anthropicClient: client,
    });

    assert.equal(result.business_name, "Acme Plumbing");
    assert.equal(calls.length, 2, "LLM called exactly twice");
    assert.ok(
      scrapedUrls.includes("https://acme.com/contact"),
      "Firecrawl must be called with the candidate URL",
    );

    const secondUserMsg = (calls[1].messages as Array<{ content: string }>)[0]?.content ?? "";
    assert.ok(secondUserMsg.includes("Acme Plumbing"), "second message contains homepage MD");
    assert.ok(secondUserMsg.includes("Contact Acme Plumbing"), "second message contains candidate MD");
    assert.ok(secondUserMsg.includes("https://acme.com/contact"), "second message labels the candidate URL");
  });

  test("fallback also fails -> WebFetchError(extraction_failed); LLM called exactly twice", async () => {
    const firecrawl = makeFakeFirecrawl(async (url) => {
      if (url === "https://acme.com/") {
        return {
          markdown: HOMEPAGE_MARKDOWN,
          metadata: { sourceURL: "https://acme.com/", statusCode: 200 },
        };
      }
      if (url === "https://acme.com/contact") {
        return {
          markdown: CONTACT_MARKDOWN,
          metadata: { sourceURL: "https://acme.com/contact", statusCode: 200 },
        };
      }
      throw new Error("unexpected scrape URL: " + url);
    });

    let call = 0;
    const calls: Array<Record<string, unknown>> = [];
    const client = {
      messages: {
        create: async (params: Record<string, unknown>) => {
          calls.push(params);
          call += 1;
          return { content: [{ type: "text", text: JSON.stringify({ _error: "extraction_failed" }) }] };
        },
      },
    } as unknown;

    await assert.rejects(
      () =>
        extractBusinessFactsFromUrl({
          url: "https://acme.com/",
          byokKey: "sk-ant-test",
          firecrawlClient: firecrawl,
          anthropicClient: client,
        }),
      (err: unknown) => err instanceof WebFetchError && err.reason === "extraction_failed",
    );
    assert.equal(calls.length, 2, "LLM called exactly twice (attempt 1 + fallback attempt)");
  });

  test("no candidates in MD + guess scrapes fail -> throws; LLM called once", async () => {
    const NO_LINKS_MARKDOWN = SAMPLE_MARKDOWN.replace("Phone: (602) 555-0100  \n", "");
    const firecrawl = makeFakeFirecrawl(async (url) => {
      if (url === "https://acme.com/") {
        return {
          markdown: NO_LINKS_MARKDOWN,
          metadata: { sourceURL: "https://acme.com/", statusCode: 200 },
        };
      }
      // Guess fallback URLs (/contact, /contact-us) both fail to scrape.
      throw new Error("404 not found");
    });

    let call = 0;
    const calls: Array<Record<string, unknown>> = [];
    const client = {
      messages: {
        create: async (params: Record<string, unknown>) => {
          calls.push(params);
          call += 1;
          return { content: [{ type: "text", text: JSON.stringify({ _error: "extraction_failed" }) }] };
        },
      },
    } as unknown;

    await assert.rejects(
      () =>
        extractBusinessFactsFromUrl({
          url: "https://acme.com/",
          byokKey: "sk-ant-test",
          firecrawlClient: firecrawl,
          anthropicClient: client,
        }),
      (err: unknown) => err instanceof WebFetchError && err.reason === "extraction_failed",
    );
    assert.equal(calls.length, 1, "LLM called exactly once — no successfully-scraped candidate to retry with");
  });

  test("Anthropic 401 on first attempt -> NO fallback (immediate anthropic_unauthorized)", async () => {
    let scrapeCalls = 0;
    const firecrawl = makeFakeFirecrawl(async (url) => {
      scrapeCalls += 1;
      return {
        markdown: HOMEPAGE_MARKDOWN,
        metadata: { sourceURL: url, statusCode: 200 },
      };
    });
    const client = makeThrowingAnthropic(401, "unauthorized");

    await assert.rejects(
      () =>
        extractBusinessFactsFromUrl({
          url: "https://acme.com/",
          byokKey: "sk-ant-bad",
          firecrawlClient: firecrawl,
          anthropicClient: client,
        }),
      (err: unknown) => err instanceof WebFetchError && err.reason === "anthropic_unauthorized",
    );
    assert.equal(scrapeCalls, 1, "only the homepage scrape happens — no contact-page fallback scrape");
  });
});
