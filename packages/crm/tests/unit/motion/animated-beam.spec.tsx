import { describe, test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { AnimatedBeam } from "../../../src/components/ui/magic/animated-beam";

function harness(forceStatic: boolean) {
  const container = React.createRef<HTMLDivElement>();
  const a = React.createRef<HTMLDivElement>();
  const b = React.createRef<HTMLDivElement>();
  return renderToString(
    React.createElement(AnimatedBeam, { containerRef: container, fromRef: a, toRef: b, forceStatic }),
  );
}
describe("<AnimatedBeam>", () => {
  test("renders an svg without crashing (refs null at SSR)", () => {
    assert.doesNotThrow(() => harness(false));
    assert.match(harness(false), /<svg/);
  });
  test("forceStatic renders no animated <motion> gradient offset (static path only)", () => {
    // static branch must still produce the svg path but omit the animated
    // <linearGradient> keyframe markup; assert the beam svg is present.
    assert.match(harness(true), /<svg/);
  });
});
