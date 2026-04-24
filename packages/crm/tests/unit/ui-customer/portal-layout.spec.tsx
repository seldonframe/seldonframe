// Tests for <PortalLayout>. SLICE 4b PR 1 C1 per audit §5.1.
//
// Strategy: renderToString + regex assertions (G-4-6 shallow harness).
// <PortalLayout> is a pure composition wrapper — no state machine.
// Covers: PublicThemeProvider integration, nav chrome (org header +
// optional session indicator + optional sign-out link), optional
// footer slot, children passthrough, a11y landmarks.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { renderToString } from "react-dom/server";

import { PortalLayout } from "../../../src/components/ui-customer/portal-layout";
import { DEFAULT_ORG_THEME } from "../../../src/lib/theme/types";

describe("<PortalLayout> — structural landmarks", () => {
  test("renders wrapper with data-portal-layout attribute", () => {
    const html = renderToString(
      <PortalLayout theme={DEFAULT_ORG_THEME} orgName="Acme">
        <div>body</div>
      </PortalLayout>,
    );
    assert.match(html, /data-portal-layout=""/);
  });

  test("renders orgName in a header landmark", () => {
    const html = renderToString(
      <PortalLayout theme={DEFAULT_ORG_THEME} orgName="Acme Dental">
        <div>body</div>
      </PortalLayout>,
    );
    assert.match(html, /<header[\s>]/);
    assert.match(html, /Acme Dental/);
  });

  test("renders children inside a <main> landmark", () => {
    const html = renderToString(
      <PortalLayout theme={DEFAULT_ORG_THEME} orgName="x">
        <div data-testid="body">portal content</div>
      </PortalLayout>,
    );
    assert.match(html, /<main[\s>]/);
    assert.match(html, /data-testid="body"/);
    assert.match(html, /portal content/);
  });
});

describe("<PortalLayout> — PublicThemeProvider integration", () => {
  test("injects the 9-var public theme override set", () => {
    const html = renderToString(
      <PortalLayout theme={DEFAULT_ORG_THEME} orgName="x">
        <div />
      </PortalLayout>,
    );
    // PublicThemeProvider emits --sf-* CSS vars.
    assert.match(html, /--sf-primary:#14b8a6/);
    assert.match(html, /--sf-accent:#0d9488/);
    assert.match(html, /--sf-font:Inter/);
    assert.match(html, /--sf-radius:8px/);
    assert.match(html, /--sf-bg:/);
    assert.match(html, /--sf-text:/);
    assert.match(html, /--sf-card-bg:/);
    assert.match(html, /--sf-muted:/);
    assert.match(html, /--sf-border:/);
  });

  test("custom theme propagates primary + accent + radius", () => {
    const brand = {
      ...DEFAULT_ORG_THEME,
      primaryColor: "#ff5722",
      accentColor: "#3f51b5",
      borderRadius: "sharp" as const,
    };
    const html = renderToString(
      <PortalLayout theme={brand} orgName="x">
        <div />
      </PortalLayout>,
    );
    assert.match(html, /--sf-primary:#ff5722/);
    assert.match(html, /--sf-accent:#3f51b5/);
    assert.match(html, /--sf-radius:0px/);
  });

  test("loads the workspace font via a Google Fonts <link>", () => {
    const html = renderToString(
      <PortalLayout theme={DEFAULT_ORG_THEME} orgName="x">
        <div />
      </PortalLayout>,
    );
    assert.match(html, /<link[^>]*href="https:\/\/fonts\.googleapis\.com\/css2\?family=Inter/);
  });
});

describe("<PortalLayout> — optional logo", () => {
  test("omits logo <img> when logoUrl absent", () => {
    const html = renderToString(
      <PortalLayout theme={DEFAULT_ORG_THEME} orgName="Acme">
        <div />
      </PortalLayout>,
    );
    assert.ok(!html.includes("data-portal-logo"));
  });

  test("renders logo <img> when logoUrl provided", () => {
    const html = renderToString(
      <PortalLayout
        theme={DEFAULT_ORG_THEME}
        orgName="Acme"
        logoUrl="https://example.com/logo.svg"
      >
        <div />
      </PortalLayout>,
    );
    assert.match(html, /data-portal-logo=""/);
    assert.match(html, /src="https:\/\/example\.com\/logo\.svg"/);
    assert.match(html, /alt="Acme"/);
  });
});

describe("<PortalLayout> — session indicator + sign-out", () => {
  test("omits session block when sessionEmail absent", () => {
    const html = renderToString(
      <PortalLayout theme={DEFAULT_ORG_THEME} orgName="x">
        <div />
      </PortalLayout>,
    );
    assert.ok(!html.includes("data-portal-session"));
  });

  test("renders session email + sign-out link when both provided", () => {
    const html = renderToString(
      <PortalLayout
        theme={DEFAULT_ORG_THEME}
        orgName="x"
        sessionEmail="alice@example.com"
        signOutHref="/portal/acme/logout"
      >
        <div />
      </PortalLayout>,
    );
    assert.match(html, /data-portal-session=""/);
    assert.match(html, /alice@example\.com/);
    assert.match(html, /href="\/portal\/acme\/logout"/);
    assert.match(html, /Sign out/);
  });

  test("omits sign-out link when only sessionEmail provided", () => {
    const html = renderToString(
      <PortalLayout
        theme={DEFAULT_ORG_THEME}
        orgName="x"
        sessionEmail="alice@example.com"
      >
        <div />
      </PortalLayout>,
    );
    assert.match(html, /alice@example\.com/);
    assert.ok(!html.includes("Sign out"));
  });
});

describe("<PortalLayout> — footer", () => {
  test("omits footer element when prop absent", () => {
    const html = renderToString(
      <PortalLayout theme={DEFAULT_ORG_THEME} orgName="x">
        <div />
      </PortalLayout>,
    );
    assert.ok(!html.includes("data-portal-footer"));
  });

  test("renders footer slot content", () => {
    const html = renderToString(
      <PortalLayout
        theme={DEFAULT_ORG_THEME}
        orgName="x"
        footer={<span>© 2026 Acme.</span>}
      >
        <div />
      </PortalLayout>,
    );
    assert.match(html, /data-portal-footer=""/);
    assert.match(html, /© 2026 Acme\./);
  });
});
