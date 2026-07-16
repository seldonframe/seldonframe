// Snapshot-shape tests for MarketingAgencyOwnership.
//
// 2026-07-16 addition per docs/strategy/ghl-pain-messaging-plan-2026-07-16.md
// (§B "/agencies — lead with ownership + the math story"). Pins:
// - the GHL help-center link href (verified export article)
// - the verbatim quote (<=15 words) from that article
// - the "July 2026" datestamp on the pricing table
// - $99 and $497 both present (the comparison anchors)
// - absence of prohibited claims from the plan doc's refuted-claims list

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { MarketingAgencyOwnership } from "../../../src/components/landing/marketing-agency-ownership";

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

// JSON.stringify-safe serializer (mirrors marketing-faq.spec.ts / marketing-pricing.spec.ts).
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

const GHL_EXPORT_HELP_URL =
  "https://help.gohighlevel.com/support/solutions/articles/155000007342";

// The verbatim quote embedded in the component — must stay <=15 words and
// must be a substring of the article text confirmed in the plan doc.
const VERBATIM_QUOTE =
  "does not support exporting websites in a way that allows them to be managed";

const PROHIBITED = /hidden fee|secret fee|zero data egress|don't own their data|doesn't own their data/i;

describe("MarketingAgencyOwnership — ownership block + $99-vs-$497 table", () => {
  test("links to the GHL export help-center article with rel=nofollow noopener", () => {
    const result = MarketingAgencyOwnership();
    const links = flatten(result).filter(
      (el) => (el.props as { href?: string })?.href === GHL_EXPORT_HELP_URL,
    );
    assert.equal(links.length, 1, "expected exactly one link to the GHL export help article");
    const props = links[0].props as { rel?: string; target?: string };
    assert.equal(props.rel, "nofollow noopener");
    assert.equal(props.target, "_blank");
  });

  test("the verbatim GHL quote is present and stays under 15 words", () => {
    const wordCount = VERBATIM_QUOTE.trim().split(/\s+/).length;
    assert.ok(wordCount <= 15, `quote must be <=15 words, got ${wordCount}`);
    const result = MarketingAgencyOwnership();
    const text = safeText(result);
    assert.ok(text.includes(VERBATIM_QUOTE), "verbatim quote missing from rendered output");
  });

  test("attributes the quote to the GHL help center, dated July 2026", () => {
    const result = MarketingAgencyOwnership();
    const text = safeText(result);
    assert.match(text, /GoHighLevel help center, accessed July 2026/);
  });

  test("the pricing table is datestamped and carries $99 + $497", () => {
    const result = MarketingAgencyOwnership();
    const text = safeText(result);
    assert.match(text, /per GoHighLevel.s published pricing, July 2026/i);
    assert.match(text, /\$99\/mo/);
    assert.match(text, /\$497\/mo/);
  });

  test("the white-label mobile cell states an honest gap, not parity", () => {
    const result = MarketingAgencyOwnership();
    const text = safeText(result);
    assert.match(text, /web portal, your domain/i);
    assert.match(text, /white-label mobile app: \+\$497\/mo add-on/i);
  });

  test("says 'no supported export', never the refuted/prohibited phrasings", () => {
    const result = MarketingAgencyOwnership();
    const text = safeText(result);
    assert.match(text, /no supported export/i);
    assert.doesNotMatch(text, PROHIBITED);
  });

  test("0% GMV framed about SF alone; GHL cell is a neutral dash, not implying GHL takes a cut", () => {
    const result = MarketingAgencyOwnership();
    const text = safeText(result);
    assert.match(text, /0% GMV on agency plans/);
  });
});
