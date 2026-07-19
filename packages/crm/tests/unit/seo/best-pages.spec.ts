// TDD guardrail for the /best/<category>-for-<audience> registry — mirrors
// agent-pages.spec.ts's style: unique slugs, every curated combo resolves,
// bestSlug round-trips, every fitNotes key is a valid AudienceGroup, every
// category has enough contenders/FAQ, and the must-ship slugs (Max's video
// targets) are present.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  BEST_CATEGORIES,
  BEST_AUDIENCES,
  BEST_PAGES,
  bestSlug,
  getBestPage,
  getBestCategory,
  getBestAudience,
  allBestSlugs,
  type AudienceGroup,
} from "../../../src/lib/seo/best-pages";
import { renderBestMarkdown } from "../../../src/lib/seo/best-markdown";
import { monthYearToIso, composeCheapestOption } from "../../../src/components/seo/best-page";

const AUDIENCE_GROUPS: ReadonlySet<AudienceGroup> = new Set(["trades", "beauty", "medical", "construction", "general"]);

// ─── registry shape ─────────────────────────────────────────────────────────

test("category slugs are unique", () => {
  const slugs = BEST_CATEGORIES.map((c) => c.slug);
  assert.equal(new Set(slugs).size, slugs.length, "duplicate category slug");
});

test("audience slugs are unique", () => {
  const slugs = BEST_AUDIENCES.map((a) => a.slug);
  assert.equal(new Set(slugs).size, slugs.length, "duplicate audience slug");
});

test("BEST_PAGES combos are unique", () => {
  const slugs = BEST_PAGES.map(bestSlug);
  assert.equal(new Set(slugs).size, slugs.length, "duplicate combo slug");
});

// ─── lookups ────────────────────────────────────────────────────────────────

test("getBestCategory returns the right category and throws on unknown", () => {
  assert.equal(getBestCategory("crm").nounPlural, "CRMs");
  assert.throws(() => getBestCategory("not-a-real-category"), /unknown best-page category/);
});

test("getBestAudience returns the right audience and throws on unknown", () => {
  assert.equal(getBestAudience("plumbers").label, "Plumbers");
  assert.throws(() => getBestAudience("not-a-real-audience"), /unknown best-page audience/);
});

test("bestSlug round-trips through getBestPage for every combo", () => {
  for (const page of BEST_PAGES) {
    const slug = bestSlug(page);
    const resolved = getBestPage(slug);
    assert.equal(resolved.page.category, page.category);
    assert.equal(resolved.page.audience, page.audience);
    assert.equal(resolved.category.slug, page.category);
    assert.equal(resolved.audience.slug, page.audience);
  }
});

test("getBestPage throws on an unknown slug", () => {
  assert.throws(() => getBestPage("not-a-real-slug"), /unknown best-page slug/);
});

test("every BEST_PAGES combo resolves (category and audience both exist)", () => {
  for (const page of BEST_PAGES) {
    assert.doesNotThrow(() => getBestCategory(page.category), `category ${page.category} missing`);
    assert.doesNotThrow(() => getBestAudience(page.audience), `audience ${page.audience} missing`);
  }
});

test("allBestSlugs matches BEST_PAGES length and has no duplicates", () => {
  const slugs = allBestSlugs();
  assert.equal(slugs.length, BEST_PAGES.length);
  assert.equal(new Set(slugs).size, slugs.length);
});

// ─── fitNotes validity ──────────────────────────────────────────────────────

test("every contender fitNotes key is a valid AudienceGroup", () => {
  for (const category of BEST_CATEGORIES) {
    for (const contender of category.contenders) {
      if (!contender.fitNotes) continue;
      for (const key of Object.keys(contender.fitNotes)) {
        assert.ok(
          AUDIENCE_GROUPS.has(key as AudienceGroup),
          `${category.slug}/${contender.key}: invalid fitNotes group '${key}'`,
        );
      }
    }
  }
});

// ─── category shape ─────────────────────────────────────────────────────────

for (const category of BEST_CATEGORIES) {
  test(`category '${category.slug}' has ≥4 contenders`, () => {
    assert.ok(category.contenders.length >= 4, `expected ≥4 contenders, got ${category.contenders.length}`);
  });

  test(`category '${category.slug}' has ≥3 FAQ entries`, () => {
    assert.ok(category.faq.length >= 3, `expected ≥3 faq, got ${category.faq.length}`);
    for (const item of category.faq) {
      assert.ok(item.q.trim().length > 0, `${category.slug}: empty FAQ question`);
      assert.ok(item.a.trim().length > 0, `${category.slug}: empty FAQ answer`);
    }
  });

  test(`category '${category.slug}' every contender has a genuine strengths list and a real watchOut`, () => {
    for (const c of category.contenders) {
      assert.ok(c.strengths.length >= 2, `${category.slug}/${c.key}: expected ≥2 strengths`);
      assert.ok(c.watchOut.trim().length > 10, `${category.slug}/${c.key}: watchOut too short/empty`);
      assert.ok(c.from.trim().length > 0, `${category.slug}/${c.key}: empty price line`);
    }
  });

  test(`category '${category.slug}' has non-empty sfPitch and freeAngle`, () => {
    assert.ok(category.sfPitch.trim().length > 20, `${category.slug}: sfPitch too short`);
    assert.ok(category.freeAngle.trim().length > 20, `${category.slug}: freeAngle too short`);
  });
}

