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
  isSafeInternalRedirect,
  toInternalRedirectPath,
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

// 2026-06-29 — Marketplace buy-intent fix. A logged-out buyer who clicks
// Install/Rent on a public listing is sent to /login?callbackUrl=<listing>.
// For the buy intent to survive the magic-link round trip and return them to
// the agent, the login/signup forms must thread a SAFE same-origin relative
// path through `sendMagicLinkAction`'s `redirectTo`, and the action's
// allowlist must PERMIT /marketplace/*. These two pure helpers own the
// same-origin safety so the form (adapter) and the action (allowlist) share
// one open-redirect policy.

describe("isSafeInternalRedirect", () => {
  test("allows the marketplace listing path (the buy-intent return target)", () => {
    assert.equal(isSafeInternalRedirect("/marketplace/247-phone-receptionist"), true);
    assert.equal(isSafeInternalRedirect("/marketplace/247-phone-receptionist?install=1"), true);
    assert.equal(isSafeInternalRedirect("/marketplace"), true);
  });

  test("allows the /build builder surface (developer-key sign-in return target)", () => {
    // A logged-out developer from SKILL.md clicking "Get a developer key" is sent
    // to /login?callbackUrl=/build/keys. Without /build allowlisted the callback
    // collapsed to /clients/new (the SMB flow). Covers the three builder pages.
    assert.equal(isSafeInternalRedirect("/build"), true);
    assert.equal(isSafeInternalRedirect("/build/keys"), true);
    assert.equal(isSafeInternalRedirect("/build/wallet"), true);
  });

  test("allows the OAuth consent return-path with query preserved (round-trips intact)", () => {
    // 2026-07-03 — a logged-out user is bounced to /login?callbackUrl=<this>
    // before landing back on the consent screen. Without /oauth/authorize on
    // the allowlist this collapses to /clients/new and consent is lost.
    assert.equal(isSafeInternalRedirect("/oauth/authorize"), true);
    assert.equal(
      isSafeInternalRedirect("/oauth/authorize?client_id=abc&redirect_uri=https%3A%2F%2Fclient.example.com%2Fcallback"),
      true,
    );
  });

  test("does not over-match lookalike /oauth-* paths (prefix must be exact)", () => {
    // A naive startsWith("/oauth") entry would wave these through too —
    // the allowlist must require the FULL /oauth/authorize segment.
    assert.equal(isSafeInternalRedirect("/oauth-evil"), false);
    assert.equal(isSafeInternalRedirect("/oauthx"), false);
    assert.equal(isSafeInternalRedirect("/oauth-evil/authorize"), false);
  });

  test("allows the existing signup-family + onboarding paths", () => {
    assert.equal(isSafeInternalRedirect("/clients/new"), true);
    assert.equal(isSafeInternalRedirect("/clients/new?url=https%3A%2F%2Fx.com&intent=build"), true);
    assert.equal(isSafeInternalRedirect("/dashboard"), true);
    assert.equal(isSafeInternalRedirect("/dashboard/billing"), true);
    assert.equal(isSafeInternalRedirect("/settings/domain"), true);
    assert.equal(isSafeInternalRedirect("/signup/connect-ai"), true);
    assert.equal(isSafeInternalRedirect("/signup/billing"), true);
    assert.equal(isSafeInternalRedirect("/claim"), true);
    assert.equal(isSafeInternalRedirect("/claim?token=abc"), true);
    assert.equal(isSafeInternalRedirect("/welcome"), true);
  });

  test("allows the REAL signup-form redirectTo shapes (?next= chain intact)", () => {
    // The signup form already submits these — the new shared allowlist must not
    // regress them (the encoded ?next= contains no literal `..`, so the traversal
    // guard leaves it alone).
    assert.equal(
      isSafeInternalRedirect(
        "/signup/connect-ai?next=%2Fclients%2Fnew%3Furl%3Dhttps%253A%252F%252Facme.com%26intent%3Dbuild",
      ),
      true,
    );
    assert.equal(isSafeInternalRedirect("/signup/billing?next=%2Fclients%2Fnew"), true);
  });

  test("rejects absolute URLs to any other host (open redirect)", () => {
    assert.equal(isSafeInternalRedirect("https://evil.com"), false);
    assert.equal(isSafeInternalRedirect("http://evil.com/marketplace/x"), false);
    assert.equal(isSafeInternalRedirect("https://evil.com/clients/new"), false);
  });

  test("rejects protocol-relative // and scheme-relative tricks", () => {
    assert.equal(isSafeInternalRedirect("//evil.com"), false);
    assert.equal(isSafeInternalRedirect("//evil.com/marketplace/x"), false);
    assert.equal(isSafeInternalRedirect("/\\evil.com"), false); // backslash smuggling
    assert.equal(isSafeInternalRedirect("/\t/evil.com"), false); // control char
  });

  test("rejects javascript:/data: and other schemes", () => {
    assert.equal(isSafeInternalRedirect("javascript:alert(1)"), false);
    assert.equal(isSafeInternalRedirect("data:text/html,<script>"), false);
    assert.equal(isSafeInternalRedirect("mailto:x@y.com"), false);
  });

  test("rejects non-leading-slash, unknown routes, and non-strings", () => {
    assert.equal(isSafeInternalRedirect("marketplace/x"), false);
    assert.equal(isSafeInternalRedirect("../etc/passwd"), false);
    assert.equal(isSafeInternalRedirect("/admin"), false);
    assert.equal(isSafeInternalRedirect("/super-admin/users"), false);
    assert.equal(isSafeInternalRedirect(""), false);
    assert.equal(isSafeInternalRedirect(null), false);
    assert.equal(isSafeInternalRedirect(undefined), false);
    assert.equal(isSafeInternalRedirect(42), false);
  });

  test("rejects a marketplace path smuggling a host via backslash or //", () => {
    // Guard the exact open-redirect shapes a `/marketplace`-prefix allowlist
    // could otherwise wave through if it only checked the leading segment.
    assert.equal(isSafeInternalRedirect("/marketplace/..//evil.com"), false);
    assert.equal(isSafeInternalRedirect("/marketplace\\@evil.com"), false);
  });

  test("allows the /claim-build invisible-claim return path with query intact", () => {
    // 2026-07-03 — web-activation invisible claim return. The /try reveal
    // sends users to /signup?callbackUrl=<encoded /claim-build?ws=...&token=...>;
    // after auth, signup redirects to that callbackUrl. Without /claim-build on
    // the allowlist this collapses to /clients/new and the claim token is lost.
    const target = "/claim-build?ws=abc&token=wst_x";
    assert.equal(isSafeInternalRedirect(target), true);
  });
});

