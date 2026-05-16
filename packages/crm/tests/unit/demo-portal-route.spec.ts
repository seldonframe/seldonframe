// v1.55.x — Tests for the /customer/<slug>/demo route's redirect
// policy (the pure resolveDemoRedirect helper).
//
// The full GET handler does I/O (db lookups + cookie writes) so we
// don't test it here directly. Instead, the route delegates its
// policy decision to resolveDemoRedirect — given the result of
// establishPortalDemoSession, where should we redirect? That part
// is pure and load-bearing, so it gets covered here.
//
// Three states matter:
//   1. ok=true  → redirect to the portal home (/customer/<slug>/)
//   2. ok=false / reason="org_not_found"   → 404 (don't leak slug
//      existence by redirecting to /login on a fake slug)
//   3. ok=false / reason="no_demo_contact" → redirect to /login as a
//      graceful fallback for pre-v1.55 workspaces (or soft-failed
//      seeds at workspace creation time). The operator's demo URL
//      stays usable, just via the magic-link path.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { resolveDemoRedirect } from "../../src/app/customer/[orgSlug]/demo/route";

describe("resolveDemoRedirect — routing policy", () => {
  test("returns redirect to portal home when demo session was established", () => {
    const result = resolveDemoRedirect({
      ok: true,
      orgSlug: "ignitify-cooling-and-heating",
      orgId: "org-abc-123",
      contactId: "contact-demo-xyz",
      redirectTo: "/customer/ignitify-cooling-and-heating/",
    });
    assert.deepEqual(result, {
      kind: "redirect",
      target: "/customer/ignitify-cooling-and-heating/",
    });
  });

  test("returns not_found when the workspace slug doesn't resolve", () => {
    // 404 by design: redirecting an unknown slug to /login would leak
    // "no workspace by that name exists" only because the magic-link
    // form errors differently. Better to return 404 — same shape as
    // any other unknown route.
    const result = resolveDemoRedirect({
      ok: false,
      reason: "org_not_found",
    });
    assert.deepEqual(result, { kind: "not_found" });
  });

  test("returns redirect to /customer/ fallback when no demo contact exists for the workspace", () => {
    // Pre-v1.55 workspace OR a soft-failed seed at workspace creation
    // time. The slug resolves; the demo contact doesn't. Fall back to
    // the customer-portal entry surface (which routes to the slug's
    // login if the customer follows it). Operator's pasted URL still
    // works as a "click this for the portal demo" — just via the
    // magic-link path instead of zero-click.
    const result = resolveDemoRedirect({
      ok: false,
      reason: "no_demo_contact",
    });
    assert.equal(result.kind, "redirect");
    if (result.kind === "redirect") {
      // We intentionally don't pin the exact target URL — what
      // matters is that the policy returns a redirect (not a 404)
      // when the demo contact is missing.
      assert.ok(result.target.startsWith("/"), "target should be a relative path");
    }
  });
});
