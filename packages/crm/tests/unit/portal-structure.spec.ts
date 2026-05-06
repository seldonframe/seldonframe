// ============================================================================
// v1.15.0 — portal-template structural primitives (pure helpers)
// ============================================================================
//
// Mirrors v1.11's landing-structure pattern but for the portal
// template (CompositeNode[] stored on organizations.settings.portal
// _template). Five atomic ops: add / move / delete / update / read.
//
// The template is what RENDERS on every customer's portal — same
// composite primitives as landing, just rendered against a per-
// customer CustomerRenderContext at request time.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyAddPortalSection,
  applyMovePortalSection,
  applyDeletePortalSection,
  applyUpdatePortalSection,
  derivePortalSectionPreview,
} from "@/lib/page-blocks/portal/structure";
import type { CompositeNode } from "@/lib/page-blocks/composite/schema";

const SECTION_HELLO: CompositeNode = {
  kind: "section",
  headline: "Welcome back",
  children: [{ kind: "text", text: "Glad to see you." }],
};
const SECTION_DOCUMENTS: CompositeNode = {
  kind: "section",
  headline: "Your documents",
  children: [{ kind: "embed", ref: "customer.documents" }],
};
const SECTION_NEXT: CompositeNode = {
  kind: "section",
  headline: "Your next appointment",
  children: [{ kind: "embed", ref: "customer.next_appointment" }],
};
const SECTION_DEALS: CompositeNode = {
  kind: "section",
  headline: "Active jobs",
  children: [{ kind: "embed", ref: "customer.deals" }],
};

// ─── applyAddPortalSection ────────────────────────────────────────────────

test("applyAddPortalSection appends to the end by default", () => {
  const result = applyAddPortalSection([SECTION_HELLO], SECTION_DOCUMENTS);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.sections.length, 2);
  assert.equal(result.sections[1], SECTION_DOCUMENTS);
});

test("applyAddPortalSection inserts at given position", () => {
  const result = applyAddPortalSection(
    [SECTION_HELLO, SECTION_DEALS],
    SECTION_DOCUMENTS,
    1,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.sections[1], SECTION_DOCUMENTS);
  assert.equal(result.sections[2], SECTION_DEALS);
});

test("applyAddPortalSection rejects non-section root", () => {
  // Portal template entries must be section-rooted (same contract
  // as composite landing sections).
  const notASection: CompositeNode = { kind: "text", text: "rogue" };
  const result = applyAddPortalSection([SECTION_HELLO], notASection);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.errors.some((e) => /root.*section|kind=section/i.test(e)));
});

test("applyAddPortalSection rejects out-of-range position", () => {
  const r1 = applyAddPortalSection([SECTION_HELLO], SECTION_NEXT, -1);
  assert.equal(r1.ok, false);
  const r2 = applyAddPortalSection([SECTION_HELLO], SECTION_NEXT, 5);
  assert.equal(r2.ok, false);
});

test("applyAddPortalSection allows position == length (append explicitly)", () => {
  const result = applyAddPortalSection([SECTION_HELLO], SECTION_NEXT, 1);
  assert.equal(result.ok, true);
});

// ─── applyMovePortalSection ───────────────────────────────────────────────

test("applyMovePortalSection moves forward + backward", () => {
  const sections = [SECTION_HELLO, SECTION_NEXT, SECTION_DOCUMENTS, SECTION_DEALS];
  const r1 = applyMovePortalSection(sections, 0, 3);
  assert.equal(r1.ok, true);
  if (!r1.ok) return;
  assert.deepEqual(
    r1.sections.map((s) => (s as { headline?: string }).headline),
    ["Your next appointment", "Your documents", "Active jobs", "Welcome back"],
  );
  const r2 = applyMovePortalSection(sections, 3, 0);
  assert.equal(r2.ok, true);
  if (!r2.ok) return;
  assert.equal((r2.sections[0] as { headline?: string }).headline, "Active jobs");
});

test("applyMovePortalSection rejects out-of-range indices", () => {
  const sections = [SECTION_HELLO, SECTION_NEXT];
  assert.equal(applyMovePortalSection(sections, -1, 0).ok, false);
  assert.equal(applyMovePortalSection(sections, 0, 2).ok, false);
});

test("applyMovePortalSection from == to is a no-op", () => {
  const result = applyMovePortalSection([SECTION_HELLO, SECTION_NEXT], 1, 1);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.sections.length, 2);
});

// ─── applyDeletePortalSection ─────────────────────────────────────────────

test("applyDeletePortalSection removes the section at the index", () => {
  const sections = [SECTION_HELLO, SECTION_NEXT, SECTION_DOCUMENTS];
  const result = applyDeletePortalSection(sections, 1);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.sections.length, 2);
  assert.equal(result.removed, SECTION_NEXT);
});

test("applyDeletePortalSection allows leaving 0 sections (empty portal is valid)", () => {
  // Different from landing's "minimum 1" rule. An empty portal
  // template is valid — the customer just sees the existing
  // built-in tabs (Documents, Bookings, etc) without a Custom tab.
  const result = applyDeletePortalSection([SECTION_HELLO], 0);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.sections.length, 0);
});

test("applyDeletePortalSection rejects out-of-range index", () => {
  assert.equal(applyDeletePortalSection([SECTION_HELLO], -1).ok, false);
  assert.equal(applyDeletePortalSection([SECTION_HELLO], 1).ok, false);
});

// ─── applyUpdatePortalSection ─────────────────────────────────────────────

test("applyUpdatePortalSection replaces the tree at the index", () => {
  const sections = [SECTION_HELLO, SECTION_NEXT, SECTION_DEALS];
  const newTree: CompositeNode = {
    kind: "section",
    headline: "Updated section",
    children: [{ kind: "text", text: "fresh content" }],
  };
  const result = applyUpdatePortalSection(sections, 1, newTree);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal((result.sections[1] as { headline?: string }).headline, "Updated section");
  assert.equal((result.sections[0] as { headline?: string }).headline, "Welcome back");
  assert.equal((result.sections[2] as { headline?: string }).headline, "Active jobs");
});

test("applyUpdatePortalSection rejects non-section root", () => {
  const notASection: CompositeNode = { kind: "text", text: "rogue" };
  const result = applyUpdatePortalSection([SECTION_HELLO], 0, notASection);
  assert.equal(result.ok, false);
});

test("applyUpdatePortalSection rejects out-of-range index", () => {
  const sections = [SECTION_HELLO, SECTION_NEXT];
  assert.equal(applyUpdatePortalSection(sections, -1, SECTION_DEALS).ok, false);
  assert.equal(applyUpdatePortalSection(sections, 2, SECTION_DEALS).ok, false);
});

// ─── derivePortalSectionPreview ───────────────────────────────────────────

test("derivePortalSectionPreview returns headline + child count", () => {
  const r = derivePortalSectionPreview(SECTION_HELLO);
  assert.match(r, /Welcome back/);
  assert.match(r, /1.*child/i);
});

test("derivePortalSectionPreview falls back to eyebrow when no headline", () => {
  const tree: CompositeNode = {
    kind: "section",
    eyebrow: "FALLBACK",
    children: [],
  };
  const r = derivePortalSectionPreview(tree);
  assert.match(r, /FALLBACK/);
});
