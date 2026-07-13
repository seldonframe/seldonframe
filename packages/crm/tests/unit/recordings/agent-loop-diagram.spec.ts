// packages/crm/tests/unit/recordings/agent-loop-diagram.spec.ts
//
// Record v3 (T4) — <AgentLoopDiagram>: renderToString smoke test (no
// hooks/browser APIs — server-renderable) + accessible title/desc check.
// Plain .spec.ts, same idiom as record-page-render.spec.ts (JSX isn't
// valid in .ts under the tsx esbuild loader, so React.createElement is
// used instead of a `<AgentLoopDiagram />` literal).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import React from "react";
import { renderToString } from "react-dom/server";

import { AgentLoopDiagram } from "../../../src/app/(public)/record/record-ui/agent-loop-diagram";

describe("<AgentLoopDiagram>", () => {
  test("renders without crashing", () => {
    assert.doesNotThrow(() => {
      renderToString(React.createElement(AgentLoopDiagram));
    });
  });

  test("has an accessible title + description", () => {
    const html = renderToString(React.createElement(AgentLoopDiagram));
    assert.match(html, /<title id="agent-loop-title">The agent loop<\/title>/);
    assert.match(html, /aria-labelledby="agent-loop-title agent-loop-desc"/);
  });

  test("renders all five loop stage labels", () => {
    const html = renderToString(React.createElement(AgentLoopDiagram));
    for (const label of ["Trigger", "Watch", "Decide", "Act", "Check with you"]) {
      assert.match(html, new RegExp(label));
    }
  });

  test("caption never overstates the mechanism", () => {
    const html = renderToString(React.createElement(AgentLoopDiagram));
    assert.match(html, /A recording becomes an agent that runs this loop for you\./);
  });
});
