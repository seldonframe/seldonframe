// Snapshot-shape tests for LandingMarketingFaqSection (Cut C Phase 6 +
// onboarding-pivot Q7/Q8 additions).
//
// Eight Q&As aligned to the locked 2026-06-18 pricing ladder
// (Builder $19 / Workspace $49 / Agency $297, no free tier). The tests
// check (a) exactly 8 <details> rendered, (b) each expected concept is
// present (who-it's-for, workspace count, white-label, domain, usage
// fees, managed AI, GHL comparison, tool-stack replacement), (c) a few
// load-bearing claims (white-label = Agency $297 with no Growth/Scale,
// managed AI with BYOK only on self-host, $497 GHL comparison),
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
  /SMB|agenc/i, // Q1 — who SeldonFrame is for
  /how many .*workspaces/i, // Q2 — workspace count per plan
  /white-label/i, // Q3 — white-label for clients
  /domain/i, // Q4 — custom domain
  /usage fees|surprise/i, // Q5 — no metered / surprise bills
  /AI key|managed/i, // Q6 — managed AI, no BYOK required
  /GoHighLevel/i, // Q7 — GHL comparison
  /Zapier|Calendly|Typeform/i, // Q8 — replaces the tool stack
];

describe("LandingMarketingFaqSection — 8 agency-focused Q&A", () => {
  test("renders exactly 8 <details> entries", () => {
    const result = LandingMarketingFaqSection();
    const details = flatten(result).filter((el) => el.type === "details");
    assert.equal(details.length, 8);
  });

  test("each expected question concept appears at least once", () => {
    const result = LandingMarketingFaqSection();
    const text = JSON.stringify(result);
    for (const pattern of EXPECTED_QUESTIONS) {
      assert.match(text, pattern, `missing question concept matching ${pattern}`);
    }
  });

  test("white-label answer is scoped to the Agency plan ($297), not Growth/Scale", () => {
    const result = LandingMarketingFaqSection();
    const text = JSON.stringify(result);
    // New locked ladder: white-label is the Agency tier ($297/mo).
    assert.match(text, /white-label/i);
    assert.match(text, /Agency/);
    assert.match(text, /\$297/);
    // The retired Free / Growth / Scale tiers must not reappear.
    assert.doesNotMatch(text, /Growth|Scale/);
  });

  test("AI answer: managed on paid plans, BYOK only on self-host", () => {
    const result = LandingMarketingFaqSection();
    const text = JSON.stringify(result);
    // New locked ladder: AI is managed/included on every paid plan;
    // bring-your-own-key is only for the self-hosted edition.
    assert.match(text, /managed/i);
    assert.match(text, /self-host/i);
    // The retired "every tier / all tiers" BYOK promise is gone.
    assert.doesNotMatch(text, /(all tiers|every tier)/i);
  });

  test("GHL-comparison answer carries the $29 vs $497 wallet math", () => {
    const result = LandingMarketingFaqSection();
    const text = JSON.stringify(result);
    assert.match(text, /\$29/);
    assert.match(text, /\$497/);
    assert.match(text, /AGPL-3\.0/);
  });

  test("tool-stack answer opens with 'No' and lists the displaced stack", () => {
    const result = LandingMarketingFaqSection();
    const text = JSON.stringify(result);
    // Q8 leads with "No." to do the heavy lifting up front.
    assert.match(text, /"No\./);
    assert.match(text, /Zapier task fees/i);
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
    // Schema mainEntity must enumerate exactly 8 Question entries.
    const questionMatches = html.match(/"@type":"Question"/g) ?? [];
    assert.equal(questionMatches.length, 8, "schema must contain 8 Question entries");
  });
});
