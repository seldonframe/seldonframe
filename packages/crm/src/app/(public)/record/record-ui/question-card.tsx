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
//
// visibility fix (2026-07-16) — Max saw the Yes/No chips render as BLANK
// cream pills on a live browser. Root-caused via getComputedStyle against
// the REAL Next.js CSS pipeline (a temp diagnostic route, not this file's
// own renderToString tests): the chips never set an explicit background,
// relying on Tailwind Preflight's `background-color: transparent` default
// for `<button>`. That default DOES hold under Chromium (verified: the
// bug does not reproduce there) — the actual gap is Preflight pairing
// `background-color: transparent` with `appearance: button` (not `none`)
// on raw buttons, a known cross-browser inconsistency: some browser/OS
// theme combinations paint a native (often light) button face UNDER an
// author's transparent background when appearance isn't explicitly `none`.
// The dashboard-shadcn-token hypothesis (--card/--foreground/--primary
// failing to resolve on /record, since only .lp-root[data-mode="record"]
// tokens exist there) does NOT hold — this component never referenced
// those tokens, and the --lp-* tokens it DID use resolved correctly. Either
// way, the fix is the same: every interactive element here now sets an
// EXPLICIT background AND an EXPLICIT, differing text color (literal hex,
// not a var — /record's CSS scope is a smaller, easier surface to keep
// bulletproof than trying to prove every var resolves in every browser),
// plus `appearance-none` so no browser is ever free to paint its own face
// underneath. Same dark-mode branding as the seldonframe.com dashboard:
// forest ink (#1F2B24) on paper (#F6F2EA) for filled chips — matching
// landing-theme.css's own `--lp-cta-bg`/`--lp-cta-ink` pairing for
// record-mode, just hardcoded here for defense in depth.
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
      <p className="text-[13.5px]" style={{ color: "#C9C2B6" }}>
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

  // Dashboard-dark font stack: same var the root layout loads Hanken
  // Grotesk into app-wide, with an explicit fallback chain so this still
  // reads correctly if the var is ever unset for any reason.
  const fontStack = "var(--font-hanken, ui-sans-serif), ui-sans-serif, system-ui, sans-serif";

  return (
    <div
      className="flex flex-col gap-2.5 rounded-[10px] p-3"
      style={{
        background: "#1A1713",
        border: "1px solid rgba(246,242,234,0.08)",
        fontFamily: fontStack,
      }}
    >
      <p
        className="text-[11px] font-[600] uppercase tracking-[0.05em]"
        style={{ color: "#A39B8D" }}
      >
        Question {position} of {total}
      </p>
      {/* aria-live: the question text changes in place (applied turns prune
          the answered question; the next one takes this same slot) — announce
          it rather than relying on a DOM-structure change screen readers may
          not catch. */}
      <p
        className="text-[15px] font-[600]"
        style={{ color: "#F6F2EA" }}
        aria-live="polite"
      >
        {question}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {/* Yes/No chips — forest ink on paper, the same filled-button
            pairing as the dashboard (landing-theme.css's --lp-cta-ink/
            --lp-cta-bg for record-mode), hardcoded here so no browser/OS
            appearance quirk can ever paint over it (see the file header's
            visibility-fix note). Squared corners per brand; appearance-none
            strips any native widget chrome that could otherwise render
            underneath the explicit background. */}
        <button
          type="button"
          disabled={pending}
          onClick={() => onAnswer(question, "Yes")}
          className="appearance-none inline-flex h-8 items-center rounded-none px-3 text-[13.5px] font-[500] hover:bg-[#E8E2D6] disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: "#F6F2EA", color: "#1F2B24" }}
        >
          Yes
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => onAnswer(question, "No")}
          className="appearance-none inline-flex h-8 items-center rounded-none px-3 text-[13.5px] font-[500] hover:bg-[#E8E2D6] disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: "#F6F2EA", color: "#1F2B24" }}
        >
          No
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => onSkip(question)}
          className="appearance-none underline underline-offset-2 text-[13.5px] disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: "transparent", color: "#A39B8D" }}
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
          className="flex-1 rounded-[10px] border bg-transparent px-3 py-2 text-[13.5px] outline-none placeholder:text-[#A39B8D] disabled:opacity-50"
          style={{ borderColor: "rgba(246,242,234,0.14)", color: "#F6F2EA" }}
        />
        {/* Send — same explicit paper/ink pairing as the Yes/No chips
            (never the bare --lp-accent/--lp-on-accent tokens this used to
            reference), plus appearance-none for the same reason. */}
        <button
          type="button"
          disabled={pending || !text.trim()}
          onClick={send}
          className="appearance-none rounded-[10px] px-3 py-2 text-[13.5px] font-[600] hover:bg-[#E8E2D6] disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: "#F6F2EA", color: "#1F2B24" }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
