// ============================================================================
// v1.11.0 — landing-structure primitives (pure helpers)
// ============================================================================
//
// Three new structural primitives over Blueprint.landing.sections:
//
//   - applyMove(sections, from, to)   → move ONE section atomically
//   - applyDelete(sections, index)    → remove ONE section atomically
//   - derivePreview(section)          → 1-line summary so agents can
//                                       disambiguate duplicate types
//                                       (services-grid grid-3 vs stats etc.)
//
// Index-based addressing is the design choice that lets these handle
// duplicate types — the case that v1.10's reorder_landing_sections
// refused. Indices are unambiguous within a single round-trip; agents
// re-read structure between mutating calls.
//
// Server-side these primitives do NO creative work. The agent picks
// which section to move/delete from operator intent + the preview
// strings. As LLMs improve, intent-mapping accuracy rises with zero
// harness changes.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyMove,
  applyDelete,
  derivePreview,
} from "@/lib/page-blocks/landing-structure";
import type { LandingSection } from "@/lib/blueprint/types";

// Build minimal LandingSection fixtures. Type-cast to LandingSection
// because the test fixtures intentionally minimize fields — the
// pure helpers don't need full content to operate on order.
const HERO = { type: "hero", headline: "Welcome", ctaPrimary: { label: "Book", href: "/book" } } as unknown as LandingSection;
const TRUST = { type: "trust-strip", items: [{ label: "Licensed" }, { label: "Insured" }] } as unknown as LandingSection;
const SERVICES_GRID = { type: "services-grid", items: [{ title: "AC Repair", description: "..." }, { title: "Heating", description: "..." }, { title: "Air Quality", description: "..." }] } as unknown as LandingSection;
const SERVICES_STATS = { type: "services-grid", layout: "stats", items: [{ title: "12 yrs", description: "in business" }, { title: "4.8★", description: "average rating" }] } as unknown as LandingSection;
const ABOUT = { type: "about", headline: "Our story", body: "Family-owned." } as unknown as LandingSection;
const FAQ = { type: "faq", items: [{ question: "Q1", answer: "A1" }, { question: "Q2", answer: "A2" }] } as unknown as LandingSection;
const CTA = { type: "mid-cta", headline: "Ready?" } as unknown as LandingSection;
const FOOTER = { type: "footer" } as unknown as LandingSection;

// ─── applyMove ─────────────────────────────────────────────────────────────

test("applyMove moves an element from index 0 to index 5 (forward, target index = result index)", () => {
  // [HERO, TRUST, SG, SGS, ABOUT, FAQ, CTA, FOOTER]
  // Move HERO so it ends up at index 5 in the result.
  // Result: [TRUST, SG, SGS, ABOUT, FAQ, HERO, CTA, FOOTER]
  const sections = [HERO, TRUST, SERVICES_GRID, SERVICES_STATS, ABOUT, FAQ, CTA, FOOTER];
  const result = applyMove(sections, 0, 5);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.sections[5].type, "hero");
  assert.equal(result.sections[0].type, "trust-strip");
  assert.equal(result.sections.length, 8);
});

test("applyMove backwards from 5 to 0", () => {
  // Move FAQ (index 5) so it ends up at index 0.
  const sections = [HERO, TRUST, SERVICES_GRID, SERVICES_STATS, ABOUT, FAQ, CTA, FOOTER];
  const result = applyMove(sections, 5, 0);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.sections[0].type, "faq");
  assert.equal(result.sections[1].type, "hero");
  assert.equal(result.sections.length, 8);
});

test("applyMove from N to N is a no-op", () => {
  const sections = [HERO, TRUST, FOOTER];
  const result = applyMove(sections, 1, 1);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.sections.map((s) => s.type), ["hero", "trust-strip", "footer"]);
});

test("applyMove handles duplicate types correctly (the case v1.10 reorder couldn't)", () => {
  // Two services-grid sections (one grid-3, one stats). Move the FIRST
  // one (the real services grid at index 2) to position 5. The stats
  // version stays where it was, modulo index shifts.
  const sections = [HERO, TRUST, SERVICES_GRID, SERVICES_STATS, ABOUT, FAQ, CTA, FOOTER];
  const result = applyMove(sections, 2, 5);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  // SERVICES_GRID (the 3-item one) should now be at index 5.
  // SERVICES_STATS (the 2-item one) shifted up to index 2 and stays there.
  assert.equal(result.sections[2].type, "services-grid");
  assert.equal((result.sections[2] as { items: unknown[] }).items.length, 2); // stats version
  assert.equal(result.sections[5].type, "services-grid");
  assert.equal((result.sections[5] as { items: unknown[] }).items.length, 3); // grid-3 version
});

