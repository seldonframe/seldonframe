// ============================================================================
// v1.12.0 — composite-block renderer tests (HTML output)
// ============================================================================
//
// Snapshot-style tests for the renderer. We don't pin the EXACT HTML
// (would break on every CSS-class rename); we assert STRUCTURAL
// invariants that operators / agents care about:
//
//   - The rendered HTML contains the operator's text content
//   - Headings emit semantic <h1>/<h2>/<h3>
//   - Lists with style=check render check-marks
//   - Buttons render with appropriate href / data-action
//   - Embeds resolve from the workspace context (or render placeholder)
//   - Theme classes apply (sf-cmp-* hierarchy)
//   - HTML is ESCAPED (no script injection from operator/LLM-supplied
//     text)
//
// The renderer is pure: tree + context in, html string out. No I/O.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  renderCompositeTree,
  COMPOSITE_CSS,
} from "@/lib/page-blocks/composite/render";
import type { CompositeNode } from "@/lib/page-blocks/composite/schema";
import type { CompositeRenderContext } from "@/lib/page-blocks/composite/render";

// Minimal context for tests. Real renderer integration passes a fuller
// context derived from the workspace blueprint.
const CTX: CompositeRenderContext = {
  workspace_phone: "+16045550142",
  workspace_phone_display: "(604) 555-0142",
  services: [
    { name: "AC Repair", description: "Same-day fixes." },
    { name: "Heating Installation", description: "Free estimates." },
  ],
  faq: [
    { question: "Do you serve weekends?", answer: "Yes." },
  ],
  testimonials: [],
  hours_summary: "Mon–Sat 7:00–19:00",
  book_url: "/book",
  intake_url: "/intake",
};

// ─── basic primitives render to expected HTML shape ────────────────────────

test("renderCompositeTree emits an <h1>/<h2>/<h3> for heading nodes", () => {
  for (const level of [1, 2, 3] as const) {
    const tree: CompositeNode = {
      kind: "section",
      children: [{ kind: "heading", level, text: `Level ${level}` }],
    };
    const html = renderCompositeTree(tree, CTX);
    assert.match(html, new RegExp(`<h${level}[^>]*>Level ${level}</h${level}>`));
  }
});

test("renderCompositeTree emits a paragraph for text nodes", () => {
  const tree: CompositeNode = {
    kind: "section",
    children: [{ kind: "text", text: "Hello world" }],
  };
  const html = renderCompositeTree(tree, CTX);
  assert.match(html, /<p[^>]*>Hello world<\/p>/);
});

test("renderCompositeTree escapes HTML in operator-supplied text", () => {
  // Critical: operator/LLM text must not be able to inject <script>.
  const tree: CompositeNode = {
    kind: "section",
    headline: '<script>alert("xss")</script>',
    children: [
      { kind: "text", text: 'Hello <img src=x onerror="alert(1)">' },
    ],
  };
  const html = renderCompositeTree(tree, CTX);
  assert.ok(!html.includes("<script>"), "must escape <script>");
  assert.ok(!html.includes('onerror="alert'), "must escape inline handlers");
  assert.ok(html.includes("&lt;script&gt;") || html.includes("&lt;"), "must HTML-escape");
});

test("renderCompositeTree renders list with check style as marked items", () => {
  const tree: CompositeNode = {
    kind: "section",
    children: [
      { kind: "list", style: "check", items: ["A", "B", "C"] },
    ],
  };
  const html = renderCompositeTree(tree, CTX);
  // Class marker on the list lets CSS apply ✓ markers.
  assert.match(html, /sf-cmp-list-check/);
  assert.match(html, /<li[^>]*>A<\/li>/);
  assert.match(html, /<li[^>]*>B<\/li>/);
  assert.match(html, /<li[^>]*>C<\/li>/);
});

test("renderCompositeTree renders list with x style", () => {
  const tree: CompositeNode = {
    kind: "section",
    children: [{ kind: "list", style: "x", items: ["a", "b"] }],
  };
  const html = renderCompositeTree(tree, CTX);
  assert.match(html, /sf-cmp-list-x/);
});

test("renderCompositeTree renders button with action.kind=navigate as anchor", () => {
  const tree: CompositeNode = {
    kind: "section",
    children: [
      {
        kind: "button",
        label: "Read more",
        action: { kind: "navigate", href: "/about" },
      },
    ],
  };
  const html = renderCompositeTree(tree, CTX);
  assert.match(html, /<a[^>]*href="\/about"[^>]*>Read more<\/a>/);
});

test("renderCompositeTree renders button with action.kind=book → href=book_url", () => {
  const tree: CompositeNode = {
    kind: "section",
    children: [
      { kind: "button", label: "Book now", action: { kind: "book" } },
    ],
  };
  const html = renderCompositeTree(tree, CTX);
  assert.match(html, /<a[^>]*href="\/book"[^>]*>Book now<\/a>/);
});

test("renderCompositeTree renders button with action.kind=phone → tel: link", () => {
  const tree: CompositeNode = {
    kind: "section",
    children: [
      { kind: "button", label: "Call us", action: { kind: "phone" } },
    ],
  };
  const html = renderCompositeTree(tree, CTX);
  assert.match(html, /<a[^>]*href="tel:\+16045550142"[^>]*>Call us<\/a>/);
});

test("renderCompositeTree renders stat with value + label", () => {
  const tree: CompositeNode = {
    kind: "section",
    children: [{ kind: "stat", value: "4.8★", label: "Average rating" }],
  };
  const html = renderCompositeTree(tree, CTX);
  assert.match(html, /4\.8★/);
  assert.match(html, /Average rating/);
  assert.match(html, /sf-cmp-stat/);
});

