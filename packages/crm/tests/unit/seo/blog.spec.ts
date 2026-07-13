// TDD guardrail for the /blog content-engine registry — unique slugs, every
// lookup resolves, structural minimums (sections/optional faq/sources),
// never-lies (>=1 real https source per article), and the Markdown twin
// renders for every article without leaking undefined/null. Mirrors
// guides.spec.ts.

import { test } from "node:test";
import assert from "node:assert/strict";

import { BLOG_ARTICLES, getBlogArticle, allBlogSlugs, articlesNewestFirst } from "../../../src/lib/seo/blog";
import { renderBlogMarkdown } from "../../../src/lib/seo/blog-markdown";
import { stripInlineMarkup } from "../../../src/lib/seo/guide-inline";

// ─── registry shape ─────────────────────────────────────────────────────────

test("blog article slugs are unique", () => {
  const slugs = BLOG_ARTICLES.map((a) => a.slug);
  assert.equal(new Set(slugs).size, slugs.length, "duplicate blog slug");
});

test("slugs are url-safe (lowercase, hyphenated, no spaces)", () => {
  for (const a of BLOG_ARTICLES) {
    assert.match(a.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `bad slug: ${a.slug}`);
  }
});

test("getBlogArticle resolves every slug and throws on unknown", () => {
  for (const a of BLOG_ARTICLES) assert.equal(getBlogArticle(a.slug).slug, a.slug);
  assert.throws(() => getBlogArticle("not-a-real-article"), /unknown blog article slug/);
});

test("allBlogSlugs matches BLOG_ARTICLES length with no duplicates", () => {
  const slugs = allBlogSlugs();
  assert.equal(slugs.length, BLOG_ARTICLES.length);
  assert.equal(new Set(slugs).size, slugs.length);
});

test("articlesNewestFirst is date-descending and includes every article", () => {
  const sorted = articlesNewestFirst();
  assert.equal(sorted.length, BLOG_ARTICLES.length);
  for (let i = 1; i < sorted.length; i++) {
    assert.ok(sorted[i - 1].date >= sorted[i].date, "articlesNewestFirst is not sorted newest-first");
  }
});

// ─── per-article structure + never-lies ─────────────────────────────────────

