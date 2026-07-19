// packages/crm/tests/unit/recordings/record-ui-v3.spec.ts
//
// Record v3 (T3) — presentational unit coverage for the new single-slot
// pieces: <CaptureCard>, <TracedList>, and <RecapPanel>'s edgeCasePrompt
// row. All three are pure presentation (props in, no I/O), so renderToString
// is enough — no jsdom needed. Plain .spec.ts (JSX isn't valid in .ts under
// tsx's esbuild loader), React.createElement throughout.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import React from "react";
import { renderToString } from "react-dom/server";

import { CaptureCard } from "../../../src/app/(public)/record/record-ui/capture-card";
import { TracedList } from "../../../src/app/(public)/record/record-ui/traced-list";
import { RecapPanel } from "../../../src/app/(public)/record/record-ui/recap-panel";
import type { RecorderSlot } from "../../../src/app/(public)/record/recorder-machine";

function emptySlot(slotIndex = 0): RecorderSlot {
  return { slotIndex, label: null, status: "empty" };
}

const noop = () => {};

describe("<CaptureCard>", () => {
  test("empty slot 0 shows the 'one normal run' copy + a Record button + upload affordance", () => {
    const html = renderToString(
      React.createElement(CaptureCard, {
        slot: emptySlot(0),
        isActive: false,
        canStart: true,
        sessionReady: true,
        supportsScreenCapture: true,
        elapsedMs: null,
        fallbackText: "",
        pendingUpload: undefined,
        uploadProgress: undefined,
        onRecord: noop,
        onStop: noop,
        onFileChange: noop,
        onFallbackTextChange: noop,
        onProcessUpload: noop,
        onCancelUpload: noop,
      }),
    );
    assert.match(html, /One normal, successful run/);
    assert.match(html, />Record</);
    assert.match(html, /or upload a recording/);
  });

  test("empty slot > 0 (an edge-case slot) shows the edge-case framing instead", () => {
    const html = renderToString(
      React.createElement(CaptureCard, {
        slot: emptySlot(1),
        isActive: false,
        canStart: true,
        sessionReady: true,
        supportsScreenCapture: true,
        elapsedMs: null,
        fallbackText: "",
        pendingUpload: undefined,
        uploadProgress: undefined,
        onRecord: noop,
        onStop: noop,
        onFileChange: noop,
        onFallbackTextChange: noop,
        onProcessUpload: noop,
        onCancelUpload: noop,
      }),
    );
    assert.match(html, /Anything ever go differently/);
  });

  test("uploading status renders the WaitCopy component (honest rotating line)", () => {
    const html = renderToString(
      React.createElement(CaptureCard, {
        slot: { slotIndex: 0, label: null, status: "uploading" },
        isActive: false,
        canStart: false,
        sessionReady: true,
        supportsScreenCapture: true,
        elapsedMs: null,
        fallbackText: "",
        pendingUpload: undefined,
        uploadProgress: undefined,
        onRecord: noop,
        onStop: noop,
        onFileChange: noop,
        onFallbackTextChange: noop,
        onProcessUpload: noop,
        onCancelUpload: noop,
      }),
    );
    assert.match(html, /Reading your recording/);
  });
});

describe("<TracedList>", () => {
  test("renders nothing when there are no traced slots", () => {
    const html = renderToString(
      React.createElement(TracedList, {
        slots: [],
        canStart: true,
        sessionReady: true,
        stepsFound: 0,
        durationMsBySlot: {},
        onLabelChange: noop,
        onRerecord: noop,
      }),
    );
    assert.equal(html, "");
  });

  test("renders a compact row per traced slot with the flow's shared step count", () => {
    const html = renderToString(
      React.createElement(TracedList, {
        slots: [{ slotIndex: 0, label: "Happy path", status: "traced" }],
        canStart: true,
        sessionReady: true,
        stepsFound: 4,
        durationMsBySlot: { 0: 12000 },
        onLabelChange: noop,
        onRerecord: noop,
      }),
    );
    assert.match(html, /aria-label="Traced recordings"/);
    assert.match(html, /Traced · flow so far: <!-- -->4<!-- --> step<!-- -->s/);
    assert.match(html, /Re-record/);
  });
});

describe("<RecapPanel> edgeCasePrompt row", () => {
  const baseProps = {
    phase: "recap" as const,
    flowModel: null,
    coverage: [],
    openQuestions: [],
    interview: [],
    interviewInput: "",
    interviewPending: false,
    interviewError: null,
    isAuthed: true,
    compiling: false,
    compiledTemplateId: null,
    claimHref: "/signup",
    skippedQuestions: new Set<string>(),
    onInterviewInputChange: noop,
    onInterviewSend: noop,
    onInterviewRetry: noop,
    onCompileNow: noop,
    onCompileAgent: noop,
    onApprove: noop,
    onQuestionAnswer: noop,
    onQuestionSkip: noop,
  };

  test("hidden when edgeCasePrompt is undefined (busy slot / all 6 used / nothing traced yet)", () => {
    const html = renderToString(React.createElement(RecapPanel, baseProps));
    assert.doesNotMatch(html, /Make it trustworthy/);
  });

  test("shown with a '+ Record an edge case' affordance when edgeCasePrompt is provided", () => {
    const html = renderToString(
      React.createElement(RecapPanel, {
        ...baseProps,
        edgeCasePrompt: { onRecord: noop, onFileChange: noop, supportsScreenCapture: true },
      }),
    );
    assert.match(html, /Make it trustworthy/);
    assert.match(html, /\+ Record an edge case/);
    assert.match(html, /or upload/);
  });

  test("mobile (no getDisplayMedia) drops the Record button but keeps the upload affordance", () => {
    const html = renderToString(
      React.createElement(RecapPanel, {
        ...baseProps,
        edgeCasePrompt: { onRecord: noop, onFileChange: noop, supportsScreenCapture: false },
      }),
    );
    assert.doesNotMatch(html, /\+ Record an edge case/);
    assert.match(html, /or upload/);
  });

  test("hidden in phase 'approved' even when edgeCasePrompt is provided (review minor #5)", () => {
    const html = renderToString(
      React.createElement(RecapPanel, {
        ...baseProps,
        phase: "approved",
        edgeCasePrompt: { onRecord: noop, onFileChange: noop, supportsScreenCapture: true },
      }),
    );
    assert.doesNotMatch(html, /Make it trustworthy/);
  });
});

