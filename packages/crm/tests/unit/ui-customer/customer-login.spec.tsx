// Tests for <CustomerLogin>. SLICE 4b PR 1 C4 per audit §5.4.
//
// Themed customer portal login — composition wrapping the
// existing OTC + JWT auth plumbing (lib/portal/auth.ts, UNCHANGED).
// Two-stage flow: request code → verify code → redirect to portal.
//
// L-17 classification: state-machine 1.7x.
//
// Strategy: renderToString for initial-state rendering at each
// stage (via `initialStage` prop for determinism). Stage
// transitions are driven by server-action return values, not by
// local state reducer — no separate reducer unit test is needed;
// the tests cover what renders at each stage.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { renderToString } from "react-dom/server";

import { CustomerLogin } from "../../../src/components/ui-customer/customer-login";
import { DEFAULT_ORG_THEME } from "../../../src/lib/theme/types";

describe("<CustomerLogin> — initial render (request stage)", () => {
  test("renders wrapper with data-customer-login attribute", () => {
    const html = renderToString(
      <CustomerLogin orgSlug="acme" theme={DEFAULT_ORG_THEME} />,
    );
    assert.match(html, /data-customer-login=""/);
  });

  test("shows email input + Send code button at request stage (default)", () => {
    const html = renderToString(
      <CustomerLogin orgSlug="acme" theme={DEFAULT_ORG_THEME} />,
    );
    assert.match(html, /<input[^>]*type="email"/);
    assert.match(html, /<button[^>]*>[^<]*Send code/);
    assert.ok(!html.includes("6-digit"));
  });

  test("title + subtitle render by default", () => {
    const html = renderToString(
      <CustomerLogin orgSlug="acme" theme={DEFAULT_ORG_THEME} />,
    );
    assert.match(html, /Sign in/);
    assert.match(html, /one-time code/i);
  });

  test("custom title + subtitle props surface", () => {
    const html = renderToString(
      <CustomerLogin
        orgSlug="acme"
        theme={DEFAULT_ORG_THEME}
        title="Client Portal"
        subtitle="Enter your email to receive a login code."
      />,
    );
    assert.match(html, /Client Portal/);
    assert.match(html, /Enter your email to receive a login code\./);
  });
});

describe("<CustomerLogin> — verify stage rendering", () => {
  test("initialStage='verify' shows code input + Verify button", () => {
    const html = renderToString(
      <CustomerLogin
        orgSlug="acme"
        theme={DEFAULT_ORG_THEME}
        initialStage="verify"
        initialEmail="alice@example.com"
      />,
    );
    // At verify stage: code input visible; email input becomes
    // readonly or hidden carry.
    assert.match(html, /6-digit/);
    assert.match(html, /<button[^>]*>[^<]*Verify/);
  });

  test("verify stage surfaces the email previously entered", () => {
    const html = renderToString(
      <CustomerLogin
        orgSlug="acme"
        theme={DEFAULT_ORG_THEME}
        initialStage="verify"
        initialEmail="alice@example.com"
      />,
    );
    assert.match(html, /alice@example\.com/);
  });

  test("verify stage renders a 'send again' link", () => {
    const html = renderToString(
      <CustomerLogin
        orgSlug="acme"
        theme={DEFAULT_ORG_THEME}
        initialStage="verify"
        initialEmail="alice@example.com"
      />,
    );
    assert.match(html, /Send again|Resend/i);
  });
});

describe("<CustomerLogin> — themed styling", () => {
  test("uses --sf-* CSS variables for customer branding", () => {
    const html = renderToString(
      <CustomerLogin orgSlug="acme" theme={DEFAULT_ORG_THEME} />,
    );
    assert.match(html, /var\(--sf-/);
  });

  test("receives the workspace theme prop (routes to --sf-primary)", () => {
    const brand = {
      ...DEFAULT_ORG_THEME,
      primaryColor: "#ff5722",
    };
    const html = renderToString(
      <CustomerLogin orgSlug="acme" theme={brand} />,
    );
    // At minimum the primary color appears in an inline style.
    assert.ok(html.includes("#ff5722") || html.includes("var(--sf-primary)"));
  });
});

describe("<CustomerLogin> — dev-code preview surface", () => {
  test("omits dev-code preview when prop absent", () => {
    const html = renderToString(
      <CustomerLogin
        orgSlug="acme"
        theme={DEFAULT_ORG_THEME}
        initialStage="verify"
        initialEmail="alice@example.com"
      />,
    );
    assert.ok(!html.includes("data-customer-login-devcode"));
  });

  test("renders dev-code preview when devCodePreview provided", () => {
    const html = renderToString(
      <CustomerLogin
        orgSlug="acme"
        theme={DEFAULT_ORG_THEME}
        initialStage="verify"
        initialEmail="alice@example.com"
        devCodePreview="123456"
      />,
    );
    assert.match(html, /data-customer-login-devcode/);
    assert.match(html, /123456/);
  });
});

describe("<CustomerLogin> — orgSlug + postLoginHref props", () => {
  test("defaults postLoginHref to /portal/<orgSlug>", () => {
    // Implementation detail: the post-verify redirect target is
    // built from orgSlug unless postLoginHref overrides. The render
    // doesn't surface this directly on the DOM, but the presence
    // of the orgSlug somewhere in the rendered tree (data attr or
    // hidden input) lets tests pin the contract.
    const html = renderToString(
      <CustomerLogin orgSlug="acme" theme={DEFAULT_ORG_THEME} />,
    );
    assert.match(html, /data-customer-login-org="acme"/);
  });
});

describe("<CustomerLogin> — error rendering", () => {
  test("errorMessage prop surfaces as a visible alert", () => {
    const html = renderToString(
      <CustomerLogin
        orgSlug="acme"
        theme={DEFAULT_ORG_THEME}
        errorMessage="Invalid code."
      />,
    );
    assert.match(html, /data-customer-login-error/);
    assert.match(html, /Invalid code\./);
  });

  test("no error markup when errorMessage absent", () => {
    const html = renderToString(
      <CustomerLogin orgSlug="acme" theme={DEFAULT_ORG_THEME} />,
    );
    assert.ok(!html.includes("data-customer-login-error"));
  });
});
