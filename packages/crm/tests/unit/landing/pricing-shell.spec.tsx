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
//
// 2026-07-08 HYDRATION-MISMATCH FIX (see docs/superpowers/sdd — pricing-
// ladder-report.md "server-only-env-in-client-bundle" lesson):
// PricingShellMarketing used to compute `isPlaceholderPriceId(tier.
// stripePriceId)` ITSELF, reading PLANS/price-ids directly in a "use
// client" file. STRIPE_*_PRICE_ID env vars are SERVER-ONLY — in the
// browser bundle they're undefined, so every tier hydrated as a
// placeholder ("Book a demo" primary) regardless of what was actually
// configured server-side, and the client's post-hydration render won.
//
// THE BUG THIS TEST FILE PREVIOUSLY MISSED, AND WHY: the old spec called
// `renderToString(<PricingShellMarketing isAuthed={false} />)` with NO
// `tiers` prop (the component read PLANS itself). That render runs in
// THIS Node test process — not a browser — so `process.env.STRIPE_*` is
// whatever the test runner's env has, which is UNSET (no .env.local /
// .env in this repo, confirmed). Every plan's `stripePriceId` resolved
// to `price_PLACEHOLDER_*`, so `isPlaceholderPriceId` was true for ALL 5
// tiers in the test's own SSR pass. The "CTA hierarchy" assertion then
// computed `nonPlaceholderCount` from the SAME (also-unconfigured)
// `getPlan()` call, got 0, and asserted `getStartedMatches.length === 0`
// — which trivially passed no matter what the component actually did
// with a CONFIGURED tier, because the test never exercised that branch.
// The test was internally consistent but never proved the true end
// state ("Get started" primary when Stripe IS configured) — exactly the
// gap that let the real hydration-mismatch bug ship invisibly (the
// live browser's ALSO-unset env happened to produce a `matches the
// test's own always-placeholder assumption` result, so nothing ever
// looked wrong in this suite even though the SSR-vs-client MISMATCH —
// the actual bug — was never something a same-process renderToString
// call could ever detect in the first place: hydration mismatches only
// exist as a client/server DELTA, and a single renderToString call has
// no "client" half to diverge from).
//
// THE FIX (this file): PricingShellMarketing no longer reads env/PLANS
// at all — it takes `tiers: LadderTier[]` as a prop with a plain
// `available: boolean` field. This test now DI's that prop directly
// with both `available: true` and `available: false` fixtures, so it
// pins the real end state on BOTH sides of the boundary — something no
// amount of env-manipulation in the old design could have done, because
// the component computed its own availability from a source (env) this
// test process doesn't control in the same way the browser's build-time
// bundle does.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import React from "react";
import { renderToString } from "react-dom/server";

import { PricingShell } from "../../../src/app/pricing/pricing-shell";
import {
  PricingShellMarketing,
  type LadderTier,
} from "../../../src/app/pricing/pricing-shell-marketing";

const ALL_LADDER_TIER_IDS = [
  "builder",
  "managed",
  "agency_starter",
  "agency_growth",
  "agency_scale",
] as const;

/** Build the 5-tier fixture set the marketing ladder always SSRs (both
 *  audience rows), with a uniform `available` flag — mirrors the shape
 *  app/pricing/page.tsx's buildLadderTiers() produces, DI'd directly so
 *  this test controls availability instead of depending on process.env. */
