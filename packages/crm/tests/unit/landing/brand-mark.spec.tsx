import { describe, test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { BrandMark } from "../../../src/components/landing/brand-mark";

describe("<BrandMark>", () => {
  test("renders the canonical brand asset, not an inline approximation", () => {
    const html = renderToString(React.createElement(BrandMark));
    assert.match(html, /\/brand\/seldonframe-icon\.svg/);
    assert.match(html, /SeldonFrame/);
  });
  test("withPathChip renders the /record chip (CSS-gated to record mode)", () => {
    const html = renderToString(React.createElement(BrandMark, { withPathChip: true }));
    assert.match(html, /lp-record-only/);
    assert.match(html, /\/record/);
  });
});
