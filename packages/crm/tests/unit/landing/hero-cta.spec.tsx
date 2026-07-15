// HTML-rendered tests for the rewritten LandingHero (onboarding-pivot).
//
// The previous hero (Cut C Phase 1) was a plain JSX function with no
// hooks — the old spec walked the returned tree directly. The new hero
// is "use client" with motion@12.38 + useReducedMotion, so the
// component must run through React's runtime. Switching to
// renderToString matches the existing chatbot-preview-section.spec
// pattern and keeps the suite jsdom-free for this surface.
//
// The new hero contract (replacing the rejected "agency-ready Business
// OS" + Claude Code MCP CTA framing):
//   - H1 leads with the natural-language product moment + "60 seconds"
//     ("Spin up your client's Business OS in 60 seconds. Just describe
//     it.")
//   - Primary CTA still hits /signup
//   - Secondary CTA points at the on-page #demo anchor
//   - Hero visual is a Tailwind LandingHeroMockup (not an external
//     image) — verify by checking for the role="img" wrapper with the
//     Acme HVAC workspace aria-label.
//   - The user-dictated risk-reversal line renders verbatim.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import React from "react";
import { renderToString } from "react-dom/server";

import { LandingHero } from "../../../src/components/landing/hero";

describe("LandingHero — onboarding-pivot rewrite", () => {
  test("headline mentions 60 seconds and the natural-language hook", () => {
    const html = renderToString(React.createElement(LandingHero));
    // The H1 spans two phrases (the second one teal-wrapped) — assert
    // both 60 seconds + describe appear within the H1 block.
    const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    assert.ok(h1Match, "hero must render an <h1>");
    assert.match(h1Match[1], /60 seconds/i);
    assert.match(h1Match[1], /describe/i);
  });

  test("primary CTA links to /signup", () => {
    const html = renderToString(React.createElement(LandingHero));
    assert.match(html, /href="\/signup"/);
  });

  test("secondary CTA links to the on-page demo anchor", () => {
    const html = renderToString(React.createElement(LandingHero));
    assert.match(html, /href="#demo"/);
  });

  test("hero mounts the live workspace screenshot with a descriptive alt", () => {
    const html = renderToString(React.createElement(LandingHero));
    // The rendered LandingHeroMockup was replaced with a real workspace
    // screenshot (workspace-head.png) so the hero shows the actual
    // product, not a stylized render — verify by checking for the img
    // src and its non-empty descriptive alt text.
    assert.match(html, /src="\/marketing\/workspace-head\.png"/);
    assert.match(html, /A live SeldonFrame workspace/);
  });

  test("renders the user-dictated risk-reversal line verbatim", () => {
    const html = renderToString(React.createElement(LandingHero));
    assert.match(
      html,
      /Create a real functioning Business OS in 60 seconds/,
      "the risk-reversal copy is user-dictated and must render verbatim",
    );
  });

  test("drops the rejected 'Open-source GHL alternative' eyebrow", () => {
    const html = renderToString(React.createElement(LandingHero));
    assert.doesNotMatch(
      html,
      /Open-source GHL alternative/i,
      "the user explicitly rejected anti-competitor eyebrow framing",
    );
  });
});
