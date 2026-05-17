// packages/crm/tests/unit/web-onboarding/html-to-markdown.spec.ts
//
// Pure-function tests on synthetic HTML. No network. No file IO.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { htmlToMarkdown } from "../../../src/lib/web-onboarding/html-to-markdown";

describe("htmlToMarkdown", () => {
  test("strips script, style, and noscript blocks", () => {
    const html = `
      <html>
        <head>
          <style>body { color: red; }</style>
          <script>alert('x');</script>
        </head>
        <body>
          <noscript>JS required</noscript>
          <p>Hello world</p>
        </body>
      </html>
    `;
    const md = htmlToMarkdown(html);
    assert.ok(md.includes("Hello world"), "kept paragraph content");
    assert.ok(!md.includes("alert"), "stripped script");
    assert.ok(!md.includes("color: red"), "stripped style");
    assert.ok(!md.includes("JS required"), "stripped noscript");
  });

  test("preserves headings, lists, and links", () => {
    const html = `
      <h1>Acme Plumbing</h1>
      <h2>Services</h2>
      <ul>
        <li>Drain cleaning</li>
        <li>Water heater repair</li>
      </ul>
      <p>Visit <a href="https://acme.com/about">our about page</a>.</p>
    `;
    const md = htmlToMarkdown(html);
    assert.match(md, /^# Acme Plumbing/m, "kept H1");
    assert.match(md, /^## Services/m, "kept H2");
    assert.match(md, /Drain cleaning/, "kept first list item");
    assert.match(md, /Water heater repair/, "kept second list item");
    assert.match(md, /\[our about page\]\(https:\/\/acme\.com\/about\)/, "kept link text + href");
  });

  test("converts normal images to ![alt](url) and drops data: URI images entirely", () => {
    // Normal images: alt text + URL are preserved in standard MD syntax.
    const normalMd = htmlToMarkdown(
      `<p>Before</p><img alt="Team photo" src="/team.jpg" /><p>After</p>`,
    );
    assert.ok(normalMd.includes("Team photo"), "kept alt for normal image");
    assert.ok(normalMd.includes("/team.jpg"), "kept src for normal image");

    // Data-URI images: dropped entirely (keepDataImages: false). The
    // safety contract is "no base64 bytes in MD output" — the alt text
    // tradeoff is acceptable because data-URI images are nearly always
    // decorative (icons, logos) not business-fact-bearing.
    const dataUriMd = htmlToMarkdown(
      `<p>Before</p><img alt="Team photo" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgA=" /><p>After</p>`,
    );
    assert.ok(!dataUriMd.includes("base64"), "did not inline data URI literal");
    assert.ok(!dataUriMd.includes("iVBORw"), "did not inline data URI body");
    assert.ok(dataUriMd.includes("Before") && dataUriMd.includes("After"), "kept surrounding text");
  });

  test("keeps header, footer, and nav content (business facts live there)", () => {
    const html = `
      <html><body>
        <header>
          <a href="tel:206-555-0100">(206) 555-0100</a>
        </header>
        <main><p>main content</p></main>
        <footer>
          <address>123 Main St, Seattle, WA 98101</address>
          <p>Family-owned since 1998</p>
        </footer>
        <nav>
          <a href="/services">Services</a>
          <a href="/contact">Contact</a>
        </nav>
      </body></html>
    `;
    const md = htmlToMarkdown(html);
    assert.match(md, /\(206\) 555-0100/, "kept phone from header");
    assert.match(md, /123 Main St, Seattle, WA 98101/, "kept address from footer");
    assert.match(md, /Family-owned since 1998/, "kept trust signal from footer");
    assert.match(md, /Services/, "kept nav link text");
  });

  test("truncates output to maxChars when content exceeds the cap", () => {
    const html = "<p>" + "a".repeat(20_000) + "</p>";
    const md = htmlToMarkdown(html, { maxChars: 500 });
    assert.equal(md.length, 500, "truncated to exact maxChars");
  });

  test("returns empty string for empty or whitespace-only input", () => {
    assert.equal(htmlToMarkdown(""), "");
    assert.equal(htmlToMarkdown("   \n\t  "), "");
  });
});
