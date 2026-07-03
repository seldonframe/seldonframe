// Security — redirect-follow SSRF guard (`fetchPublicUrlSafe`).
//
// `assertPublicHttpUrl` only vets the URL it's handed; a plain `fetch()`
// follows redirects by default, so a public page that 302's to
// `http://169.254.169.254/` (or any other internal target) sails past the
// guard on the SECOND hop. `fetchPublicUrlSafe` closes that gap by
// re-vetting every redirect hop with `redirect: "manual"`.
//
// These specs stub `globalThis.fetch` (no real network) to simulate
// redirect chains and assert the guard fires (or doesn't) at the right hop.
//
// To run:
//   cd packages/crm
//   node --import tsx --test tests/unit/security/ssrf-guard-redirect.spec.ts

import { describe, test, afterEach } from "node:test";
import assert from "node:assert/strict";

import { fetchPublicUrlSafe, SsrfBlockedError } from "../../../src/lib/security/ssrf-guard";

// All the `*.example.com` hostnames used below are placeholders that don't
// actually resolve in DNS — inject a fake resolver (same DI seam
// `assertPublicHttpUrl` already exposes) so every hop's re-vet resolves to a
// fixed public IP instead of hitting real DNS.
const PUBLIC_IP = "93.184.216.34";
const resolve = async (_host: string) => [{ address: PUBLIC_IP, family: 4 }];

type FakeResponseInit = { status: number; location?: string; body?: string };

function fakeResponse({ status, location, body = "" }: FakeResponseInit): Response {
  const headers = new Headers();
  if (location) headers.set("location", location);
  return new Response(body, { status, headers });
}

/** Installs a fetch stub that serves a scripted sequence of responses keyed
 *  by URL, and records every URL actually fetched (so we can prove a
 *  private-target hop's body was NEVER fetched). */
function stubFetch(script: Record<string, FakeResponseInit>) {
  const calls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push(url);
    const entry = script[url];
    if (!entry) {
      throw new Error(`stubFetch: no script entry for ${url}`);
    }
    return fakeResponse(entry);
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

describe("fetchPublicUrlSafe — redirect-follow SSRF guard", () => {
  let restore: (() => void) | null = null;

  afterEach(() => {
    if (restore) {
      restore();
      restore = null;
    }
  });

  test("302 → cloud metadata (169.254.169.254) is blocked after the first hop", async () => {
    const stub = stubFetch({
      "https://public.example.com/": { status: 302, location: "http://169.254.169.254/latest/meta-data/" },
    });
    restore = stub.restore;

    await assert.rejects(
      () => fetchPublicUrlSafe("https://public.example.com/", undefined, { resolve }),
      (err: unknown) => err instanceof SsrfBlockedError,
    );
    // The private target must never actually be fetched.
    assert.equal(stub.calls.includes("http://169.254.169.254/latest/meta-data/"), false);
    assert.deepEqual(stub.calls, ["https://public.example.com/"]);
  });

  test("302 → private 10.x address is blocked after the first hop", async () => {
    const stub = stubFetch({
      "https://public.example.com/": { status: 302, location: "http://10.0.0.5/internal" },
    });
    restore = stub.restore;

    await assert.rejects(
      () => fetchPublicUrlSafe("https://public.example.com/", undefined, { resolve }),
      (err: unknown) => err instanceof SsrfBlockedError,
    );
    assert.equal(stub.calls.includes("http://10.0.0.5/internal"), false);
  });

  test("302 → IPv6 loopback (::1) is blocked after the first hop", async () => {
    const stub = stubFetch({
      "https://public.example.com/": { status: 302, location: "http://[::1]/admin" },
    });
    restore = stub.restore;

    await assert.rejects(
      () => fetchPublicUrlSafe("https://public.example.com/", undefined, { resolve }),
      (err: unknown) => err instanceof SsrfBlockedError,
    );
    assert.equal(stub.calls.includes("http://[::1]/admin"), false);
  });

  test("2-hop public → public → public chain succeeds and returns the final response", async () => {
    const stub = stubFetch({
      "https://a.example.com/": { status: 302, location: "https://b.example.com/" },
      "https://b.example.com/": { status: 301, location: "https://c.example.com/" },
      "https://c.example.com/": { status: 200, body: "hello" },
    });
    restore = stub.restore;

    const res = await fetchPublicUrlSafe("https://a.example.com/", undefined, { resolve });
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "hello");
    assert.deepEqual(stub.calls, [
      "https://a.example.com/",
      "https://b.example.com/",
      "https://c.example.com/",
    ]);
  });

  test("more than 3 redirect hops throws (default cap)", async () => {
    const stub = stubFetch({
      "https://a.example.com/": { status: 302, location: "https://b.example.com/" },
      "https://b.example.com/": { status: 302, location: "https://c.example.com/" },
      "https://c.example.com/": { status: 302, location: "https://d.example.com/" },
      "https://d.example.com/": { status: 302, location: "https://e.example.com/" },
      "https://e.example.com/": { status: 200, body: "too far" },
    });
    restore = stub.restore;

    await assert.rejects(
      () => fetchPublicUrlSafe("https://a.example.com/", undefined, { resolve }),
      (err: unknown) => err instanceof SsrfBlockedError,
    );
    // Never reaches the 5th URL — capped at maxRedirects (default 3).
    assert.equal(stub.calls.includes("https://e.example.com/"), false);
  });

  test("same-host http→https 301 is allowed (legitimate upgrade redirect)", async () => {
    const stub = stubFetch({
      "http://upgrades.example.com/": { status: 301, location: "https://upgrades.example.com/" },
      "https://upgrades.example.com/": { status: 200, body: "secure" },
    });
    restore = stub.restore;

    const res = await fetchPublicUrlSafe("http://upgrades.example.com/", undefined, { resolve });
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "secure");
  });

  test("initial-URL guard still fires for a private initial url (no fetch at all)", async () => {
    const stub = stubFetch({});
    restore = stub.restore;

    await assert.rejects(
      () => fetchPublicUrlSafe("http://169.254.169.254/"),
      (err: unknown) => err instanceof SsrfBlockedError,
    );
    assert.deepEqual(stub.calls, []);
  });
});
