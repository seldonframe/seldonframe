// packages/crm/tests/unit/landing/marketing-hero-biz-disclaimer.spec.tsx
//
// Persona-loop finding (2026-08-15): the homepage hero's "Paste a URL" and
// "Describe the business" tabs are styled identically, but only the URL tab
// is the ungated no-signup build (heroSubmitTarget always routes "biz" to
// /signup — see hero-submit-target.ts and marketing-hero-target.spec.ts).
// A visitor with no website (a very common case for solo trades) who picks
// "Describe the business" gets silently redirected to signup after typing a
// whole description, with no warning beforehand. This spec locks in the
// honesty-fix disclaimer added to the biz pane.
import "../../setup-dom";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
// MarketingHero calls next/navigation's useRouter() unconditionally.
// renderToString has no App Router mounted, so useRouter throws unless an
// AppRouterContext.Provider wraps the tree — same stub-router convention as
// landing-mode-shell.spec.tsx (this repo avoids mock.module for CJS-interop
// reliability — see tests/unit/theme/save-theme.spec.ts).
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { MarketingHero } from "../../../src/components/landing/marketing-hero";

const STUB_ROUTER = {
  back: () => {},
  forward: () => {},
  refresh: () => {},
  push: () => {},
  replace: () => {},
  prefetch: () => {},
};

function renderHero(ungatedBuildEnabled: boolean) {
  return renderToString(
    <AppRouterContext.Provider value={STUB_ROUTER}>
      <MarketingHero ungatedBuildEnabled={ungatedBuildEnabled} />
    </AppRouterContext.Provider>,
  );
}

describe("MarketingHero — biz-tab signup disclaimer", () => {
  test("ungated build on: biz pane warns it needs a free account before the URL-only free build", () => {
    const html = renderHero(true);
    assert.match(
      html,
      /Building from a description needs a free account/,
      "visitor must be warned before typing a description that only the URL tab is the free, no-signup build",
    );
  });

  test("ungated build off: no disclaimer (both tabs already route to signup — no discrepancy to flag)", () => {
    const html = renderHero(false);
    assert.doesNotMatch(html, /Building from a description needs a free account/);
  });
});