function fixtureTiers(available: boolean): LadderTier[] {
  return ALL_LADDER_TIER_IDS.map((id, i) => ({
    id,
    name: id,
    price: 29 + i * 10,
    tagline: `${id} tagline`,
    maxSubAccounts: 0,
    fullWhiteLabel: false,
    available,
  }));
}

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
    const html = renderToString(
      React.createElement(PricingShellMarketing, { isAuthed: false, tiers: fixtureTiers(true) }),
    );
    assert.match(html, /data-pricing-theme="marketing"/);
  });

  test("renders BOTH audience rows server-side (crawler visibility) — 5 tiers total, only one row un-hidden", () => {
    const html = renderToString(
      React.createElement(PricingShellMarketing, { isAuthed: false, tiers: fixtureTiers(true) }),
    );
    // All 5 sellable tier ids must appear in the SSR HTML regardless of
    // which audience row is visually active (preserves the 2026-07-08
    // SSR hotfix, 3c77b6a1d).
    for (const tier of ALL_LADDER_TIER_IDS) {
      assert.match(html, new RegExp(`data-tier="${tier}"`), `${tier} must be present in SSR HTML`);
    }
    // Exactly one of the two audience-row wrapper divs carries `hidden`.
    const hiddenRowCount = (html.match(/class="mt-8 grid gap-5[^"]*hidden"/g) ?? []).length;
    assert.equal(hiddenRowCount, 1, "exactly one audience row must be CSS-hidden (the inactive one)");
  });

  test("audience toggle has tablist/tab semantics", () => {
    const html = renderToString(
      React.createElement(PricingShellMarketing, { isAuthed: false, tiers: fixtureTiers(true) }),
    );
    assert.match(html, /role="tablist"/);
    assert.match(html, /aria-label="Choose your audience"/);
    const tabMatches = html.match(/role="tab"/g) ?? [];
    assert.equal(tabMatches.length, 2, "exactly 2 audience tabs (personal / agency)");
  });

  test("END STATE — every tier available (Stripe fully configured): every card's PRIMARY is 'Get started' + secondary 'or book a demo'; NO 'Book a demo' anywhere", () => {
    const html = renderToString(
      React.createElement(PricingShellMarketing, { isAuthed: false, tiers: fixtureTiers(true) }),
    );
    const getStartedMatches = html.match(/Get started/g) ?? [];
    const bookADemoMatches = html.match(/Book a demo/g) ?? [];
    const secondaryDemoMatches = html.match(/or book a demo/g) ?? [];

    assert.equal(getStartedMatches.length, 5, "one 'Get started' primary per available tier");
    assert.equal(bookADemoMatches.length, 0, "no placeholder-priced tiers -> zero 'Book a demo' CTAs");
    assert.equal(secondaryDemoMatches.length, 5, "every available tier also gets the secondary demo link");
  });

  test("END STATE — no tier available (Stripe unconfigured / all placeholder): every card's PRIMARY is 'Book a demo'; NO 'Get started', NO secondary demo link", () => {
    const html = renderToString(
      React.createElement(PricingShellMarketing, { isAuthed: false, tiers: fixtureTiers(false) }),
    );
    const getStartedMatches = html.match(/Get started/g) ?? [];
    const bookADemoMatches = html.match(/Book a demo/g) ?? [];
    const secondaryDemoMatches = html.match(/or book a demo/g) ?? [];

    assert.equal(getStartedMatches.length, 0, "no available tiers -> zero 'Get started' CTAs");
    assert.equal(bookADemoMatches.length, 5, "one 'Book a demo' primary per unavailable tier");
    assert.equal(secondaryDemoMatches.length, 0, "placeholder cards never get a duplicate secondary demo link");
  });

  test("BOUNDARY — a mixed set (some available, some not) renders each card's CTA independently", () => {
    const mixed = fixtureTiers(true).map((t, i) => ({ ...t, available: i % 2 === 0 }));
    // builder, agency_starter, agency_scale = available (indices 0,2,4);
    // managed, agency_growth = unavailable (indices 1,3).
    const html = renderToString(
      React.createElement(PricingShellMarketing, { isAuthed: false, tiers: mixed }),
    );
    const getStartedMatches = html.match(/Get started/g) ?? [];
    const bookADemoMatches = html.match(/Book a demo/g) ?? [];
    const secondaryDemoMatches = html.match(/or book a demo/g) ?? [];

    assert.equal(getStartedMatches.length, 3);
    assert.equal(bookADemoMatches.length, 2);
    assert.equal(secondaryDemoMatches.length, 3);
  });

  test("NO sticky bottom CTA bar", () => {
    const html = renderToString(
      React.createElement(PricingShellMarketing, { isAuthed: false, tiers: fixtureTiers(true) }),
    );
    assert.doesNotMatch(html, /fixed inset-x-0 bottom-0/);
  });

  test("data-tier-cta attributes are present for every rendered tier card (smoke/test hook)", () => {
    const html = renderToString(
      React.createElement(PricingShellMarketing, { isAuthed: false, tiers: fixtureTiers(true) }),
    );
    for (const tier of ALL_LADDER_TIER_IDS) {
      assert.match(html, new RegExp(`data-tier-cta="${tier}"`), `${tier} must carry data-tier-cta`);
    }
  });

  test("renders the everything-included list restyled light (no dark dashboard classes)", () => {
    const html = renderToString(
      React.createElement(PricingShellMarketing, { isAuthed: false, tiers: fixtureTiers(true) }),
    );
    assert.match(html, /Everything included/i);
    // Must not carry the dashboard-chrome utility classes used by the
    // flag-off PricingShell (bg-card, text-muted-foreground, etc — those
    // are shadcn/dashboard tokens, not the marketing site's literal hex
    // palette).
    assert.doesNotMatch(html, /bg-card\//);
    assert.doesNotMatch(html, /text-muted-foreground/);
  });
});

describe("source guard — no price id lives in the client (pricing-shell-marketing.tsx)", () => {
  const SOURCE = readFileSync(
    path.join(__dirname, "../../../src/app/pricing/pricing-shell-marketing.tsx"),
    "utf8",
  );
  // Strip comments so this guard checks LIVE CODE only — the file's own
  // header prose intentionally documents the old `stripePriceId` /
  // `isPlaceholderPriceId` names as history (the whole point of this
  // fix), which would otherwise false-positive a naive substring check.
  const CODE_ONLY = SOURCE
    .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
    .replace(/^\s*\/\/.*$/gm, ""); // line comments

  test("still declares \"use client\" (this guard only makes sense for a client component)", () => {
    assert.match(SOURCE, /^"use client";/m);
  });

  test("does not reference stripePriceId in live code", () => {
    assert.doesNotMatch(CODE_ONLY, /stripePriceId/);
  });

  test("does not call isPlaceholderPriceId in live code", () => {
    assert.doesNotMatch(CODE_ONLY, /isPlaceholderPriceId/);
  });

  test("does not import from lib/billing/plans or lib/billing/price-ids", () => {
    assert.doesNotMatch(CODE_ONLY, /from ["']@\/lib\/billing\/plans["']/);
    assert.doesNotMatch(CODE_ONLY, /from ["']@\/lib\/billing\/price-ids["']/);
  });

  test("does not read process.env directly", () => {
    assert.doesNotMatch(CODE_ONLY, /process\.env/);
  });
});

describe("source guard — no price id lives in the client (upgrade-modal.tsx)", () => {
  const SOURCE = readFileSync(
    path.join(__dirname, "../../../src/components/billing/upgrade-modal.tsx"),
    "utf8",
  );
  const CODE_ONLY = SOURCE
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  test("does not import a Stripe price id constant from lib/billing/price-ids", () => {
    assert.doesNotMatch(CODE_ONLY, /from ["']@\/lib\/billing\/price-ids["']/);
  });

  test("does not reference a *_PRICE_ID identifier in live code", () => {
    assert.doesNotMatch(CODE_ONLY, /[A-Z_]+_PRICE_ID/);
  });
});
