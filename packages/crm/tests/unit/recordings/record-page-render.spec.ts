// packages/crm/tests/unit/recordings/record-page-render.spec.ts
//
// renderToString smoke test for <RecordClient> — mirrors the harness in
// tests/unit/onboarding/shell.spec.tsx (no jsdom needed; useEffect never
// runs during server rendering, so the session-mint fetch + capture wiring
// never fire here — this only pins the initial "landing" phase markup).
//
// Record v3 (T3) — the single-slot redesign replaced the 6-card grid with
// exactly ONE capture card up front; these assertions were updated to match
// (previously asserted 6 Record buttons / 6 upload affordances render on
// initial load — now exactly 1 of each, since only the first non-traced
// slot ever renders as the capture card).
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

function renderInitial(isAuthed = false): string {
  return renderToString(
    React.createElement(RecordClient, { claimedSessionId: null, claimed: false, isAuthed }),
  );
}

describe("<RecordClient> — initial landing-phase render", () => {
  test("renders without crashing", () => {
    assert.doesNotThrow(() => {
      renderInitial();
    });
  });

  test("renders without crashing when isAuthed is true", () => {
    assert.doesNotThrow(() => {
      renderInitial(true);
    });
  });

  test("renders exactly ONE capture card (single-slot redesign) — not a 6-card grid", () => {
    const html = renderInitial();
    const recordButtonCount = (html.match(/>Record</g) ?? []).length;
    assert.equal(recordButtonCount, 1);
  });

  test("recap panel is hidden while phase is landing", () => {
    const html = renderInitial();
    assert.doesNotMatch(html, /aria-label="Recap"/);
    assert.doesNotMatch(html, /Ask Seldon/);
  });

  test("headline + slots section + agent-loop explainer render", () => {
    const html = renderInitial();
    assert.match(html, /Show Seldon how you work/);
    assert.match(html, /aria-label="Recording slots"/);
    assert.match(html, /The agent loop/);
  });

  test('"Start fresh" is absent when no session exists yet (landing phase)', () => {
    const html = renderInitial();
    assert.doesNotMatch(html, /Start fresh/);
  });

  test('"Your recordings" heading anchors the recordings column even before a session/restore state exists (vision fix)', () => {
    const html = renderInitial();
    assert.match(html, /Your recordings/);
  });

  test('"Restored from earlier" never renders without the heading it anchors to', () => {
    const html = renderInitial();
    // No restore has happened on initial SSR, so the inline restored text
    // must be absent even though the heading itself always renders.
    assert.doesNotMatch(html, /Restored from earlier/);
  });

  test("upload-a-recording affordance renders exactly once (single capture card, initial SSR state assumes desktop)", () => {
    const html = renderInitial();
    const uploadAffordanceCount = (html.match(/or upload a recording/g) ?? []).length;
    assert.equal(uploadAffordanceCount, 1);
  });

  test("no traced-list rows and no edge-case prompt on initial landing (nothing traced yet)", () => {
    const html = renderInitial();
    assert.doesNotMatch(html, /aria-label="Traced recordings"/);
    assert.doesNotMatch(html, /Make it trustworthy/);
  });
});