describe("toInternalRedirectPath", () => {
  test("returns a relative path for an absolute app-origin callbackUrl", () => {
    // buildListingSignInUrl encodes the listing as an ABSOLUTE app-origin URL.
    // The form must collapse it to a same-origin relative path (NextAuth's
    // redirectTo + sanitizeRedirectTo only honor leading-slash internal paths).
    assert.equal(
      toInternalRedirectPath("https://app.seldonframe.com/marketplace/247-phone-receptionist?install=1"),
      "/marketplace/247-phone-receptionist?install=1",
    );
    assert.equal(
      toInternalRedirectPath("https://staging.app.seldonframe.com/marketplace/speed-to-lead"),
      "/marketplace/speed-to-lead",
    );
  });

  test("passes through an already-relative safe path", () => {
    assert.equal(toInternalRedirectPath("/marketplace/x?install=1"), "/marketplace/x?install=1");
    assert.equal(toInternalRedirectPath("/clients/new"), "/clients/new");
    assert.equal(toInternalRedirectPath("/build/keys"), "/build/keys");
  });

  test("returns null for an absolute URL to a foreign host (no open redirect)", () => {
    assert.equal(toInternalRedirectPath("https://evil.com/marketplace/x"), null);
    assert.equal(toInternalRedirectPath("//evil.com/marketplace/x"), null);
    assert.equal(toInternalRedirectPath("javascript:alert(1)"), null);
  });

  test("returns null for a same-origin URL whose PATH is not allowlisted", () => {
    // Same host, but /admin isn't a permitted internal target — must not leak.
    assert.equal(toInternalRedirectPath("https://app.seldonframe.com/admin"), null);
  });

  test("returns null for empty / non-string", () => {
    assert.equal(toInternalRedirectPath(""), null);
    assert.equal(toInternalRedirectPath(null), null);
    assert.equal(toInternalRedirectPath(undefined), null);
    assert.equal(toInternalRedirectPath(42), null);
  });
});
