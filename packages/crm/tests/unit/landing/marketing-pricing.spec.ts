// Snapshot-shape test for LandingMarketingPricingSection.
//
// 2026-07-08 pricing ladder (Task 4): the homepage keeps the single
// $29 flat-price card (one-number rule) always. The ONLY thing that
// changes behind SF_TIER_LADDER is one quiet line under the card
// pointing agency operators at /pricing for the ladder. Flag OFF (the
// current default) renders byte-identical to today's single-card view
// — this pins the $29 card content + the ABSENCE of any tier-ladder
// vocabulary. Flag ON adds the one line; nothing else moves.

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

describe("LandingMarketingPricingSection — flag ON (SF_TIER_LADDER) — adds one quiet line", () => {
  test("still renders exactly one plan card (one-number rule preserved)", () => {
    const result = LandingMarketingPricingSection({ tierLadderOn: true });
    const cols = flatten(result).filter(
      (el) => typeof (el.props as { "data-plan"?: string })?.["data-plan"] === "string",
    );
    assert.deepEqual(
      cols.map((c) => (c.props as { "data-plan": string })["data-plan"]),
      ["flat"],
    );
  });

  test("adds the sub-accounts line linking to /pricing", () => {
    const result = LandingMarketingPricingSection({ tierLadderOn: true });
    const text = safeText(result);
    assert.match(text, /sub-accounts/i);
    assert.match(text, /\$99/);
    const links = flatten(result).filter(
      (el) => (el.props as { href?: string })?.href === "/pricing",
    );
    assert.ok(links.length >= 1, "expected a /pricing link");
  });
});
