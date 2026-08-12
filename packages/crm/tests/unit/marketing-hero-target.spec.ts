// packages/crm/tests/unit/marketing-hero-target.spec.ts
//
// heroSubmitTarget is extracted to a plain module
// (src/components/landing/hero-submit-target.ts) rather than imported from
// marketing-hero.tsx directly — the hero is a "use client" component and
// importing it under node:test/tsx risks dragging in JSX/CSS side effects.
// marketing-hero.tsx re-exports the same function for the rest of the app.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  heroSubmitLoadingMessage,
  heroSubmitTarget,
} from "../../src/components/landing/hero-submit-target";

test("flag off → byte-identical current behavior", () => {
  assert.equal(
    heroSubmitTarget("url", "https://acme.com", false),
    "/signup?intent=build&url=https%3A%2F%2Facme.com",
  );
  assert.equal(heroSubmitTarget("biz", "Family plumbing in Reno", false), "/signup?intent=build");
});

test("flag on → /try carries the url; biz tab routes to signup (description build is signup-gated, /try is URL-only)", () => {
  assert.equal(
    heroSubmitTarget("url", "https://acme.com", true),
    "/try?url=https%3A%2F%2Facme.com",
  );
  assert.equal(heroSubmitTarget("biz", "Family plumbing in Reno", true), "/signup?intent=build");
});

// Persona-loop finding (2026-07-26): the loading-overlay copy must never
// claim a workspace is spinning up when heroSubmitTarget is actually about
// to redirect to the signup wall — every non-"/try" destination is a
// signup redirect, so the message has to say so.
test("loading message matches heroSubmitTarget's destination for every tab/flag combination", () => {
  for (const tab of ["url", "biz"] as const) {
    for (const ungatedBuildEnabled of [true, false]) {
      const destination = heroSubmitTarget(tab, "https://acme.com", ungatedBuildEnabled);
      const message = heroSubmitLoadingMessage(tab, ungatedBuildEnabled);
      if (destination.startsWith("/try")) {
        assert.equal(message, "Spinning up your workspace…");
      } else {
        assert.equal(destination.startsWith("/signup"), true);
        assert.equal(message, "Taking you to sign up…");
      }
    }
  }
});
