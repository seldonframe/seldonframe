// packages/crm/src/app/(public)/record/record-ui/question-card.tsx
//
// One-question-at-a-time interview card (interview-one-question slice).
// Replaces recap-panel.tsx's old amber (#EAB308) "Open questions (N)" <ul>
// wall — that rendered ALL open questions at once, which is what led Max to
// answer every one of them in a single free-text message and hit
// interviewTurn's honest "could you rephrase / answer one at a time?"
// fallback (interview.ts's applied:false path). The product already told
// the user to go one at a time; this UI just enforces it structurally.
//
// Presentational only — no I/O. record-client.tsx owns the questionIndex
// state and wires onAnswer/onSkip to the existing interview send/advance
// flow (reusing /api/v1/recordings/interview via sendInterviewMessage — no
// new endpoint, no schema change). Chips are just prefilled answers; the
// free-text field is the honest fallback for anything a Yes/No can't cover.
"use client";

import { useState } from "react";

/** Pure index-advance helper — exported for direct unit testing, since
 *  record-client.tsx's hooks aren't reachable via renderToString (useEffect
 *  never runs during SSR, and there's no jsdom harness for this surface). */
export function nextQuestionIndex(index: number): number {
  return index + 1;
}

/** Pure clamp helper — keeps the index in [0, total] whenever the server
 *  refreshes openQuestions after a merge (it may add or remove questions,
 *  per the design's "always re-derive N and clamp i"). `total` itself is a
 *  valid clamp target — it's the sentinel this card's compact "all
 *  questions answered" state renders on (index >= questions.length). */
export function clampQuestionIndex(index: number, total: number): number {
  return Math.min(Math.max(index, 0), total);
}

export function QuestionCard({
  questions,
  index,
  pending,
  onAnswer,
  onSkip,
}: {
  questions: string[];
  index: number;
  /** interviewPending — true while the previous answer's interview turn is
   *  still in flight. Disables every affordance so a second click can't fire
   *  a concurrent /interview request while one is still resolving. */
  pending: boolean;
  /** Fired by a chip ("Yes"/"No") or the free-text Send — record-client.tsx
   *  frames it as `Q: <question>\nA: <answer>` and sends the ONE existing
   *  interview message, then advances the index. */
  onAnswer: (question: string, answer: string) => void;
  /** Advances without sending anything (no merge attempted for a skipped
   *  question). */
  onSkip: () => void;
}) {
  const [text, setText] = useState("");

  if (questions.length === 0) return null;

  if (index >= questions.length) {
    return (
      <p className="text-[13.5px]" style={{ color: "var(--lp-body)" }}>
        All questions answered.
      </p>
    );
  }

  const question = questions[index];

  function send() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onAnswer(question, trimmed);
    setText("");
  }

  return (
    <div
      className="flex flex-col gap-2.5 rounded-[10px] border p-3"
      style={{ borderColor: "var(--lp-border-soft)" }}
    >
      <p
        className="text-[11px] font-[600] uppercase tracking-[0.05em]"
        style={{ color: "var(--lp-muted)" }}
      >
        Question {index + 1} of {questions.length}
      </p>
      <p className="text-[15px] font-[600]" style={{ color: "var(--lp-ink)" }}>
        {question}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => onAnswer(question, "Yes")}
          className="inline-flex h-8 items-center rounded-[9px] border px-3 text-[13.5px] font-[600] disabled:cursor-not-allowed disabled:opacity-50"
          style={{ borderColor: "var(--lp-border)", color: "var(--lp-ink)" }}
        >
          Yes
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => onAnswer(question, "No")}
          className="inline-flex h-8 items-center rounded-[9px] border px-3 text-[13.5px] font-[600] disabled:cursor-not-allowed disabled:opacity-50"
          style={{ borderColor: "var(--lp-border)", color: "var(--lp-ink)" }}
        >
          No
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onSkip}
          className="text-[13.5px] underline underline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          style={{ color: "var(--lp-muted)" }}
        >
          Skip
        </button>
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={text}
          disabled={pending}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Or type a short answer..."
          className="flex-1 rounded-[10px] border bg-transparent px-3 py-2 text-[13.5px] outline-none placeholder:text-[color:var(--lp-muted)] disabled:opacity-50"
          style={{ borderColor: "var(--lp-border-soft)", color: "var(--lp-ink)" }}
        />
        <button
          type="button"
          disabled={pending || !text.trim()}
          onClick={send}
          className="rounded-[10px] px-3 py-2 text-[13.5px] font-[600] disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: "var(--lp-accent)", color: "var(--lp-on-accent)" }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