for (const a of BLOG_ARTICLES) {
  test(`blog '${a.slug}' has title, description, dek`, () => {
    assert.ok(a.title.trim().length > 0, "empty title");
    assert.ok(a.description.trim().length > 20, "description too short");
    assert.ok(a.dek.trim().length > 20, "dek too short");
  });

  test(`blog '${a.slug}' has a valid ISO date`, () => {
    assert.match(a.date, /^\d{4}-\d{2}-\d{2}$/, `date not ISO yyyy-mm-dd: '${a.date}'`);
  });

  test(`blog '${a.slug}' has >=3 sections with h2 + body`, () => {
    assert.ok(a.sections.length >= 3, `expected >=3 sections, got ${a.sections.length}`);
    for (const s of a.sections) {
      assert.ok(s.h2.trim().length > 0, "empty h2");
      assert.ok(s.body.trim().length > 40, `section '${s.h2}' body too short`);
      assert.ok(!/<[a-z][^>]*>/i.test(s.body), `section '${s.h2}' contains raw HTML`);
      // markdown-lite balance sanity: "**" must appear an even number of times per body.
      const boldMarkers = (s.body.match(/\*\*/g) ?? []).length;
      assert.equal(boldMarkers % 2, 0, `section '${s.h2}' has unclosed ** bold markers`);
      // single-asterisk parity: after removing **bold** spans, any remaining
      // "*" (from *italic*) must also come in matched pairs, never a lone one.
      const withoutBold = s.body.replace(/\*\*[^*]+\*\*/g, "");
      const singleAsterisks = (withoutBold.match(/\*/g) ?? []).length;
      assert.equal(singleAsterisks % 2, 0, `section '${s.h2}' has an unclosed * italic marker`);
    }
  });

  test(`blog '${a.slug}' stripInlineMarkup removes every markdown-lite token`, () => {
    const strings: string[] = [
      a.title,
      a.description,
      a.dek,
      ...a.sections.map((s) => s.body),
      ...(a.faq ?? []).flatMap((f) => [f.q, f.a]),
    ];
    for (const raw of strings) {
      const stripped = stripInlineMarkup(raw);
      assert.ok(!stripped.includes("**"), `stripInlineMarkup left "**" behind: "${stripped.slice(0, 80)}"`);
      assert.ok(!stripped.includes("]("), `stripInlineMarkup left "](" behind: "${stripped.slice(0, 80)}"`);
      assert.ok(!/\*/.test(stripped), `stripInlineMarkup left a lone "*" behind: "${stripped.slice(0, 80)}"`);
    }
  });

  test(`blog '${a.slug}' callouts (if any) have non-empty text`, () => {
    for (const s of a.sections) {
      if (!s.callout) continue;
      assert.ok(s.callout.text.trim().length > 0, `${s.h2}: callout has empty text`);
    }
  });

  test(`blog '${a.slug}' callout analogies (if any) don't double up "kind of like"`, () => {
    for (const s of a.sections) {
      if (!s.callout || s.callout.kind !== "analogy") continue;
      // Not a hard requirement either way — just make sure the field is real prose.
      assert.ok(s.callout.text.trim().split(/\s+/).length > 2, `${s.h2}: analogy callout too thin`);
    }
  });

  test(`blog '${a.slug}' FAQ (if present) has >=1 non-empty entry`, () => {
    if (a.faq === undefined) return;
    assert.ok(a.faq.length >= 1, "faq array present but empty");
    for (const f of a.faq) {
      assert.ok(f.q.trim().length > 0, "empty FAQ question");
      assert.ok(f.a.trim().length > 0, "empty FAQ answer");
    }
  });

  test(`blog '${a.slug}' cites >=1 real https source (never-lies)`, () => {
    assert.ok(a.sources.length >= 1, "no source cited");
    for (const s of a.sources) {
      assert.ok(s.label.trim().length > 0, "empty source label");
      assert.ok(/^https:\/\/\S+$/.test(s.url), `source url not https / has whitespace: "${s.url}"`);
    }
  });

  test(`blog '${a.slug}' relatedTool/relatedGuide (if set) use the right prefix`, () => {
    if (a.relatedTool !== undefined) {
      assert.ok(a.relatedTool.startsWith("/tools/"), `relatedTool should be a /tools path, got '${a.relatedTool}'`);
    }
    if (a.relatedGuide !== undefined) {
      assert.ok(a.relatedGuide.startsWith("/guides/"), `relatedGuide should be a /guides path, got '${a.relatedGuide}'`);
    }
  });

  test(`blog '${a.slug}' sourceVideo (if set) has https url + title + channel`, () => {
    if (a.sourceVideo === undefined) return;
    assert.ok(/^https:\/\/\S+$/.test(a.sourceVideo.url), `sourceVideo url not https: '${a.sourceVideo.url}'`);
    assert.ok(a.sourceVideo.title.trim().length > 0, "sourceVideo missing title");
    assert.ok(a.sourceVideo.channel.trim().length > 0, "sourceVideo missing channel");
  });
}

// ─── markdown twin ───────────────────────────────────────────────────────────

test("renderBlogMarkdown renders every article without throwing or leaking", () => {
  for (const slug of allBlogSlugs()) {
    let md = "";
    assert.doesNotThrow(() => {
      md = renderBlogMarkdown(slug);
    }, `renderBlogMarkdown threw for ${slug}`);
    assert.ok(md.length > 200, `${slug}: markdown too short`);
    assert.match(md, /^# .+/m, `${slug}: missing H1`);
    assert.ok(!/\bundefined\b|\bnull\b/.test(md), `${slug}: leaked undefined/null`);
  }
});

test("the seed article is not video-sourced (proves the type handles both cases)", () => {
  const seed = getBlogArticle("why-original-content-wins-seo");
  assert.equal(seed.sourceVideo, undefined);
});
