// HTML-rendered tests for the new LandingComparisonSection
// ("Stop renting 5 tools").
//
// Verifies the load-bearing user-facing claims so a future ux-copy
// polish that reorders sentences doesn't accidentally drop the wallet
// math or break the rent/ship column-header pairing.
//
// What we check:
//   - Section H2 carries the "Stop renting 5 tools" headline
//   - LEFT column lists the four "what you're renting" tools with the
//     drafted dollar amounts (GHL $497, Zapier $847, the stitched
//     stack $400) and the ~$1,744 subtotal
//   - LEFT column uses semantic <del> on the struck prices and the
//     sr-only "no longer needed" suffix so screen-reader users get the
//     "this is dying" frame even if their verbosity setting skips
//     deletion announcements (a11y-review M4)
//   - RIGHT column lists the Growth + Scale tiers with $29 / $99 and
//     the $29-$99 total
//   - The visually-hidden bridging sentence is rendered for SR users
//     who skip the central arrow (a11y-review M2)

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import React from "react";
import { renderToString } from "react-dom/server";

import { LandingComparisonSection } from "../../../src/components/landing/landing-comparison-section";

describe("LandingComparisonSection — rent vs ship", () => {
  test("H2 carries the 'Stop renting 5 tools' command", () => {
    const html = renderToString(React.createElement(LandingComparisonSection));
    const h2Match = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/);
    assert.ok(h2Match, "comparison section must render an <h2>");
    assert.match(h2Match[1], /Stop renting 5 tools/i);
    assert.match(h2Match[1], /60 seconds/i);
  });

  test("LEFT column lists the four 'renting' items with dollar amounts", () => {
    const html = renderToString(React.createElement(LandingComparisonSection));
    assert.match(html, /GoHighLevel Agency Pro/);
    assert.match(html, /\$497/);
    assert.match(html, /Zapier/);
    assert.match(html, /\$847/);
    assert.match(html, /Calendly/);
    assert.match(html, /\$400/);
    assert.match(html, /\$1,744/, "subtotal must render the assembled wallet math");
  });

  test("LEFT column wraps struck prices in semantic <del>", () => {
    const html = renderToString(React.createElement(LandingComparisonSection));
    const delMatches = html.match(/<del/g) ?? [];
    // Three line-item prices + the subtotal = at least 4 <del> blocks.
    assert.ok(
      delMatches.length >= 4,
      `expected at least 4 <del> blocks for the struck prices, got ${delMatches.length}`,
    );
  });

  test("LEFT column carries the 'no longer needed' sr-only suffix", () => {
    const html = renderToString(React.createElement(LandingComparisonSection));
    assert.match(html, /no longer needed/);
  });

  test("RIGHT column lists Growth + Scale tiers with their prices", () => {
    const html = renderToString(React.createElement(LandingComparisonSection));
    assert.match(html, /Growth/);
    assert.match(html, /\$29/);
    assert.match(html, /Scale/);
    assert.match(html, /\$99/);
  });

  test("renders the sr-only bridging sentence for screen-reader users", () => {
    const html = renderToString(React.createElement(LandingComparisonSection));
    // a11y-review M2 — the visual central arrow is decorative; this
    // sentence gives SR users the same "instead of all of the above"
    // frame.
    assert.match(html, /Instead of all of the above/i);
  });
});
