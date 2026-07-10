// packages/crm/tests/unit/recordings/record-page-render.spec.ts
//
// renderToString smoke test for <RecordClient> — mirrors the harness in
// tests/unit/onboarding/shell.spec.tsx (no jsdom needed; useEffect never
// runs during server rendering, so the session-mint fetch + capture wiring
// never fire here — this only pins the initial "landing" phase markup).
//
// Plain .spec.ts (not .tsx, per the plan's exact Task 10 filename) — JSX
// syntax isn't valid in a .ts file under tsx's esbuild loader, so the
// element is built with React.createElement instead of a `<RecordClient />`
// literal. Functionally identical to JSX.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import React from "react";
import { renderToString } from "react-dom/server";

import { RecordClient } from "../../../src/app/(public)/record/record-client";
import { MAX_RECORDINGS_PER_SESSION } from "../../../src/lib/recordings/policy";

function renderInitial(): string {
  return renderToString(
    React.createElement(RecordClient, { claimedSessionId: null, claimed: false }),
  );
}

describe("<RecordClient> — initial landing-phase render", () => {
  test("renders without crashing", () => {
    assert.doesNotThrow(() => {
      renderInitial();
    });
  });

  test(`renders all ${MAX_RECORDINGS_PER_SESSION} recording slots`, () => {
    const html = renderInitial();
    const recordButtonCount = (html.match(/>Record</g) ?? []).length;
    assert.equal(recordButtonCount, MAX_RECORDINGS_PER_SESSION);
  });

  test("recap panel is hidden while phase is landing", () => {
    const html = renderInitial();
    assert.doesNotMatch(html, /aria-label="Recap"/);
    assert.doesNotMatch(html, /Ask Seldon/);
  });

  test("headline + slots section render", () => {
    const html = renderInitial();
    assert.match(html, /Show Seldon how you work/);
    assert.match(html, /aria-label="Recording slots"/);
  });
});
