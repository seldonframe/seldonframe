// TDD guardrail for the /guides content-engine registry — unique slugs, every
// lookup resolves, structural minimums (sections/faq/sources), never-lies
// (>=1 real https source per article), valid cluster + related links, and the
// Markdown twin renders for every guide without leaking undefined/null.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  GUIDES,
  CLUSTER_LABELS,
  getGuide,
  allGuideSlugs,
  guidesInCluster,
  populatedClusters,
  type GuideCluster,
} from "../../../src/lib/seo/guides";
import { renderGuideMarkdown } from "../../../src/lib/seo/guide-markdown";

const CLUSTERS: ReadonlySet<GuideCluster> = new Set(Object.keys(CLUSTER_LABELS) as GuideCluster[]);

// ─── registry shape ─────────────────────────────────────────────────────────

test("guide slugs are unique", () => {
  const slugs = GUIDES.map((g) => g.slug);
  assert.equal(new Set(slugs).size, slugs.length, "duplicate guide slug");
});

test("slugs are url-safe (lowercase, hyphenated, no spaces)", () => {
  for (const g of GUIDES) {
    assert.match(g.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `bad slug: ${g.slug}`);
  }
});

test("getGuide resolves every slug and throws on unknown", () => {
  for (const g of GUIDES) assert.equal(getGuide(g.slug).slug, g.slug);
  assert.throws(() => getGuide("not-a-real-guide"), /unknown guide slug/);
});

test("allGuideSlugs matches GUIDES length with no duplicates", () => {
  const slugs = allGuideSlugs();
  assert.equal(slugs.length, GUIDES.length);
  assert.equal(new Set(slugs).size, slugs.length);
});

// ─── per-guide structure + never-lies ───────────────────────────────────────

for (const g of GUIDES) {
  test(`guide '${g.slug}' has title, description, targetKeyword`, () => {
    assert.ok(g.title.trim().length > 0, "empty title");
    assert.ok(g.description.trim().length > 20, "description too short");
    assert.ok(g.targetKeyword.trim().length > 0, "empty targetKeyword");
    assert.ok(g.dek.trim().length > 20, "dek too short");
  });

  test(`guide '${g.slug}' has a valid cluster`, () => {
    assert.ok(CLUSTERS.has(g.cluster), `invalid cluster '${g.cluster}'`);
  });

  test(`guide '${g.slug}' has >=3 sections with h2 + body`, () => {
    assert.ok(g.sections.length >= 3, `expected >=3 sections, got ${g.sections.length}`);
    for (const s of g.sections) {
      assert.ok(s.h2.trim().length > 0, "empty h2");
      assert.ok(s.body.trim().length > 40, `section '${s.h2}' body too short`);
      assert.ok(!/<[a-z][^>]*>/i.test(s.body), `section '${s.h2}' contains raw HTML`);
    }
  });

  test(`guide '${g.slug}' has >=2 FAQ entries`, () => {
    assert.ok(g.faq.length >= 2, `expected >=2 faq, got ${g.faq.length}`);
    for (const f of g.faq) {
      assert.ok(f.q.trim().length > 0, "empty FAQ question");
      assert.ok(f.a.trim().length > 0, "empty FAQ answer");
    }
  });

  test(`guide '${g.slug}' cites >=1 real https source (never-lies)`, () => {
    assert.ok(g.sources.length >= 1, "no source cited");
    for (const s of g.sources) {
      assert.ok(s.label.trim().length > 0, "empty source label");
      assert.ok(/^https:\/\/\S+$/.test(s.url), `source url not https / has whitespace: "${s.url}"`);
    }
  });

  test(`guide '${g.slug}' links to a /tools pillar and any relatedBest is a path`, () => {
    assert.ok(g.relatedTool.startsWith("/tools/"), `relatedTool should be a /tools path, got '${g.relatedTool}'`);
    if (g.relatedBest !== undefined) {
      assert.ok(g.relatedBest.startsWith("/"), `relatedBest should be a path, got '${g.relatedBest}'`);
    }
  });
}

// ─── clusters ────────────────────────────────────────────────────────────────

test("guidesInCluster + populatedClusters are consistent with GUIDES", () => {
  const total = populatedClusters().reduce((n, c) => n + c.guides.length, 0);
  assert.equal(total, GUIDES.length, "populatedClusters dropped or duplicated guides");
  for (const c of populatedClusters()) {
    assert.equal(c.guides.length, guidesInCluster(c.cluster).length);
    assert.ok(c.label.trim().length > 0, `cluster '${c.cluster}' has no label`);
  }
});

// ─── markdown twin ───────────────────────────────────────────────────────────

test("renderGuideMarkdown renders every guide without throwing or leaking", () => {
  for (const slug of allGuideSlugs()) {
    let md = "";
    assert.doesNotThrow(() => {
      md = renderGuideMarkdown(slug);
    }, `renderGuideMarkdown threw for ${slug}`);
    assert.ok(md.length > 200, `${slug}: markdown too short`);
    assert.match(md, /^# .+/m, `${slug}: missing H1`);
    assert.ok(!/\bundefined\b|\bnull\b/.test(md), `${slug}: leaked undefined/null`);
  }
});
