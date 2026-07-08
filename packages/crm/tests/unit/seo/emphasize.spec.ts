// Unit tests for the skimmability helpers shared by every comparison /
// alternative / best SEO page: emphasize() (React <strong> nodes) and
// emphasizeMd() (Markdown **bold**). Verifies price ranges, en-dashes,
// idempotency, and no-match passthrough.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { emphasize, emphasizeMd } from "../../../src/lib/seo/emphasize";

function renderEmphasize(text: string): string {
  const node = emphasize(text);
  // emphasize() returns a ReactNode (string | array of string/<strong>).
  // Wrap in a fragment-friendly container for static rendering.
  return renderToStaticMarkup(node as any);
}

describe("emphasize (React)", () => {
  test("wraps a flat dollar amount", () => {
    const html = renderEmphasize("SeldonFrame is $29/mo flat.");
    assert.match(html, /<strong>\$29\/mo<\/strong>/);
  });

  test("wraps a dollar price range with a hyphen", () => {
    const html = renderEmphasize("Pricing runs $97-$497/mo depending on tier.");
    assert.match(html, /<strong>\$97-\$497\/mo<\/strong>/);
  });

  test("wraps a dollar price range with an en-dash", () => {
    const html = renderEmphasize("Pricing runs $97–$497/mo depending on tier.");
    assert.match(html, /<strong>\$97–\$497\/mo<\/strong>/);
  });

  test("wraps a per-minute price", () => {
    const html = renderEmphasize("Calls cost $0.30/min on their plan.");
    assert.match(html, /<strong>\$0\.30\/min<\/strong>/);
  });

  test("wraps a plain large dollar amount with a comma", () => {
    const html = renderEmphasize("Setup runs about $3,000 up front.");
    assert.match(html, /<strong>\$3,000<\/strong>/);
  });

  test("wraps a percentage", () => {
    const html = renderEmphasize("They take a 5% cut of every sale.");
    assert.match(html, /<strong>5%<\/strong>/);
  });

  test("wraps the phrase 'flat' case-insensitively", () => {
    const html = renderEmphasize("It is a FLAT monthly fee.");
    assert.match(html, /<strong>FLAT<\/strong>/);
  });

  test("wraps 'per minute', 'per credit', 'per contact', 'per user', 'per location', 'per seat', 'per call'", () => {
    const phrases = ["per minute", "per credit", "per contact", "per user", "per location", "per seat", "per call"];
    for (const phrase of phrases) {
      const html = renderEmphasize(`Billed ${phrase} on this plan.`);
      assert.match(html, new RegExp(`<strong>${phrase}</strong>`, "i"), `expected to wrap "${phrase}"`);
    }
  });

  test("wraps 'quote-gated', 'free forever', 'unlimited workspaces', 'add-on'", () => {
    const phrases = ["quote-gated", "free forever", "unlimited workspaces", "add-on"];
    for (const phrase of phrases) {
      const html = renderEmphasize(`This is ${phrase} for now.`);
      assert.match(html, new RegExp(`<strong>${phrase}</strong>`, "i"), `expected to wrap "${phrase}"`);
    }
  });

  test("does not double-wrap overlapping matches (money adjacent to a phrase)", () => {
    const html = renderEmphasize("$29/mo flat, unlimited workspaces, first workspace free forever.");
    // Each phrase should appear wrapped exactly once, not nested.
    assert.match(html, /<strong>\$29\/mo<\/strong>/);
    assert.match(html, /<strong>flat<\/strong>/i);
    assert.match(html, /<strong>unlimited workspaces<\/strong>/i);
    assert.match(html, /<strong>free forever<\/strong>/i);
    assert.doesNotMatch(html, /<strong><strong>/);
  });

  test("passes through text with no matches unchanged", () => {
    const text = "This sentence has no high-signal tokens at all.";
    const result = emphasize(text);
    assert.equal(result, text);
  });

  test("passes through empty string unchanged", () => {
    assert.equal(emphasize(""), "");
  });

  test("returns an array with stable keys when multiple matches exist", () => {
    const node = emphasize("Costs $29/mo and $49/mo separately.") as unknown[];
    assert.ok(Array.isArray(node), "expected an array of nodes");
    const strongCount = (node as any[]).filter((n) => isValidElement(n)).length;
    assert.equal(strongCount, 2);
  });
});

describe("emphasizeMd (Markdown)", () => {
  test("wraps a flat dollar amount in **bold**", () => {
    assert.equal(emphasizeMd("SeldonFrame is $29/mo flat."), "SeldonFrame is **$29/mo** **flat**.");
  });

  test("wraps a dollar price range with an en-dash", () => {
    const out = emphasizeMd("Pricing runs $97–$497/mo depending on tier.");
    assert.match(out, /\*\*\$97–\$497\/mo\*\*/);
  });

  test("wraps a percentage", () => {
    assert.match(emphasizeMd("They take a 5% cut."), /\*\*5%\*\*/);
  });

  test("passes through text with no matches unchanged", () => {
    const text = "Nothing special about this line.";
    assert.equal(emphasizeMd(text), text);
  });

  test("passes through empty string unchanged", () => {
    assert.equal(emphasizeMd(""), "");
  });

  test("is idempotent — running twice never produces ****", () => {
    const once = emphasizeMd("SeldonFrame is $29/mo flat, unlimited workspaces, free forever.");
    const twice = emphasizeMd(once);
    assert.doesNotMatch(twice, /\*\*\*\*/);
    assert.equal(twice, once);
  });

  test("is idempotent for a plain percentage and money mix", () => {
    const once = emphasizeMd("Fees run 2-5% plus $0.30/min per call.");
    const twice = emphasizeMd(once);
    assert.doesNotMatch(twice, /\*\*\*\*/);
    assert.equal(twice, once);
  });
});
