// Media sources T2 — stock photo search (Unsplash + Pexels).
//
// Pure/DI'd: `searchStockPhotos` takes an injected `fetch` + injected keys so
// tests never touch the network or real env vars. Contract:
//   - queries BOTH providers in parallel
//   - normalizes each into { url, thumbUrl, alt, credit, source }
//   - merges + interleaves for variety, capped at ~6 total
//   - never throws: a missing key or a provider error yields [] for THAT
//     provider only — the other provider's results still come back.
//
// To run:
//   cd packages/crm
//   node --import tsx --test tests/unit/media/stock-search.spec.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { searchStockPhotos, resolveStockKeys } from "../../../src/lib/media/stock-search";

type FetchCall = { url: string; init?: RequestInit };

function fakeFetch(
  handler: (url: string, init?: RequestInit) => { status: number; body: unknown } | Promise<{ status: number; body: unknown }>,
) {
  const calls: FetchCall[] = [];
  const fn = async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const result = await handler(url, init);
    return {
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
      json: async () => result.body,
    } as Response;
  };
  return { fn, calls };
}

const UNSPLASH_OK = {
  results: [
    {
      urls: { regular: "https://images.unsplash.com/a-regular.jpg", small: "https://images.unsplash.com/a-small.jpg" },
      alt_description: "a cozy cafe",
      user: { name: "Ada Lovelace" },
      links: { download_location: "https://api.unsplash.com/photos/a/download" },
    },
    {
      urls: { regular: "https://images.unsplash.com/b-regular.jpg", small: "https://images.unsplash.com/b-small.jpg" },
      alt_description: "a bright storefront",
      user: { name: "Grace Hopper" },
      links: { download_location: "https://api.unsplash.com/photos/b/download" },
    },
  ],
};

const PEXELS_OK = {
  photos: [
    {
      src: { large: "https://images.pexels.com/x-large.jpg", medium: "https://images.pexels.com/x-medium.jpg" },
      alt: "a modern office",
      photographer: "Margaret Hamilton",
    },
    {
      src: { large: "https://images.pexels.com/y-large.jpg", medium: "https://images.pexels.com/y-medium.jpg" },
      alt: "a coffee shop counter",
      photographer: "Katherine Johnson",
    },
  ],
};

describe("resolveStockKeys", () => {
  test("reads UNSPLASH_ACCESS_KEY and PEXELS_API_KEY from env", () => {
    const keys = resolveStockKeys({
      UNSPLASH_ACCESS_KEY: "unsplash-secret",
      PEXELS_API_KEY: "pexels-secret",
    } as unknown as NodeJS.ProcessEnv);
    assert.deepEqual(keys, { unsplash: "unsplash-secret", pexels: "pexels-secret" });
  });

  test("returns undefined entries when env vars are absent", () => {
    const keys = resolveStockKeys({} as unknown as NodeJS.ProcessEnv);
    assert.equal(keys.unsplash, undefined);
    assert.equal(keys.pexels, undefined);
  });
});

