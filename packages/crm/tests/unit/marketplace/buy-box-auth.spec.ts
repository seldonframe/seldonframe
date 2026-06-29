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
  shouldShowFinishCheckout,
} from "../../../src/lib/marketplace/buy-box-auth";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

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
    // The callbackUrl is the absolute app-origin listing URL with ?install=1
    // (the finish-checkout return marker), encoded.
    const cb = new URL(url).searchParams.get("callbackUrl");
    assert.equal(cb, "https://app.seldonframe.com/marketplace/ai-phone-receptionist?install=1");
  });

  test("encodes a slug safely and never produces a www target", () => {
    const url = buildListingSignInUrl("weird slug/../x", "https://app.seldonframe.com");
    assert.ok(!url.includes("www.seldonframe.com"), "must not target www");
    const cb = new URL(url).searchParams.get("callbackUrl");
    // slug is encodeURIComponent'd inside the path; ?install=1 marks the return
    assert.equal(cb, `https://app.seldonframe.com/marketplace/${encodeURIComponent("weird slug/../x")}?install=1`);
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
    assert.equal(cb, "https://staging.app.seldonframe.com/marketplace/speed-to-lead?install=1");
  });
});

// 2026-06-29 — The post-signup "Finish checkout →" state. A buyer who returned
// with ?install=1 AND is now authenticated gets a prominent nudge to complete
// the purchase they started before signing up — without the charge ever firing
// on mount.
describe("shouldShowFinishCheckout", () => {
  const base = { installIntent: true, isAuthenticated: true, isSeed: false, justPurchased: false };

  test("shows when authenticated + ?install=1 on a real (non-seed) listing", () => {
    assert.equal(shouldShowFinishCheckout(base), true);
  });

  test("hidden without the ?install=1 intent (a normal listing visit)", () => {
    assert.equal(shouldShowFinishCheckout({ ...base, installIntent: false }), false);
  });

  test("hidden when not authenticated (they get the sign-in CTA instead)", () => {
    // The buy box still sends a logged-out visitor to sign-in; a finish-checkout
    // nudge would be wrong (there's no session to install into).
    assert.equal(shouldShowFinishCheckout({ ...base, isAuthenticated: false }), false);
  });

  test("hidden on a seed/demo listing (no real purchase to finish)", () => {
    assert.equal(shouldShowFinishCheckout({ ...base, isSeed: true }), false);
  });

  test("hidden once ?purchased=true takes over (success state wins)", () => {
    assert.equal(shouldShowFinishCheckout({ ...base, justPurchased: true }), false);
  });
});

// Guardrail: the buy intent must be "finished" by an explicit click, NEVER auto-
// fired on mount. The listing island must not contain a useEffect that calls the
// install/checkout action — that would risk a double charge for a returning
// buyer. We assert this structurally on the component source so a future refactor
// that wires an auto-install effect fails this test loudly.
describe("buy box never auto-fires the charge on mount (?install=1)", () => {
  test("listing-actions-client has no effect that calls installAgentListingAction", () => {
    const src = readFileSync(
      fileURLToPath(new URL("../../../src/components/marketplace/listing-actions-client.tsx", import.meta.url)),
      "utf8",
    );
    // The action is only ever invoked inside the onInstall click handler. There
    // must be no useEffect whose body references installAgentListingAction.
    const effectBodies = src.match(/useEffect\(\s*\(\)\s*=>\s*\{[\s\S]*?\}\s*,\s*\[[\s\S]*?\]\s*\)/g) ?? [];
    for (const body of effectBodies) {
      assert.ok(
        !/installAgentListingAction|onInstall\s*\(/.test(body),
        "no mount/effect may call the install action — the charge must be click-driven",
      );
    }
  });
});
