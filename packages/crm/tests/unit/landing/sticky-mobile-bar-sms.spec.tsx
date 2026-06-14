import { describe, test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { StickyMobileBar } from "@/components/landing-r1/chrome/sticky-mobile-bar";

describe("<StickyMobileBar> — Text button gating", () => {
  test("renders the Text button with the exact sms: href when smsHref is set", () => {
    const html = renderToString(
      React.createElement(StickyMobileBar, {
        archetype: "bold-urgency",
        phone: "(209) 555-0144",
        smsHref: "sms:+18395550100",
        bookHref: "https://x.app.seldonframe.com/book",
      }),
    );
    assert.match(html, /Text/);
    assert.match(html, /href="sms:\+18395550100"/);
  });

  test("omits the Text button entirely when smsHref is absent", () => {
    const html = renderToString(
      React.createElement(StickyMobileBar, {
        archetype: "bold-urgency",
        phone: "(209) 555-0144",
      }),
    );
    // Call is always present; Text must NOT be.
    assert.match(html, /Call/);
    assert.ok(!/>Text</.test(html), "Text button should be absent without smsHref");
  });

  test("renders nothing for archetypes excluded from the sticky bar", () => {
    const html = renderToString(
      React.createElement(StickyMobileBar, {
        archetype: "cinematic-aspirational",
        phone: "(209) 555-0144",
        smsHref: "sms:+1",
      }),
    );
    assert.equal(html, "");
  });
});