for (const audience of BEST_AUDIENCES) {
  test(`audience '${audience.slug}' has label, painHook, exampleService`, () => {
    assert.ok(audience.label.trim().length > 0, `${audience.slug}: empty label`);
    assert.ok(audience.painHook.trim().length > 10, `${audience.slug}: painHook too short`);
    assert.ok(audience.exampleService.trim().length > 0, `${audience.slug}: empty exampleService`);
  });
}

// ─── must-ship slugs (Max's YouTube targets) ───────────────────────────────

test("all must-ship slugs are present", () => {
  const expected = [
    "crm-for-small-business",
    "website-builder-for-small-business",
    "website-builder-for-construction-companies",
    "booking-system-for-small-business",
    "booking-app-for-small-business",
    "booking-system-for-beauty-businesses",
    "ai-receptionist-for-small-business",
    "crm-for-plumbers",
    "booking-system-for-med-spas",
    "website-builder-for-hvac",
  ];
  const have = new Set(allBestSlugs());
  for (const slug of expected) {
    assert.ok(have.has(slug), `missing must-ship slug: ${slug}`);
  }
});

test("total combo count is roughly the curated matrix (~30-40)", () => {
  assert.ok(BEST_PAGES.length >= 30 && BEST_PAGES.length <= 40, `expected 30-40 combos, got ${BEST_PAGES.length}`);
});

// ─── markdown twin ──────────────────────────────────────────────────────────

test("renderBestMarkdown returns non-empty markdown containing the H1 keyword for a sample slug", () => {
  const md = renderBestMarkdown("crm-for-small-business");
  assert.ok(md.length > 200, "markdown output too short");
  assert.match(md, /# The \d+ Best CRMs for Small Businesses \(2026\)/);
  assert.match(md, /SeldonFrame/);
});

test("renderBestMarkdown works for every curated slug without throwing", () => {
  for (const slug of allBestSlugs()) {
    assert.doesNotThrow(() => renderBestMarkdown(slug), `renderBestMarkdown threw for ${slug}`);
    const md = renderBestMarkdown(slug);
    assert.ok(md.length > 100, `${slug}: markdown output too short`);
  }
});

// ─── composition sanity across the whole matrix ────────────────────────────

test("no stray undefined/null leaks into any rendered markdown", () => {
  for (const slug of allBestSlugs()) {
    const md = renderBestMarkdown(slug);
    assert.ok(!/\bundefined\b|\bnull\b/.test(md), `${slug}: leaked undefined/null into markdown`);
  }
});

// ─── citable-listicle architecture additions ───────────────────────────────

test("every contender sourceUrl, when present, is https and has no spaces", () => {
  for (const category of BEST_CATEGORIES) {
    for (const c of category.contenders) {
      if (!c.sourceUrl) continue;
      assert.ok(c.sourceUrl.startsWith("https://"), `${category.slug}/${c.key}: sourceUrl must be https://, got "${c.sourceUrl}"`);
      assert.ok(!/\s/.test(c.sourceUrl), `${category.slug}/${c.key}: sourceUrl contains whitespace: "${c.sourceUrl}"`);
    }
  }
});

test("monthYearToIso handles all 12 months and rejects garbage", () => {
  assert.equal(monthYearToIso("January 2026"), "2026-01-01");
  assert.equal(monthYearToIso("February 2026"), "2026-02-01");
  assert.equal(monthYearToIso("March 2026"), "2026-03-01");
  assert.equal(monthYearToIso("April 2026"), "2026-04-01");
  assert.equal(monthYearToIso("May 2026"), "2026-05-01");
  assert.equal(monthYearToIso("June 2026"), "2026-06-01");
  assert.equal(monthYearToIso("July 2026"), "2026-07-01");
  assert.equal(monthYearToIso("August 2026"), "2026-08-01");
  assert.equal(monthYearToIso("September 2026"), "2026-09-01");
  assert.equal(monthYearToIso("October 2026"), "2026-10-01");
  assert.equal(monthYearToIso("November 2026"), "2026-11-01");
  assert.equal(monthYearToIso("December 2026"), "2026-12-01");
  assert.throws(() => monthYearToIso("not a date"), /unrecognized/);
  assert.throws(() => monthYearToIso("Julember 2026"), /unrecognized/);
  assert.throws(() => monthYearToIso("2026"), /unrecognized/);
  assert.throws(() => monthYearToIso(""), /unrecognized/);
});

test("composeCheapestOption never claims a free plan off a 'no free tier' price line", () => {
  for (const category of BEST_CATEGORIES) {
    const line = composeCheapestOption(category);
    if (line.endsWith("(has a free plan)")) {
      assert.ok(!/no free/i.test(line), `${category.slug}: claimed a free plan on a 'no free' price line: ${line}`);
    }
  }
  // Regression: Lindy's "(7-day trial; no free tier)" must not be picked as the
  // free option — Zapier Agents is the first contender with a real free tier.
  assert.match(composeCheapestOption(getBestCategory("everyday-ai-agent")), /^Zapier Agents/);
});

test("renderBestMarkdown for a sample slug contains the quick-picks and methodology sections", () => {
  const md = renderBestMarkdown("crm-for-small-business");
  assert.match(md, /## Our picks at a glance/);
  assert.match(md, /## How we ranked/);
  assert.match(md, /Reviewed by Maxime Houle, Founder, SeldonFrame/);
});
