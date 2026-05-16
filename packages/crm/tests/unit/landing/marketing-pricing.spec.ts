// Snapshot-shape test for LandingMarketingPricingSection (Cut C Phase 4).
// Asserts the 3-tier matrix structure: Free / Growth / Scale columns,
// 10 feature rows from spec §Cut B, and CTAs that route to /signup
// (note: /signup, NOT /auth/signup — (auth) is a Next.js route group).
//
// Same shape-walking pattern as hero-cta.spec.ts and how-it-works.spec.ts
// so we don't need jsdom for what is otherwise a static surface.

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

describe("LandingMarketingPricingSection — 3-column matrix", () => {
  test("renders 3 tier columns: Free, Growth, Scale", () => {
    const result = LandingMarketingPricingSection();
    const cols = flatten(result).filter(
      (el) =>
        typeof (el.props as { "data-tier"?: string })?.["data-tier"] === "string",
    );
    const tiers = cols.map((c) => (c.props as { "data-tier": string })["data-tier"]);
    assert.deepEqual(tiers, ["free", "growth", "scale"]);
  });

  test("each tier card surfaces its price label", () => {
    const result = LandingMarketingPricingSection();
    const text = safeText(result);
    assert.match(text, /\$0/);
    assert.match(text, /\$29/);
    assert.match(text, /\$99/);
  });

  test("Free column CTA links to /signup", () => {
    const result = LandingMarketingPricingSection();
    const ctas = flatten(result).filter(
      (el) => (el.props as { "data-tier-cta"?: string })?.["data-tier-cta"] === "free",
    );
    assert.equal(ctas.length, 1);
    assert.equal(
      (ctas[0].props as { href?: string }).href,
      "/signup",
    );
  });

  test("Growth + Scale CTAs link to /signup with plan query param", () => {
    const result = LandingMarketingPricingSection();
    const growthCta = flatten(result).find(
      (el) => (el.props as { "data-tier-cta"?: string })?.["data-tier-cta"] === "growth",
    );
    const scaleCta = flatten(result).find(
      (el) => (el.props as { "data-tier-cta"?: string })?.["data-tier-cta"] === "scale",
    );
    assert.equal(
      (growthCta?.props as { href?: string } | undefined)?.href,
      "/signup?plan=growth",
    );
    assert.equal(
      (scaleCta?.props as { href?: string } | undefined)?.href,
      "/signup?plan=scale",
    );
  });

  test("all 10 feature rows from spec §Cut B render", () => {
    const result = LandingMarketingPricingSection();
    const text = safeText(result);
    for (const label of [
      "Workspaces",
      "BYOK Anthropic key",
      "Unlimited contacts",
      "branding hidden",
      "Custom domain",
      "Client portal",
      "AI agents",
      "white-label",
      "Priority support",
      "Claude Code MCP",
    ]) {
      assert.match(text, new RegExp(label, "i"), `missing feature row: ${label}`);
    }
  });
});
