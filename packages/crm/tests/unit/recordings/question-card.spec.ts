// packages/crm/tests/unit/recordings/question-card.spec.ts
//
// Interview one-question-at-a-time (Tasks 1-2): <QuestionCard> is the
// presentational replacement for recap-panel.tsx's old amber "Open
// questions" <ul> wall — exactly ONE question at a time, Yes/No chips, a
// free-text answer + Send, and a Skip link. Also covers the pure
// index-advance/clamp helpers record-client.tsx wires up around it (no
// jsdom needed for either — renderToString + plain function calls).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import React from "react";
import { renderToString } from "react-dom/server";

import {
  QuestionCard,
  clampQuestionIndex,
  nextQuestionIndex,
} from "../../../src/app/(public)/record/record-ui/question-card";

const noop = () => {};

describe("nextQuestionIndex", () => {
  test("advances by one", () => {
    assert.equal(nextQuestionIndex(0), 1);
    assert.equal(nextQuestionIndex(3), 4);
  });
});

describe("clampQuestionIndex", () => {
  test("leaves an in-range index untouched", () => {
    assert.equal(clampQuestionIndex(2, 5), 2);
  });

  test("clamps down to the new total when the server drops questions", () => {
    assert.equal(clampQuestionIndex(5, 2), 2);
  });

  test("never goes negative", () => {
    assert.equal(clampQuestionIndex(-3, 5), 0);
  });

  test("total itself is a valid clamp target (the 'all answered' sentinel)", () => {
    assert.equal(clampQuestionIndex(9, 3), 3);
  });
});

describe("<QuestionCard>", () => {
  test("renders nothing when there are no open questions", () => {
    const html = renderToString(
      React.createElement(QuestionCard, {
        questions: [],
        index: 0,
        pending: false,
        onAnswer: noop,
        onSkip: noop,
      }),
    );
    assert.equal(html, "");
  });

  test("shows exactly ONE question with its 1-based position out of N", () => {
    const html = renderToString(
      React.createElement(QuestionCard, {
        questions: ["What if there's no email?", "Who approves invoices?", "Q3?", "Q4?", "Q5?", "Q6?"],
        index: 0,
        pending: false,
        onAnswer: noop,
        onSkip: noop,
      }),
    );
    assert.match(html, /Question <!-- -->1<!-- --> of <!-- -->6/);
    assert.match(html, /What if there&#x27;s no email\?|What if there's no email\?/);
    // Only the current question's text renders — none of the others leak in.
    assert.doesNotMatch(html, /Who approves invoices\?/);
  });

  test("shows the question at the given index, not always the first", () => {
    const html = renderToString(
      React.createElement(QuestionCard, {
        questions: ["Q1?", "Q2?", "Q3?"],
        index: 1,
        pending: false,
        onAnswer: noop,
        onSkip: noop,
      }),
    );
    assert.match(html, /Question <!-- -->2<!-- --> of <!-- -->3/);
    assert.match(html, />Q2\?</);
  });

  test("renders Yes/No chips, a Skip link, and a free-text input + Send", () => {
    const html = renderToString(
      React.createElement(QuestionCard, {
        questions: ["Q1?"],
        index: 0,
        pending: false,
        onAnswer: noop,
        onSkip: noop,
      }),
    );
    assert.match(html, />Yes</);
    assert.match(html, />No</);
    assert.match(html, />Skip</);
    assert.match(html, /<input/);
    assert.match(html, />Send</);
  });

  test("no amber (#EAB308) anywhere in the question card markup", () => {
    const html = renderToString(
      React.createElement(QuestionCard, {
        questions: ["Q1?", "Q2?"],
        index: 0,
        pending: false,
        onAnswer: noop,
        onSkip: noop,
      }),
    );
    assert.doesNotMatch(html, /#EAB308/i);
  });

  test("index past the end renders the compact 'all questions answered' state, not a crash", () => {
    const html = renderToString(
      React.createElement(QuestionCard, {
        questions: ["Q1?", "Q2?"],
        index: 2,
        pending: false,
        onAnswer: noop,
        onSkip: noop,
      }),
    );
    assert.match(html, /All questions answered/);
    assert.doesNotMatch(html, />Yes</);
  });

  test("pending disables the Yes/No/Skip/Send affordances", () => {
    const html = renderToString(
      React.createElement(QuestionCard, {
        questions: ["Q1?"],
        index: 0,
        pending: true,
        onAnswer: noop,
        onSkip: noop,
      }),
    );
    const disabledCount = (html.match(/disabled=""/g) ?? []).length;
    // Yes, No, Skip, Send — all four gated while an interview turn is in flight.
    assert.ok(disabledCount >= 4, `expected >=4 disabled controls, saw ${disabledCount}`);
  });
});
