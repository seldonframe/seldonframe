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
// Presentational only — no I/O. record-client.tsx owns the skippedQuestions
// set and wires onAnswer/onSkip to the existing interview send flow
// (reusing /api/v1/recordings/interview via sendInterviewMessage — no new
// endpoint, no schema change). Chips are just prefilled answers; the
// free-text field is the honest fallback for anything a Yes/No can't cover.
//
// review fix (2026-07-16) — this is a QUEUE, not a pointer. An earlier
// version tracked a numeric `questionIndex` and advanced it +1 optimistically
// on every answer/skip. That's wrong against interviewTurn's actual
// contract (interview.ts): an APPLIED turn returns openQuestions with the
// answered question PRUNED — advancing +1 on top of a shorter list skips
// the next question. And on applied:false (the merge didn't land),
// openQuestions is UNCHANGED — advancing +1 there silently drops an
// uncaptured question. There is no reliable index to advance TO; the only
// honest source of truth is "whichever open question is still in the list
// and hasn't been locally skipped" — a queue selector, not a counter.
"use client";

import { useState } from "react";

/** Pure selector — exported for direct unit testing, since record-client.tsx's
 *  hooks aren't reachable via renderToString (useEffect never runs during
 *  SSR, and there's no jsdom harness for this surface). The visible question
 *  is always the FIRST entry of `questions` that isn't in `skipped` — no
 *  index, no clamping. When a turn applies, the server's refreshed
 *  `openQuestions` simply no longer contains the answered question, so the
 *  next call naturally reveals the next one. When a turn doesn't apply,
 *  `questions` is unchanged, so the SAME question stays visible — honest,
 *  since it wasn't actually captured. `position`/`total` are derived from
 *  the filtered (skip-excluded) list, so "Question 1 of N" always describes
 *  the remaining queue, not the original list. */
export function selectVisibleQuestion(
  questions: string[],
  skipped: ReadonlySet<string>,
): { question: string; position: number; total: number } | null {
  const remaining = questions.filter((q) => !skipped.has(q));
  if (remaining.length === 0) return null;
  return { question: remaining[0], position: 1, total: remaining.length };
}

export function QuestionCard({
  questions,
  skippedQuestions,
  pending,
  onAnswer,
  onSkip,
}: {
  questions: string[];
  /** Question texts the operator has locally skipped — excluded from the
   *  queue selector. Never cleared: once skipped, a question only comes
   *  back into view if the server itself re-adds the same text (rare, and
   *  harmless if it does — it's just a fresh entry to skip again). */
  skippedQuestions: ReadonlySet<string>;
  /** interviewPending — true while the previous answer's interview turn is
   *  still in flight. Disables every affordance so a second click can't fire
   *  a concurrent /interview request while one is still resolving. */
  pending: boolean;
  /** Fired by a chip ("Yes"/"No") or the free-text Send — record-client.tsx
   *  frames it as `Q: <question>\nA: <answer>` and sends the ONE existing
   *  interview message. No local advance: the server's refreshed
   *  openQuestions (on an applied turn) is what reveals the next question. */
  onAnswer: (question: string, answer: string) => void;
  /** Adds `question` to the local skip set — no merge attempted, nothing
   *  sent to the server. */
  onSkip: (question: string) => void;
}) {
  const [text, setText] = useState("");

  if (questions.length === 0) return null;

  const visible = selectVisibleQuestion(questions, skippedQuestions);

  if (!visible) {
    return (
      <p className="text-[13.5px]" style={{ color: "var(--lp-body)" }}>
        All questions answered.
      </p>
    );
  }

  const { question, position, total } = visible;

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
        Question {position} of {total}
      </p>
      {/* aria-live: the question text changes in place (applied turns prune
          the answered question; the next one takes this same slot) — announce
          it rather than relying on a DOM-structure change screen readers may
          not catch. */}
      <p
        className="text-[15px] font-[600]"
        style={{ color: "var(--lp-ink)" }}
        aria-live="polite"
      >
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
          onClick={() => onSkip(question)}
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
          aria-label="Answer this question"
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
