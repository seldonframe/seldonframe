// Tests for <PageShell>. SLICE 4a PR 1 C3 per audit §2.1.
//
// Strategy: renderToString via react-dom/server — captures the
// rendered HTML without needing jsdom. Tests assert on the
// rendered structure (landmarks, text content, classes). Full
// interaction testing is out of scope for SLICE 4a per G-4-6.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { renderToString } from "react-dom/server";

import { PageShell } from "../../../src/components/ui-composition/page-shell";

describe("<PageShell> — structural landmarks", () => {
  test("renders title as an h1", () => {
    const html = renderToString(
      <PageShell title="My page">
        <div>content</div>
      </PageShell>,
    );
    assert.match(html, /<h1[^>]*>[^<]*My page[^<]*<\/h1>/);
  });

  test("renders children content", () => {
    const html = renderToString(
      <PageShell title="x">
        <div data-testid="body">hello</div>
      </PageShell>,
    );
    assert.match(html, /data-testid="body"/);
    assert.match(html, />hello</);
  });

  test("uses the page-title typography token", () => {
    const html = renderToString(
      <PageShell title="x">
        <div />
      </PageShell>,
    );
    assert.match(html, /class="[^"]*text-page-title/);
  });
});

describe("<PageShell> — optional description", () => {
  test("omits the description element when prop absent", () => {
    const html = renderToString(
      <PageShell title="x">
        <div />
      </PageShell>,
    );
    // No <p>…</p> landmark when no description provided.
    assert.ok(!html.includes('data-page-shell-description'));
  });

  test("renders description when provided", () => {
    const html = renderToString(
      <PageShell title="x" description="A subtitle line.">
        <div />
      </PageShell>,
    );
    assert.match(html, /data-page-shell-description/);
    assert.match(html, /A subtitle line\./);
  });
});

describe("<PageShell> — actions slot", () => {
  test("omits the actions container when prop absent", () => {
    const html = renderToString(
      <PageShell title="x">
        <div />
      </PageShell>,
    );
    assert.ok(!html.includes('data-page-shell-actions'));
  });

  test("renders actions slot content when provided", () => {
    const html = renderToString(
      <PageShell title="x" actions={<button>New</button>}>
        <div />
      </PageShell>,
    );
    assert.match(html, /data-page-shell-actions/);
    assert.match(html, /<button[^>]*>New<\/button>/);
  });
});

describe("<PageShell> — breadcrumbs slot", () => {
  test("omits breadcrumbs when prop absent", () => {
    const html = renderToString(
      <PageShell title="x">
        <div />
      </PageShell>,
    );
    assert.ok(!html.includes('data-page-shell-breadcrumbs'));
  });

  test("renders breadcrumb entries", () => {
    const html = renderToString(
      <PageShell
        title="x"
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Contacts", href: "/contacts" },
          { label: "Alice" },
        ]}
      >
        <div />
      </PageShell>,
    );
    assert.match(html, /data-page-shell-breadcrumbs/);
    assert.match(html, /Home/);
    assert.match(html, /Contacts/);
    assert.match(html, /Alice/);
    // Links present for items with href.
    assert.match(html, /href="\//);
    assert.match(html, /href="\/contacts"/);
  });
});

describe("<PageShell> — accessibility + semantics", () => {
  test("outermost wrapper is a <main> or has role='main' (admin page landmark)", () => {
    const html = renderToString(
      <PageShell title="x">
        <div />
      </PageShell>,
    );
    // Either a <main> tag or role="main" on the wrapper.
    const hasMain = /<main[\s>]/.test(html) || /role="main"/.test(html);
    assert.ok(hasMain, "expected a main landmark at the page root");
  });

  test("breadcrumbs use nav landmark with aria-label", () => {
    const html = renderToString(
      <PageShell
        title="x"
        breadcrumbs={[{ label: "Home", href: "/" }]}
      >
        <div />
      </PageShell>,
    );
    assert.match(html, /<nav[^>]*aria-label="Breadcrumb"/);
  });
});
