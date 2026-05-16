// Tests for v1.54.0 archetype-curated Unsplash fallback.
//
// Phase 1 (existing behavior): LLM-generated query + 3-tier broadening.
// Phase 2 (NEW): when all Phase 1 candidates return zero results AND
// caller provided archetypeContext, try archetype.fallbackImageQueries
// picked deterministically by hash(business_name) % len.

import { describe, test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  resolveHeroImage,
  __setUnsplashFetchForTest,
  __resetUnsplashFetchForTest,
  pickFallbackQuery,
} from "../../src/lib/crm/personality-images";

// Build a fake Unsplash search response with N results, mimicking the
// real API shape just enough for the resolver to extract urls + id +
// download_location + photographer attribution.
function fakeSearchResponse(count: number, queryEcho: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      results: Array.from({ length: count }).map((_, i) => ({
        id: `${queryEcho}-${i}`,
        urls: { raw: `https://example.com/${queryEcho}-${i}.jpg` },
        links: { download_location: `https://example.com/dl/${queryEcho}-${i}` },
        user: {
          name: "Test Photographer",
          username: "testphotog",
          links: { html: "https://example.com/photog" },
        },
      })),
    }),
  };
}

function fakeZeroResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ({ results: [] }),
  };
}

before(() => {
  process.env.UNSPLASH_ACCESS_KEY = "test-key";
});

after(() => {
  delete process.env.UNSPLASH_ACCESS_KEY;
  __resetUnsplashFetchForTest();
});

beforeEach(() => {
  __resetUnsplashFetchForTest();
});

describe("pickFallbackQuery — determinism + distribution", () => {
  test("same input → same output", () => {
    const a = pickFallbackQuery("bold-urgency", "Mr Rooter Plumbing");
    const b = pickFallbackQuery("bold-urgency", "Mr Rooter Plumbing");
    assert.equal(a, b);
  });

  test("different business names produce at least 2 distinct fallbacks", () => {
    const picks = new Set([
      pickFallbackQuery("bold-urgency", "Mr Rooter Plumbing"),
      pickFallbackQuery("bold-urgency", "Joe's HVAC Service"),
      pickFallbackQuery("bold-urgency", "Quigley Air Conditioning"),
      pickFallbackQuery("bold-urgency", "Acme Electrical"),
    ]);
    assert.ok(
      picks.size >= 2,
      `expected >= 2 distinct picks, got ${picks.size}: ${[...picks].join(", ")}`,
    );
  });

  test("returns a query that exists in the archetype's fallbackImageQueries", () => {
    const pick = pickFallbackQuery("clinical-trust", "Smile Dental");
    // Import here to assert membership.
    const { ARCHETYPES } = require("../../src/lib/workspace/aesthetic-archetypes");
    assert.ok(
      ARCHETYPES["clinical-trust"].fallbackImageQueries.includes(pick),
      `${pick} not in clinical-trust fallbacks`,
    );
  });
});

describe("resolveHeroImage — Phase 1 succeeds, Phase 2 never fires", () => {
  test("returns LLM query result when Phase 1 hits", async () => {
    const calls: string[] = [];
    __setUnsplashFetchForTest(async (url: string) => {
      calls.push(url);
      return fakeSearchResponse(3, "plumber");
    });

    const result = await resolveHeroImage("emergency plumber", {
      archetype: "bold-urgency",
      businessName: "Mr Rooter",
    });

    assert.ok(result);
    assert.match(result!.url, /plumber-0\.jpg/);
    // Phase 2 should NOT have fired — only Phase 1 query.
    assert.equal(calls.length, 1, `expected 1 call, got ${calls.length}`);
  });
});

describe("resolveHeroImage — Phase 1 all-zero, no archetype context", () => {
  test("returns null (preserves existing behavior)", async () => {
    __setUnsplashFetchForTest(async () => fakeZeroResponse());

    const result = await resolveHeroImage("asphalt shingle residential roof");
    assert.equal(result, null);
  });
});

