// packages/crm/tests/unit/recordings/question-card.spec.ts
//
// Interview one-question-at-a-time: <QuestionCard> is the presentational
// replacement for recap-panel.tsx's old amber "Open questions" <ul> wall —
// exactly ONE question at a time, Yes/No chips, a free-text answer + Send,
// and a Skip link. Also covers the pure selectVisibleQuestion queue selector
// record-client.tsx wires up around it (no jsdom needed for either —
// renderToString + plain function calls).
//
// review fix (2026-07-16) — this used to be an index (nextQuestionIndex/
// clampQuestionIndex advanced by 1 on every answer/skip). That was wrong
// against interviewTurn's actual contract: an APPLIED turn returns
// openQuestions with the answered question PRUNED server-side, so a "+1"
// advance on top of a shorter list skips the next question; on applied:false
// the list is UNCHANGED, so "+1" skips an uncaptured question instead of
// leaving it visible. selectVisibleQuestion replaces the index with a queue
// selector: the first entry of the CURRENT openQuestions not in the local
// skip set. The two tests at the bottom of the selectVisibleQuestion describe
// block are the loop tests the review flagged as missing — the applied
// (pruned) path and the applied:false (unchanged) path.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import React from "react";
import { renderToString } from "react-dom/server";

import { QuestionCard, selectVisibleQuestion } from "../../../src/app/(public)/record/record-ui/question-card";

const noop = () => {};
const noopSkip = (_q: string) => {};

describe("selectVisibleQuestion", () => {
  test("with no skips, the visible question is the first in the list", () => {
    const result = selectVisibleQuestion(["Q1?", "Q2?", "Q3?"], new Set<string>());
    assert.deepEqual(result, { question: "Q1?", position: 1, total: 3 });
  });

  test("a skipped question is excluded — the next unskipped one becomes visible", () => {
    const result = selectVisibleQuestion(["Q1?", "Q2?", "Q3?"], new Set(["Q1?"]));
    assert.deepEqual(result, { question: "Q2?", position: 1, total: 2 });
  });

  test("every question skipped or gone returns null (the 'all answered' sentinel)", () => {
    assert.equal(selectVisibleQuestion([], new Set<string>()), null);
    assert.equal(selectVisibleQuestion(["Q1?"], new Set(["Q1?"])), null);
  });

  test("position/total are derived from the filtered (skip-excluded) list, not the raw list", () => {
    const result = selectVisibleQuestion(["Q1?", "Q2?", "Q3?", "Q4?"], new Set(["Q1?", "Q3?"]));
    assert.deepEqual(result, { question: "Q2?", position: 1, total: 2 });
  });

  // The two loop tests the review flagged as missing.
  test("applied path — the answered question is pruned from the refreshed openQuestions, so the NEXT question becomes visible", () => {
    // Before: operator answers Q1?, server applies the turn.
    const before = selectVisibleQuestion(["Q1?", "Q2?", "Q3?"], new Set<string>());
    assert.equal(before?.question, "Q1?");
    // interviewTurn's applied path returns openQuestions with Q1? pruned —
    // record-client.tsx dispatches this straight into state.openQuestions,
    // no local index math involved.
    const refreshed = ["Q2?", "Q3?"];
    const after = selectVisibleQuestion(refreshed, new Set<string>());
    assert.deepEqual(after, { question: "Q2?", position: 1, total: 2 });
  });

  test("applied:false path — openQuestions is unchanged, so the SAME question stays visible (no advance)", () => {
    const questions = ["Q1?", "Q2?", "Q3?"];
    const before = selectVisibleQuestion(questions, new Set<string>());
    assert.equal(before?.question, "Q1?");
    // interviewTurn's applied:false fallback returns the INPUT
    // model/openQuestions unchanged (interview.ts) — the array reference may
    // even differ (a fresh array with the same content), but the selector
    // must land on the same question either way.
    const unchanged = ["Q1?", "Q2?", "Q3?"];
    const after = selectVisibleQuestion(unchanged, new Set<string>());
    assert.deepEqual(after, { question: "Q1?", position: 1, total: 3 });
  });
});

