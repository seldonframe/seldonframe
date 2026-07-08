// Snapshot-shape tests for LandingMarketingFaqSection.
//
// 2026-07-08 pricing ladder (Task 6, flip-time commit): the homepage
// FAQ keeps "$29/mo flat" as the anchor truth (one-number rule) and
// now ALSO mentions the agency ladder (whitelabel + client sub-accounts
// starting at $99/mo) in the workspace-count and white-label answers.
// The previous spec pinned an even older $297/$497 GoHighLevel-era
// ladder that predates the 2026-06-22 flat-price rewrite and was
// already failing before this branch (9 FAQs exist, not 8) — rewritten
// here to match the CURRENT 9-question component.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { LandingMarketingFaqSection } from "../../../src/components/landing/marketing-faq-section";

type AnyEl = { props?: Record<string, unknown>; type?: unknown };

function flatten(node: unknown, acc: AnyEl[] = []): AnyEl[] {
  if (!node || typeof node !== "object") return acc;
  const el = node as AnyEl;
  acc.push(el);
  const children = el.props?.children;
  if (Array.isArray(children)) for (const c of children) flatten(c, acc);
  else if (children) flatten(children, acc);
  return acc;
}

const EXPECTED_QUESTIONS = [
  /who is seldonframe for/i, // who SeldonFrame is for
  /own AI key/i, // BYOK
  /how much is it/i, // price
  /free to start/i, // no card required
  /how many .*workspaces/i, // workspace count
  /white-label/i, // white-label for clients
  /own domain/i, // custom domain
  /GoHighLevel/i, // GHL comparison
  /Zapier|Calendly|Typeform/i, // replaces the tool stack
];

describe("LandingMarketingFaqSection — 9 Q&A, $29 anchor + agency ladder mentions", () => {
  test("renders exactly 9 <details> entries", () => {
    const result = LandingMarketingFaqSection();
    const details = flatten(result).filter((el) => el.type === "details");
    assert.equal(details.length, 9);
  });

  test("each expected question concept appears at least once", () => {
    const result = LandingMarketingFaqSection();
    const text = JSON.stringify(result);
    for (const pattern of EXPECTED_QUESTIONS) {
      assert.match(text, pattern, `missing question concept matching ${pattern}`);
    }
  });

  test("$29/mo flat remains the anchor truth", () => {
    const result = LandingMarketingFaqSection();
    const text = JSON.stringify(result);
    assert.match(text, /\$29\/mo flat/);
    assert.match(text, /cancel anytime/i);
  });

  test("workspace-count answer mentions the agency ladder ($99/mo) without displacing the $29 anchor", () => {
    const result = LandingMarketingFaqSection();
    const text = JSON.stringify(result);
    assert.match(text, /sub-accounts?/i);
    assert.match(text, /\$99\/mo/);
  });

  test("white-label answer scopes whitelabel to the agency ladder ($99/mo and up)", () => {
    const result = LandingMarketingFaqSection();
    const text = JSON.stringify(result);
    assert.match(text, /white-label/i);
    assert.match(text, /agency plan/i);
    assert.match(text, /\$99\/mo/);
  });

  test("GHL-comparison answer carries the $29 vs $497 wallet math", () => {
    const result = LandingMarketingFaqSection();
    const text = JSON.stringify(result);
    assert.match(text, /\$29/);
    assert.match(text, /\$497/);
    assert.match(text, /AGPL-3\.0/);
  });

  test("tool-stack answer leads with 'No' and lists the displaced stack", () => {
    const result = LandingMarketingFaqSection();
    const text = JSON.stringify(result);
    assert.match(text, /"No\./);
    assert.match(text, /Zapier task fees/i);
  });

  test("embeds FAQPage JSON-LD schema for Google rich results, matching the 9 questions", () => {
    const result = LandingMarketingFaqSection();
    const scripts = flatten(result).filter((el) => el.type === "script");
    assert.equal(scripts.length, 1, "must embed exactly one schema script");
    const script = scripts[0];
    const html = (
      (script.props as { dangerouslySetInnerHTML?: { __html?: string } })
        ?.dangerouslySetInnerHTML?.__html ?? ""
    );
    assert.match(html, /"@type":"FAQPage"/);
    const questionMatches = html.match(/"@type":"Question"/g) ?? [];
    assert.equal(questionMatches.length, 9, "schema must contain 9 Question entries");
  });
});