describe("resolveHeroImage — Phase 1 all-zero, with archetype context, Phase 2 fires", () => {
  test("fires fallback query and returns result", async () => {
    const queries: string[] = [];
    __setUnsplashFetchForTest(async (url: string) => {
      const match = url.match(/query=([^&]+)/);
      const query = match ? decodeURIComponent(match[1]) : "";
      queries.push(query);
      // Phase 1 candidates zero-result; Phase 2 fallback succeeds.
      if (query.startsWith("asphalt") || query.startsWith("shingle") || query === "residential roof") {
        return fakeZeroResponse();
      }
      return fakeSearchResponse(5, "fallback");
    });

    const result = await resolveHeroImage("asphalt shingle residential roof", {
      archetype: "bold-urgency",
      businessName: "Mr Rooter",
    });

    assert.ok(result, "Phase 2 should have returned a result");
    assert.match(result!.url, /fallback-0\.jpg/);
    // Phase 1: 3 candidates. Phase 2: 1 fallback query. Total = 4.
    assert.equal(queries.length, 4, `expected 4 queries (3 Phase 1 + 1 Phase 2), got ${queries.length}: ${queries.join(" | ")}`);
    // The last query should be a known bold-urgency fallback.
    const { ARCHETYPES } = require("../../src/lib/workspace/aesthetic-archetypes");
    assert.ok(
      ARCHETYPES["bold-urgency"].fallbackImageQueries.includes(queries[3]),
      `last query "${queries[3]}" should be a bold-urgency fallback`,
    );
  });
});

describe("resolveHeroImage — no UNSPLASH_ACCESS_KEY", () => {
  test("returns null without making any API calls", async () => {
    delete process.env.UNSPLASH_ACCESS_KEY;
    let called = false;
    __setUnsplashFetchForTest(async () => {
      called = true;
      return fakeZeroResponse();
    });

    const result = await resolveHeroImage("anything", {
      archetype: "bold-urgency",
      businessName: "Mr Rooter",
    });

    assert.equal(result, null);
    assert.equal(called, false);
    process.env.UNSPLASH_ACCESS_KEY = "test-key"; // restore for next test
  });
});

describe("resolveGalleryImages — Phase 2 per zero-result slot", () => {
  test("LLM queries succeed → no Phase 2", async () => {
    const { resolveGalleryImages } = await import("../../src/lib/crm/personality-images");
    __setUnsplashFetchForTest(async (url: string) => {
      const match = url.match(/query=([^&]+)/);
      const query = match ? decodeURIComponent(match[1]) : "";
      return fakeSearchResponse(5, query.replace(/\s+/g, "-"));
    });

    const results = await resolveGalleryImages(
      ["dental crown", "dental cleaning", "dental implant"],
      { archetype: "clinical-trust", businessName: "Smile Dental" },
    );
    assert.equal(results.length, 3);
  });

  test("All LLM queries zero-result → Phase 2 fills each slot", async () => {
    const { resolveGalleryImages } = await import("../../src/lib/crm/personality-images");
    const seenQueries: string[] = [];
    __setUnsplashFetchForTest(async (url: string) => {
      const match = url.match(/query=([^&]+)/);
      const query = match ? decodeURIComponent(match[1]) : "";
      seenQueries.push(query);
      // Specific LLM queries zero-result; broad fallbacks succeed.
      const { ARCHETYPES } = require("../../src/lib/workspace/aesthetic-archetypes");
      const isFallback = ARCHETYPES["clinical-trust"].fallbackImageQueries.includes(query);
      return isFallback ? fakeSearchResponse(5, query.replace(/\s+/g, "-")) : fakeZeroResponse();
    });

    const results = await resolveGalleryImages(
      ["super specific dental crown procedure", "minimally invasive dental cleaning"],
      { archetype: "clinical-trust", businessName: "Smile Dental" },
    );
    assert.equal(results.length, 2, "both slots should have been filled via Phase 2");
  });

  test("No archetypeContext → Phase 2 skipped, slots stay empty (existing behavior)", async () => {
    const { resolveGalleryImages } = await import("../../src/lib/crm/personality-images");
    __setUnsplashFetchForTest(async () => fakeZeroResponse());

    const results = await resolveGalleryImages(["something nonexistent"]);
    assert.equal(results.length, 0);
  });
});
