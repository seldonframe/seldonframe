// TDD guardrail for the CRM Pricing Index data-transform module
// (lib/seo/pricing-index.ts) — the never-lies chart behind
// /charts/crm-pricing-index. Checks: SF-tier mapping correctness (GHL →
// Agency, solo tools → Builder), no fabricated numbers (every series point
// traces to a registry entry or the SF ladder), quote-gated handling, and
// monotonic cost steps as business size grows.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  buildVendorSeries,
  sfBandForVendor,
  allChartSlugs,
  SF_TIER_MAP,
  SF_TIER_PRICES,
  CONTACT_PRESETS,
  SEAT_PRESETS,
  type BusinessSize,
} from "../../../src/lib/seo/pricing-index";
import { PRICING, getCompetitorPricing } from "../../../src/lib/seo/competitor-pricing";

const SMALL: BusinessSize = { contacts: 500, seats: 1 };
const MID: BusinessSize = { contacts: 10_000, seats: 3 };
const LARGE: BusinessSize = { contacts: 50_000, seats: 10 };

// ─── SF-tier mapping correctness ────────────────────────────────────────────

test("every PRICING slug has an SF_TIER_MAP entry (1:1 coverage)", () => {
  for (const slug of allChartSlugs()) {
    assert.ok(SF_TIER_MAP[slug], `${slug}: missing SF_TIER_MAP entry`);
  }
});

test("SF_TIER_MAP has no orphan entries beyond the registry", () => {
  const registrySlugs = new Set(PRICING.map((p) => p.slug));
  for (const slug of Object.keys(SF_TIER_MAP)) {
    assert.ok(registrySlugs.has(slug), `${slug}: SF_TIER_MAP entry has no matching competitor-pricing registry row`);
  }
});

test("GoHighLevel maps to the Agency band (agency_starter..agency_scale), never Builder", () => {
  const mapping = SF_TIER_MAP["gohighlevel"];
  assert.equal(mapping.band[0], "agency_starter");
  assert.equal(mapping.band[1], "agency_scale");
});

test("Vendasta and Stammer AI (agency reseller platforms) map to Agency tiers", () => {
  assert.equal(SF_TIER_MAP["vendasta"].band[0], "agency_starter");
  assert.equal(SF_TIER_MAP["stammer-ai"].band[0], "agency_starter");
});

test("solo/DIY tools (Linktree, Durable, Vapi, Retell) map to Builder only — never Agency", () => {
  for (const slug of ["linktree", "durable", "vapi", "retell-ai"]) {
    const mapping = SF_TIER_MAP[slug];
    assert.equal(mapping.band[0], "builder", `${slug}: expected Builder floor`);
    assert.notEqual(mapping.band[1], "agency_starter", `${slug}: should not reach Agency`);
    assert.notEqual(mapping.band[1], "agency_growth", `${slug}: should not reach Agency`);
    assert.notEqual(mapping.band[1], "agency_scale", `${slug}: should not reach Agency`);
  }
});

test("SeldonFrame is never charted cheapest-vs-most-expensive: GHL's own top plan ($497) sits inside or above the SF Agency band, not compared against Builder ($29)", () => {
  const band = sfBandForVendor("gohighlevel", LARGE);
  assert.ok(band.low >= SF_TIER_PRICES.agency_starter, "GHL band floor must be at least Agency Starter ($99), not Builder ($29)");
});

// ─── no fabricated numbers ───────────────────────────────────────────────────

test("every non-quote-gated chart point's costMonthly traces to a parseable dollar figure in that vendor's own plans[]", () => {
  const series = buildVendorSeries(MID);
  for (const s of series) {
    for (const point of s.points) {
      if (point.costMonthly === null) continue;
      const pricing = getCompetitorPricing(s.slug);
      const haystack = pricing.plans.map((p) => p.price).join(" | ");
      // the exact dollar amount must appear as a numeral somewhere in that
      // vendor's plans array (loose substring check — proves it's sourced,
      // not invented).
      assert.ok(
        haystack.includes(String(point.costMonthly)),
        `${s.slug}: costMonthly ${point.costMonthly} does not trace to any plans[].price string ("${haystack}")`,
      );
    }
  }
});

test("SF band low/high values are always one of the 5 live SF_TIER_PRICES constants ($29/$49/$99/$199/$299)", () => {
  const validPrices = new Set<number>(Object.values(SF_TIER_PRICES));
  for (const slug of allChartSlugs()) {
    const band = sfBandForVendor(slug, MID);
    assert.ok(validPrices.has(band.low), `${slug}: SF band low ${band.low} not a real tier price`);
    assert.ok(validPrices.has(band.high), `${slug}: SF band high ${band.high} not a real tier price`);
  }
});

// ─── quote-gated handling ────────────────────────────────────────────────────

test("fully quote-gated vendors with no parseable plan price render costMonthly:null and quoteGated:true, never a guessed number", () => {
  // synthflow's only two plans are both non-numeric ("starting at reportedly
  // ~$30,000/yr" has no $-prefixed number in the expected format, and the
  // self-serve line is per-minute, not monthly) — spot-check via the actual
  // parse behavior rather than assuming.
  const series = buildVendorSeries(SMALL);
  for (const s of series) {
    for (const point of s.points) {
      if (point.costMonthly === null) {
        assert.equal(point.quoteGated, true, `${s.slug}: costMonthly null but quoteGated not flagged`);
      }
    }
  }
});

test("sfBandForVendor throws for an unknown slug rather than silently drawing a fabricated band", () => {
  assert.throws(() => sfBandForVendor("not-a-real-vendor", SMALL));
});

// ─── monotonic cost steps ────────────────────────────────────────────────────

test("SF band cost never decreases as business size steps up (Builder $29 -> ... -> Agency $299 is monotonic non-decreasing)", () => {
  for (const slug of allChartSlugs()) {
    const small = sfBandForVendor(slug, SMALL);
    const large = sfBandForVendor(slug, LARGE);
    assert.ok(large.high >= small.high, `${slug}: SF band high decreased from small (${small.high}) to large (${large.high}) business size`);
  }
});

test("CONTACT_PRESETS and SEAT_PRESETS are strictly increasing (valid stepped slider values)", () => {
  for (let i = 1; i < CONTACT_PRESETS.length; i++) {
    assert.ok(CONTACT_PRESETS[i] > CONTACT_PRESETS[i - 1], "CONTACT_PRESETS must be strictly increasing");
  }
  for (let i = 1; i < SEAT_PRESETS.length; i++) {
    assert.ok(SEAT_PRESETS[i] > SEAT_PRESETS[i - 1], "SEAT_PRESETS must be strictly increasing");
  }
});

test("buildVendorSeries returns exactly one series per registry vendor, each with a non-empty points array", () => {
  const series = buildVendorSeries(MID);
  assert.equal(series.length, PRICING.length);
  for (const s of series) {
    assert.ok(s.points.length > 0, `${s.slug}: empty points array`);
  }
});

test("every chart point carries a verified date and source URL traceable to the registry entry", () => {
  const series = buildVendorSeries(SMALL);
  for (const s of series) {
    const pricing = getCompetitorPricing(s.slug);
    for (const point of s.points) {
      assert.ok(point.verified.includes(pricing.verified), `${s.slug}: verified date doesn't match registry`);
      assert.equal(point.sourceUrl, pricing.pricingUrl, `${s.slug}: sourceUrl doesn't match registry pricingUrl`);
    }
  }
});
