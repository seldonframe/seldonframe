// packages/crm/tests/unit/web-onboarding/firecrawl-scrape.spec.ts
//
// Uses the `firecrawlClient` DI seam — no network IO, no real Firecrawl
// account, no FIRECRAWL_API_KEY required during the test run.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  firecrawlScrape,
  type FirecrawlClientLike,
} from "../../../src/lib/web-onboarding/firecrawl-scrape";

// Markdown body comfortably above the 200-char MIN_MARKDOWN_CHARS floor.
const SAMPLE_MARKDOWN =
  "# Acme Plumbing\n\n" +
  "## Our Services\n\n" +
  "- Drain cleaning and hydro-jetting\n" +
  "- Water heater repair and replacement\n" +
  "- Slab leak detection and repair\n" +
  "- Sewer line camera inspection\n\n" +
  "## About\n\n" +
  "Family-owned plumbing company serving Phoenix since 1998. Licensed, " +
  "bonded, and insured. Same-day service for emergencies. 412 five-star " +
  "reviews. BBB A+ rated.\n\n" +
  "Phone: (602) 555-0100  \n" +
  "Email: hello@acme-plumbing.com  \n" +
  "Address: 123 Main St, Phoenix, AZ 85001\n";

function makeFakeClient(impl: (url: string, opts?: Record<string, unknown>) => Promise<unknown>): {
  client: FirecrawlClientLike;
  calls: Array<{ url: string; opts?: Record<string, unknown> }>;
} {
  const calls: Array<{ url: string; opts?: Record<string, unknown> }> = [];
  const client: FirecrawlClientLike = {
    scrape: async (url, opts) => {
      calls.push({ url, opts });
      return impl(url, opts);
    },
  };
  return { client, calls };
}

describe("firecrawlScrape", () => {
  test("happy path: returns ok with markdown + finalUrl + title", async () => {
    const { client, calls } = makeFakeClient(async () => ({
      markdown: SAMPLE_MARKDOWN,
      metadata: {
        sourceURL: "https://acme-plumbing.com/",
        title: "Acme Plumbing | Phoenix, AZ",
        statusCode: 200,
      },
    }));

    const result = await firecrawlScrape("https://acme-plumbing.com", {
      firecrawlClient: client,
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.match(result.markdown, /Acme Plumbing/);
      assert.equal(result.finalUrl, "https://acme-plumbing.com/");
      assert.equal(result.title, "Acme Plumbing | Phoenix, AZ");
    }
    // Confirm we asked for markdown format + kept onlyMainContent off.
    assert.equal(calls.length, 1);
    const opts = calls[0]?.opts as { formats?: string[]; onlyMainContent?: boolean } | undefined;
    assert.deepEqual(opts?.formats, ["markdown"]);
    assert.equal(opts?.onlyMainContent, false);
  });

  test("SDK throws -> reason: fetch_failed with detail from error message", async () => {
    const { client } = makeFakeClient(async () => {
      throw new Error("Firecrawl returned 500: upstream unavailable");
    });

    const result = await firecrawlScrape("https://acme-plumbing.com", {
      firecrawlClient: client,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "fetch_failed");
      assert.match(result.detail ?? "", /upstream unavailable/);
    }
  });

  test("error mentioning /timeout/i -> reason: timeout", async () => {
    const { client } = makeFakeClient(async () => {
      throw new Error("Scrape job timed out after 30000ms");
    });

    const result = await firecrawlScrape("https://slow.example", {
      firecrawlClient: client,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "timeout");
    }
  });

  test("markdown shorter than 200 chars -> reason: empty_content", async () => {
    const { client } = makeFakeClient(async () => ({
      markdown: "# Loading\n\nPlease enable JavaScript.",
      metadata: { sourceURL: "https://spa.example/", statusCode: 200 },
    }));

    const result = await firecrawlScrape("https://spa.example", {
      firecrawlClient: client,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "empty_content");
      assert.match(result.detail ?? "", /chars of MD/);
    }
  });
});
