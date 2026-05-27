// packages/crm/tests/unit/integrations/anthropic-key-field.spec.tsx
//
// 2026-05-27 — Smoke test for the shared <AnthropicKeyField> +
// <EncryptionNotice> primitives extracted to keep /signup/connect-ai
// and /settings/integrations/llm aligned on the Anthropic BYOK shape.
//
// The two consuming surfaces wrap this with different framing, but the
// label, placeholder, console / billing helper line, and encryption
// notice must stay identical. This file pins all five of those copy
// + a11y guarantees so a future edit can't accidentally drift the
// signup surface away from the settings surface (or vice versa).
//
// Uses renderToString rather than full jsdom — these components are
// stateless and have no event handlers; the static HTML is enough to
// verify presence + attribute wiring.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import React from "react";
import { renderToString } from "react-dom/server";

import {
  AnthropicKeyField,
  ANTHROPIC_BILLING_URL,
  ANTHROPIC_CONSOLE_URL,
  EncryptionNotice,
} from "../../../src/components/integrations/anthropic-key-field";

describe("<AnthropicKeyField>", () => {
  test("renders the Anthropic API key label", () => {
    const html = renderToString(<AnthropicKeyField inputId="apiKey-test" />);
    assert.match(html, /Anthropic API key/);
  });

  test("renders the sk-ant- placeholder by default", () => {
    const html = renderToString(<AnthropicKeyField inputId="apiKey-test" />);
    assert.match(html, /placeholder="sk-ant-\.\.\."/);
  });

  test("respects a custom placeholder when provided", () => {
    // Settings page swaps the placeholder to "Paste a new key to
    // replace the current one" when a key is already configured.
    // The prop must thread through.
    const html = renderToString(
      <AnthropicKeyField
        inputId="apiKey-test"
        placeholder="Paste a new key to replace the current one"
      />,
    );
    assert.match(html, /placeholder="Paste a new key to replace the current one"/);
  });

  test("input id matches the label htmlFor (a11y)", () => {
    const html = renderToString(<AnthropicKeyField inputId="apiKey-anthropic" />);
    assert.match(html, /for="apiKey-anthropic"/);
    assert.match(html, /id="apiKey-anthropic"/);
  });

  test("renders the canonical helper line with both Anthropic URLs", () => {
    const html = renderToString(<AnthropicKeyField inputId="apiKey-test" />);
    assert.match(html, /Get a key from/);
    assert.match(html, /console\.anthropic\.com/);
    assert.ok(html.includes(ANTHROPIC_CONSOLE_URL), "console URL missing");
    assert.ok(html.includes(ANTHROPIC_BILLING_URL), "billing URL missing");
  });

  test("defaults the input name to apiKey (action wire shape)", () => {
    // Both consuming actions (saveConnectAiKeyAction +
    // saveLlmKeyAction) read formData.get("apiKey"). The default has
    // to stay "apiKey" or one of the two surfaces breaks silently.
    const html = renderToString(<AnthropicKeyField inputId="apiKey-test" />);
    assert.match(html, /name="apiKey"/);
  });

  test("aria-describedby threads through when supplied", () => {
    const html = renderToString(
      <AnthropicKeyField inputId="apiKey-test" ariaDescribedBy="explainer-1" />,
    );
    assert.match(html, /aria-describedby="explainer-1"/);
  });

  test("input is type=password + autoComplete=off + spellCheck=false", () => {
    // Treat the key like a credential — don't autocomplete (could
    // leak into browser autofill) and don't spell-check (would
    // underline every legitimate Anthropic key character).
    const html = renderToString(<AnthropicKeyField inputId="apiKey-test" />);
    assert.match(html, /type="password"/);
    assert.match(html, /autoComplete="off"/);
    assert.match(html, /spellCheck="false"/);
  });
});

describe("<EncryptionNotice>", () => {
  test("renders the canonical AES-256-GCM sentence", () => {
    const html = renderToString(<EncryptionNotice />);
    assert.match(html, /Keys are encrypted with AES-256-GCM/);
    assert.match(html, /SF cannot read your raw keys/);
    assert.match(html, /decrypted in memory at agent-turn time/);
  });

  test("defaults to the muted bordered-box variant", () => {
    // Settings page renders below provider cards using the muted
    // bordered box — that's the default. Variant string check is
    // brittle, so we look for the bordered classes instead.
    const html = renderToString(<EncryptionNotice />);
    assert.match(html, /border-border/);
    assert.match(html, /bg-muted/);
  });

  test("footer-text variant drops the bordered box", () => {
    // Signup page wants a lighter footer-style notice below the
    // primary CTA — different visual weight, same copy.
    const html = renderToString(<EncryptionNotice variant="footer-text" />);
    assert.match(html, /Keys are encrypted with AES-256-GCM/);
    // Should NOT render the bordered card chrome in this variant.
    assert.ok(!html.includes("border-border"), "footer-text variant should not render the muted box border");
  });

  test("trailing ReactNode appends after the canonical sentence", () => {
    // Settings page passes a trailing fragment to mention the MCP
    // tool. Signup leaves it empty.
    const html = renderToString(
      <EncryptionNotice trailing={<span data-testid="trail">extra-copy</span>} />,
    );
    assert.match(html, /AES-256-GCM/);
    assert.match(html, /extra-copy/);
  });
});
