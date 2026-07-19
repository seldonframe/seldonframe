import { describe, test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { Terminal, TypingAnimation, AnimatedSpan } from "../../../src/components/ui/magic/terminal";
describe("<Terminal>", () => {
  test("static render shows the full command text (SSR/no-JS/crawler safe)", () => {
    const html = renderToString(
      React.createElement(Terminal, null,
        React.createElement(TypingAnimation, { forceStatic: true }, "npx -y @seldonframe/mcp"),
        React.createElement(AnimatedSpan, { forceStatic: true }, "✓ connected")),
    );
    assert.match(html, /npx -y @seldonframe\/mcp/);
    assert.match(html, /connected/);
  });
});
