// packages/crm/tests/unit/auth/signup-redirect.spec.ts
//
// 2026-05-22 — Coverage for the query-passthrough helpers used by the
// new card-at-signup flow. These functions decide what URL the visitor
// lands on after the magic link + card collection complete, so a
// regression here would silently drop the user's ?url= / ?biz= /
// ?intent= signal — the exact bug this change set is meant to fix.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  buildSignupNextPath,
  buildSignupBillingRedirect,
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

  test("with biz + intent=build produces /clients/new?biz=...&intent=build", () => {
    const out = buildSignupNextPath({
      biz: "A boutique law firm in Austin",
      intent: "build",
    });
    assert.equal(
      out,
      "/clients/new?biz=A+boutique+law+firm+in+Austin&intent=build",
    );
  });

  test("intent=build is dropped when no url/biz is present", () => {
    // Bare intent without a payload would auto-submit nothing — drop it.
    const out = buildSignupNextPath({ intent: "build" });
    assert.equal(out, "/clients/new");
  });

  test("prefers url over biz when both are passed", () => {
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