describe("searchStockPhotos — both providers healthy", () => {
  test("merges + normalizes + interleaves + caps at 6", async () => {
    const { fn, calls } = fakeFetch((url) => {
      if (url.includes("unsplash.com")) return { status: 200, body: UNSPLASH_OK };
      if (url.includes("pexels.com")) return { status: 200, body: PEXELS_OK };
      throw new Error(`unexpected url ${url}`);
    });

    const result = await searchStockPhotos("cafe", {
      fetch: fn as unknown as typeof fetch,
      keys: { unsplash: "u-key", pexels: "p-key" },
    });

    assert.ok(result.length <= 6);
    assert.equal(result.length, 4); // 2 unsplash + 2 pexels in the fixtures
    for (const photo of result) {
      assert.equal(typeof photo.url, "string");
      assert.equal(typeof photo.thumbUrl, "string");
      assert.equal(typeof photo.alt, "string");
      assert.equal(typeof photo.credit, "string");
      assert.ok(photo.source === "unsplash" || photo.source === "pexels");
    }

    // Interleaved for variety: first two results should be one from each source.
    assert.equal(result[0]!.source, "unsplash");
    assert.equal(result[1]!.source, "pexels");

    // Field mapping sanity.
    const first = result.find((p) => p.source === "unsplash");
    assert.equal(first?.url, "https://images.unsplash.com/a-regular.jpg");
    assert.equal(first?.thumbUrl, "https://images.unsplash.com/a-small.jpg");
    assert.equal(first?.alt, "a cozy cafe");
    assert.equal(first?.credit, "Ada Lovelace");

    const pexel = result.find((p) => p.source === "pexels");
    assert.equal(pexel?.url, "https://images.pexels.com/x-large.jpg");
    assert.equal(pexel?.thumbUrl, "https://images.pexels.com/x-medium.jpg");
    assert.equal(pexel?.alt, "a modern office");
    assert.equal(pexel?.credit, "Margaret Hamilton");

    // Auth headers formed correctly.
    const unsplashCall = calls.find((c) => c.url.includes("unsplash.com"));
    const pexelsCall = calls.find((c) => c.url.includes("pexels.com"));
    const unsplashAuth = new Headers(unsplashCall?.init?.headers).get("Authorization");
    const pexelsAuth = new Headers(pexelsCall?.init?.headers).get("Authorization");
    assert.equal(unsplashAuth, "Client-ID u-key");
    assert.equal(pexelsAuth, "p-key");
  });

  test("caps total results at 6 even when providers return more", async () => {
    const manyUnsplash = {
      results: Array.from({ length: 4 }, (_, i) => ({
        urls: { regular: `https://images.unsplash.com/${i}-regular.jpg`, small: `https://images.unsplash.com/${i}-small.jpg` },
        alt_description: `photo ${i}`,
        user: { name: `User ${i}` },
      })),
    };
    const manyPexels = {
      photos: Array.from({ length: 4 }, (_, i) => ({
        src: { large: `https://images.pexels.com/${i}-large.jpg`, medium: `https://images.pexels.com/${i}-medium.jpg` },
        alt: `photo ${i}`,
        photographer: `Shooter ${i}`,
      })),
    };
    const { fn } = fakeFetch((url) => {
      if (url.includes("unsplash.com")) return { status: 200, body: manyUnsplash };
      if (url.includes("pexels.com")) return { status: 200, body: manyPexels };
      throw new Error(`unexpected url ${url}`);
    });

    const result = await searchStockPhotos("office", {
      fetch: fn as unknown as typeof fetch,
      keys: { unsplash: "u-key", pexels: "p-key" },
    });

    assert.equal(result.length, 6);
  });
});

describe("searchStockPhotos — partial provider failure", () => {
  test("Unsplash 500s → Pexels results still returned", async () => {
    const { fn } = fakeFetch((url) => {
      if (url.includes("unsplash.com")) return { status: 500, body: { error: "boom" } };
      if (url.includes("pexels.com")) return { status: 200, body: PEXELS_OK };
      throw new Error(`unexpected url ${url}`);
    });

    const result = await searchStockPhotos("cafe", {
      fetch: fn as unknown as typeof fetch,
      keys: { unsplash: "u-key", pexels: "p-key" },
    });

    assert.equal(result.length, 2);
    assert.ok(result.every((p) => p.source === "pexels"));
  });

  test("Pexels throws (network error) → Unsplash results still returned", async () => {
    const fn = async (input: string | URL) => {
      const url = String(input);
      if (url.includes("pexels.com")) throw new Error("network down");
      if (url.includes("unsplash.com")) {
        return {
          ok: true,
          status: 200,
          json: async () => UNSPLASH_OK,
        } as Response;
      }
      throw new Error(`unexpected url ${url}`);
    };

    const result = await searchStockPhotos("cafe", {
      fetch: fn as unknown as typeof fetch,
      keys: { unsplash: "u-key", pexels: "p-key" },
    });

    assert.equal(result.length, 2);
    assert.ok(result.every((p) => p.source === "unsplash"));
  });

  test("both keys absent → [] without calling fetch", async () => {
    let called = false;
    const fn = async () => {
      called = true;
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    };

    const result = await searchStockPhotos("cafe", {
      fetch: fn as unknown as typeof fetch,
      keys: {},
    });

    assert.deepEqual(result, []);
    assert.equal(called, false);
  });

  test("a provider returns an empty result set → handled gracefully", async () => {
    const { fn } = fakeFetch((url) => {
      if (url.includes("unsplash.com")) return { status: 200, body: { results: [] } };
      if (url.includes("pexels.com")) return { status: 200, body: PEXELS_OK };
      throw new Error(`unexpected url ${url}`);
    });

    const result = await searchStockPhotos("cafe", {
      fetch: fn as unknown as typeof fetch,
      keys: { unsplash: "u-key", pexels: "p-key" },
    });

    assert.equal(result.length, 2);
    assert.ok(result.every((p) => p.source === "pexels"));
  });

  test("never throws even when both providers fail", async () => {
    const fn = async () => {
      throw new Error("dns fail");
    };
    const result = await searchStockPhotos("cafe", {
      fetch: fn as unknown as typeof fetch,
      keys: { unsplash: "u-key", pexels: "p-key" },
    });
    assert.deepEqual(result, []);
  });
});
