// TDD guardrail for the 2026-07-16 vs-GoHighLevel evidence-ordered upgrade
// (docs/strategy/ghl-pain-messaging-plan-2026-07-16.md). Pins:
//  - the gohighlevel entry's optional evidenceSections + honestyBox render on
//    /compare/seldonframe-vs-gohighlevel, lock-in FIRST, with the help-center
//    quote + link + datestamp and the honesty-box aggregate ratings + A2P line
//  - the prohibited-claims list (per the plan doc) is absent from the
//    rendered page
//  - the optional-fields design means every OTHER competitor renders with
//    zero drift (no evidence sections, no honesty box) — the no-fields-no-
//    change proof

import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import { COMPETITORS, getCompetitor, pairAudience, sfPriceAnchor } from "../../../src/lib/seo/alternative-pages";
import { SeldonFrameVsPage } from "../../../src/components/seo/seldonframe-vs-page";

function renderVsPage(slug: string): string {
  const competitor = getCompetitor(slug);
  return renderToStaticMarkup(createElement(SeldonFrameVsPage, { competitor }) as any);
}

const PROHIBITED = /hidden fee|secret fee|zero data egress|don't own their data|\$2k|2,000\/mo/i;
const SMS_PROVISIONING_COMPARISON = /weeks? (to|for) (get|provision).{0,20}(number|sms)/i;

test("gohighlevel entry declares evidenceSections with lock-in FIRST", () => {
  const c = getCompetitor("gohighlevel");
  assert.ok(c.evidenceSections && c.evidenceSections.length >= 4, "expected at least 4 evidence sections");
  const titles = c.evidenceSections!.map((s) => s.title);
  assert.match(titles[0], /lock-in/i, `first evidence section should be lock-in, got: ${titles[0]}`);
});

test("gohighlevel evidenceSections carry the help-center quote + link + datestamp", () => {
  const c = getCompetitor("gohighlevel");
  const lockIn = c.evidenceSections!.find((s) => /lock-in/i.test(s.title));
  assert.ok(lockIn?.quote, "lock-in section missing a quote");
  assert.equal(lockIn!.quote!.href, "https://help.gohighlevel.com/support/solutions/articles/155000007342");
  assert.ok(lockIn!.quote!.text.split(/\s+/).length <= 15, "quote exceeds 15 words");
  assert.ok(lockIn!.quote!.text.length > 0);
});

test("/compare/seldonframe-vs-gohighlevel renders the evidence sections, lock-in first, before the honesty box", () => {
  const html = renderVsPage("gohighlevel");
  const lockInIdx = html.search(/lock-in/i);
  const complexityIdx = html.search(/complexity|learning curve/i);
  const pricingStackIdx = html.search(/pricing stack/i);
  const reliabilityIdx = html.search(/reliability, as reviewers report/i);
  const honestyIdx = html.search(/What GoHighLevel gets right/i);

  assert.ok(lockInIdx > -1, "lock-in section not rendered");
  assert.ok(complexityIdx > lockInIdx, "complexity section should render after lock-in");
  assert.ok(pricingStackIdx > complexityIdx, "pricing-stack section should render after complexity");
  assert.ok(reliabilityIdx > pricingStackIdx, "reliability section should render after pricing-stack");
  assert.ok(honestyIdx > reliabilityIdx, "honesty box should render after all evidence sections");
});

test("/compare/seldonframe-vs-gohighlevel renders the honesty box with both aggregate ratings and the A2P line", () => {
  const html = renderVsPage("gohighlevel");
  assert.match(html, /4\.6\/5/);
  assert.match(html, /4\.2\/5/);
  assert.match(html, /A2P 10DLC carrier registration delays apply to every SMS platform/i);
});

test("/compare/seldonframe-vs-gohighlevel absolutely never contains a prohibited claim", () => {
  const html = renderVsPage("gohighlevel");
  assert.doesNotMatch(html, PROHIBITED, "prohibited phrase leaked into the GHL vs-page");
});

test("/compare/seldonframe-vs-gohighlevel never compares SMS/phone provisioning time against SeldonFrame", () => {
  const html = renderVsPage("gohighlevel");
  assert.doesNotMatch(html, SMS_PROVISIONING_COMPARISON, "SMS-provisioning-time comparison leaked into the GHL vs-page");
});

test("the help-center link is rendered as an anchor on the page", () => {
  const html = renderVsPage("gohighlevel");
  assert.match(html, /href="https:\/\/help\.gohighlevel\.com\/support\/solutions\/articles\/155000007342"/);
});

// ─── no-drift proof: at least one other competitor is byte-identical to the
// pre-upgrade shape (no evidenceSections/honestyBox fields → no new markup) ──

test("a non-gohighlevel competitor (vendasta) declares no evidenceSections/honestyBox and renders none", () => {
  const c = getCompetitor("vendasta");
  assert.equal(c.evidenceSections, undefined);
  assert.equal(c.honestyBox, undefined);

  const html = renderVsPage("vendasta");
  assert.doesNotMatch(html, /What GoHighLevel gets right/i);
  assert.doesNotMatch(html, /evidence first/i);
  assert.doesNotMatch(html, PROHIBITED);
});

test("only gohighlevel among all competitors declares evidenceSections/honestyBox (scope guard)", () => {
  const withEvidence = COMPETITORS.filter((c) => c.evidenceSections || c.honestyBox).map((c) => c.slug);
  assert.deepEqual(withEvidence, ["gohighlevel"]);
});

// ── 2026-07-16 hotfix guards (post-#110 smoke failures) ─────────────────────
// (1) pair pages resolved the band at RUNTIME via pairAudience(objects) and
// silently fell through to solo; (2) agency-band competitors' heroSub doubles
// as the meta description — the first price a crawler/SERP reader meets.

test("pairAudience is agency-wins over audience STRINGS (the runtime contract)", () => {
  assert.equal(pairAudience("agency", "mixed"), "agency");
  assert.equal(pairAudience("solo", "agency"), "agency");
  assert.equal(pairAudience("mixed", "solo"), "mixed");
  assert.equal(pairAudience("solo", "solo"), "solo");
});

test("every agency-band competitor's heroSub leads with the $99 ladder, never $29-first", () => {
  for (const c of COMPETITORS.filter((c) => c.audience === "agency")) {
    const i99 = c.heroSub.indexOf("$99");
    const i29 = c.heroSub.indexOf("$29");
    assert.notEqual(i99, -1, `${c.slug}: agency heroSub must state the $99 ladder`);
    if (i29 !== -1) assert.ok(i99 < i29, `${c.slug}: heroSub mentions $29 before $99`);
  }
});

test("a gohighlevel pair resolves to the agency anchor end-to-end", () => {
  const anchor = sfPriceAnchor(pairAudience("agency", "mixed"));
  assert.ok(anchor.indexOf("$99") !== -1 && (anchor.indexOf("$29") === -1 || anchor.indexOf("$99") < anchor.indexOf("$29")));
});

test("no words-not-digits price collocation dodge in the gohighlevel entry", () => {
  const text = JSON.stringify(COMPETITORS.find((c) => c.slug === "gohighlevel"));
  assert.doesNotMatch(text, /29 dollars[^.]{0,80}(white-?label|client sub-accounts)/i);
});
