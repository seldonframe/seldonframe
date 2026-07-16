// Snapshot-shape test for LandingMarketingPricingSection.
//
// 2026-07-16 agency repositioning (Max's call): flag ON now renders the
// THREE AGENCY TIER cards ($99 Starter / $199 Growth / $299 Scale) with
// 0% GMV framing and NO 2% talk (the solo GMV story lives on /pricing +
// the FAQ). Flag OFF (SF_TIER_LADDER unset) still renders the single $29
// flat card with no tier-ladder vocabulary — that contract is unchanged
// from the 2026-07-08 one-number rule.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { LandingMarketingPricingSection } from "../../../src/components/landing/marketing-pricing-section";

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

// JSON.stringify-safe serializer for React element trees. lucide-react
// icon components close back on themselves via their `type` ref, which
// trips the default stringifier. We drop function values (which is what
// the `type` slot holds when it's a component) and emit `[Circular]` if
// anything else loops.
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

describe("LandingMarketingPricingSection — flag OFF (default) — single $29 card, byte-compatible", () => {
  test("renders exactly one plan card ($29 flat)", () => {
    const result = LandingMarketingPricingSection({});
    const cols = flatten(result).filter(
      (el) => typeof (el.props as { "data-plan"?: string })?.["data-plan"] === "string",
    );
    assert.deepEqual(
      cols.map((c) => (c.props as { "data-plan": string })["data-plan"]),
      ["flat"],
    );
  });

  test("the $29 price + unlimited-workspaces copy is present", () => {
    const result = LandingMarketingPricingSection({});
    const text = safeText(result);
    assert.match(text, /\$29/);
    assert.match(text, /Unlimited workspaces/);
  });

  test("no tier-ladder vocabulary leaks when the flag is off", () => {
    const result = LandingMarketingPricingSection({});
    const text = safeText(result);
    assert.doesNotMatch(text, /sub-account/i);
    assert.doesNotMatch(text, /Agency Starter|Agency Growth|Agency Scale/);
  });
});

describe("LandingMarketingPricingSection — flag ON (SF_TIER_LADDER) — three agency tiers", () => {
  test("renders exactly the three agency tier cards, in ladder order", () => {
    const result = LandingMarketingPricingSection({ tierLadderOn: true });
    const cols = flatten(result).filter(
      (el) => typeof (el.props as { "data-plan"?: string })?.["data-plan"] === "string",
    );
    assert.deepEqual(
      cols.map((c) => (c.props as { "data-plan": string })["data-plan"]),
      ["agency_starter", "agency_growth", "agency_scale"],
    );
  });

  test("shows the catalog-true prices and sub-account counts", () => {
    const result = LandingMarketingPricingSection({ tierLadderOn: true });
    const text = safeText(result);
    assert.match(text, /\$99/);
    assert.match(text, /\$199/);
    assert.match(text, /\$299/);
    assert.match(text, /10 client sub-accounts/);
    assert.match(text, /30 client sub-accounts/);
    assert.match(text, /Unlimited client sub-accounts/);
  });

  test("leads with 0% GMV and never mentions the solo 2% fee", () => {
    const result = LandingMarketingPricingSection({ tierLadderOn: true });
    const text = safeText(result);
    assert.match(text, /0% GMV/);
    assert.doesNotMatch(text, /2%/);
  });

  test("links to /pricing (comparison) and /#hero-form (free build)", () => {
    const result = LandingMarketingPricingSection({ tierLadderOn: true });
    const links = flatten(result).map((el) => (el.props as { href?: string })?.href);
    assert.ok(links.filter((h) => h === "/pricing").length >= 1, "expected a /pricing link");
    assert.ok(links.filter((h) => h === "/#hero-form").length >= 1, "expected the free-build anchor");
  });

  test("never claims popularity we haven't measured", () => {
    const result = LandingMarketingPricingSection({ tierLadderOn: true });
    const text = safeText(result);
    assert.doesNotMatch(text, /most popular|best value/i);
  });
});
