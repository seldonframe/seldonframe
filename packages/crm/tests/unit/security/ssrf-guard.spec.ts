// Security — SSRF egress guard (FIX 1 + 2).
//
// The pure parts of `src/lib/security/ssrf-guard.ts` are TDD'd here with
// NO real DNS: `isBlockedIp` / `isAllowedUrlShape` are synchronous and
// table-driven, and `assertPublicHttpUrl` takes a dependency-injected
// resolver so we can simulate a hostname resolving to a private/metadata
// IP (the SSRF rebind/exfil case) without touching the network.
//
// To run:
//   cd packages/crm
//   node_modules/.bin/tsx --test tests/unit/security/ssrf-guard.spec.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  isBlockedIp,
  isAllowedUrlShape,
  assertPublicHttpUrl,
  SsrfBlockedError,
} from "../../../src/lib/security/ssrf-guard";

// ── isBlockedIp — IPv4 ────────────────────────────────────────────────────────

describe("isBlockedIp — IPv4 private / loopback / link-local / metadata", () => {
  const blocked = [
    "127.0.0.1", // loopback
    "127.1.2.3", // loopback /8
    "0.0.0.0", // unspecified
    "10.0.0.1", // private /8
    "10.255.255.255",
    "172.16.0.1", // private /12
    "172.31.255.255",
    "192.168.0.1", // private /16
    "192.168.1.100",
    "169.254.0.1", // link-local /16
    "169.254.169.254", // cloud metadata
    "100.64.0.1", // carrier-grade NAT (shared)
    "192.0.0.1", // IETF protocol assignments
  ];
  for (const ip of blocked) {
    test(`${ip} → blocked`, () => {
      assert.equal(isBlockedIp(ip), true, `${ip} should be blocked`);
    });
  }
});

describe("isBlockedIp — IPv4 public → allowed", () => {
  const allowed = [
    "8.8.8.8",
    "1.1.1.1",
    "172.15.255.255", // just outside 172.16/12
    "172.32.0.1", // just outside 172.16/12
    "11.0.0.1", // just outside 10/8
    "192.167.255.255", // just outside 192.168/16
    "169.253.255.255", // just outside 169.254/16
    "93.184.216.34", // example.com
  ];
  for (const ip of allowed) {
    test(`${ip} → allowed`, () => {
      assert.equal(isBlockedIp(ip), false, `${ip} should be allowed`);
    });
  }
});

// ── isBlockedIp — IPv6 ────────────────────────────────────────────────────────

describe("isBlockedIp — IPv6 private / loopback / link-local", () => {
  const blocked = [
    "::1", // loopback
    "::", // unspecified
    "::ffff:127.0.0.1", // IPv4-mapped loopback
    "::ffff:169.254.169.254", // IPv4-mapped metadata
    "::ffff:10.0.0.1", // IPv4-mapped private
    "fc00::1", // unique-local fc00::/7
    "fd12:3456:789a::1", // unique-local
    "fe80::1", // link-local fe80::/10
    "fe80::abcd:1234",
  ];
  for (const ip of blocked) {
    test(`${ip} → blocked`, () => {
      assert.equal(isBlockedIp(ip), true, `${ip} should be blocked`);
    });
  }
});

describe("isBlockedIp — IPv6 public → allowed", () => {
  const allowed = [
    "2001:4860:4860::8888", // Google public DNS
    "2606:4700:4700::1111", // Cloudflare
    "2a00:1450:4001:81b::200e", // a public address
  ];
  for (const ip of allowed) {
    test(`${ip} → allowed`, () => {
      assert.equal(isBlockedIp(ip), false, `${ip} should be allowed`);
    });
  }
});

// ── isAllowedUrlShape ─────────────────────────────────────────────────────────

describe("isAllowedUrlShape — protocol / credentials / port / literal-IP hostnames", () => {
  test("plain https public host → allowed", () => {
    assert.equal(isAllowedUrlShape(new URL("https://example.com/")).ok, true);
  });
  test("plain http public host → allowed", () => {
    assert.equal(isAllowedUrlShape(new URL("http://example.com/")).ok, true);
  });
  test("https on :8443 → allowed (common alt-https)", () => {
    assert.equal(isAllowedUrlShape(new URL("https://example.com:8443/")).ok, true);
  });
  test("ftp:// → rejected (protocol)", () => {
    assert.equal(isAllowedUrlShape(new URL("ftp://example.com/")).ok, false);
  });
  test("file:// → rejected (protocol)", () => {
    assert.equal(isAllowedUrlShape(new URL("file:///etc/passwd")).ok, false);
  });
  test("credentials in URL → rejected", () => {
    assert.equal(isAllowedUrlShape(new URL("https://user:pass@example.com/")).ok, false);
  });
  test("odd port (:22 ssh) → rejected", () => {
    assert.equal(isAllowedUrlShape(new URL("https://example.com:22/")).ok, false);
  });
  test("hostname is literal localhost → rejected", () => {
    assert.equal(isAllowedUrlShape(new URL("http://localhost/")).ok, false);
  });
  test("hostname is metadata.google.internal → rejected", () => {
    assert.equal(isAllowedUrlShape(new URL("http://metadata.google.internal/")).ok, false);
  });
  test("hostname is a literal private IP → rejected at shape stage", () => {
    assert.equal(isAllowedUrlShape(new URL("http://169.254.169.254/latest/meta-data/")).ok, false);
    assert.equal(isAllowedUrlShape(new URL("http://127.0.0.1:3000/")).ok, false);
    assert.equal(isAllowedUrlShape(new URL("http://[::1]/")).ok, false);
  });
  test("hostname is a public literal IP → allowed at shape stage", () => {
    assert.equal(isAllowedUrlShape(new URL("http://8.8.8.8/")).ok, true);
  });
});