test("renderCompositeTree resolves embed.ref=phone to the workspace phone display", () => {
  const tree: CompositeNode = {
    kind: "section",
    children: [{ kind: "embed", ref: "phone" }],
  };
  const html = renderCompositeTree(tree, CTX);
  assert.match(html, /\(604\) 555-0142/);
});

test("renderCompositeTree resolves embed.ref=services to a list of services", () => {
  const tree: CompositeNode = {
    kind: "section",
    children: [{ kind: "embed", ref: "services" }],
  };
  const html = renderCompositeTree(tree, CTX);
  assert.match(html, /AC Repair/);
  assert.match(html, /Heating Installation/);
});

test("renderCompositeTree handles missing embed data gracefully (no crash)", () => {
  const emptyCtx: CompositeRenderContext = {
    ...CTX,
    services: [],
    faq: [],
    testimonials: [],
    workspace_phone: "",
    workspace_phone_display: "",
  };
  for (const ref of ["services", "faq", "testimonials", "hours", "phone"] as const) {
    const tree: CompositeNode = {
      kind: "section",
      children: [{ kind: "embed", ref }],
    };
    const html = renderCompositeTree(tree, emptyCtx);
    assert.equal(typeof html, "string");
    // We never crash; render a placeholder span.
    assert.ok(html.length > 0, `embed ref=${ref} produced empty output`);
  }
});

// ─── containers ────────────────────────────────────────────────────────────

test("renderCompositeTree wraps section content in <section class='sf-cmp-section'>", () => {
  const tree: CompositeNode = {
    kind: "section",
    eyebrow: "EYEBROW",
    headline: "HEADLINE",
    subhead: "SUBHEAD",
    children: [{ kind: "text", text: "body" }],
  };
  const html = renderCompositeTree(tree, CTX);
  assert.match(html, /<section[^>]*class="[^"]*sf-cmp-section[^"]*"/);
  assert.match(html, /EYEBROW/);
  assert.match(html, /HEADLINE/);
  assert.match(html, /SUBHEAD/);
});

test("renderCompositeTree row renders 2/3/4 columns", () => {
  for (const cols of [2, 3, 4] as const) {
    const tree: CompositeNode = {
      kind: "section",
      children: [
        {
          kind: "row",
          cols,
          children: Array.from({ length: cols }, (_, i) => ({
            kind: "text",
            text: `col ${i}`,
          })) as unknown as CompositeNode[],
        },
      ],
    };
    const html = renderCompositeTree(tree, CTX);
    assert.match(html, new RegExp(`sf-cmp-row-${cols}`));
  }
});

test("renderCompositeTree card with variant=muted carries the muted class", () => {
  const tree: CompositeNode = {
    kind: "section",
    children: [
      {
        kind: "card",
        variant: "muted",
        children: [{ kind: "text", text: "muted content" }],
      },
    ],
  };
  const html = renderCompositeTree(tree, CTX);
  assert.match(html, /sf-cmp-card-muted/);
});

test("renderCompositeTree handles the canonical comparison pattern end-to-end", () => {
  const tree: CompositeNode = {
    kind: "section",
    eyebrow: "Why us",
    headline: "With us vs. DIY",
    children: [
      {
        kind: "row",
        cols: 2,
        children: [
          {
            kind: "card",
            children: [
              { kind: "heading", level: 3, text: "With Cypress & Pine" },
              {
                kind: "list",
                style: "check",
                items: ["Same-day", "Insured", "12 years"],
              },
            ],
          },
          {
            kind: "card",
            variant: "muted",
            children: [
              { kind: "heading", level: 3, text: "DIY" },
              {
                kind: "list",
                style: "x",
                items: ["No tools", "No insurance", "Hours wasted"],
              },
            ],
          },
        ],
      },
    ],
  };
  const html = renderCompositeTree(tree, CTX);

  // Both columns and all content present. The "&" in the heading is
  // HTML-escaped to "&amp;" — that's correct/required.
  assert.match(html, /With Cypress &amp; Pine/);
  assert.match(html, /Same-day/);
  assert.match(html, /Hours wasted/);
  // Container hierarchy: section > row > 2 cards > heading + list
  assert.match(html, /sf-cmp-section/);
  assert.match(html, /sf-cmp-row-2/);
  assert.match(html, /sf-cmp-card/);
});

// ─── COMPOSITE_CSS sanity ──────────────────────────────────────────────────

test("COMPOSITE_CSS is a non-empty string with the core classes", () => {
  assert.equal(typeof COMPOSITE_CSS, "string");
  assert.ok(COMPOSITE_CSS.length > 200, "CSS chunk seems empty");
  for (const cls of [
    ".sf-cmp-section",
    ".sf-cmp-row",
    ".sf-cmp-card",
    ".sf-cmp-button",
    ".sf-cmp-list",
    ".sf-cmp-stat",
  ]) {
    assert.ok(COMPOSITE_CSS.includes(cls), `expected CSS to include ${cls}`);
  }
});

test("COMPOSITE_CSS uses theme tokens (CSS custom properties), not hardcoded colors", () => {
  // Theme integration check: composite blocks should respect the
  // workspace's theme. Hardcoded #fff or #000 in the composite styles
  // would break dark-mode workspaces.
  for (const token of ["--sf-bg", "--sf-text", "--sf-border", "--sf-primary"]) {
    assert.ok(
      COMPOSITE_CSS.includes(token),
      `expected CSS to use theme token var(${token})`,
    );
  }
});
