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

  test("all 3 step screenshots are a11y-correct (decorative or descriptive)", () => {
    // Real captures are wired up for all 3 steps now (step 1 uses the
    // sign-in screenshot at /marketing/sign-in.png, steps 2-3 use
    // /marketing/how-it-works/*) — match on the shared /marketing/
    // prefix so the count reflects however many step images the live
    // component renders, rather than hardcoding a path segment that
    // only matched 2 of the 3 steps.
    const result = LandingHowItWorksSection();
    const imgs = flatten(result).filter((el) => {
      const p = el.props as { src?: string } | undefined;
      return typeof p?.src === "string" && p.src.startsWith("/marketing/");
    });
    assert.equal(imgs.length, 3);
    for (const img of imgs) {
      const props = img.props as { alt?: string; role?: string };
      const altIsString = typeof props.alt === "string";
      const isDecorative = props.alt === "" && props.role === "presentation";
      const isDescriptive = altIsString && (props.alt?.length ?? 0) > 0;
      assert.ok(
        isDecorative || isDescriptive,
        "screenshot must be either decorative (alt='' + role='presentation') or descriptive (non-empty alt)",
      );
    }
  });
});
