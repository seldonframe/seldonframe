// Unit test for the public listing buy-box auth URL builders. Pure string math
// — no Next, no cookies — so the server page + client island can rely on a
// logged-out buyer being sent to the APP origin's /login with a callbackUrl back
// to THIS listing (so post-login the Install action runs where the host-only
// session cookie lives).
//
// Run:
//   node --import tsx --test tests/unit/marketplace/buy-box-auth.spec.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  resolveAppOrigin,
  buildListingSignInUrl,
} from "../../../src/lib/marketplace/buy-box-auth";

describe("resolveAppOrigin", () => {
  test("uses NEXT_PUBLIC_APP_URL when set (trailing slash stripped)", () => {
    assert.equal(resolveAppOrigin("https://app.seldonframe.com/"), "https://app.seldonframe.com");
    assert.equal(resolveAppOrigin("https://staging.app.seldonframe.com"), "https://staging.app.seldonframe.com");
  });

  test("falls back to the production app host when unset/blank", () => {
    assert.equal(resolveAppOrigin(undefined), "https://app.seldonframe.com");
    assert.equal(resolveAppOrigin(null), "https://app.seldonframe.com");
    assert.equal(resolveAppOrigin("   "), "https://app.seldonframe.com");
  });
});

describe("buildListingSignInUrl", () => {
  test("targets the APP origin /login with a callbackUrl back to the listing on the app origin", () => {
    const url = buildListingSignInUrl("ai-phone-receptionist", "https://app.seldonframe.com");
    // Must point at the app origin's sign-in (where the session cookie lives) —
    // never at www (host-only cookie isn't sent there).
    assert.ok(
      url.startsWith("https://app.seldonframe.com/login?callbackUrl="),
      `expected app-origin /login, got: ${url}`,
    );
    // The callbackUrl is the absolute app-origin listing URL, encoded.
    const cb = new URL(url).searchParams.get("callbackUrl");
    assert.equal(cb, "https://app.seldonframe.com/marketplace/ai-phone-receptionist");
  });

  test("encodes a slug safely and never produces a www target", () => {
    const url = buildListingSignInUrl("weird slug/../x", "https://app.seldonframe.com");
    assert.ok(!url.includes("www.seldonframe.com"), "must not target www");
    const cb = new URL(url).searchParams.get("callbackUrl");
    // slug is encodeURIComponent'd inside the path
    assert.equal(cb, `https://app.seldonframe.com/marketplace/${encodeURIComponent("weird slug/../x")}`);
  });

  test("an empty slug falls back to the marketplace index callback (still app origin)", () => {
    const url = buildListingSignInUrl("", "https://app.seldonframe.com");
    const cb = new URL(url).searchParams.get("callbackUrl");
    assert.equal(cb, "https://app.seldonframe.com/marketplace");
  });

  test("respects a custom (e.g. staging) app origin and strips a trailing slash", () => {
    const url = buildListingSignInUrl("speed-to-lead", "https://staging.app.seldonframe.com/");
    assert.ok(url.startsWith("https://staging.app.seldonframe.com/login?callbackUrl="));
    const cb = new URL(url).searchParams.get("callbackUrl");
    assert.equal(cb, "https://staging.app.seldonframe.com/marketplace/speed-to-lead");
  });
});
