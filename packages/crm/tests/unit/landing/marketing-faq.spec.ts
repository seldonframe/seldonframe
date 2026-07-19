// Snapshot-shape tests for LandingMarketingFaqSection.
//
// 2026-07-16 agency-persona rewrite (Max's call, with the homepage
// repositioning + 3-tier pricing grid): the FAQ now speaks to the agency
// operator selling client front offices. This spec pins the 12-question
// agency contract and its §1b pricing truth: Agency $99·$199·$299 with
// 0% GMV / Builder $29 + Managed $49 solo tiers (flat 2% only when SF is
// the sales channel) / marketplace fee 5% / no trial.
//
// (The previous spec pinned the 2026-07-08 9-question SMB contract and
// was already red on main — the component had grown to 11 questions
// without the spec moving. It also serialized via bare JSON.stringify,
// which crashes on circular component-type refs; this rewrite uses the
// same safe serializer as marketing-pricing.spec.ts.)

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

// JSON.stringify-safe serializer (mirrors marketing-pricing.spec.ts):
// drops function values (component `type` slots) and marks any other
// cycle as [Circular] instead of throwing.
function safeText(node: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(node, (_key, value) => {
    if (typeof value === "function") return undefined;
    if (typeof value === "object" && value !== null) {
      if (seen.has(value as object)) return "[Circular]";
      seen.add(value as object);
    }
    return value;
  });
}

const EXPECTED_QUESTIONS = [
  /client's front office/i, // reliability, client-voiced
  /developer to deliver/i, // no-code operation
  /which plan is right/i, // the tier ladder
  /charge my clients/i, // agency unit economics
  /what's the catch/i, // flat price honesty
  /own AI key/i, // BYOK qualifier
  /free to start/i, // no card, demo-first
  /GoHighLevel/i, // GHL comparison
  /Zapier|Calendly|Typeform/i, // replaces the tool stack
  /white-label/i, // white-label for clients
  /wait until the AI gets better/i, // never-goes-stale
  /who owns the client work/i, // portability / no lock-in
];

describe("LandingMarketingFaqSection — 12 agency-persona Q&A, §1b pricing truth", () => {
  test("renders exactly 12 <details> entries", () => {
    const result = LandingMarketingFaqSection();
    const details = flatten(result).filter((el) => el.type === "details");
    assert.equal(details.length, 12);
  });

  test("each expected question concept appears at least once", () => {
    const result = LandingMarketingFaqSection();
    const text = safeText(result);
    for (const pattern of EXPECTED_QUESTIONS) {
      assert.match(text, pattern, `missing question concept matching ${pattern}`);
    }
  });

  test("the agency ladder is stated with catalog-true prices and counts", () => {
    const result = LandingMarketingFaqSection();
    const text = safeText(result);
    assert.match(text, /\$99\/mo/);
    assert.match(text, /\$199\/mo/);
    assert.match(text, /\$299\/mo/);
    assert.match(text, /10 client sub-accounts/);
    assert.match(text, /cancel anytime/i);
  });

  test("the solo tiers stay visible for non-agency visitors ($29 Builder / $49 Managed)", () => {
    const result = LandingMarketingFaqSection();
    const text = safeText(result);
    assert.match(text, /\$29\/mo/);
    assert.match(text, /\$49\/mo/);
  });

  test("GMV truth: 0% on agency plans, flat 2% only when SF is the sales channel, 5% marketplace", () => {
    const result = LandingMarketingFaqSection();
    const text = safeText(result);
    assert.match(text, /0% GMV/);
    assert.match(text, /flat 2%/);
    assert.match(text, /sales channel/);
    assert.match(text, /5% on marketplace transactions/);
  });

  test("client-pricing anchor uses the standing $300–800/mo retail range", () => {
    const result = LandingMarketingFaqSection();
    const text = safeText(result);
    assert.match(text, /\$300–800\/mo/);
  });

  test("white-label answer scopes whitelabel to the agency ladder ($99/mo and up)", () => {
    const result = LandingMarketingFaqSection();
    const text = safeText(result);
    assert.match(text, /white-?label/i);
    assert.match(text, /agency plan/i);
    assert.match(text, /\$99\/mo/);
  });

  test("GHL-comparison answer carries the $99-white-label vs $497 wallet math", () => {
    const result = LandingMarketingFaqSection();
    const text = safeText(result);
    assert.match(text, /\$99\/mo/);
    assert.match(text, /\$497/);
    assert.match(text, /AGPL-3\.0/);
  });

  test("tool-stack answer leads with 'No' and names the Zapier task fees", () => {
    const result = LandingMarketingFaqSection();
    const text = safeText(result);
    assert.match(text, /"No\./);
    assert.match(text, /Zapier task fees/i);
  });

  test("no trial language — the free build is the trial", () => {
    const result = LandingMarketingFaqSection();
    const text = safeText(result);
    assert.doesNotMatch(text, /free trial|14-day/i);
    assert.match(text, /free/i);
  });

  test("embeds FAQPage JSON-LD schema matching the 12 questions", () => {
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
    assert.equal(questionMatches.length, 12, "schema must contain 12 Question entries");
  });
});
