// 2026-07-08 marketing-branding fix wave — pins for /pricing's two
// entirely-separate renderings (see app/pricing/page.tsx's header):
//
//   SF_TIER_LADDER OFF (default) — the legacy dark PricingShell
//     (byte-identical single-card view, sticky bottom CTA bar).
//   SF_TIER_LADDER ON — the new light PricingShellMarketing (matches
//     seldonframe.com marketing branding): light-theme background,
//     "Get started" primary + "or book a demo" secondary on every
//     card, NO sticky bar, both audience rows SSR (crawler-visible).
//
// renderToString (no jsdom) is sufficient for these structural pins —
// the audience-toggle CLICK interaction itself is out of scope here
// (both rows already render server-side; only CSS visibility toggles
// client-side, which renderToString can't exercise, but the "both
// rows SSR" invariant IS exactly what renderToString proves).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import React from "react";
import { renderToString } from "react-dom/server";

import { PricingShell } from "../../../src/app/pricing/pricing-shell";
import { PricingShellMarketing } from "../../../src/app/pricing/pricing-shell-marketing";
import { getPlan } from "../../../src/lib/billing/plans";
import { isPlaceholderPriceId } from "../../../src/lib/billing/price-ids";

describe("PricingShell — SF_TIER_LADDER OFF (legacy dark single-card view)", () => {
  test("renders the sticky bottom CTA bar", () => {
    const html = renderToString(React.createElement(PricingShell, { isAuthed: false }));
    assert.match(html, /Get started/);
    // The sticky bar's distinguishing structural marker: fixed inset-x-0 bottom-0.
    assert.match(html, /fixed inset-x-0 bottom-0/);
  });

  test("renders the single $29 plan card only — no audience toggle, no tier ladder", () => {
    const html = renderToString(React.createElement(PricingShell, { isAuthed: false }));
    assert.match(html, /\$29/);
    assert.doesNotMatch(html, /data-tier=/);
    assert.doesNotMatch(html, /role="tablist"/);
  });

  test("does not render the light marketing theme marker", () => {
    const html = renderToString(React.createElement(PricingShell, { isAuthed: false }));
    assert.doesNotMatch(html, /data-pricing-theme="marketing"/);
  });
});

describe("PricingShellMarketing — SF_TIER_LADDER ON (light marketing-branded view)", () => {
  test("carries the light-theme marker (data-pricing-theme=marketing)", () => {
    const html = renderToString(React.createElement(PricingShellMarketing, { isAuthed: false }));
    assert.match(html, /data-pricing-theme="marketing"/);
  });

  test("renders BOTH audience rows server-side (crawler visibility) — 5 tiers total, only one row un-hidden", () => {
    const html = renderToString(React.createElement(PricingShellMarketing, { isAuthed: false }));
    // All 5 sellable tier ids must appear in the SSR HTML regardless of
    // which audience row is visually active (preserves the 2026-07-08
    // SSR hotfix, 3c77b6a1d).
    for (const tier of ["builder", "managed", "agency_starter", "agency_growth", "agency_scale"]) {
      assert.match(html, new RegExp(`data-tier="${tier}"`), `${tier} must be present in SSR HTML`);
    }
    // Exactly one of the two audience-row wrapper divs carries `hidden`.
    const hiddenRowCount = (html.match(/class="mt-8 grid gap-5[^"]*hidden"/g) ?? []).length;
    assert.equal(hiddenRowCount, 1, "exactly one audience row must be CSS-hidden (the inactive one)");
  });

  test("audience toggle has tablist/tab semantics", () => {
    const html = renderToString(React.createElement(PricingShellMarketing, { isAuthed: false }));
    assert.match(html, /role="tablist"/);
    assert.match(html, /aria-label="Choose your audience"/);
    const tabMatches = html.match(/role="tab"/g) ?? [];
    assert.equal(tabMatches.length, 2, "exactly 2 audience tabs (personal / agency)");
  });

  test("CTA hierarchy: every non-placeholder tier gets 'Get started' + 'or book a demo' secondary; every placeholder tier gets 'Book a demo' primary only (no duplicate)", () => {
    const html = renderToString(React.createElement(PricingShellMarketing, { isAuthed: false }));
    const SELLABLE_TIER_IDS = ["builder", "managed", "agency_starter", "agency_growth", "agency_scale"] as const;
    const nonPlaceholderCount = SELLABLE_TIER_IDS.filter(
      (id) => !isPlaceholderPriceId(getPlan(id)!.stripePriceId),
    ).length;
    const placeholderCount = SELLABLE_TIER_IDS.length - nonPlaceholderCount;

    const getStartedMatches = html.match(/Get started/g) ?? [];
    const bookADemoMatches = html.match(/Book a demo/g) ?? [];
    const secondaryDemoMatches = html.match(/or book a demo/g) ?? [];

    // Every non-placeholder tier's PRIMARY is "Get started".
    assert.equal(getStartedMatches.length, nonPlaceholderCount, "one 'Get started' per non-placeholder tier");
    // Every placeholder tier's PRIMARY is "Book a demo" (money-safe gate, unchanged).
    assert.equal(bookADemoMatches.length, placeholderCount, "one 'Book a demo' primary per placeholder tier");
    // Every non-placeholder tier ALSO gets the quiet secondary link — this
    // is the CTA-hierarchy fix: a card with "Get started" is never left
    // without a lower-commitment escape hatch.
    assert.equal(secondaryDemoMatches.length, nonPlaceholderCount, "one secondary 'or book a demo' per non-placeholder tier — no duplicate on placeholder cards");
  });

  test("NO sticky bottom CTA bar", () => {
    const html = renderToString(React.createElement(PricingShellMarketing, { isAuthed: false }));
    assert.doesNotMatch(html, /fixed inset-x-0 bottom-0/);
  });

  test("data-tier-cta attributes are present for every rendered tier card (smoke/test hook)", () => {
    const html = renderToString(React.createElement(PricingShellMarketing, { isAuthed: false }));
    for (const tier of ["builder", "managed", "agency_starter", "agency_growth", "agency_scale"]) {
      assert.match(html, new RegExp(`data-tier-cta="${tier}"`), `${tier} must carry data-tier-cta`);
    }
  });

  test("renders the everything-included list restyled light (no dark dashboard classes)", () => {
    const html = renderToString(React.createElement(PricingShellMarketing, { isAuthed: false }));
    assert.match(html, /Everything included/i);
    // Must not carry the dashboard-chrome utility classes used by the
    // flag-off PricingShell (bg-card, text-muted-foreground, etc — those
    // are shadcn/dashboard tokens, not the marketing site's literal hex
    // palette).
    assert.doesNotMatch(html, /bg-card\//);
    assert.doesNotMatch(html, /text-muted-foreground/);
  });
});
