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
