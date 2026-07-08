import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isWebUngatedBuildOn,
  isAutopayConsoleOn,
  WEB_BUILD_RATE_LIMIT,
  WEB_BUILD_RATE_WINDOW_MS,
  WEB_UNGATED_ORIGIN,
} from "@/lib/web-build/policy";
import {
  normalizeUrlForExtractionCache,
  urlExtractionCacheKey,
} from "@/lib/web-build/url-cache-key";

test("flag: on only for exact '1' (trimmed)", () => {
  assert.equal(isWebUngatedBuildOn({ SF_WEB_UNGATED_BUILD: "1" }), true);
  assert.equal(isWebUngatedBuildOn({ SF_WEB_UNGATED_BUILD: " 1 " }), true);
  assert.equal(isWebUngatedBuildOn({ SF_WEB_UNGATED_BUILD: "true" }), false);
  assert.equal(isWebUngatedBuildOn({ SF_WEB_UNGATED_BUILD: "0" }), false);
  assert.equal(isWebUngatedBuildOn({}), false);
});

test("flag: SF_AUTOPAY_CONSOLE — on only for exact '1' (trimmed); everything else keeps the console dark", () => {
  assert.equal(isAutopayConsoleOn({ SF_AUTOPAY_CONSOLE: "1" }), true);
  assert.equal(isAutopayConsoleOn({ SF_AUTOPAY_CONSOLE: " 1 " }), true);
  assert.equal(isAutopayConsoleOn({ SF_AUTOPAY_CONSOLE: "true" }), false);
  assert.equal(isAutopayConsoleOn({ SF_AUTOPAY_CONSOLE: "0" }), false);
  assert.equal(isAutopayConsoleOn({}), false);
});

test("constants", () => {
  assert.equal(WEB_BUILD_RATE_LIMIT, 3);
  assert.equal(WEB_BUILD_RATE_WINDOW_MS, 24 * 60 * 60 * 1000);
  assert.equal(WEB_UNGATED_ORIGIN, "web_ungated");
});

test("normalize: lowercases host, strips scheme/query/hash/trailing slash, keeps path", () => {
  assert.equal(
    normalizeUrlForExtractionCache("HTTPS://WWW.Example.com/Services/?utm=x#top"),
    "www.example.com/Services"
  );
  assert.equal(normalizeUrlForExtractionCache("http://example.com/"), "example.com");
  assert.equal(normalizeUrlForExtractionCache("example.com/about"), "example.com/about");
  assert.equal(normalizeUrlForExtractionCache("not a url %%"), null);
});

test("cache key: sha256 hex, stable, null for invalid", () => {
  const a = urlExtractionCacheKey("https://example.com/");
  const b = urlExtractionCacheKey("EXAMPLE.com");
  assert.ok(a && /^[0-9a-f]{64}$/.test(a));
  assert.equal(a, b);
  assert.equal(urlExtractionCacheKey("%%"), null);
});

test("resolveWebBuildRateLimit: env override with strict fallback", async () => {
  const { resolveWebBuildRateLimit, WEB_BUILD_RATE_LIMIT } = await import("@/lib/web-build/policy");
  assert.equal(resolveWebBuildRateLimit({}), WEB_BUILD_RATE_LIMIT);
  assert.equal(resolveWebBuildRateLimit({ SF_WEB_BUILD_RATE_LIMIT: "25" }), 25);
  assert.equal(resolveWebBuildRateLimit({ SF_WEB_BUILD_RATE_LIMIT: "0" }), WEB_BUILD_RATE_LIMIT);
  assert.equal(resolveWebBuildRateLimit({ SF_WEB_BUILD_RATE_LIMIT: "-5" }), WEB_BUILD_RATE_LIMIT);
  assert.equal(resolveWebBuildRateLimit({ SF_WEB_BUILD_RATE_LIMIT: "abc" }), WEB_BUILD_RATE_LIMIT);
  assert.equal(resolveWebBuildRateLimit({ SF_WEB_BUILD_RATE_LIMIT: "1e9" }), WEB_BUILD_RATE_LIMIT);
});
