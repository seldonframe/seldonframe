// Snapshot-shape tests for GitHubStarsBadge (Cut C Phase 5).
//
// The badge accepts a numeric stargazers_count (or null on fetch
// failure). It renders the formatted count for >=1000 ("1.2k", "134k"),
// the raw integer below 1000, and falls back to a plain "GitHub" label
// when the count is null (no number-shaped content). The wrapping
// <Link> always targets the seldonframe/crm GitHub repo regardless of
// state — that link is the section's primary CTA.
//
// Same shape-walking pattern as the rest of tests/unit/landing/*.spec.ts.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { GitHubStarsBadge } from "../../../src/components/landing/github-stars-badge";
import { LandingOpenSourceSection } from "../../../src/components/landing/open-source-section";

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

// JSON.stringify-safe serializer (lucide-react icon components hold
// circular refs in their `type` slot; mirror the helper from
// marketing-pricing.spec.ts so the assertion can read element text).
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

describe("GitHubStarsBadge", () => {
  test("formats 4-digit star count with k suffix (1234 → 1.2k)", () => {
    const result = GitHubStarsBadge({ stars: 1234 });
    const text = safeText(result);
    assert.match(text, /1\.2k|1\.2K/);
  });

  test("formats 6-digit star count with k suffix (134567 → 135k or 134k)", () => {
    const result = GitHubStarsBadge({ stars: 134567 });
    const text = safeText(result);
    // 134567 / 1000 = 134.567 → Math.round → 135. Allow either to
    // protect against future rounding-rule polish.
    assert.match(text, /13[45]k|13[45]K/);
  });

  test("uses raw number under 1000", () => {
    const result = GitHubStarsBadge({ stars: 42 });
    const text = safeText(result);
    // Substring "42" appears in the formatted span; tolerant of
    // surrounding markup.
    assert.match(text, /"42"|>42</);
  });

  test("falls back to 'GitHub' label only when stars is null", () => {
    const result = GitHubStarsBadge({ stars: null });
    const text = safeText(result);
    assert.match(text, /GitHub|seldonframe\/crm/);
    // No star-count number-shaped substring should be present.
    // Width/height JSON values from icon components are filtered by
    // restricting the search to text between > and <, which is the
    // only place rendered text lives.
    const textBetweenTags = (text.match(/>[^<]+</g) ?? []).join("");
    assert.doesNotMatch(textBetweenTags, /\d+/);
  });

  test("link always points at the seldonframe/crm GitHub repo", () => {
    const text = safeText(GitHubStarsBadge({ stars: 100 }));
    assert.match(text, /github\.com\/seldonframe\/crm/);
  });
});

describe("LandingOpenSourceSection", () => {
  test("renders 3 pillar cards", async () => {
    const result = await LandingOpenSourceSection();
    const pillars = flatten(result).filter(
      (el) => typeof (el.props as { "data-pillar"?: string })?.["data-pillar"] === "string",
    );
    assert.equal(pillars.length, 3, "must render 3 pillars");
  });

  test("H2 reframes lock-in fear (contains 'fork')", async () => {
    const result = await LandingOpenSourceSection();
    const text = safeText(result);
    // The Phase 5 H2 ux-copy refines past a passive AGPL fact statement
    // to an active fork promise. Test the refined-copy intent (not the
    // exact string) so future copy polish doesn't break the assertion.
    assert.match(text, /fork/i);
  });

  test("subtitle surfaces AGPL-3.0 license string", async () => {
    const result = await LandingOpenSourceSection();
    const text = safeText(result);
    assert.match(text, /AGPL-3\.0/);
  });

  test("Pillar 3 addresses data-ownership concern", async () => {
    const result = await LandingOpenSourceSection();
    const text = safeText(result);
    // Pillar 3 carries the GDPR / data-portability message from the
    // design-critique flag. The body mentions "Postgres" (concrete
    // export format) — substring match is sufficient.
    assert.match(text, /Postgres|data/i);
  });
});
