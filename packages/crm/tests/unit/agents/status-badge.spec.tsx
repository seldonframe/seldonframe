// Agent truth slice (Task 2) — <TemplateStatusBadge>: the title chip on the
// studio agent page must never show a stale "draft" chip on a template that
// has ≥1 real deployment (a lie-shaped label — the chip tracked the
// marketplace lifecycle, not deployment truth). Design:
// docs/superpowers/specs/2026-07-16-agent-truth-design.md (Task 2).

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { renderToString } from "react-dom/server";
import {
  TemplateStatusBadge,
  marketplaceListingCopy,
} from "../../../src/app/(dashboard)/studio/agents/status-badge";

describe("<TemplateStatusBadge> — honest Live label (agent truth)", () => {
  test("0 deployments -> renders the existing draft tri-state chip, unchanged", () => {
    const html = renderToString(<TemplateStatusBadge status="draft" deploymentCount={0} />);
    assert.match(html, />draft</);
    assert.doesNotMatch(html, /Live/);
  });

  test("no deploymentCount prop at all -> byte-for-byte the existing tri-state (backward compatible)", () => {
    const html = renderToString(<TemplateStatusBadge status="published" />);
    assert.match(html, />published</);
    assert.doesNotMatch(html, /Live/);
  });

  test("≥1 deployment -> renders '● Live · N deployment(s)' INSTEAD of the tri-state, regardless of status", () => {
    const html = renderToString(<TemplateStatusBadge status="draft" deploymentCount={1} />);
    assert.match(html, /Live · 1 deployment\b/);
    assert.doesNotMatch(html, />draft</);
  });

  test("plural deployment count", () => {
    const html = renderToString(<TemplateStatusBadge status="draft" deploymentCount={3} />);
    assert.match(html, /Live · 3 deployments/);
  });

  test("a live badge is never rendered for a status other than draft when deployments exist too — Live always wins", () => {
    const html = renderToString(<TemplateStatusBadge status="published" deploymentCount={2} />);
    assert.match(html, /Live · 2 deployments/);
    assert.doesNotMatch(html, />published</);
  });

  // L-36 — visibility invariant: explicit fg + bg classes, never letting an
  // inherited/absent color collide with the badge's own background.
  test("L-36 visibility invariant: the Live badge carries an explicit foreground AND background class", () => {
    const html = renderToString(<TemplateStatusBadge status="draft" deploymentCount={1} />);
    assert.match(html, /class="[^"]*bg-emerald-500\/15[^"]*"/);
    assert.match(html, /class="[^"]*text-emerald-700[^"]*"/);
  });

  test("L-36 visibility invariant: the draft/tested/published tri-state still carries explicit fg+bg (unchanged)", () => {
    for (const status of ["draft", "tested", "published"] as const) {
      const html = renderToString(<TemplateStatusBadge status={status} deploymentCount={0} />);
      // Every branch's class string pairs a bg-*/color with a text-* — never
      // just one or the other (an invisible-on-dark-or-light regression).
      assert.match(html, /bg-\S+/, `${status}: expected an explicit background class`);
      assert.match(html, /text-\S+/, `${status}: expected an explicit foreground class`);
    }
  });
});

describe("marketplaceListingCopy — the tri-state's meaning, moved into the Sell card", () => {
  test("draft -> 'Not listed on marketplace'", () => {
    assert.equal(marketplaceListingCopy("draft"), "Not listed on marketplace");
  });

  test("published -> 'Listed'", () => {
    assert.equal(marketplaceListingCopy("published"), "Listed");
  });

  test("tested -> no override copy (keeps its existing meaning wherever it appears)", () => {
    assert.equal(marketplaceListingCopy("tested"), null);
  });

  test("an unknown status -> no copy (never throws)", () => {
    assert.equal(marketplaceListingCopy("something_else"), null);
  });
});
