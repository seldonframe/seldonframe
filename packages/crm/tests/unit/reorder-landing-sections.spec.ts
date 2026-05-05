// ============================================================================
// v1.10.0 — reorder_landing_sections (pure function)
// ============================================================================
//
// Reorders landing-page sections without changing their content. The
// operator says "move FAQ to the bottom" → IDE agent computes a new
// section-type array → server validates the multiset of types is
// preserved (same sections, same count) and writes the new ordering.
//
// Validation rules:
//   - Every section type in current must appear in newOrder
//   - newOrder cannot contain types not present in current
//   - Duplicate types in current are not supported (return error;
//     operator should use update_landing_section to manage duplicates
//     individually)
//
// Pure function so we can test it without DB.

import { test } from "node:test";
import assert from "node:assert/strict";
import { reorderLandingSections } from "@/lib/page-blocks/reorder";
import type { LandingSection } from "@/lib/blueprint/types";

const HERO: LandingSection = {
  type: "hero",
  headline: "Welcome",
  ctaPrimary: { label: "Book", href: "/book" },
};
const SERVICES: LandingSection = {
  type: "services-grid",
  items: [{ title: "AC Repair", description: "Same-day fixes." }],
};
const FAQ: LandingSection = {
  type: "faq",
  items: [{ question: "Do you serve weekends?", answer: "Yes." }],
} as LandingSection;
const CTA: LandingSection = {
  type: "mid-cta",
  headline: "Ready to book?",
};

test("reorderLandingSections moves a section to a new position", () => {
  const result = reorderLandingSections(
    [HERO, SERVICES, FAQ, CTA],
    ["hero", "services-grid", "mid-cta", "faq"],
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.sections.length, 4);
  assert.equal(result.sections[0].type, "hero");
  assert.equal(result.sections[1].type, "services-grid");
  assert.equal(result.sections[2].type, "mid-cta");
  assert.equal(result.sections[3].type, "faq");
  // Content preserved (we ONLY reorder, never mutate).
  assert.deepEqual(result.sections[0], HERO);
  assert.deepEqual(result.sections[3], FAQ);
});

test("reorderLandingSections rejects when newOrder is missing a current type", () => {
  const result = reorderLandingSections(
    [HERO, SERVICES, FAQ, CTA],
    ["hero", "services-grid", "faq"], // missing mid-cta
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.errors.some((e) => /missing|mid-cta/i.test(e)));
});

test("reorderLandingSections rejects when newOrder contains an unknown type", () => {
  const result = reorderLandingSections(
    [HERO, SERVICES],
    ["hero", "services-grid", "testimonials"], // testimonials not in current
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.errors.some((e) => /unknown|testimonials|not present/i.test(e)));
});

test("reorderLandingSections rejects when current has duplicate section types", () => {
  // The reorder API uses type as the identity key, so duplicates
  // would be ambiguous. Direct the operator to update_landing_section
  // for cases where they have multiple sections of the same type.
  const result = reorderLandingSections(
    [HERO, CTA, SERVICES, CTA, FAQ],
    ["hero", "services-grid", "mid-cta", "mid-cta", "faq"],
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.errors.some((e) => /duplicate|update_landing_section/i.test(e)));
});

test("reorderLandingSections is a no-op when newOrder equals current order", () => {
  const result = reorderLandingSections(
    [HERO, SERVICES, FAQ],
    ["hero", "services-grid", "faq"],
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.sections, [HERO, SERVICES, FAQ]);
});

test("reorderLandingSections rejects when newOrder is empty but current has sections", () => {
  // Empty new order would wipe the page — that's a delete operation,
  // not a reorder. Refuse.
  const result = reorderLandingSections([HERO, SERVICES], []);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.errors.some((e) => /missing|empty/i.test(e)));
});
