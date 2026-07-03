// sf_ref cookie capture — virality pack Task 5. Pure logic only (no Next.js
// request/response objects — see ref-cookie.ts's header for why the actual
// cookie mutation happens in proxy.ts, not here).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  resolveRefCookieValue,
  readRefCookieFromHeader,
  REF_COOKIE_NAME,
  REF_COOKIE_MAX_AGE_SECONDS,
  REF_COOKIE_OPTIONS,
} from "../../../src/lib/growth/ref-cookie";

describe("resolveRefCookieValue — capture decision", () => {
  test("absent ref (undefined/null) → null (nothing to capture)", () => {
    assert.equal(resolveRefCookieValue(undefined, null), null);
    assert.equal(resolveRefCookieValue(null, null), null);
  });

  test("empty / whitespace-only ref → null", () => {
    assert.equal(resolveRefCookieValue("", null), null);
    assert.equal(resolveRefCookieValue("   ", null), null);
  });

  test("an array ref value (duplicated ?ref=a&ref=b) → null, never throws", () => {
    assert.equal(resolveRefCookieValue(["a", "b"] as unknown as string, null), null);
  });

  test("a fresh ref with no existing cookie → the trimmed value", () => {
    assert.equal(resolveRefCookieValue("org_referrer_1", null), "org_referrer_1");
    assert.equal(resolveRefCookieValue("  org_referrer_1  ", null), "org_referrer_1");
    assert.equal(resolveRefCookieValue("org_referrer_1", undefined), "org_referrer_1");
  });

  test("a ref identical to the current cookie → null (no-op, don't reset the 90-day expiry)", () => {
    assert.equal(resolveRefCookieValue("org_referrer_1", "org_referrer_1"), null);
    // Whitespace-insensitive comparison — a re-visit with the same id should
    // still no-op even if the cookie value had incidental whitespace.
    assert.equal(resolveRefCookieValue("org_referrer_1", "  org_referrer_1  "), null);
  });

  test("a DIFFERENT ref than the current cookie → overwrites with the new value", () => {
    assert.equal(resolveRefCookieValue("org_referrer_2", "org_referrer_1"), "org_referrer_2");
  });
});

describe("readRefCookieFromHeader — extracting sf_ref from a raw Cookie header", () => {
  test("absent header → null", () => {
    assert.equal(readRefCookieFromHeader(null), null);
    assert.equal(readRefCookieFromHeader(undefined), null);
    assert.equal(readRefCookieFromHeader(""), null);
  });

  test("header present but no sf_ref cookie → null", () => {
    assert.equal(readRefCookieFromHeader("other_cookie=abc; another=def"), null);
  });

  test("sf_ref is the only cookie", () => {
    assert.equal(readRefCookieFromHeader("sf_ref=org_referrer_1"), "org_referrer_1");
  });

  test("sf_ref is one of several cookies, in any position", () => {
    assert.equal(
      readRefCookieFromHeader("a=1; sf_ref=org_referrer_1; b=2"),
      "org_referrer_1",
    );
    assert.equal(readRefCookieFromHeader("sf_ref=org_referrer_1; b=2"), "org_referrer_1");
    assert.equal(readRefCookieFromHeader("a=1; sf_ref=org_referrer_1"), "org_referrer_1");
  });

  test("URI-decodes the cookie value", () => {
    assert.equal(
      readRefCookieFromHeader(`sf_ref=${encodeURIComponent("org with spaces")}`),
      "org with spaces",
    );
  });

  test("a cookie NAMED sf_ref_other is not mistaken for sf_ref", () => {
    assert.equal(readRefCookieFromHeader("sf_ref_other=nope"), null);
  });

  test("an empty sf_ref value → null", () => {
    assert.equal(readRefCookieFromHeader("sf_ref=; b=2"), null);
  });
});

describe("cookie constants — the exact shape every call site must agree on", () => {
  test("REF_COOKIE_NAME is sf_ref", () => {
    assert.equal(REF_COOKIE_NAME, "sf_ref");
  });

  test("REF_COOKIE_MAX_AGE_SECONDS is 90 days", () => {
    assert.equal(REF_COOKIE_MAX_AGE_SECONDS, 60 * 60 * 24 * 90);
  });

  test("REF_COOKIE_OPTIONS is httpOnly + secure + sameSite=lax + path=/ + the 90-day maxAge", () => {
    assert.equal(REF_COOKIE_OPTIONS.httpOnly, true);
    assert.equal(REF_COOKIE_OPTIONS.secure, true);
    assert.equal(REF_COOKIE_OPTIONS.sameSite, "lax");
    assert.equal(REF_COOKIE_OPTIONS.path, "/");
    assert.equal(REF_COOKIE_OPTIONS.maxAge, REF_COOKIE_MAX_AGE_SECONDS);
  });
});
