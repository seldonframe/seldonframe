// Media sources T2 — safe external-URL resolver.
//
// SSRF FIRST: `resolveExternalMedia` must run every candidate URL through
// `assertPublicHttpUrl` before ever fetching it. Images that pass are
// re-hosted to Vercel Blob (never depend on a hotlink/expiring URL); videos
// are validated then returned as-is (re-hosting large video is costly).
//
// To run:
//   cd packages/crm
//   node --import tsx --test tests/unit/media/resolve-url.spec.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { resolveExternalMedia } from "../../../src/lib/media/resolve-url";
import { SsrfBlockedError } from "../../../src/lib/security/ssrf-guard";

function fakeAssertPublicHttpUrl(behavior: "allow" | "block") {
  let calls = 0;
  const fn = async (rawUrl: string) => {
    calls++;
    if (behavior === "block") throw new SsrfBlockedError();
    return { url: new URL(rawUrl), ip: "93.184.216.34" };
  };
  return { fn, callCount: () => calls };
}

function fakeFetch(status: number, headers: Record<string, string>, bodyBytes = new Uint8Array([1, 2, 3])) {
  const calls: string[] = [];
  const fn: typeof fetch = async (input) => {
    calls.push(String(input));
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers(headers),
      arrayBuffer: async () => bodyBytes.buffer,
    } as unknown as Response;
  };
  return { fn, calls };
}

describe("resolveExternalMedia — SSRF guard first", () => {
  test("private/loopback URL rejected as unsafe_url WITHOUT calling fetch", async () => {
    const assertGuard = fakeAssertPublicHttpUrl("block");
    let fetchCalled = false;
    const fetchImpl = async () => {
      fetchCalled = true;
      return {} as Response;
    };
    const putImpl = async () => {
      throw new Error("put should not be called");
    };

    const result = await resolveExternalMedia("http://127.0.0.1:6379/image.jpg", "image", {
      assertPublicHttpUrl: assertGuard.fn,
      fetch: fetchImpl,
      put: putImpl,
    });

    assert.deepEqual(result, { ok: false, error: "unsafe_url" });
    assert.equal(fetchCalled, false);
    assert.equal(assertGuard.callCount(), 1);
  });

  test("non-http(s) scheme rejected", async () => {
    const assertGuard = fakeAssertPublicHttpUrl("block");
    const result = await resolveExternalMedia("file:///etc/passwd", "image", {
      assertPublicHttpUrl: assertGuard.fn,
    });
    assert.deepEqual(result, { ok: false, error: "unsafe_url" });
  });
});

describe("resolveExternalMedia — image kind", () => {
  test("valid image URL is re-hosted to Blob", async () => {
    const assertGuard = fakeAssertPublicHttpUrl("allow");
    const { fn: fetchImpl } = fakeFetch(200, {
      "content-type": "image/jpeg",
      "content-length": "1024",
    });
    let putCalled = false;
    let putArgs: unknown[] = [];
    const putImpl = async (...args: unknown[]) => {
      putCalled = true;
      putArgs = args;
      return { url: "https://blob.vercel-storage.com/rehosted-abc123.jpg" };
    };

    const result = await resolveExternalMedia("https://example.com/photo.jpg", "image", {
      assertPublicHttpUrl: assertGuard.fn,
      fetch: fetchImpl,
      put: putImpl as unknown as (typeof import("@vercel/blob"))["put"],
    });

    assert.equal(putCalled, true);
    assert.ok(putArgs.length > 0);
    assert.deepEqual(result, {
      ok: true,
      url: "https://blob.vercel-storage.com/rehosted-abc123.jpg",
      contentType: "image/jpeg",
    });
  });

  test("wrong content-type for image kind is rejected", async () => {
    const assertGuard = fakeAssertPublicHttpUrl("allow");
    const { fn: fetchImpl } = fakeFetch(200, {
      "content-type": "application/pdf",
      "content-length": "1024",
    });
    let putCalled = false;
    const putImpl = async () => {
      putCalled = true;
      return { url: "should-not-happen" };
    };

    const result = await resolveExternalMedia("https://example.com/file.pdf", "image", {
      assertPublicHttpUrl: assertGuard.fn,
      fetch: fetchImpl,
      put: putImpl as unknown as (typeof import("@vercel/blob"))["put"],
    });

    assert.equal(result.ok, false);
    assert.equal(putCalled, false);
  });

  test("oversized image is rejected", async () => {
    const assertGuard = fakeAssertPublicHttpUrl("allow");
    const { fn: fetchImpl } = fakeFetch(200, {
      "content-type": "image/png",
      "content-length": String(10 * 1024 * 1024), // 10MB > 5MB cap
    });
    let putCalled = false;
    const putImpl = async () => {
      putCalled = true;
      return { url: "should-not-happen" };
    };

    const result = await resolveExternalMedia("https://example.com/huge.png", "image", {
      assertPublicHttpUrl: assertGuard.fn,
      fetch: fetchImpl,
      put: putImpl as unknown as (typeof import("@vercel/blob"))["put"],
    });

    assert.equal(result.ok, false);
    assert.equal(putCalled, false);
  });
});

