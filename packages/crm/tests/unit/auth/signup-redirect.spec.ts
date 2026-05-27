// packages/crm/tests/unit/auth/signup-redirect.spec.ts
//
// 2026-05-22 — Coverage for the query-passthrough helpers used by the
// new card-at-signup flow. These functions decide what URL the visitor
// lands on after the magic link + card collection complete, so a
// regression here would silently drop the user's ?url= / ?biz= /
// ?intent= signal — the exact bug this change set is meant to fix.
//
// 2026-05-23 — Updated for the localStorage carrier switch. `biz` no
// longer travels through the URL chain (it lives in
// localStorage('sf-workspace-seed') instead), so the previous "biz +
// intent" assertions are dropped and replaced with assertions that
// `biz` is silently ignored AND that `intent=build` survives even
// without a `url` in the URL (the marketing hero in BIZ mode forwards
// `?intent=build` with no biz query param).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  buildSignupNextPath,
  buildSignupBillingRedirect,
  buildSignupConnectAiRedirect,
  sanitizeNextPath,
} from "../../../src/lib/auth/signup-redirect";

describe("buildSignupNextPath", () => {
  test("with url + intent=build produces /clients/new?url=...&intent=build", () => {
    const out = buildSignupNextPath({
      url: "https://example.com",
      intent: "build",
    });
    assert.equal(
      out,
      "/clients/new?url=https%3A%2F%2Fexample.com&intent=build",
    );
  });

  test("biz is silently dropped from the URL (carried via localStorage instead)", () => {
    // Long paste payloads explode the URL chain through Stripe's
    // 2048-char return_url cap. The marketing hero now writes biz
    // to localStorage; this helper must not put it in the URL.
    const out = buildSignupNextPath({
      biz: "A boutique law firm in Austin",
      intent: "build",
    });
    assert.doesNotMatch(out, /biz=/);
    // intent=build still survives — /clients/new auto-submits from
    // the localStorage seed once it hydrates on mount.
    assert.match(out, /intent=build/);
  });

  test("intent=build survives with no payload (localStorage will provide it)", () => {
    // Previously this dropped intent. After the bug fix, intent=build
    // must propagate through so /clients/new can auto-submit from the
    // localStorage seed. If localStorage is empty, the form's mount
    // effect no-ops.
    const out = buildSignupNextPath({ intent: "build" });
    assert.equal(out, "/clients/new?intent=build");
  });

  test("prefers url when both url + biz passed (biz is dropped anyway)", () => {
    const out = buildSignupNextPath({
      url: "https://example.com",
      biz: "redundant",
    });
    assert.match(out, /url=https/);
    assert.doesNotMatch(out, /biz=/);
  });

  test("empty inputs return bare /clients/new", () => {
    assert.equal(buildSignupNextPath({}), "/clients/new");
    assert.equal(
      buildSignupNextPath({ url: "", biz: "", intent: "" }),
      "/clients/new",
    );
  });

  test("non-build intent values are dropped", () => {
    // Only intent=build is a known signal; anything else should be
    // discarded so a hostile ?intent= can't trigger arbitrary client
    // behaviour.
    assert.equal(
      buildSignupNextPath({ url: "https://example.com", intent: "drop-tables" }),
      "/clients/new?url=https%3A%2F%2Fexample.com",
    );
  });

  test("trims whitespace from inputs", () => {
    const out = buildSignupNextPath({
      url: "   https://example.com   ",
      intent: "build",
    });
    assert.match(out, /url=https%3A%2F%2Fexample\.com&intent=build/);
  });

  test("caps over-long url at 1024 chars to prevent oversized redirects", () => {
    const long = "a".repeat(5000);
    const out = buildSignupNextPath({ url: `https://${long}.com`, intent: "build" });
    // The URL is encoded so we can't strict-compare; just ensure the
    // output is bounded.
    assert.ok(out.length < 1300, `expected bounded length, got ${out.length}`);
  });

  test("URL chain stays well under Stripe's 2048-char return_url cap even with huge biz", () => {
    // The whole point of the localStorage switch: a 4KB paste must
    // not produce a redirect that breaks Stripe.confirmSetupIntent.
    const huge = "x".repeat(4000);
    const out = buildSignupNextPath({ biz: huge, intent: "build" });
    assert.ok(
      out.length < 100,
      `huge biz must not bloat the URL — got ${out.length} chars`,
    );
  });
});

describe("buildSignupBillingRedirect", () => {
  test("embeds next= into /signup/billing", () => {
    const out = buildSignupBillingRedirect({
      url: "https://example.com",
      intent: "build",
    });
    // The next param is URL-encoded since it contains its own ?url=...
    // — that's the contract: /signup/billing reads ?next= and
    // decodeURIComponent's it.
    assert.match(out, /^\/signup\/billing\?next=/);
    const next = decodeURIComponent(out.split("next=")[1]!);
    assert.equal(next, "/clients/new?url=https%3A%2F%2Fexample.com&intent=build");
  });

  test("bare call with no inputs still produces a valid relative URL", () => {
    const out = buildSignupBillingRedirect({});
    assert.equal(out, "/signup/billing?next=%2Fclients%2Fnew");
  });

  test("biz input produces a redirect with no biz in the URL but intent preserved", () => {
    const out = buildSignupBillingRedirect({
      biz: "Long paste of business info — Google Maps + reviews here",
      intent: "build",
    });
    const next = decodeURIComponent(out.split("next=")[1]!);
    // intent=build survives so /clients/new auto-submits from
    // localStorage, but the biz payload itself is nowhere in the URL.
    assert.equal(next, "/clients/new?intent=build");
    assert.doesNotMatch(out, /Long\+paste/);
    assert.doesNotMatch(out, /biz=/);
  });

  test("full chain stays well under 2048 chars even with huge biz payload", () => {
    // Stripe's confirmSetupIntent rejects return URLs > 2048 chars.
    // The /signup/billing route uses sanitizeNextPath(?next=) as the
    // return URL. We verify the whole chain stays small.
    const huge = "y".repeat(4000);
    const out = buildSignupBillingRedirect({ biz: huge, intent: "build" });
    assert.ok(
      out.length < 200,
      `huge biz must not bloat the redirect — got ${out.length} chars`,
    );
  });
});

