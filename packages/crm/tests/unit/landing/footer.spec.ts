// Snapshot-shape tests for the refreshed LandingFooter (Cut C Phase 7).
//
// The Phase 7 refresh replaces the stub footer with: (a) a prominent
// "Open source on GitHub" call-to-arms block at the top of the
// footer, (b) a real link grid (Product / Resources / Legal), (c) an
// AGPL-3.0 license line (NOT MIT — the previous footer drifted from
// the LICENSE file). These tests pin those three contract points.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { LandingFooter } from "../../../src/components/landing/footer";

type AnyEl = { props?: Record<string, unknown>; type?: unknown };

function flatten(node: unknown, acc: AnyEl[] = []): AnyEl[] {
  if (!node || typeof node !== "object") return acc;
  // Array nodes (e.g. an array returned from a helper like
  // renderLinkList) aren't themselves React elements — descend into
  // each entry. Without this the per-element {props, type} shape
  // below misses Links rendered via a map helper.
  if (Array.isArray(node)) {
    for (const c of node) flatten(c, acc);
    return acc;
  }
  const el = node as AnyEl;
  acc.push(el);
  const children = el.props?.children;
  if (Array.isArray(children)) for (const c of children) flatten(c, acc);
  else if (children) flatten(children, acc);
  return acc;
}

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

describe("LandingFooter — Cut C Phase 7 refresh", () => {
  test("includes a prominent GitHub call-to-arms block", () => {
    const result = LandingFooter();
    const text = safeText(result);
    // The block heading + the View-on-GitHub link both signal the
    // top-of-footer treatment from the Phase 7 spec.
    assert.match(text, /Open source on GitHub/i);
    assert.match(text, /github\.com\/seldonframe\/crm/);
  });

  test("license line says AGPL-3.0 (not MIT)", () => {
    const result = LandingFooter();
    const text = safeText(result);
    assert.match(text, /AGPL-3\.0/);
    // Defensive: ensure the older MIT string isn't lingering.
    assert.doesNotMatch(text, /MIT/);
  });

  test("renders Product / Resources / Legal link sections", () => {
    const result = LandingFooter();
    const text = safeText(result);
    assert.match(text, /Product/);
    assert.match(text, /Resources/);
    assert.match(text, /Legal/);
  });

  test("Privacy + Terms legal links are absolute app.seldonframe.com URLs", () => {
    const result = LandingFooter();
    const links = flatten(result).filter(
      (el) => typeof (el.props as { href?: string })?.href === "string",
    );
    const hrefs = links.map((el) => (el.props as { href: string }).href);
    assert.ok(
      hrefs.some((h) => h.includes("app.seldonframe.com/policy")),
      "Privacy link must point at app.seldonframe.com/policy",
    );
    assert.ok(
      hrefs.some((h) => h.includes("app.seldonframe.com/terms")),
      "Terms link must point at app.seldonframe.com/terms",
    );
  });
});
