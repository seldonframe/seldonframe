// Tests for the v1.55.1 ChatbotPreview section component.
//
// Renders the workspace name, tagline, a 6-step operator launch wizard,
// and the copy-snippet helper for the agency operator. Uses
// renderToString (no jsdom) — matches the existing test patterns
// for other landing section components.
//
// v1.55.1 — replaced the "Try the AI receptionist" pill test with
// wizard-content tests. The wizard guides operators through test →
// customize → eval → promote → embed → watch leads, with deep links
// into the agents + contacts dashboards.

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

  test("renders the 6-step operator launch wizard", () => {
    const html = renderToString(
      <ChatbotPreviewSection
        businessName="Acme"
        tagline="test"
        embedUrl="https://example.com/embed.js"
      />,
    );
    // Header copy for the wizard card.
    assert.ok(
      html.includes("6 steps to launch"),
      "wizard heading should appear",
    );
    // At least three step labels — confirms ordered list is rendered.
    assert.ok(
      html.includes("Test the chatbot"),
      "step 1 label should be present",
    );
    assert.ok(
      html.includes("Customize behavior"),
      "step 2 label should be present",
    );
    assert.ok(
      html.includes("Paste on your client"),
      "step 5 label should be present",
    );
    // SVG chat-bubble icon still rendered as a visual anchor for the
    // wizard (moved out of the pill, now sits next to the wizard heading).
    assert.ok(
      html.includes('d="M9 18h-3'),
      "chat-bubble SVG path should be present in the wizard",
    );
  });

  test("links to the agents dashboard from the wizard", () => {
    const html = renderToString(
      <ChatbotPreviewSection
        businessName="Acme"
        tagline="test"
        embedUrl="https://example.com/embed.js"
      />,
    );
    assert.ok(
      html.includes("app.seldonframe.com/agents"),
      "wizard should link to the agents dashboard URL",
    );
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