describe("buildSignupConnectAiRedirect", () => {
  // 2026-05-27 — Coverage for the helper that replaces buildSignupBillingRedirect
  // as the default post-magic-link redirect. The mandatory step 2/2 of signup
  // moved from card capture to Anthropic BYOK collection (live data showed
  // 0/12 conversions through /signup/billing); this helper builds the redirect
  // URL that lands the magic-link verifier on /signup/connect-ai with the
  // visitor's eventual /clients/new destination embedded as ?next=.
  test("embeds next= into /signup/connect-ai", () => {
    const out = buildSignupConnectAiRedirect({
      url: "https://example.com",
      intent: "build",
    });
    assert.match(out, /^\/signup\/connect-ai\?next=/);
    const next = decodeURIComponent(out.split("next=")[1]!);
    assert.equal(next, "/clients/new?url=https%3A%2F%2Fexample.com&intent=build");
  });

  test("?next= survives the round trip (decodes back to a sanitizable path)", () => {
    const out = buildSignupConnectAiRedirect({
      url: "https://acme.com",
      intent: "build",
    });
    const encoded = out.split("next=")[1]!;
    const next = decodeURIComponent(encoded);
    // The same shape sanitizeNextPath accepts — proves the round trip
    // is closed and ?next= is recoverable on the /signup/connect-ai page.
    assert.equal(sanitizeNextPath(next), next);
  });

  test("intent=build survives even without a url (localStorage carries biz)", () => {
    // The marketing hero in BIZ mode forwards ?intent=build with no biz
    // in the URL chain (the biz payload is in localStorage). The redirect
    // must still carry intent so /clients/new auto-submits on mount.
    const out = buildSignupConnectAiRedirect({ intent: "build" });
    const next = decodeURIComponent(out.split("next=")[1]!);
    assert.equal(next, "/clients/new?intent=build");
  });

  test("bare call with no inputs still produces a valid relative URL", () => {
    const out = buildSignupConnectAiRedirect({});
    assert.equal(out, "/signup/connect-ai?next=%2Fclients%2Fnew");
  });

  test("huge biz payload doesn't bloat the redirect URL", () => {
    // Same constraint as buildSignupBillingRedirect — the URL chain
    // stays small because biz is carried via localStorage, not the URL.
    const huge = "z".repeat(4000);
    const out = buildSignupConnectAiRedirect({ biz: huge, intent: "build" });
    assert.ok(
      out.length < 200,
      `huge biz must not bloat the connect-ai redirect — got ${out.length} chars`,
    );
  });

  test("non-build intent values are dropped (matches buildSignupNextPath)", () => {
    const out = buildSignupConnectAiRedirect({
      url: "https://example.com",
      intent: "drop-tables",
    });
    const next = decodeURIComponent(out.split("next=")[1]!);
    // Only url survives; intent is dropped because only "build" is a
    // recognised signal — guards against hostile ?intent=foo manipulation.
    assert.equal(next, "/clients/new?url=https%3A%2F%2Fexample.com");
  });
});

describe("sanitizeNextPath", () => {
  test("passes through /clients/new with query string intact", () => {
    assert.equal(
      sanitizeNextPath("/clients/new?url=https%3A%2F%2Fexample.com&intent=build"),
      "/clients/new?url=https%3A%2F%2Fexample.com&intent=build",
    );
  });

  test("passes through /dashboard", () => {
    assert.equal(sanitizeNextPath("/dashboard"), "/dashboard");
    assert.equal(sanitizeNextPath("/dashboard/billing"), "/dashboard/billing");
  });

  test("passes through /settings/domain (BYOK-arc step 3 upsell target)", () => {
    // /settings/domain was added to the allowlist on 2026-05-27 so the
    // upsell card in that page can route through /signup/billing?next=
    // /settings/domain and bounce back here once the card is saved.
    // Without this entry the next= collapses to /clients/new and the
    // user is stranded one click from the surface they just paid to
    // unlock.
    assert.equal(sanitizeNextPath("/settings/domain"), "/settings/domain");
  });

  test("rejects protocol-relative // (open-redirect attempt)", () => {
    assert.equal(sanitizeNextPath("//evil.com/path"), "/clients/new");
  });

  test("rejects absolute URLs", () => {
    assert.equal(sanitizeNextPath("https://evil.com"), "/clients/new");
    assert.equal(sanitizeNextPath("http://evil.com"), "/clients/new");
  });

  test("rejects non-leading-slash paths", () => {
    assert.equal(sanitizeNextPath("clients/new"), "/clients/new");
    assert.equal(sanitizeNextPath("../etc"), "/clients/new");
  });

  test("rejects unknown internal routes", () => {
    assert.equal(sanitizeNextPath("/admin"), "/clients/new");
    assert.equal(sanitizeNextPath("/super-admin/users"), "/clients/new");
  });

  test("rejects empty and non-string inputs", () => {
    assert.equal(sanitizeNextPath(""), "/clients/new");
    assert.equal(sanitizeNextPath(null), "/clients/new");
    assert.equal(sanitizeNextPath(undefined), "/clients/new");
    assert.equal(sanitizeNextPath(42), "/clients/new");
  });
});
