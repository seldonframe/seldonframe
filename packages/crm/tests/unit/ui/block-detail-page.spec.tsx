// Tests for <BlockDetailPage>. SLICE 4a PR 2 C1 per audit §2.1.
//
// Strategy: renderToString + regex assertions (G-4-6 shallow
// harness). Covers PageShell integration, tabs nav, subtitle,
// and a11y landmarks. Tab body is rendered via children —
// parent decides which tab's content to render based on route/
// searchParams — so tab content is NOT tested at this level.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { renderToString } from "react-dom/server";

import { BlockDetailPage } from "../../../src/components/ui-composition/block-detail-page";

describe("<BlockDetailPage> — structural landmarks", () => {
  test("renders title as an h1 (via PageShell)", () => {
    const html = renderToString(
      <BlockDetailPage title="Alice Smith">
        <div>body</div>
      </BlockDetailPage>,
    );
    assert.match(html, /<h1[^>]*>[^<]*Alice Smith[^<]*<\/h1>/);
  });

  test("renders children inside the content area", () => {
    const html = renderToString(
      <BlockDetailPage title="x">
        <div data-testid="body">details go here</div>
      </BlockDetailPage>,
    );
    assert.match(html, /data-testid="body"/);
    assert.match(html, />details go here</);
  });

  test("has a <main> landmark via PageShell", () => {
    const html = renderToString(
      <BlockDetailPage title="x">
        <div />
      </BlockDetailPage>,
    );
    assert.match(html, /<main[\s>]/);
  });
});

describe("<BlockDetailPage> — optional subtitle", () => {
  test("omits subtitle element when prop absent", () => {
    const html = renderToString(
      <BlockDetailPage title="x">
        <div />
      </BlockDetailPage>,
    );
    assert.ok(!html.includes("data-block-detail-subtitle"));
  });

  test("renders subtitle when provided", () => {
    const html = renderToString(
      <BlockDetailPage title="x" subtitle="alice@example.com">
        <div />
      </BlockDetailPage>,
    );
    assert.match(html, /data-block-detail-subtitle/);
    assert.match(html, /alice@example\.com/);
  });
});

describe("<BlockDetailPage> — optional tabs", () => {
  test("omits tabs nav when prop absent", () => {
    const html = renderToString(
      <BlockDetailPage title="x">
        <div />
      </BlockDetailPage>,
    );
    assert.ok(!html.includes("data-block-detail-tabs"));
  });

  test("renders tabs as a nav with links", () => {
    const html = renderToString(
      <BlockDetailPage
        title="x"
        tabs={[
          { id: "overview", label: "Overview", href: "/a?tab=overview" },
          { id: "activities", label: "Activities", href: "/a?tab=activities" },
        ]}
      >
        <div />
      </BlockDetailPage>,
    );
    assert.match(html, /data-block-detail-tabs/);
    assert.match(html, /<nav[^>]*aria-label="Tabs"/);
    assert.match(html, /Overview/);
    assert.match(html, /Activities/);
    assert.match(html, /href="\/a\?tab=overview"/);
    assert.match(html, /href="\/a\?tab=activities"/);
  });

  test("marks activeTab with aria-current=page", () => {
    const html = renderToString(
      <BlockDetailPage
        title="x"
        tabs={[
          { id: "overview", label: "Overview", href: "?tab=overview" },
          { id: "activities", label: "Activities", href: "?tab=activities" },
        ]}
        activeTab="activities"
      >
        <div />
      </BlockDetailPage>,
    );
    // The activities tab should be the one marked aria-current="page".
    assert.match(html, /aria-current="page"/);
    // Extract the element with aria-current=page and verify it contains "Activities".
    const match = html.match(/<[^>]*aria-current="page"[^>]*>[^<]*<\/[^>]*>/);
    assert.ok(match, "expected at least one element with aria-current=page");
    assert.ok(match && match[0].includes("Activities"), "aria-current=page should be on Activities tab");
  });

  test("does NOT mark inactive tabs with aria-current", () => {
    const html = renderToString(
      <BlockDetailPage
        title="x"
        tabs={[
          { id: "overview", label: "Overview", href: "?tab=overview" },
          { id: "activities", label: "Activities", href: "?tab=activities" },
        ]}
        activeTab="overview"
      >
        <div />
      </BlockDetailPage>,
    );
    // The activities tab must NOT carry aria-current=page.
    const match = html.match(/<[^>]*aria-current="page"[^>]*>[^<]*<\/[^>]*>/);
    assert.ok(match, "expected active tab with aria-current=page");
    assert.ok(match && !match[0].includes("Activities"), "inactive tab must not be aria-current");
  });

  test("tabs with no activeTab render without aria-current", () => {
    const html = renderToString(
      <BlockDetailPage
        title="x"
        tabs={[
          { id: "overview", label: "Overview", href: "?tab=overview" },
        ]}
      >
        <div />
      </BlockDetailPage>,
    );
    assert.ok(!html.includes('aria-current'));
  });
});

describe("<BlockDetailPage> — actions + breadcrumbs forwarded to PageShell", () => {
  test("renders actions slot when provided", () => {
    const html = renderToString(
      <BlockDetailPage title="x" actions={<button>Edit</button>}>
        <div />
      </BlockDetailPage>,
    );
    assert.match(html, /data-page-shell-actions/);
    assert.match(html, /<button[^>]*>Edit<\/button>/);
  });

  test("renders breadcrumbs when provided", () => {
    const html = renderToString(
      <BlockDetailPage
        title="x"
        breadcrumbs={[
          { label: "CRM", href: "/" },
          { label: "Contacts", href: "/contacts" },
          { label: "Alice" },
        ]}
      >
        <div />
      </BlockDetailPage>,
    );
    assert.match(html, /data-page-shell-breadcrumbs/);
    assert.match(html, /Contacts/);
    assert.match(html, /Alice/);
  });
});

describe("<BlockDetailPage> — typography", () => {
  test("uses the page-title typography token (h1)", () => {
    const html = renderToString(
      <BlockDetailPage title="x">
        <div />
      </BlockDetailPage>,
    );
    assert.match(html, /class="[^"]*text-page-title/);
  });

  test("subtitle uses body/muted-foreground typography", () => {
    const html = renderToString(
      <BlockDetailPage title="x" subtitle="alice@example.com">
        <div />
      </BlockDetailPage>,
    );
    // Subtitle element carries the text-body + text-muted-foreground classes.
    const subMatch = html.match(
      /<[^>]*data-block-detail-subtitle[^>]*class="([^"]*)"/,
    );
    assert.ok(subMatch, "expected subtitle element with classes");
    assert.match(subMatch![1], /text-body/);
    assert.match(subMatch![1], /text-muted-foreground/);
  });
});