describe("<QuestionCard> visibility invariant (chip text must never match its background)", () => {
  // Live-browser bug (2026-07-16): Max saw the Yes/No chips render as BLANK
  // cream pills — label invisible. Root-caused via getComputedStyle against
  // the real Next.js CSS pipeline (not this test harness): the chips never
  // set an explicit background, relying on Tailwind Preflight's
  // `background-color: transparent` default on `<button>`. That default
  // holds under Chromium/Playwright (verified: transparent bg, cream text,
  // renders correctly) — the actual gap is Preflight's `appearance: button`
  // (not `none`), a well-documented cross-browser inconsistency where some
  // browsers/OS theme combinations paint a native (often light/cream) button
  // face UNDER an author's `background-color: transparent` when appearance
  // isn't explicitly `none`. The dashboard-token hypothesis (--card/
  // --foreground/--primary failing to resolve on /record) does NOT hold:
  // this component never references those tokens, and the --lp-* tokens it
  // does use resolve correctly (confirmed via computed style). The fix is
  // still the same either way: stop relying on any implicit/inherited
  // background — every chip gets an EXPLICIT background AND an EXPLICIT,
  // differing text color, so there's no browser/OS path left where they can
  // coincide. Test visibility, not presence (the OG-card lesson) — assert
  // the actual hex values, not just that *a* style attribute exists.
  test("the Yes chip carries an explicit paper background (#F6F2EA) AND explicit forest-ink text (#1F2B24)", () => {
    const html = renderToString(
      React.createElement(QuestionCard, {
        questions: ["Q1?"],
        skippedQuestions: new Set<string>(),
        pending: false,
        onAnswer: noop,
        onSkip: noopSkip,
      }),
    );
    const match = html.match(/<button[^>]*>Yes<\/button>/);
    assert.ok(match, "Yes chip did not render");
    const tag = match[0];
    assert.match(tag, /#F6F2EA/i, "Yes chip is missing its explicit paper background (#F6F2EA)");
    assert.match(tag, /#1F2B24/i, "Yes chip is missing its explicit forest-ink text color (#1F2B24)");
  });

  test("the No chip carries an explicit paper background (#F6F2EA) AND explicit forest-ink text (#1F2B24)", () => {
    const html = renderToString(
      React.createElement(QuestionCard, {
        questions: ["Q1?"],
        skippedQuestions: new Set<string>(),
        pending: false,
        onAnswer: noop,
        onSkip: noopSkip,
      }),
    );
    const match = html.match(/<button[^>]*>No<\/button>/);
    assert.ok(match, "No chip did not render");
    const tag = match[0];
    assert.match(tag, /#F6F2EA/i, "No chip is missing its explicit paper background (#F6F2EA)");
    assert.match(tag, /#1F2B24/i, "No chip is missing its explicit forest-ink text color (#1F2B24)");
  });

  test("the chip background and text colors are never the same hex (the actual visibility invariant)", () => {
    const html = renderToString(
      React.createElement(QuestionCard, {
        questions: ["Q1?"],
        skippedQuestions: new Set<string>(),
        pending: false,
        onAnswer: noop,
        onSkip: noopSkip,
      }),
    );
    for (const label of ["Yes", "No"]) {
      const match = html.match(new RegExp(`<button[^>]*>${label}</button>`));
      assert.ok(match, `${label} chip did not render`);
      const tag = match[0];
      // Direct, unambiguous check on the two literal values the directive
      // specifies — bg #F6F2EA, text #1F2B24 — rather than a generic
      // "any two hexes differ" check, since that would pass even if both
      // ended up cream (matching the ORIGINAL bug) as long as some OTHER
      // unrelated hex appeared anywhere in the tag.
      assert.match(tag, /#F6F2EA/i, `${label} chip missing explicit #F6F2EA background`);
      assert.match(tag, /#1F2B24/i, `${label} chip missing explicit #1F2B24 text`);
    }
  });

  test("the question text itself sets its color explicitly to #F6F2EA (not a bare CSS var)", () => {
    const html = renderToString(
      React.createElement(QuestionCard, {
        questions: ["What if there's no email?"],
        skippedQuestions: new Set<string>(),
        pending: false,
        onAnswer: noop,
        onSkip: noopSkip,
      }),
    );
    assert.match(html, /aria-live="polite"[^>]*>What if there&#x27;s no email\?</);
    const idx = html.indexOf("What if there&#x27;s no email?");
    assert.ok(idx >= 0);
    const before = html.slice(Math.max(0, idx - 400), idx);
    assert.match(before, /#F6F2EA/i, "question text is missing an explicit #F6F2EA color");
  });

  test("disabled chips still carry their explicit colors (contrast holds even mid-flight)", () => {
    const html = renderToString(
      React.createElement(QuestionCard, {
        questions: ["Q1?"],
        skippedQuestions: new Set<string>(),
        pending: true,
        onAnswer: noop,
        onSkip: noopSkip,
      }),
    );
    const match = html.match(/<button[^>]*>Yes<\/button>/);
    assert.ok(match);
    assert.match(match[0], /#F6F2EA/i);
    assert.match(match[0], /#1F2B24/i);
  });
});

describe("<QuestionCard>", () => {
  test("renders nothing when there are no open questions", () => {
    const html = renderToString(
      React.createElement(QuestionCard, {
        questions: [],
        skippedQuestions: new Set<string>(),
        pending: false,
        onAnswer: noop,
        onSkip: noopSkip,
      }),
    );
    assert.equal(html, "");
  });

  test("shows exactly ONE question with its 1-based position out of N", () => {
    const html = renderToString(
      React.createElement(QuestionCard, {
        questions: ["What if there's no email?", "Who approves invoices?", "Q3?", "Q4?", "Q5?", "Q6?"],
        skippedQuestions: new Set<string>(),
        pending: false,
        onAnswer: noop,
        onSkip: noopSkip,
      }),
    );
    assert.match(html, /Question <!-- -->1<!-- --> of <!-- -->6/);
    assert.match(html, /What if there&#x27;s no email\?|What if there's no email\?/);
    // Only the current question's text renders — none of the others leak in.
    assert.doesNotMatch(html, /Who approves invoices\?/);
  });

  test("skipping the first question reveals the second, and the total shrinks to match the remaining queue", () => {
    const html = renderToString(
      React.createElement(QuestionCard, {
        questions: ["Q1?", "Q2?", "Q3?"],
        skippedQuestions: new Set(["Q1?"]),
        pending: false,
        onAnswer: noop,
        onSkip: noopSkip,
      }),
    );
    assert.match(html, /Question <!-- -->1<!-- --> of <!-- -->2/);
    assert.match(html, />Q2\?</);
    assert.doesNotMatch(html, />Q1\?</);
  });

  test("renders Yes/No chips, a Skip link, and a free-text input + Send", () => {
    const html = renderToString(
      React.createElement(QuestionCard, {
        questions: ["Q1?"],
        skippedQuestions: new Set<string>(),
        pending: false,
        onAnswer: noop,
        onSkip: noopSkip,
      }),
    );
    assert.match(html, />Yes</);
    assert.match(html, />No</);
    assert.match(html, />Skip</);
    assert.match(html, /<input/);
    assert.match(html, />Send</);
  });

  test("the answer input carries an accessible label", () => {
    const html = renderToString(
      React.createElement(QuestionCard, {
        questions: ["Q1?"],
        skippedQuestions: new Set<string>(),
        pending: false,
        onAnswer: noop,
        onSkip: noopSkip,
      }),
    );
    assert.match(html, /aria-label="Answer this question"/);
  });

  test('the question text is announced via aria-live="polite"', () => {
    const html = renderToString(
      React.createElement(QuestionCard, {
        questions: ["Q1?"],
        skippedQuestions: new Set<string>(),
        pending: false,
        onAnswer: noop,
        onSkip: noopSkip,
      }),
    );
    assert.match(html, /aria-live="polite"[^>]*>Q1\?</);
  });

  test("no amber (#EAB308) anywhere in the question card markup", () => {
    const html = renderToString(
      React.createElement(QuestionCard, {
        questions: ["Q1?", "Q2?"],
        skippedQuestions: new Set<string>(),
        pending: false,
        onAnswer: noop,
        onSkip: noopSkip,
      }),
    );
    assert.doesNotMatch(html, /#EAB308/i);
  });

  test("every question skipped renders the compact 'all questions answered' state, not a crash", () => {
    const html = renderToString(
      React.createElement(QuestionCard, {
        questions: ["Q1?", "Q2?"],
        skippedQuestions: new Set(["Q1?", "Q2?"]),
        pending: false,
        onAnswer: noop,
        onSkip: noopSkip,
      }),
    );
    assert.match(html, /All questions answered/);
    assert.doesNotMatch(html, />Yes</);
  });

  test("pending disables the Yes/No/Skip/Send affordances", () => {
    const html = renderToString(
      React.createElement(QuestionCard, {
        questions: ["Q1?"],
        skippedQuestions: new Set<string>(),
        pending: true,
        onAnswer: noop,
        onSkip: noopSkip,
      }),
    );
    const disabledCount = (html.match(/disabled=""/g) ?? []).length;
    // Yes, No, Skip, Send — all four gated while an interview turn is in flight.
    assert.ok(disabledCount >= 4, `expected >=4 disabled controls, saw ${disabledCount}`);
  });
});
