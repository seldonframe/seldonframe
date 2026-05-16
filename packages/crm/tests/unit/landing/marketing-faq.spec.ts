// Snapshot-shape tests for LandingMarketingFaqSection (Cut C Phase 6).
//
// Six agency-focused Q&As. The tests check (a) exactly 6 <details>
// rendered, (b) each expected concept is present (white-label, domain,
// Anthropic key, workspace count, Claude Code, isolation), (c) a few
// load-bearing claims (Growth+Scale mention, "every tier" for BYOK),
// (d) the FAQPage JSON-LD schema script is emitted with the same
// answer text — Google's structured-data validator drops the schema
// otherwise.
//
// Patterns kept loose-but-distinct so a future ux-copy polish that
// reorders sentences doesn't break the assertion.

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
  /white-label/i,
  /domain/i,
  /Anthropic/i,
  /how many .*workspaces/i,
  /Claude Code/i,
  /isolated|isolation/i,
];

describe("LandingMarketingFaqSection — 6 agency-focused Q&A", () => {
  test("renders exactly 6 <details> entries", () => {
    const result = LandingMarketingFaqSection();
    const details = flatten(result).filter((el) => el.type === "details");
    assert.equal(details.length, 6);
  });

  test("each expected question concept appears at least once", () => {
    const result = LandingMarketingFaqSection();
    const text = JSON.stringify(result);
    for (const pattern of EXPECTED_QUESTIONS) {
      assert.match(text, pattern, `missing question concept matching ${pattern}`);
    }
  });

  test("answer for white-label mentions both Growth and Scale", () => {
    const result = LandingMarketingFaqSection();
    const text = JSON.stringify(result);
    assert.match(text, /Growth/);
    assert.match(text, /Scale/);
  });

  test("answer for BYOK signals every-tier availability", () => {
    const result = LandingMarketingFaqSection();
    const text = JSON.stringify(result);
    // The refined copy says "every tier" (was "all tiers" in the
    // draft); tolerate either phrasing so a future ux-copy polish
    // doesn't break the spec contract.
    assert.match(text, /(all tiers|every tier)/i);
  });

  test("embeds FAQPage JSON-LD schema for Google rich results", () => {
    const result = LandingMarketingFaqSection();
    const scripts = flatten(result).filter((el) => el.type === "script");
    assert.equal(scripts.length, 1, "must embed exactly one schema script");
    const script = scripts[0];
    const html = (
      (script.props as { dangerouslySetInnerHTML?: { __html?: string } })
        ?.dangerouslySetInnerHTML?.__html ?? ""
    );
    assert.match(html, /"@type":"FAQPage"/);
    // Schema mainEntity must enumerate exactly 6 Question entries.
    const questionMatches = html.match(/"@type":"Question"/g) ?? [];
    assert.equal(questionMatches.length, 6, "schema must contain 6 Question entries");
  });
});
