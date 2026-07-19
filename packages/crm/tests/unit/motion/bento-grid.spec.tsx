import { describe, test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { BentoGrid, BentoCard } from "../../../src/components/ui/magic/bento-grid";
describe("<BentoGrid>", () => {
  test("renders each card's name + description", () => {
    const html = renderToString(
      React.createElement(BentoGrid, null,
        React.createElement(BentoCard, { name: "CRM", description: "Contacts & deals" }),
        React.createElement(BentoCard, { name: "Booking", description: "Cal.diy" })),
    );
    // Note: React's renderToString HTML-escapes "&" to "&amp;", so a literal
    // "&" in the assertion regex can never match real SSR output. Matching
    // the escaped entity here (brief's spec used a literal "&").
    assert.match(html, /CRM/); assert.match(html, /Contacts &amp; deals/);
    assert.match(html, /Booking/);
  });
});
