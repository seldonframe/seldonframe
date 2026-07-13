// packages/crm/tests/unit/landing/record-faq.spec.tsx
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { RecordFaq } from "../../../src/components/landing/record/record-faq";

describe("<RecordFaq> JSON-LD gating", () => {
  test("withSchema renders exactly one FAQPage schema", () => {
    const html = renderToString(React.createElement(RecordFaq, { withSchema: true }));
    assert.equal(html.split("FAQPage").length - 1, 1);
    assert.match(html, /recordings stay private/i);
  });
  test("default renders NO schema (avoids duplicate FAQPage on /)", () => {
    const html = renderToString(React.createElement(RecordFaq));
    assert.doesNotMatch(html, /FAQPage/);
  });
});
