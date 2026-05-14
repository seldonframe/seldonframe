import { test } from "node:test";
import assert from "node:assert/strict";
import { rankUrlsForFaqRelevance } from "@/lib/soul-compiler/sitemap-priority";

function makeMockClient(response: string) {
  return {
    messages: {
      create: async () => ({
        content: [{ type: "text", text: response }],
      }),
    },
  };
}

test("sitemap-priority: returns ranked URLs from Claude response", async () => {
  const mockResponse = JSON.stringify([
    { url: "https://example.com/faq", reason: "Explicit FAQ slug", confidence: 0.95 },
    { url: "https://example.com/services", reason: "May contain inline Q&A", confidence: 0.5 },
  ]);

  const result = await rankUrlsForFaqRelevance({
    domain: "example.com",
    apiKey: "sk-test",
    _testUrls: ["https://example.com/faq", "https://example.com/services", "https://example.com/blog/post-1"],
    _testClient: makeMockClient(mockResponse) as any,
  });

  assert.equal(result.length, 2);
  assert.equal(result[0].url, "https://example.com/faq");
  assert.equal(result[0].confidence, 0.95);
});

test("sitemap-priority: rejects hallucinated URLs not in input", async () => {
  const mockResponse = JSON.stringify([
    { url: "https://example.com/faq", reason: "FAQ", confidence: 0.9 },
    { url: "https://hallucinated.com/faq", reason: "FAQ", confidence: 0.9 },
  ]);

  const result = await rankUrlsForFaqRelevance({
    domain: "example.com",
    apiKey: "sk-test",
    _testUrls: ["https://example.com/faq"],
    _testClient: makeMockClient(mockResponse) as any,
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].url, "https://example.com/faq");
});

test("sitemap-priority: respects limit parameter", async () => {
  const mockResponse = JSON.stringify([
    { url: "https://example.com/faq", reason: "FAQ", confidence: 0.9 },
    { url: "https://example.com/services", reason: "S", confidence: 0.7 },
    { url: "https://example.com/about", reason: "A", confidence: 0.5 },
  ]);

  const result = await rankUrlsForFaqRelevance({
    domain: "example.com",
    apiKey: "sk-test",
    limit: 2,
    _testUrls: [
      "https://example.com/faq",
      "https://example.com/services",
      "https://example.com/about",
    ],
    _testClient: makeMockClient(mockResponse) as any,
  });

  assert.equal(result.length, 2);
});

test("sitemap-priority: empty URL list returns empty result", async () => {
  const result = await rankUrlsForFaqRelevance({
    domain: "example.com",
    apiKey: "sk-test",
    _testUrls: [],
    _testClient: makeMockClient("[]") as any,
  });

  assert.deepEqual(result, []);
});

test("sitemap-priority: malformed JSON falls back to top URLs", async () => {
  const result = await rankUrlsForFaqRelevance({
    domain: "example.com",
    apiKey: "sk-test",
    _testUrls: ["https://example.com/faq", "https://example.com/services"],
    _testClient: makeMockClient("not json") as any,
  });

  // Fallback: return the input URLs with confidence 0.5
  assert.equal(result.length, 2);
  assert.equal(result[0].confidence, 0.5);
});
