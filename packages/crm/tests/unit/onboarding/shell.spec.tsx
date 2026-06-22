// packages/crm/tests/unit/onboarding/shell.spec.tsx
//
// 2026-05-27 — Smoke test for <OnboardingShell>. Verifies the progress
// fill percentage, the step counter copy, the a11y wiring on the
// progressbar, and the absence-of-state (the shell is purely
// presentational — no useState, no event handlers, safe to render from
// a server component).
//
// 2026-06-22 — The shell now takes an explicit {step, total} arc position
// instead of a single 1|2|3 step. The Anthropic-key step is skipped for
// keyless operators, so the forced arc is 2 steps for them (Build →
// Make-it-yours, 50% / 100%) and 3 steps for keyed operators (33% / 67% /
// 100%). Fill is derived as step/total; the counter reads "Step N of M".
//
// Uses renderToString — no jsdom needed because the shell has no
// interactivity. The fill width is a style attribute (`style="width:
// 50%"`) and the step copy is plain text inside a <span>; both are
// observable in static HTML.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import React from "react";
import { renderToString } from "react-dom/server";

import { OnboardingShell } from "../../../src/components/onboarding/shell";

// React's server renderer interleaves text nodes with HTML comment
// markers (`<!-- -->`) between adjacent JSX expressions. So the JSX
// "Step {step} of {total}" emits "Step <!-- -->1<!-- --> of <!-- -->2"
// not "Step 1 of 2" — a literal regex on the visible copy fails. The
// helper builds a regex that tolerates the optional comment markers
// around both interpolated numbers.
function stepCounterRegex(step: number, total: number): RegExp {
  return new RegExp(
    `Step (?:<!-- -->)?${step}(?:<!-- -->)? of (?:<!-- -->)?${total}`,
  );
}

describe("<OnboardingShell> — keyless 2-step arc (key step skipped)", () => {
  test("step 1 of 2 renders 50% fill + 'Step 1 of 2' copy", () => {
    const html = renderToString(
      <OnboardingShell step={1} total={2} title="Connect AI" />,
    );
    assert.match(html, /width:50%/);
    assert.match(html, stepCounterRegex(1, 2));
    assert.match(html, /Connect AI/);
  });

  test("step 2 of 2 renders 100% fill + 'Step 2 of 2' copy", () => {
    const html = renderToString(
      <OnboardingShell step={2} total={2} title="Make it yours" />,
    );
    assert.match(html, /width:100%/);
    assert.match(html, stepCounterRegex(2, 2));
    assert.match(html, /Make it yours/);
  });
});

describe("<OnboardingShell> — full 3-step arc (keyed operator)", () => {
  test("step 1 of 3 renders 33% fill + 'Step 1 of 3' copy", () => {
    const html = renderToString(
      <OnboardingShell step={1} total={3} title="Connect AI" />,
    );
    assert.match(html, /width:33%/);
    assert.match(html, stepCounterRegex(1, 3));
    assert.match(html, /Connect AI/);
  });

  test("step 2 of 3 renders 67% fill + 'Step 2 of 3' copy", () => {
    const html = renderToString(
      <OnboardingShell step={2} total={3} title="Build your first workspace" />,
    );
    assert.match(html, /width:67%/);
    assert.match(html, stepCounterRegex(2, 3));
    assert.match(html, /Build your first workspace/);
  });

  test("step 3 of 3 renders 100% fill + 'Step 3 of 3' copy", () => {
    const html = renderToString(
      <OnboardingShell step={3} total={3} title="Make it yours" />,
    );
    assert.match(html, /width:100%/);
    assert.match(html, stepCounterRegex(3, 3));
    assert.match(html, /Make it yours/);
  });
});

describe("<OnboardingShell> — a11y + chrome", () => {
  test("progressbar has aria-valuenow matching the fill percentage", () => {
    // a11y: the visual fill width and the screen-reader-announced value
    // must agree. Drift between them would mean assistive tech announces
    // a different progress than what's drawn.
    for (const [step, total, expected] of [
      [1, 2, 50],
      [2, 2, 100],
      [1, 3, 33],
      [2, 3, 67],
      [3, 3, 100],
    ] as const) {
      const html = renderToString(
        <OnboardingShell step={step} total={total} title="Test" />,
      );
      assert.match(
        html,
        new RegExp(`aria-valuenow="${expected}"`),
        `step ${step} of ${total} should set aria-valuenow=${expected}`,
      );
    }
  });

  test("progressbar role + aria-valuemin/max are correctly wired", () => {
    const html = renderToString(
      <OnboardingShell step={2} total={3} title="Test" />,
    );
    assert.match(html, /role="progressbar"/);
    assert.match(html, /aria-valuemin="0"/);
    assert.match(html, /aria-valuemax="100"/);
  });

  test("brand wordmark links to the homepage so confused operators can escape (showLogo=true default)", () => {
    // The shell should never trap the user. The logo doubles as a way
    // back to the marketing site if they want to start over or read
    // more about what they're signing up for.
    const html = renderToString(
      <OnboardingShell step={1} total={2} title="Connect AI" />,
    );
    assert.match(html, /href="\/"/);
    assert.match(html, /SeldonFrame — home/);
  });

  test("brand mark uses the teal-500 accent (#14b8a6)", () => {
    // Visual contract: the progress bar fill AND the logo's accent
    // strokes both use #14b8a6. The shell renders both inline (logo as
    // SVG strokes, bar via Tailwind arbitrary class), so this test
    // exists to catch a future palette swap that updates one but not
    // the other.
    const html = renderToString(
      <OnboardingShell step={2} total={3} title="Test" />,
    );
    // The progress bar fill uses a Tailwind bg-[#14b8a6] class
    assert.match(html, /bg-\[#14b8a6\]/);
    // The logo SVG strokes use the literal hex
    assert.match(html, /stroke="#14b8a6"/);
  });

  test("showLogo={false} omits the brand mark + homepage link", () => {
    // Step 1 surface lives inside the auth layout which already
    // renders a centered wordmark above the card. Rendering a second
    // mark inside the shell on that page would look redundant, so the
    // page passes showLogo={false}.
    const html = renderToString(
      <OnboardingShell step={1} total={2} title="Connect AI" showLogo={false} />,
    );
    assert.doesNotMatch(html, /href="\/"/);
    assert.doesNotMatch(html, /SeldonFrame — home/);
    // Progress bar still renders — the test isn't asserting "the whole
    // shell disappears", only the logo portion.
    assert.match(html, stepCounterRegex(1, 2));
    assert.match(html, /width:50%/);
  });
});
