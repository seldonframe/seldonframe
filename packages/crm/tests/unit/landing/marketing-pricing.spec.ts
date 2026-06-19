// Snapshot-shape test for LandingMarketingPricingSection.
//
// 2026-06-18 pricing migration (Phase 3): the homepage pricing section is
// the flat 3-tier ladder — Builder $19 / Workspace $49 / Agency $297 —
// with CTAs that route to /signup?plan=<tier>. (Was Free/Growth/Scale.)
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
  test("renders 3 tier columns: Builder, Workspace, Agency", () => {
    const result = LandingMarketingPricingSection();
    const cols = flatten(result).filter(
      (el) =>
        typeof (el.props as { "data-tier"?: string })?.["data-tier"] === "string",
    );
    const tiers = cols.map((c) => (c.props as { "data-tier": string })["data-tier"]);
    assert.deepEqual(tiers, ["builder", "workspace", "agency"]);
  });

  test("each tier card surfaces its price label", () => {
    const result = LandingMarketingPricingSection();
    const text = safeText(result);
    assert.match(text, /\$19/);
    assert.match(text, /\$49/);
    assert.match(text, /\$297/);
  });

  test("Builder CTA links to /signup?plan=builder", () => {
    const result = LandingMarketingPricingSection();
    const ctas = flatten(result).filter(
      (el) => (el.props as { "data-tier-cta"?: string })?.["data-tier-cta"] === "builder",
    );
    assert.equal(ctas.length, 1);
    assert.equal(
      (ctas[0].props as { href?: string }).href,
      "/signup?plan=builder",
    );
  });

  test("Workspace + Agency CTAs link to /signup with plan query param", () => {
    const result = LandingMarketingPricingSection();
    const workspaceCta = flatten(result).find(
      (el) => (el.props as { "data-tier-cta"?: string })?.["data-tier-cta"] === "workspace",
    );
    const agencyCta = flatten(result).find(
      (el) => (el.props as { "data-tier-cta"?: string })?.["data-tier-cta"] === "agency",
    );
    assert.equal(
      (workspaceCta?.props as { href?: string } | undefined)?.href,
      "/signup?plan=workspace",
    );
    assert.equal(
      (agencyCta?.props as { href?: string } | undefined)?.href,
      "/signup?plan=agency",
    );
  });

  test("the key feature rows render", () => {
    // Short substrings of the real (longer) marketing copy so a future
    // copy polish doesn't break the test; the substrings must still
    // uniquely identify each row in the comparison table.
    const result = LandingMarketingPricingSection();
    const text = safeText(result);
    for (const label of [
      "Client workspaces",
      "Landing pages",
      "Own domain",
      "CRM",
      "Booking page",
      "Intake form",
      "AI chatbot",
      "White-label",
      "Priority support",
    ]) {
      assert.match(text, new RegExp(label, "i"), `missing feature row: ${label}`);
    }
  });
});
