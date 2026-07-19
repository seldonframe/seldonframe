// Navbar brand-slot logo rendering (world-class images, part 2).
//
// When the client's own logo is captured from their site (html-image-harvester
// → facts.logo → R1 payload.logo → Navbar logoUrl), the nav renders their real
// brand mark instead of the uppercase text wordmark. Absent logoUrl keeps the
// legacy wordmark behavior unchanged.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import React from "react";
import { renderToString } from "react-dom/server";

import { Navbar } from "../../../src/components/landing-r1/chrome/navbar";

const base = {
  archetype: "bold-urgency" as const,
  businessName: "Dallas Heating",
  phone: "972-423-0012",
};

describe("Navbar logo", () => {
  test("renders the client logo <img> in place of the wordmark when logoUrl is set", () => {
    const html = renderToString(<Navbar {...base} logoUrl="https://cdn.x.com/logo.svg" />);
    assert.match(html, /class="sf-navbar-logo"/);
    assert.match(html, /src="https:\/\/cdn\.x\.com\/logo\.svg"/);
    assert.match(html, /alt="Dallas Heating"/);
    // The uppercase text wordmark must NOT render when a logo is shown.
    assert.doesNotMatch(html, /DALLAS HEATING</);
  });

  test("falls back to the text wordmark when no logoUrl", () => {
    const html = renderToString(<Navbar {...base} />);
    assert.match(html, /DALLAS HEATING/);
    assert.doesNotMatch(html, /sf-navbar-logo"/);
  });
});
