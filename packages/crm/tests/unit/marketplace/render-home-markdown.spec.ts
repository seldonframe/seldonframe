// Marketing-homepage Markdown twin (/home.md) renderer — pure. These tests lock
// the clean output shape (H1 promise + the single-sourced positioning blockquote
// + the how-it-works steps + the includes list + pricing + links) and the
// load-bearing facts the GEO research says move AI visibility (the 60-second
// claim, the $29 price, named capabilities), plus absolute links.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { renderHomeMarkdown, homeUrl, HOME_BASE_URL } from "../../../src/lib/marketplace/render-home-markdown";
import { POSITIONING_ONE_LINER } from "../../../src/app/(public)/home-copy";

describe("renderHomeMarkdown()", () => {
  test("leads with an H1 promise", () => {
    const md = renderHomeMarkdown();
    assert.match(md, /^# SeldonFrame — a whole client front office, live in 60 seconds/);
  });

  test("quotes the SHARED positioning line verbatim (single source, no drift)", () => {
    const md = renderHomeMarkdown();
    // The blockquote must be exactly the page's POSITIONING_ONE_LINER — proving
    // the core promise can't drift between the HTML page and the Markdown.
    assert.ok(md.includes(`> ${POSITIONING_ONE_LINER}`), "blockquote must contain the shared positioning line");
  });

  test("has the canonical sections", () => {
    const md = renderHomeMarkdown();
    assert.match(md, /## How it works/);
    assert.match(md, /## What every workspace includes/);
    assert.match(md, /## Pricing/);
    assert.match(md, /## Links/);
  });

  test("front-loads the load-bearing facts (60s, $29, named capabilities)", () => {
    const md = renderHomeMarkdown();
    assert.match(md, /60 seconds/);
    assert.match(md, /\$29\/mo/);
    // Trial-based pricing was removed 2026-07-05; the live PROOF facts
    // front-load "free to build" + flat pricing + no lock-in instead.
    assert.match(md, /Build it free/);
    assert.match(md, /Cancel anytime/);
    // Named capabilities the homepage ships — concrete specifics, not metadata.
    assert.match(md, /AI receptionist/);
    assert.match(md, /Missed-call text-back/);
    assert.match(md, /Review requester/i);
    assert.match(md, /Booking page/);
    assert.match(md, /CRM/);
  });

  test("numbers the three how-it-works steps", () => {
    const md = renderHomeMarkdown();
    assert.match(md, /1\. \*\*Paste a URL/);
    assert.match(md, /2\. \*\*Watch it spin up/);
    assert.match(md, /3\. \*\*Run it yourself/);
  });

  test("default base URL is the live marketing origin; links are absolute", () => {
    const md = renderHomeMarkdown();
    assert.equal(homeUrl(), HOME_BASE_URL);
    assert.match(md, /https:\/\/seldonframe\.com\/marketplace/);
    assert.match(md, /https:\/\/seldonframe\.com\/ai-agents/);
    assert.match(md, /https:\/\/seldonframe\.com\/pricing/);
    assert.match(md, /https:\/\/seldonframe\.com\/signup/);
    // No relative links leak in.
    assert.ok(!/\]\(\/[^/]/.test(md), "must not contain relative markdown links");
  });

  test("a custom base URL is honored + trailing slash trimmed", () => {
    const md = renderHomeMarkdown("https://staging.example.com/");
    assert.equal(homeUrl("https://staging.example.com/"), "https://staging.example.com");
    assert.match(md, /https:\/\/staging\.example\.com\/marketplace/);
    assert.ok(!md.includes("https://staging.example.com//marketplace"), "no double slash");
  });

  test("ends with a pointer back to the human homepage", () => {
    const md = renderHomeMarkdown();
    assert.match(md, /See the full homepage: https:\/\/seldonframe\.com\//);
  });
});
