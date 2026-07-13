// packages/crm/tests/unit/landing/landing-mode-shell.spec.tsx
// jsdom bootstrap MUST be the first import (green-main lesson: unwired
// setup-dom was the root of 16 "stale UI" CI failures).
import "../../setup-dom";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { JSDOM } from "jsdom";
// MarketingHero (part of the build stack) calls next/navigation's
// useRouter() unconditionally. renderToString has no App Router mounted,
// so useRouter throws "invariant expected app router to be mounted"
// unless an AppRouterContext.Provider wraps the tree — a stub router,
// not a next/navigation module mock (this repo's convention explicitly
// avoids mock.module for CJS-interop reliability — see
// tests/unit/theme/save-theme.spec.ts).
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { LandingModeShell } from "../../../src/components/landing/landing-mode";
// unified-landing.tsx no longer imports landing-theme.css directly (that
// moved to each route's page.tsx, per the controller decision recorded in
// task-9-report.md) — so it's safe to import here under node:test, which
// has no CSS loader.
import { UnifiedLanding } from "../../../src/app/(public)/unified-landing";

function shell(initialMode: "build" | "record", recordEnabled = true) {
  return renderToString(
    React.createElement(LandingModeShell, {
      initialMode,
      recordEnabled,
      urlStrategy: "replace-state",
      nav: React.createElement("div", null, "NAV"),
      buildStack: React.createElement("div", null, "BUILD-STACK"),
      recordStack: React.createElement("div", null, "RECORD-STACK"),
      footer: React.createElement("div", null, "FOOTER"),
    }),
  );
}

const STUB_RECORD_PROPS = {
  claimedSessionId: null,
  claimed: false,
  isAuthed: false,
  sharedFlag: null,
} as const;

const STUB_ROUTER = {
  back: () => {},
  forward: () => {},
  refresh: () => {},
  push: () => {},
  replace: () => {},
  prefetch: () => {},
};

function renderUnifiedLanding(opts: {
  initialMode: "build" | "record";
  recordEnabled: boolean;
  urlStrategy?: "replace-state" | "navigate-home";
  tierLadderOn?: boolean;
  ungatedBuildEnabled?: boolean;
  recordFaqWithSchema?: boolean;
}) {
  return renderToString(
    React.createElement(
      AppRouterContext.Provider,
      { value: STUB_ROUTER },
      React.createElement(UnifiedLanding, {
        initialMode: opts.initialMode,
        recordEnabled: opts.recordEnabled,
        urlStrategy: opts.urlStrategy ?? "navigate-home",
        tierLadderOn: opts.tierLadderOn ?? false,
        ungatedBuildEnabled: opts.ungatedBuildEnabled ?? false,
        recordFaqWithSchema: opts.recordFaqWithSchema ?? false,
        recordProps: STUB_RECORD_PROPS,
      }),
    ),
  );
}

/** Find the element whose own text contains `needle`, walking up from the
 *  deepest matching text node so we get the tightest wrapping element (not
 *  some huge ancestor that also happens to contain the string). Returns
 *  null if not found. Uses the owning document's own TreeWalker/NodeFilter
 *  (cross-realm-safe — the caller may pass a freshly parsed jsdom Document
 *  distinct from the ambient globalThis.document). */
function findElementContainingText(root: Element, needle: string): Element | null {
  const doc = root.ownerDocument;
  const NODE_FILTER_SHOW_TEXT = 4;
  const walker = doc.createTreeWalker(root, NODE_FILTER_SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (node.textContent?.includes(needle)) {
      return node.parentElement;
    }
    node = walker.nextNode();
  }
  return null;
}

/** True if `el` or any ancestor up to `root` carries the `hidden`
 *  attribute — the shell's mounted-but-hidden contract for the build
 *  stack in record mode (landing-mode.tsx: `hidden={mode !== "build"}`). */
function hasHiddenAncestor(el: Element | null): boolean {
  let cur: Element | null = el;
  while (cur) {
    if (cur.hasAttribute("hidden")) return true;
    cur = cur.parentElement;
  }
  return false;
}

describe("<LandingModeShell> SSR", () => {
  test("build mode: data-mode=build, record stack NOT mounted", () => {
    const html = shell("build");
    assert.match(html, /data-mode="build"/);
    assert.match(html, /BUILD-STACK/);
    assert.doesNotMatch(html, /RECORD-STACK/);
  });
  test("record mode SSRs dark with record stack mounted (no-flash contract)", () => {
    const html = shell("record");
    assert.match(html, /data-mode="record"/);
    assert.match(html, /RECORD-STACK/);
  });
  test("flag off forces build even when initialMode=record", () => {
    const html = shell("record", false);
    assert.match(html, /data-mode="build"/);
    assert.doesNotMatch(html, /RECORD-STACK/);
  });
});

describe("<UnifiedLanding> composition (Task 9)", () => {
  test("record mode: record-stack copy present, data-mode=record, build stack mounted-but-hidden", () => {
    const html = renderUnifiedLanding({ initialMode: "record", recordEnabled: true });

    // Record-stack copy is in the SSR HTML.
    assert.match(html, /No signup to start/);
    assert.match(html, /Record yourself working/);
    assert.match(html, /The same SeldonFrame/);

    // Shell is flipped to record mode.
    assert.match(html, /data-mode="record"/);

    // The build stack is mounted-but-hidden (spec: hero input state
    // survives a round-trip flip), so its hero copy IS in the SSR HTML —
    // assert hiddenness structurally via a real DOM parse rather than
    // assuming the string is absent.
    const parsed = new JSDOM(html);
    const buildHeroNode = findElementContainingText(parsed.window.document.body, "Start a service business");
    assert.ok(buildHeroNode, "expected to find the build hero's 'Start a service business' copy in the SSR HTML");
    assert.ok(
      hasHiddenAncestor(buildHeroNode),
      "build hero copy must sit under an ancestor carrying the `hidden` attribute in record mode",
    );
  });

  test("flag off: no record-stack copy anywhere, data-mode=build", () => {
    const html = renderUnifiedLanding({ initialMode: "record", recordEnabled: false });
    assert.doesNotMatch(html, /Record yourself working/);
    assert.match(html, /data-mode="build"/);
  });
});