describe("resolveExternalMedia — redirect handling (SSRF-via-redirect)", () => {
  test("302 to a private/metadata host is blocked WITHOUT fetching the private target", async () => {
    // Initial URL passes the guard; the guard is asked again for the
    // redirect target and must reject it — and the fetch for that private
    // target must never happen.
    const PRIVATE_TARGET = "http://169.254.169.254/latest/meta-data/iam/security-credentials/";
    let assertCalls = 0;
    const assertPublicHttpUrl = async (rawUrl: string) => {
      assertCalls++;
      if (rawUrl === PRIVATE_TARGET) {
        throw new SsrfBlockedError();
      }
      return { url: new URL(rawUrl), ip: "93.184.216.34" };
    };

    const fetchCalls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const target = String(input);
      fetchCalls.push(target);
      if (target === PRIVATE_TARGET) {
        // Should never be reached — but if the bug regresses, prove it by
        // returning a "successful" fetch so the test would otherwise pass
        // straight through the vulnerable path.
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "image/jpeg", "content-length": "1024" }),
          arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
        } as unknown as Response;
      }
      return {
        ok: false,
        status: 302,
        headers: new Headers({ location: PRIVATE_TARGET }),
        arrayBuffer: async () => new Uint8Array().buffer,
      } as unknown as Response;
    };

    const result = await resolveExternalMedia("https://example.com/redirector", "image", {
      assertPublicHttpUrl,
      fetch: fetchImpl,
    });

    assert.deepEqual(result, { ok: false, error: "unsafe_url" });
    // The initial URL was vetted, the redirect target was vetted (and
    // rejected) — but the private target was NEVER fetched.
    assert.equal(assertCalls, 2);
    assert.equal(fetchCalls.includes(PRIVATE_TARGET), false);
    assert.deepEqual(fetchCalls, ["https://example.com/redirector"]);
  });

  test("302 to a VALID public image URL is followed, re-validated, and re-hosted", async () => {
    const FINAL_URL = "https://cdn.example.com/photo-final.jpg";
    const assertedUrls: string[] = [];
    const assertPublicHttpUrl = async (rawUrl: string) => {
      assertedUrls.push(rawUrl);
      return { url: new URL(rawUrl), ip: "93.184.216.34" };
    };

    const fetchCalls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const target = String(input);
      fetchCalls.push(target);
      if (target === "https://example.com/redirector") {
        return {
          ok: false,
          status: 302,
          headers: new Headers({ location: FINAL_URL }),
          arrayBuffer: async () => new Uint8Array().buffer,
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "image/jpeg", "content-length": "1024" }),
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      } as unknown as Response;
    };

    let putCalled = false;
    const putImpl = async () => {
      putCalled = true;
      return { url: "https://blob.vercel-storage.com/rehosted-final.jpg" };
    };

    const result = await resolveExternalMedia("https://example.com/redirector", "image", {
      assertPublicHttpUrl,
      fetch: fetchImpl,
      put: putImpl as unknown as (typeof import("@vercel/blob"))["put"],
    });

    assert.equal(putCalled, true);
    assert.deepEqual(assertedUrls, ["https://example.com/redirector", FINAL_URL]);
    assert.deepEqual(fetchCalls, ["https://example.com/redirector", FINAL_URL]);
    assert.deepEqual(result, {
      ok: true,
      url: "https://blob.vercel-storage.com/rehosted-final.jpg",
      contentType: "image/jpeg",
    });
  });

  test("redirect chain longer than MAX_REDIRECTS is rejected as too_many_redirects", async () => {
    const assertPublicHttpUrl = async (rawUrl: string) => ({ url: new URL(rawUrl), ip: "93.184.216.34" });

    const fetchCalls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const target = String(input);
      fetchCalls.push(target);
      // Always redirect to the next hop, forever.
      const n = Number(target.match(/hop(\d+)/)?.[1] ?? "0");
      return {
        ok: false,
        status: 302,
        headers: new Headers({ location: `https://example.com/hop${n + 1}` }),
        arrayBuffer: async () => new Uint8Array().buffer,
      } as unknown as Response;
    };

    const result = await resolveExternalMedia("https://example.com/hop0", "image", {
      assertPublicHttpUrl,
      fetch: fetchImpl,
    });

    assert.deepEqual(result, { ok: false, error: "too_many_redirects" });
    // Never re-hosts, never loops unboundedly.
    assert.ok(fetchCalls.length <= 5);
  });
});

describe("resolveExternalMedia — video kind", () => {
  test("valid video URL is returned as-is (NOT re-hosted)", async () => {
    const assertGuard = fakeAssertPublicHttpUrl("allow");
    const { fn: fetchImpl } = fakeFetch(200, {
      "content-type": "video/mp4",
      "content-length": String(20 * 1024 * 1024), // 20MB, under video cap
    });
    let putCalled = false;
    const putImpl = async () => {
      putCalled = true;
      return { url: "should-not-happen" };
    };

    const result = await resolveExternalMedia("https://example.com/clip.mp4", "video", {
      assertPublicHttpUrl: assertGuard.fn,
      fetch: fetchImpl,
      put: putImpl as unknown as (typeof import("@vercel/blob"))["put"],
    });

    assert.equal(putCalled, false);
    assert.deepEqual(result, {
      ok: true,
      url: "https://example.com/clip.mp4",
      contentType: "video/mp4",
    });
  });

  test("wrong content-type for video kind is rejected", async () => {
    const assertGuard = fakeAssertPublicHttpUrl("allow");
    const { fn: fetchImpl } = fakeFetch(200, {
      "content-type": "image/jpeg",
      "content-length": "1024",
    });

    const result = await resolveExternalMedia("https://example.com/not-a-video.jpg", "video", {
      assertPublicHttpUrl: assertGuard.fn,
      fetch: fetchImpl,
    });

    assert.equal(result.ok, false);
  });

  test("oversized video is rejected", async () => {
    const assertGuard = fakeAssertPublicHttpUrl("allow");
    const { fn: fetchImpl } = fakeFetch(200, {
      "content-type": "video/webm",
      "content-length": String(80 * 1024 * 1024), // over the video cap
    });

    const result = await resolveExternalMedia("https://example.com/huge.webm", "video", {
      assertPublicHttpUrl: assertGuard.fn,
      fetch: fetchImpl,
    });

    assert.equal(result.ok, false);
  });
});
