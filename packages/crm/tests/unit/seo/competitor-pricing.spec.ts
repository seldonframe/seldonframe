// TDD guardrail for the "[Competitor] pricing" registry — mirrors
// alternative-pages/best-pages spec style: slug parity with the alternative-pages
// registry, sane non-empty markdown for every page, quote-gated entries say so,
// every pricingUrl is a real https link, and `verified` matches the expected
// "Month YYYY" shape.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { PRICING, getCompetitorPricing, allPricingSlugs } from "../../../src/lib/seo/competitor-pricing";
import { COMPETITORS } from "../../../src/lib/seo/alternative-pages";
import { renderCompetitorPricingMarkdown } from "../../../src/lib/seo/competitor-pricing-markdown";

// ─── registry shape ─────────────────────────────────────────────────────────

test("PRICING has exactly 25 entries", () => {
  assert.equal(PRICING.length, 25);
});

test("PRICING slugs are unique", () => {
  const slugs = allPricingSlugs();
  assert.equal(new Set(slugs).size, slugs.length, "duplicate competitor-pricing slug");
});

test("every PRICING slug matches a slug in the alternative-pages COMPETITORS registry (set equality)", () => {
  const pricingSlugs = new Set(allPricingSlugs());
  const altSlugs = new Set(COMPETITORS.map((c) => c.slug).filter((s) => s !== "claude-projects"));
  assert.deepEqual(pricingSlugs, altSlugs, "competitor-pricing slugs must exactly match alternative-pages slugs (excluding claude-projects, which has no pricing page)");
});

test("getCompetitorPricing throws for an unknown slug", () => {
  assert.throws(() => getCompetitorPricing("not-a-real-competitor"));
});

test("getCompetitorPricing resolves every PRICING slug", () => {
  for (const p of PRICING) {
    assert.doesNotThrow(() => getCompetitorPricing(p.slug), `${p.slug}: getCompetitorPricing threw`);
  }
});

// ─── per-entry field sanity ──────────────────────────────────────────────────

for (const p of PRICING) {
  test(`'${p.slug}': pricingUrl starts with https://`, () => {
    assert.match(p.pricingUrl, /^https:\/\//, `${p.slug}: pricingUrl must start with https://`);
  });

  test(`'${p.slug}': verified matches "Month YYYY"`, () => {
    assert.match(p.verified, /^[A-Z][a-z]+ 20\d\d$/, `${p.slug}: verified must look like "July 2026"`);
  });

  test(`'${p.slug}': has at least one plan`, () => {
    assert.ok(p.plans.length > 0, `${p.slug}: plans array empty`);
  });

  test(`'${p.slug}': has at least one stack entry`, () => {
    assert.ok(p.stacks.length > 0, `${p.slug}: stacks array empty (every competitor has SOME add-on/meter/cap)`);
  });

  test(`'${p.slug}': bottomLine is non-empty prose`, () => {
    assert.ok(p.bottomLine.trim().length > 40, `${p.slug}: bottomLine too short/empty`);
  });

  if (p.quoteGated) {
    test(`'${p.slug}': quote-gated entries contain "quote" or "contact sales" language`, () => {
      const haystack = JSON.stringify(p).toLowerCase();
      assert.ok(
        haystack.includes("quote") || haystack.includes("contact sales") || haystack.includes("talk to sales"),
        `${p.slug}: quoteGated:true but no "quote"/"contact sales"/"talk to sales" language found anywhere in the entry`,
      );
    });
  }
}

// ─── markdown twin ───────────────────────────────────────────────────────────

for (const p of PRICING) {
  test(`renderCompetitorPricingMarkdown('${p.slug}') returns sane, non-empty markdown`, () => {
    const md = renderCompetitorPricingMarkdown(p.slug);
    assert.ok(md.length > 300, `${p.slug}: markdown output too short`);
    assert.ok(md.includes("Pricing"), `${p.slug}: missing "Pricing" in heading`);
    assert.ok(!/\bundefined\b/.test(md), `${p.slug}: leaked "undefined" into markdown`);
    assert.ok(!/\bnull\b/.test(md), `${p.slug}: leaked "null" into markdown`);
  });

  test(`renderCompetitorPricingMarkdown('${p.slug}') includes the sources line with the real pricingUrl`, () => {
    const md = renderCompetitorPricingMarkdown(p.slug);
    assert.ok(md.includes(p.pricingUrl), `${p.slug}: markdown missing the source pricingUrl`);
  });
}

test("renderCompetitorPricingMarkdown throws for an unknown slug", () => {
  assert.throws(() => renderCompetitorPricingMarkdown("not-a-real-competitor"));
});
