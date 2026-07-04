// packages/crm/tests/unit/marketing-hero-target.spec.ts
//
// heroSubmitTarget is extracted to a plain module
// (src/components/landing/hero-submit-target.ts) rather than imported from
// marketing-hero.tsx directly — the hero is a "use client" component and
// importing it under node:test/tsx risks dragging in JSX/CSS side effects.
// marketing-hero.tsx re-exports the same function for the rest of the app.

import { test } from "node:test";
import assert from "node:assert/strict";
import { heroSubmitTarget } from "../../src/components/landing/hero-submit-target";

test("flag off → byte-identical current behavior", () => {
  assert.equal(
    heroSubmitTarget("url", "https://acme.com", false),
    "/signup?intent=build&url=https%3A%2F%2Facme.com",
  );
  assert.equal(heroSubmitTarget("biz", "Family plumbing in Reno", false), "/signup?intent=build");
});

test("flag on → /try carries the url; biz tab still goes to /try", () => {
  assert.equal(
    heroSubmitTarget("url", "https://acme.com", true),
    "/try?url=https%3A%2F%2Facme.com",
  );
  assert.equal(heroSubmitTarget("biz", "Family plumbing in Reno", true), "/try");
});