// ── assertPublicHttpUrl — DI'd resolver ───────────────────────────────────────

/** A fake DNS resolver: maps host → fixed addresses. */
function fakeResolver(map: Record<string, string[]>) {
  return async (host: string) => {
    const addrs = map[host];
    if (!addrs) throw new Error(`ENOTFOUND ${host}`);
    return addrs.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
  };
}

describe("assertPublicHttpUrl — resolve-and-reject", () => {
  test("public host resolving to a public IP → returns parsed URL + pinned ip", async () => {
    const resolve = fakeResolver({ "example.com": ["93.184.216.34"] });
    const result = await assertPublicHttpUrl("https://example.com/path", { resolve });
    assert.equal(result.url.hostname, "example.com");
    assert.equal(result.ip, "93.184.216.34");
  });

  test("host resolving to 169.254.169.254 (metadata) → throws SsrfBlockedError", async () => {
    const resolve = fakeResolver({ "evil.example.com": ["169.254.169.254"] });
    await assert.rejects(
      () => assertPublicHttpUrl("https://evil.example.com/", { resolve }),
      (err: unknown) => err instanceof SsrfBlockedError,
    );
  });

  test("host resolving to 127.0.0.1 → throws", async () => {
    const resolve = fakeResolver({ "rebind.example.com": ["127.0.0.1"] });
    await assert.rejects(
      () => assertPublicHttpUrl("https://rebind.example.com/", { resolve }),
      (err: unknown) => err instanceof SsrfBlockedError,
    );
  });

  test("host resolving to 10.x private → throws", async () => {
    const resolve = fakeResolver({ "internal.example.com": ["10.1.2.3"] });
    await assert.rejects(
      () => assertPublicHttpUrl("https://internal.example.com/", { resolve }),
      (err: unknown) => err instanceof SsrfBlockedError,
    );
  });

  test("host with ONE public + ONE private address → throws (any-blocked)", async () => {
    // DNS-rebinding defense: reject if ANY resolved address is private.
    const resolve = fakeResolver({ "mixed.example.com": ["93.184.216.34", "127.0.0.1"] });
    await assert.rejects(
      () => assertPublicHttpUrl("https://mixed.example.com/", { resolve }),
      (err: unknown) => err instanceof SsrfBlockedError,
    );
  });

  test("non-http protocol → throws WITHOUT calling the resolver", async () => {
    let called = false;
    const resolve = async (host: string) => {
      called = true;
      return [{ address: "93.184.216.34", family: 4 as const }];
    };
    await assert.rejects(
      () => assertPublicHttpUrl("ftp://example.com/", { resolve }),
      (err: unknown) => err instanceof SsrfBlockedError,
    );
    assert.equal(called, false, "resolver must not run for a bad-shape URL");
  });

  test("literal localhost → throws WITHOUT calling the resolver", async () => {
    let called = false;
    const resolve = async () => {
      called = true;
      return [{ address: "127.0.0.1", family: 4 as const }];
    };
    await assert.rejects(
      () => assertPublicHttpUrl("http://localhost:8080/", { resolve }),
      (err: unknown) => err instanceof SsrfBlockedError,
    );
    assert.equal(called, false);
  });

  test("credentials in URL → throws", async () => {
    const resolve = fakeResolver({ "example.com": ["93.184.216.34"] });
    await assert.rejects(
      () => assertPublicHttpUrl("https://user:pw@example.com/", { resolve }),
      (err: unknown) => err instanceof SsrfBlockedError,
    );
  });

  test("garbage / unparseable URL → throws SsrfBlockedError (not a raw TypeError)", async () => {
    const resolve = fakeResolver({});
    await assert.rejects(
      () => assertPublicHttpUrl("not a url", { resolve }),
      (err: unknown) => err instanceof SsrfBlockedError,
    );
  });

  test("DNS resolution failure → throws SsrfBlockedError (fail-closed)", async () => {
    const resolve = fakeResolver({}); // nothing resolves
    await assert.rejects(
      () => assertPublicHttpUrl("https://nonexistent.example.com/", { resolve }),
      (err: unknown) => err instanceof SsrfBlockedError,
    );
  });
});
