import { describe, test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { OrbitingCircles } from "../../../src/components/ui/magic/orbiting-circles";
const kids = ["A", "B", "C"].map((k) => React.createElement("span", { key: k }, k));
describe("<OrbitingCircles>", () => {
  test("renders every child (static markup present for SSR/crawlers)", () => {
    const html = renderToString(React.createElement(OrbitingCircles, { radius: 80 }, kids));
    assert.match(html, /A/); assert.match(html, /B/); assert.match(html, /C/);
  });
  test("forceStatic renders children at fixed positions, no orbit animation class", () => {
    const html = renderToString(React.createElement(OrbitingCircles, { radius: 80, forceStatic: true }, kids));
    assert.match(html, /A/); assert.doesNotMatch(html, /animate-orbit|orbit\s/);
  });
});
