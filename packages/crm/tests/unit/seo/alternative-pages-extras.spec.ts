// TDD guardrail for the 2026-07-08 SEO batch: the 10 new big-volume VS_PAIRS
// (task A), every competitor's pricingSourceUrl (task B), and the
// BuildWidget's normalizeSiteInput helper (task D) — mirrors the style of
// best-pages.spec.ts and seldonframe-vs.spec.ts.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { COMPETITORS, getCompetitor } from "../../../src/lib/seo/alternative-pages";
import { VS_PAIRS, vsSlug, getVsPair } from "../../../src/lib/seo/alternative-pages-extras";
import { normalizeSiteInput } from "../../../src/components/seo/build-widget";

// ─── task A: the 10 new big-volume third-party pairs ───────────────────────

const NEW_PAIR_SLUGS = [
  "hubspot-vs-salesforce",
  "hubspot-vs-activecampaign",
  "activecampaign-vs-klaviyo",
  "clickfunnels-vs-kartra",
  "zoho-vs-hubspot",
  "keap-vs-activecampaign",
  "salesforce-vs-zoho",
  "hubspot-vs-clickfunnels",
  "klaviyo-vs-hubspot",
  "kartra-vs-gohighlevel",
];

test("VS_PAIRS slugs are unique", () => {
  const slugs = VS_PAIRS.map(vsSlug);
  assert.equal(new Set(slugs).size, slugs.length, "duplicate VS_PAIRS slug");
});

for (const slug of NEW_PAIR_SLUGS) {
  test(`new pair '${slug}' resolves via getVsPair`, () => {
    const { pair, a, b } = getVsPair(slug);
    assert.equal(vsSlug(pair), slug);
    assert.ok(a.slug === pair.a, "resolved competitor a mismatch");
    assert.ok(b.slug === pair.b, "resolved competitor b mismatch");
    assert.ok(pair.angle.trim().length > 20, `${slug}: angle too short`);
  });
}

test("getVsPair throws on an unknown pair slug", () => {
  assert.throws(() => getVsPair("not-a-real-pair"), /Unknown vs pair/);
});

// ─── task B: pricingSourceUrl on every competitor ──────────────────────────

test("every competitor has a valid https pricingSourceUrl", () => {
  for (const c of COMPETITORS) {
    assert.ok(c.pricingSourceUrl, `${c.slug}: missing pricingSourceUrl`);
    assert.match(c.pricingSourceUrl, /^https:\/\//, `${c.slug}: pricingSourceUrl is not https`);
    assert.doesNotThrow(() => new URL(c.pricingSourceUrl), `${c.slug}: pricingSourceUrl is not a valid URL`);
  }
});

test("getCompetitor returns a competitor with pricingSourceUrl set", () => {
  const c = getCompetitor("gohighlevel");
  assert.equal(c.pricingSourceUrl, "https://www.gohighlevel.com/pricing");
});

// ─── task D: normalizeSiteInput (BuildWidget) ──────────────────────────────

test("normalizeSiteInput adds https:// to a bare domain", () => {
  assert.equal(normalizeSiteInput("example.com"), "https://example.com/");
});

test("normalizeSiteInput preserves an already-qualified URL", () => {
  assert.equal(normalizeSiteInput("https://example.com/pricing"), "https://example.com/pricing");
});

test("normalizeSiteInput accepts http:// explicitly", () => {
  assert.equal(normalizeSiteInput("http://example.com"), "http://example.com/");
});

test("normalizeSiteInput trims surrounding whitespace", () => {
  assert.equal(normalizeSiteInput("  example.com  "), "https://example.com/");
});

test("normalizeSiteInput returns null for an empty string", () => {
  assert.equal(normalizeSiteInput(""), null);
  assert.equal(normalizeSiteInput("   "), null);
});

test("normalizeSiteInput returns null for garbage with no dot", () => {
  assert.equal(normalizeSiteInput("not a url"), null);
  assert.equal(normalizeSiteInput("localhost"), null);
});
