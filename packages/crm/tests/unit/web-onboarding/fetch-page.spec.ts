// packages/crm/tests/unit/web-onboarding/fetch-page.spec.ts
//
// Unit tests for the server-side HTTP fetch helper. All five tests use
// the `fetchImpl` injection seam — no network IO during test runs.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { fetchPage } from "../../../src/lib/web-onboarding/fetch-page";

function makeResponse(init: {
  status?: number;
  contentType?: string;
  body?: string;
  url?: string;
}): Response {
  return new Response(init.body ?? "", {
    status: init.status ?? 200,
    headers: { "content-type": init.contentType ?? "text/html; charset=utf-8" },
  });
}

describe("fetchPage", () => {
  test("returns ok with HTML body on a successful 200 text/html response", async () => {
    const html = "<html><body><h1>Hello</h1></body></html>";
    const fakeFetch: typeof fetch = async () => makeResponse({ body: html });
    const result = await fetchPage("https://acme.com", { fetchImpl: fakeFetch });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.html, html);
      assert.match(result.contentType, /text\/html/);
    }
  });

  test("returns timeout reason when the fetch aborts (caller-injected AbortError)", async () => {
    const fakeFetch: typeof fetch = async (_input, init) => {
      // Emulate an underlying fetch that respects the signal — when the
      // controller fires, throw AbortError just like Node's native fetch.
      return new Promise((_resolve, reject) => {
        const signal = (init as RequestInit | undefined)?.signal as AbortSignal | undefined;
        signal?.addEventListener("abort", () => {
          const err = new Error("The operation was aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    };
    const result = await fetchPage("https://slow.example", {
      fetchImpl: fakeFetch,
      timeoutMs: 10,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "timeout");
  });

  test("returns http_error_<status> on a non-2xx response", async () => {
    const fakeFetch: typeof fetch = async () => makeResponse({ status: 404, body: "not found" });
    const result = await fetchPage("https://acme.com/missing", { fetchImpl: fakeFetch });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "http_error_404");
  });

  test("returns non_html when content-type is application/pdf", async () => {
    const fakeFetch: typeof fetch = async () =>
      makeResponse({ contentType: "application/pdf", body: "%PDF-1.4" });
    const result = await fetchPage("https://acme.com/report.pdf", { fetchImpl: fakeFetch });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "non_html");
  });

  test("returns network_error on any other thrown error (DNS, TLS, connection reset)", async () => {
    const fakeFetch: typeof fetch = async () => {
      throw new TypeError("fetch failed");
    };
    const result = await fetchPage("https://nonexistent.invalid", { fetchImpl: fakeFetch });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "network_error");
  });
});
