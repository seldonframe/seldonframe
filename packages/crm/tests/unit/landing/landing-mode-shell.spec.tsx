// packages/crm/tests/unit/landing/landing-mode-shell.spec.tsx
// jsdom bootstrap MUST be the first import (green-main lesson: unwired
// setup-dom was the root of 16 "stale UI" CI failures).
import "../../setup-dom";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { LandingModeShell } from "../../../src/components/landing/landing-mode";

function shell(initialMode: "build" | "record", recordEnabled = true) {
  return renderToString(
    React.createElement(LandingModeShell, {
      initialMode,
      recordEnabled,
      urlStrategy: "replace-state",
      nav: React.createElement("div", null, "NAV"),
      buildStack: React.createElement("div", null, "BUILD-STACK"),
      recordStack: React.createElement("div", null, "RECORD-STACK"),
      footer: React.createElement("div", null, "FOOTER"),
    }),
  );
}

describe("<LandingModeShell> SSR", () => {
  test("build mode: data-mode=build, record stack NOT mounted", () => {
    const html = shell("build");
    assert.match(html, /data-mode="build"/);
    assert.match(html, /BUILD-STACK/);
    assert.doesNotMatch(html, /RECORD-STACK/);
  });
  test("record mode SSRs dark with record stack mounted (no-flash contract)", () => {
    const html = shell("record");
    assert.match(html, /data-mode="record"/);
    assert.match(html, /RECORD-STACK/);
  });
  test("flag off forces build even when initialMode=record", () => {
    const html = shell("record", false);
    assert.match(html, /data-mode="build"/);
    assert.doesNotMatch(html, /RECORD-STACK/);
  });
});
