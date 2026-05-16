// Snapshot-shape test for refreshed LandingHero (Cut C Phase 1).
// Verifies: headline copy ("agency" + "60 seconds"), both CTA
// destinations (/signup primary, /docs/getting-started/connect-claude-code
// secondary), and non-empty alt text on the hero loop image.
// Shape-check (props/children walk) — matches the existing
// renderToString convention by exercising the component without
// jsdom.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { LandingHero } from "../../../src/components/landing/hero";

type AnyEl = { props?: Record<string, unknown>; type?: unknown };

function walk(node: unknown, predicate: (el: AnyEl) => boolean): AnyEl | null {
  if (!node || typeof node !== "object") return null;
  const el = node as AnyEl;
  if (predicate(el)) return el;
  const children = el.props?.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = walk(child, predicate);
      if (found) return found;
    }
  } else if (children) {
    return walk(children, predicate);
  }
  return null;
}

describe("LandingHero — agency-onboarding refresh", () => {
  test("headline mentions agency + 60 seconds", () => {
    const result = LandingHero();
    const h1 = walk(result, (el) => el.type === "h1");
    assert.ok(h1, "hero must render an <h1>");
    const text = JSON.stringify(h1.props?.children);
    assert.match(text, /agency/i);
    assert.match(text, /60 seconds/i);
  });

  test("primary CTA links to /signup", () => {
    const result = LandingHero();
    const primary = walk(
      result,
      (el) => (el.props as { href?: string })?.href === "/signup",
    );
    assert.ok(primary, "primary CTA must link to /signup");
  });

  test("secondary CTA links to Claude Code MCP docs", () => {
    const result = LandingHero();
    const secondary = walk(
      result,
      (el) =>
        (el.props as { href?: string })?.href ===
        "/docs/getting-started/connect-claude-code",
    );
    assert.ok(
      secondary,
      "secondary CTA must link to /docs/getting-started/connect-claude-code",
    );
  });

  test("hero loop image has alt text", () => {
    const result = LandingHero();
    const img = walk(result, (el) => {
      const p = el.props as { src?: string; alt?: string } | undefined;
      return typeof p?.src === "string" && p.src.includes("hero-loop");
    });
    assert.ok(img, "hero must render the 6-sec loop image");
    assert.ok(
      typeof (img.props as { alt?: string }).alt === "string" &&
        (img.props as { alt: string }).alt.length > 0,
      "hero loop image must have non-empty alt text",
    );
  });
});
