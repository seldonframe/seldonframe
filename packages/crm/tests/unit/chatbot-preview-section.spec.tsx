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
      />,
    );
    assert.ok(
      html.includes("AI receptionist — ask anything"),
      "tagline should appear in the rendered output",
    );
  });

  test("renders the chat-bubble SVG icon in the 'Try the AI receptionist' pill", () => {
    const html = renderToString(
      <ChatbotPreviewSection
        businessName="Acme"
        tagline="test"
        embedUrl="https://example.com/embed.js"
      />,
    );
    // SVG path data from the chat-bubble icon — verifies the new icon is
    // rendered instead of the ↘ arrow.
    assert.ok(
      html.includes('d="M9 18h-3'),
      "chat-bubble SVG path should be present in the pill",
    );
    assert.ok(html.includes("Try the AI receptionist"), "pill label still present");
  });

  test("shows the paste-snippet helper for the agency operator", () => {
    const html = renderToString(
      <ChatbotPreviewSection
        businessName="Acme"
        tagline="test"
        embedUrl="https://example.com/embed.js"
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

  test("renders against the theme-provided background", () => {
    // Background + text colors come from CSS variables set by
    // PublicThemeProvider higher in the tree. The component just
    // consumes them — no light/dark branching at this layer.
    const html = renderToString(
      <ChatbotPreviewSection
        businessName="Acme"
        tagline="test"
        embedUrl="https://example.com/embed.js"
      />,
    );
    assert.ok(
      html.includes("--sf-bg"),
      "component should render against the theme-provided --sf-bg variable",
    );
  });
});