describe("<RecapPanel> question card (interview-one-question)", () => {
  const baseProps = {
    phase: "recap" as const,
    flowModel: null,
    coverage: [],
    openQuestions: [],
    interview: [],
    interviewInput: "",
    interviewPending: false,
    interviewError: null,
    isAuthed: true,
    compiling: false,
    compiledTemplateId: null,
    claimHref: "/signup",
    skippedQuestions: new Set<string>(),
    onInterviewInputChange: noop,
    onInterviewSend: noop,
    onInterviewRetry: noop,
    onCompileNow: noop,
    onCompileAgent: noop,
    onApprove: noop,
    onQuestionAnswer: noop,
    onQuestionSkip: noop,
  };

  test("empty openQuestions renders no question card at all", () => {
    const html = renderToString(React.createElement(RecapPanel, baseProps));
    assert.doesNotMatch(html, /Question <!-- -->/);
    assert.doesNotMatch(html, />Yes</);
  });

  test("exactly ONE question renders when there are 6 open questions — 'Question 1 of 6', not a wall", () => {
    const html = renderToString(
      React.createElement(RecapPanel, {
        ...baseProps,
        openQuestions: ["Q1?", "Q2?", "Q3?", "Q4?", "Q5?", "Q6?"],
      }),
    );
    assert.match(html, /Question <!-- -->1<!-- --> of <!-- -->6/);
    assert.doesNotMatch(html, />Q2\?</);
    assert.doesNotMatch(html, />Q6\?</);
  });

  test("skippedQuestions excludes locally-skipped questions from view — the next unskipped one shows", () => {
    const html = renderToString(
      React.createElement(RecapPanel, {
        ...baseProps,
        openQuestions: ["Q1?", "Q2?", "Q3?"],
        skippedQuestions: new Set(["Q1?", "Q2?"]),
      }),
    );
    // Filtered queue is just ["Q3?"] — "Question 1 of 1", not "3 of 3".
    assert.match(html, /Question <!-- -->1<!-- --> of <!-- -->1/);
    assert.match(html, />Q3\?</);
  });

  test("an applied server refresh (answered question pruned from openQuestions) reveals the next question with no local index math", () => {
    // Simulates record-client.tsx's state.openQuestions after
    // sendInterviewMessage's INTERVIEW_REPLY/MODEL_UPDATED dispatch on an
    // applied turn — the answered question is simply no longer in the array.
    const html = renderToString(
      React.createElement(RecapPanel, {
        ...baseProps,
        openQuestions: ["Q2?", "Q3?"], // Q1? already pruned server-side
        skippedQuestions: new Set<string>(),
      }),
    );
    assert.match(html, /Question <!-- -->1<!-- --> of <!-- -->2/);
    assert.match(html, />Q2\?</);
  });

  test("an applied:false refresh (openQuestions unchanged) keeps the SAME question visible", () => {
    const html = renderToString(
      React.createElement(RecapPanel, {
        ...baseProps,
        openQuestions: ["Q1?", "Q2?", "Q3?"], // unchanged — turn didn't apply
        skippedQuestions: new Set<string>(),
      }),
    );
    assert.match(html, /Question <!-- -->1<!-- --> of <!-- -->3/);
    assert.match(html, />Q1\?</);
  });

  test("the question card carries no #EAB308 amber (token hierarchy only)", () => {
    const html = renderToString(
      React.createElement(RecapPanel, {
        ...baseProps,
        openQuestions: ["Q1?", "Q2?"],
      }),
    );
    // Isolate the question-card markup (between the "Question 1 of 2" label
    // and the closing of its wrapper) rather than the whole panel — the
    // per-step coverage summary line legitimately still uses #EAB308 for the
    // "needs approval" tier badge, which is out of scope for this slice.
    const cardStart = html.indexOf("Question <!-- -->1");
    assert.ok(cardStart >= 0, "question card did not render");
    const cardMarkup = html.slice(cardStart, cardStart + 1500);
    assert.doesNotMatch(cardMarkup, /#EAB308/i);
  });

  test("Yes/No chips and Skip render alongside the free-text input", () => {
    const html = renderToString(
      React.createElement(RecapPanel, {
        ...baseProps,
        openQuestions: ["Q1?"],
      }),
    );
    assert.match(html, />Yes</);
    assert.match(html, />No</);
    assert.match(html, />Skip</);
    assert.match(html, /<input/);
  });
});