test("applyMove rejects from_index out of range", () => {
  const sections = [HERO, TRUST, FOOTER];
  const r1 = applyMove(sections, -1, 0);
  assert.equal(r1.ok, false);
  const r2 = applyMove(sections, 3, 0);
  assert.equal(r2.ok, false);
});

test("applyMove rejects to_index out of range", () => {
  const sections = [HERO, TRUST, FOOTER];
  const r1 = applyMove(sections, 0, -1);
  assert.equal(r1.ok, false);
  const r2 = applyMove(sections, 0, 3);
  assert.equal(r2.ok, false);
});

test("applyMove rejects empty sections array", () => {
  const result = applyMove([], 0, 0);
  assert.equal(result.ok, false);
});

test("applyMove does not mutate input array", () => {
  const sections = [HERO, TRUST, FOOTER];
  const before = [...sections];
  applyMove(sections, 0, 2);
  assert.deepEqual(sections, before, "input array must be unchanged (immutability)");
});

// ─── applyDelete ───────────────────────────────────────────────────────────

test("applyDelete removes the element at the given index", () => {
  // [HERO, TRUST, SG, SGS, ABOUT, FAQ, CTA, FOOTER]
  // Delete index 3 (the stats services-grid duplicate).
  const sections = [HERO, TRUST, SERVICES_GRID, SERVICES_STATS, ABOUT, FAQ, CTA, FOOTER];
  const result = applyDelete(sections, 3);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.sections.length, 7);
  assert.equal(result.removed.type, "services-grid");
  assert.equal((result.removed as { layout?: string }).layout, "stats");
});

test("applyDelete from index 0 (first element)", () => {
  const sections = [HERO, TRUST, FOOTER];
  const result = applyDelete(sections, 0);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.sections[0].type, "trust-strip");
  assert.equal(result.sections.length, 2);
});

test("applyDelete from last index", () => {
  const sections = [HERO, TRUST, FOOTER];
  const result = applyDelete(sections, 2);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.sections[result.sections.length - 1].type, "trust-strip");
});

test("applyDelete refuses to leave 0 sections", () => {
  // Empty landing pages are broken UX. Server enforces a minimum of 1.
  const sections = [HERO];
  const result = applyDelete(sections, 0);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.errors.some((e) => /leave|empty|minimum/i.test(e)));
});

test("applyDelete rejects index out of range", () => {
  const sections = [HERO, TRUST];
  const r1 = applyDelete(sections, -1);
  assert.equal(r1.ok, false);
  const r2 = applyDelete(sections, 2);
  assert.equal(r2.ok, false);
});

test("applyDelete does not mutate input array", () => {
  const sections = [HERO, TRUST, FOOTER];
  const before = [...sections];
  applyDelete(sections, 1);
  assert.deepEqual(sections, before);
});

// ─── derivePreview ─────────────────────────────────────────────────────────
//
// Preview strings are how the agent disambiguates duplicate-typed
// sections. Each section type has its own derivation: hero shows
// the headline, services-grid shows "<N> services" or "<N> stats",
// faq shows "<N> questions", etc. The strings are short (under
// ~80 chars) so they fit comfortably in get_landing_structure
// responses.

test("derivePreview for hero shows the headline", () => {
  assert.match(derivePreview(HERO), /Welcome/);
});

test("derivePreview for services-grid distinguishes grid-3 from stats layout", () => {
  // Critical for the duplicate-services-grid case. The agent must
  // be able to tell "3 services" apart from "2 stats" via preview alone.
  const grid = derivePreview(SERVICES_GRID);
  const stats = derivePreview(SERVICES_STATS);
  assert.notEqual(grid, stats);
  assert.match(grid, /3/);
  assert.match(stats, /(stats|2)/i);
});

test("derivePreview for faq shows item count", () => {
  assert.match(derivePreview(FAQ), /2/);
});

test("derivePreview for trust-strip shows item count", () => {
  assert.match(derivePreview(TRUST), /2/);
});

test("derivePreview for about shows the headline", () => {
  assert.match(derivePreview(ABOUT), /Our story/);
});

test("derivePreview for mid-cta shows the headline", () => {
  assert.match(derivePreview(CTA), /Ready/);
});

test("derivePreview for unknown/sparse sections returns a non-empty fallback", () => {
  // Defensive — sections of unknown type or with missing fields
  // should still produce a usable preview (the agent always has
  // SOMETHING to look at).
  const odd = { type: "something-new" } as unknown as LandingSection;
  const result = derivePreview(odd);
  assert.equal(typeof result, "string");
  assert.ok(result.length > 0);
});

test("derivePreview truncates long text to a sane upper bound", () => {
  const longHero = {
    type: "hero",
    headline: "x".repeat(500),
    ctaPrimary: { label: "Book", href: "/book" },
  } as unknown as LandingSection;
  const result = derivePreview(longHero);
  assert.ok(result.length <= 100, `expected truncation, got ${result.length} chars`);
});
