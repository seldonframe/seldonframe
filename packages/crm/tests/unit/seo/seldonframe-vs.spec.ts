// TDD guardrail for the flagship /compare/seldonframe-vs-<slug> pages —
// mirrors best-pages.spec.ts's style: for every competitor in the registry,
// the markdown twin renders sane content, getExtras resolves (guards against
// a registry/extras drift), and the composed FAQ builders return well-formed
// items.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { COMPETITORS, getCompetitor } from "../../../src/lib/seo/alternative-pages";
import { getExtras } from "../../../src/lib/seo/alternative-pages-extras";
import { renderSeldonframeVsMarkdown } from "../../../src/lib/seo/seldonframe-vs-markdown";
import { composeSeldonframeVsFaq } from "../../../src/components/seo/seldonframe-vs-page";
import { composeVsFaq } from "../../../src/components/seo/vs-page";

// ─── every competitor: markdown twin + extras resolve ──────────────────────

for (const c of COMPETITORS) {
  test(`renderSeldonframeVsMarkdown('${c.slug}') returns sane, non-empty markdown`, () => {
    const md = renderSeldonframeVsMarkdown(c);
    assert.ok(md.length > 300, `${c.slug}: markdown output too short`);
    assert.match(md, new RegExp(`SeldonFrame vs ${escapeRegExp(c.name)}`));
    assert.ok(md.includes(c.them.pricingModel), `${c.slug}: missing competitor pricingModel string`);
    assert.ok(!/\bundefined\b|\bnull\b/.test(md), `${c.slug}: leaked undefined/null into markdown`);
  });

  test(`getExtras resolves for competitor '${c.slug}' (registry/extras mismatch guard)`, () => {
    assert.doesNotThrow(() => getExtras(c.slug), `${c.slug}: missing extras entry`);
    const x = getExtras(c.slug);
    assert.ok(x.pros.length > 0, `${c.slug}: extras.pros empty`);
    assert.ok(x.cons.length > 0, `${c.slug}: extras.cons empty`);
    assert.ok(x.chooseThem.length > 0, `${c.slug}: extras.chooseThem empty`);
    assert.ok(x.chooseSf.length > 0, `${c.slug}: extras.chooseSf empty`);
    assert.ok(x.switchNote.trim().length > 0, `${c.slug}: extras.switchNote empty`);
  });
}

// ─── composed FAQ builders ──────────────────────────────────────────────────

test("composeSeldonframeVsFaq returns 2 well-formed items for a sample competitor", () => {
  const c = getCompetitor("gohighlevel");
  const items = composeSeldonframeVsFaq(c);
  assert.equal(items.length, 2);
  for (const item of items) {
    assert.ok(item.q.trim().length > 0, "empty FAQ question");
    assert.ok(item.a.trim().length > 0, "empty FAQ answer");
  }
  assert.match(items[0].q, /good GoHighLevel alternative/);
  assert.match(items[0].a, /\/alternative-to-gohighlevel/);
  assert.match(items[1].q, /How much does GoHighLevel cost/);
  assert.ok(items[1].a.includes(c.them.pricingModel));
});

test("composeVsFaq returns 4 well-formed items for a sample pair", () => {
  const a = getCompetitor("gohighlevel");
  const b = getCompetitor("vendasta");
  const items = composeVsFaq(a, b);
  assert.equal(items.length, 4);
  for (const item of items) {
    assert.ok(item.q.trim().length > 0, "empty FAQ question");
    assert.ok(item.a.trim().length > 0, "empty FAQ answer");
    assert.ok(!/\bundefined\b|\bnull\b/.test(item.q + item.a), "leaked undefined/null into composed FAQ");
  }
  assert.match(items[0].q, /Which is better/);
  assert.ok(items[0].a.includes(a.whenTheyWin));
  assert.ok(items[0].a.includes(b.whenTheyWin));
  assert.match(items[1].q, /What does GoHighLevel cost vs Vendasta/);
  assert.ok(items[1].a.includes(a.them.pricingModel));
  assert.ok(items[1].a.includes(b.them.pricingModel));
  assert.match(items[2].q, /alternative to both/);
  assert.match(items[3].q, /Can I switch/);
  assert.ok(items[3].a.includes("/alternative-to-gohighlevel"));
  assert.ok(items[3].a.includes("/alternative-to-vendasta"));
});

// ─── agency price-anchor banding (Max, 2026-07-16) ─────────────────────────
// On agency-audience comparison surfaces, $99-$299 is the lead anchor and
// $29 is demoted to a solo aside; solo surfaces keep $29/mo flat as the
// anchor; mixed surfaces carry both without leading with either.

test("gohighlevel (agency band): pricing anchor leads with $99, FAQ never pairs 'agencies' with '$29/mo flat' as the lead", () => {
  const c = getCompetitor("gohighlevel");
  assert.equal(c.audience, "agency");
  const md = renderSeldonframeVsMarkdown(c);
  assert.match(md, /\$99/, "gohighlevel vs-page markdown missing the $99 agency anchor");
  const faqItems = composeSeldonframeVsFaq(c);
  assert.doesNotMatch(
    faqItems[0].a,
    /agencies and builders, yes.*\$29\/mo flat instead of/i,
    "gohighlevel FAQ still leads agencies with the bare $29/mo flat anchor",
  );
  assert.match(faqItems[0].a, /\$99/, "gohighlevel FAQ answer should carry the agency anchor");
});

test("durable and linktree (solo band): still anchor '$29/mo flat'", () => {
  for (const slug of ["durable", "linktree"]) {
    const c = getCompetitor(slug);
    assert.equal(c.audience, "solo");
    const faqItems = composeSeldonframeVsFaq(c);
    assert.match(faqItems[0].a, /\$29\/mo flat/, `${slug} FAQ answer should still anchor $29/mo flat`);
  }
});

test("hubspot (mixed band): carries both the solo and agency anchors", () => {
  const c = getCompetitor("hubspot");
  assert.equal(c.audience, "mixed");
  const faqItems = composeSeldonframeVsFaq(c);
  assert.match(faqItems[0].a, /\$29\/mo flat/, "mixed anchor should still mention $29/mo flat solo");
  assert.match(faqItems[0].a, /\$99/, "mixed anchor should still mention the $99+ agency tier");
});

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
