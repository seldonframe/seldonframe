// Accept-header content negotiation — the SAFETY-CRITICAL helper that runs in
// the proxy on every matched marketplace request. These tests lock the four
// non-negotiables: compare q-values (no substring match), resolve a tie to
// Markdown ONLY when text/markdown is explicitly named, wildcards never flip a
// browser to Markdown, and the 406 (acceptsNeither) decision.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { negotiate, acceptsNeither } from "../../../src/lib/http/negotiate";

describe("negotiate() — HTML by default (conservative)", () => {
  test("absent/empty Accept → html (no stated preference)", () => {
    assert.equal(negotiate(undefined), "html");
    assert.equal(negotiate(null), "html");
    assert.equal(negotiate(""), "html");
    assert.equal(negotiate("   "), "html");
  });

  test("a real browser Accept → html", () => {
    // Chrome's actual default Accept.
    assert.equal(
      negotiate(
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      ),
      "html",
    );
  });

  test("*/* alone → html (markdown only via wildcard, never explicit)", () => {
    assert.equal(negotiate("*/*"), "html");
  });

  test("text/* alone → html (still only a wildcard match for markdown)", () => {
    assert.equal(negotiate("text/*"), "html");
  });

  test("only an unrelated type (application/json) → html", () => {
    assert.equal(negotiate("application/json"), "html");
  });
});

describe("negotiate() — q-value comparison (not substring matching)", () => {
  test("text/html, text/markdown;q=0.5 → html (1.0 > 0.5)", () => {
    assert.equal(negotiate("text/html, text/markdown;q=0.5"), "html");
  });

  test("text/markdown;q=0.9, text/html → html (1.0 > 0.9)", () => {
    assert.equal(negotiate("text/markdown;q=0.9, text/html"), "html");
  });

  test("text/markdown;q=0.8, text/html;q=0.5 → markdown (0.8 > 0.5)", () => {
    assert.equal(negotiate("text/markdown;q=0.8, text/html;q=0.5"), "markdown");
  });

  test("substring-only presence does NOT win when html outranks it", () => {
    // Naive `includes('text/markdown')` would wrongly serve markdown here.
    assert.equal(negotiate("text/html;q=1.0, text/markdown;q=0.1"), "html");
  });

  test("text/markdown;q=0 (explicitly unacceptable) → html", () => {
    assert.equal(negotiate("text/markdown;q=0, text/html"), "html");
    assert.equal(negotiate("text/markdown;q=0"), "html");
  });
});

describe("negotiate() — markdown wins only when explicit + >= html", () => {
  test("text/markdown alone → markdown", () => {
    assert.equal(negotiate("text/markdown"), "markdown");
  });

  test("text/markdown with a charset param → markdown", () => {
    assert.equal(negotiate("text/markdown; charset=utf-8"), "markdown");
  });

  test("explicit tie (both q=1.0, markdown named) → markdown", () => {
    assert.equal(negotiate("text/markdown, text/html"), "markdown");
    assert.equal(negotiate("text/html, text/markdown"), "markdown");
  });

  test("explicit tie at a lower equal q → markdown", () => {
    assert.equal(negotiate("text/markdown;q=0.7, text/html;q=0.7"), "markdown");
  });

  test("markdown explicit + html only via wildcard → markdown", () => {
    // html is q=0.8 (via */*), markdown is q=1.0 explicit → markdown.
    assert.equal(negotiate("text/markdown, */*;q=0.8"), "markdown");
  });

  test("Claude Code / agent-style Accept (markdown first) → markdown", () => {
    assert.equal(negotiate("text/markdown, text/plain;q=0.9, */*;q=0.5"), "markdown");
  });
});

describe("negotiate() — robustness (malformed input never throws, defaults html)", () => {
  test("junk tokens are skipped, not crashed on", () => {
    assert.equal(negotiate("garbage,,, ;;; text/html"), "html");
  });

  test("a bare type with no subtype is ignored", () => {
    assert.equal(negotiate("text, text/markdown"), "markdown");
    assert.equal(negotiate("text"), "html");
  });

  test("a NaN q-value falls back to the default (1)", () => {
    // markdown q parses to NaN → treated as 1; tie with html (1) → markdown.
    assert.equal(negotiate("text/markdown;q=abc, text/html"), "markdown");
  });

  test("q above 1 clamps to 1 (does not beat an explicit html=1 as a tie→md)", () => {
    assert.equal(negotiate("text/markdown;q=5, text/html;q=1"), "markdown");
  });

  test("case-insensitive media types", () => {
    assert.equal(negotiate("TEXT/MARKDOWN"), "markdown");
    assert.equal(negotiate("Text/HTML, Text/Markdown;q=0.5"), "html");
  });
});

describe("acceptsNeither() — the 406 decision for .md route handlers", () => {
  test("absent/empty Accept → false (accepts everything)", () => {
    assert.equal(acceptsNeither(undefined), false);
    assert.equal(acceptsNeither(""), false);
  });

  test("*/* → false (wildcard accepts the markdown we serve)", () => {
    assert.equal(acceptsNeither("*/*"), false);
  });

  test("text/* → false (wildcard subtype accepts text/markdown)", () => {
    assert.equal(acceptsNeither("text/*"), false);
  });

  test("text/markdown → false", () => {
    assert.equal(acceptsNeither("text/markdown"), false);
  });

  test("text/html → false (html is one of the two acceptable types)", () => {
    assert.equal(acceptsNeither("text/html"), false);
  });

  test("only application/json (no wildcard) → true (neither acceptable)", () => {
    assert.equal(acceptsNeither("application/json"), true);
  });

  test("image/png, application/pdf → true", () => {
    assert.equal(acceptsNeither("image/png, application/pdf"), true);
  });

  test("text/markdown;q=0 with no other text → true (explicitly unacceptable)", () => {
    assert.equal(acceptsNeither("text/markdown;q=0"), true);
  });
});
