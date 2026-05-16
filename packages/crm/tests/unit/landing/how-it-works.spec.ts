// Snapshot-shape test for LandingHowItWorksSection (Cut C Phase 2).
// Verifies the 3-step funnel anchors: signup → URL paste → 60-second
// workspace. Shape-check walking the React element tree (no jsdom
// required) — matches the hero-cta.spec.ts pattern.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { LandingHowItWorksSection } from "../../../src/components/landing/how-it-works-section";

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

describe("LandingHowItWorksSection — 3-step layout", () => {
  test("renders exactly 3 step cards", () => {
    const result = LandingHowItWorksSection();
    const cards = flatten(result).filter(
      (el) =>
        typeof (el.props as { "data-step"?: string })?.["data-step"] === "string",
    );
    assert.equal(cards.length, 3, "must have 3 step cards");
  });

  test("step 1 mentions Sign up free", () => {
    const result = LandingHowItWorksSection();
    const text = JSON.stringify(result);
    assert.match(text, /Sign up free/i);
  });

  test("step 2 mentions paste URL", () => {
    const result = LandingHowItWorksSection();
    const text = JSON.stringify(result);
    assert.match(text, /paste/i);
    assert.match(text, /URL|website/i);
  });

  test("step 3 mentions 60 seconds", () => {
    const result = LandingHowItWorksSection();
    const text = JSON.stringify(result);
    assert.match(text, /60 seconds/i);
  });

  test("all 3 step screenshots have non-empty alt text", () => {
    const result = LandingHowItWorksSection();
    const imgs = flatten(result).filter((el) => {
      const p = el.props as { src?: string } | undefined;
      return typeof p?.src === "string" && p.src.startsWith("/marketing/how-it-works");
    });
    assert.equal(imgs.length, 3);
    for (const img of imgs) {
      const alt = (img.props as { alt?: string }).alt;
      assert.ok(typeof alt === "string" && alt.length > 0);
    }
  });
});
