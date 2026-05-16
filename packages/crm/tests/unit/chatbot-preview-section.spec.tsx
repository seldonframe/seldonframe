// Tests for the v1.55.0 ChatbotPreview section component.
//
// Renders the workspace name, tagline, an embedded chatbot script tag,
// and the copy-snippet helper for the agency operator. Uses
// renderToString (no jsdom) — matches the existing test patterns
// for other landing section components.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { renderToString } from "react-dom/server";

import { ChatbotPreviewSection } from "../../src/components/landing/sections/chatbot-preview";

describe("ChatbotPreviewSection", () => {
  test("renders business name as the h1", () => {
    const html = renderToString(
      <ChatbotPreviewSection
        businessName="Ignitify Cooling"
        tagline="AI receptionist — ask anything"
        embedUrl="https://example.com/embed.js"
        themeMode="light"
      />,
    );
    assert.ok(html.includes("<h1"), "should have an h1");
    assert.ok(html.includes("Ignitify Cooling"), "h1 should contain business name");
  });

  test("renders the tagline as descriptive text", () => {
    const html = renderToString(
      <ChatbotPreviewSection
        businessName="Acme"
        tagline="AI receptionist — ask anything"
        embedUrl="https://example.com/embed.js"
        themeMode="light"
      />,
    );
    assert.ok(
      html.includes("AI receptionist — ask anything"),
      "tagline should appear in the rendered output",
    );
  });

  test("injects the embed.js script tag for the agent", () => {
    const html = renderToString(
      <ChatbotPreviewSection
        businessName="Acme"
        tagline="test"
        embedUrl="https://app.seldonframe.com/api/v1/public/agent/acme--default/embed.js"
        themeMode="light"
      />,
    );
    assert.ok(
      html.includes('src="https://app.seldonframe.com/api/v1/public/agent/acme--default/embed.js"'),
      "embed URL should appear as a script tag src attribute",
    );
    assert.ok(html.includes("async"), "script tag should be async");
  });

  test("shows the paste-snippet helper for the agency operator", () => {
    const html = renderToString(
      <ChatbotPreviewSection
        businessName="Acme"
        tagline="test"
        embedUrl="https://example.com/embed.js"
        themeMode="light"
      />,
    );
    assert.ok(
      html.includes("Want this on your site?"),
      "operator-helper copy should appear",
    );
    assert.ok(
      html.includes("&lt;script") || html.includes("<script"),
      "snippet should be visible (HTML-encoded or literal) for the operator to copy",
    );
  });

  test("light mode uses light background", () => {
    const html = renderToString(
      <ChatbotPreviewSection
        businessName="Acme"
        tagline="test"
        embedUrl="https://example.com/embed.js"
        themeMode="light"
      />,
    );
    assert.ok(
      /background[^"]*:\s*var\(--sf-bg\)/.test(html) ||
        html.includes("--sf-bg") ||
        /bg-(white|background)/.test(html),
      "light mode should set a light background via theme var or class",
    );
  });
});
