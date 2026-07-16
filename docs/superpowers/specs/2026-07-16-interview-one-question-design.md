# Interview one-question-at-a-time + recap palette — design & plan

**Branch:** `feat/interview-one-question` @ `40c564f40` · **Approved:** Max 2026-07-15 ("yes do them all") · **Flag:** none (UI presentation; the compile/interview contracts are unchanged)

## Why (Max's run, 2026-07-15)

Two complaints + one bug from the live run: (1) OPEN QUESTIONS renders as a 6-question amber wall (`#EAB308` at recap-panel.tsx:177) — unreadable, un-actionable; (2) overall recap type/color "not great"; (3) Max answered ALL questions in one free-text message and `interviewTurn` failed to merge (interview.ts:14 — `ok:true, applied:false` after one retry; the "could you rephrase / answer one at a time" reply). The product told the user to do one-at-a-time; the UI should just BE one-at-a-time.

## Ground truth (verified this session)

- `interviewTurn` (lib/recordings/interview.ts): validates merged FlowModel via `FlowModelSchema`, one retry, then `applied:false` honest fallback. It already returns `appliedPairs?: AnsweredPair[]`.
- UI: recap-panel.tsx L170-183 questions list (`#EAB308`), L231-290 ASK SELDON chat + input; send handler record-client.tsx L519-560 POSTs `{message}` to /api/v1/recordings/interview.
- Palette tokens: `.lp-root[data-mode="record"]` in components/landing/landing-theme.css (`--lp-ink #F6F2EA`, `--lp-body #C9C2B6`, `--lp-muted #A39B8D`, `--lp-bg #14110D`); route-level import already in record/page.tsx. Constraint honored: landing-theme.css is imported only from app/(public).
- Render tests: renderToString harness in tests/unit/recordings/record-ui-v3.spec.ts.

## Design

1. **One question card.** Replace the questions `<ul>` with a single card: "Question {i} of {N}" + the question in `--lp-ink` (NOT amber) + three affordances: **Yes** chip, **No** chip, and a short free-text input with its own Send. Answering (chip or text) sends ONE message to the existing endpoint, framed for merge reliability: `Q: <question text>\nA: <answer>`. A **Skip** link advances without sending. After the last question: compact "All questions answered" state (or the card hides if none). openQuestions from each interview reply refresh the deck (server may add/remove questions — always re-derive `N` and clamp `i`).
2. **Chip semantics are honest:** chips are just prefilled answers ("Yes"/"No") — no new endpoint, no schema change. The ASK SELDON free chat stays below for ad-hoc detail (unchanged behavior, including the applied:false reply).
3. **Palette/type pass on the recap panel only:** amber question text → token hierarchy (`--lp-ink` for questions/headers, `--lp-body` for prose, `--lp-muted` for meta). `TIER_COLOR` stays for tier BADGES only (that's its job). Buttons/chips follow the record-mode tokens (cream-on-dark, squared per brand). No new fonts — use the page's existing stack; fix sizes/weights for hierarchy (question ≥15px/600; body 13.5px).
4. **Multi-answer robustness note:** the one-at-a-time UI structurally removes the failure trigger; the server keeps its honest fallback for free-chat. NO server changes in this slice (Minimal Impact) — if the implementer finds the `Q:/A:` framing breaks any interview.spec expectation, STOP and report rather than editing server code.

## Build plan (TDD, commit per task, judge tests by delta; baselines first)

- **Task 1 — question-card state.** record-client.tsx: `questionIndex` state (number, clamped to openQuestions length; reset on INTERVIEW_REPLY via effect or reducer — follow recorder-machine conventions if the state lives there; read it first). `handleQuestionAnswer(question: string, answer: string)` → reuses `sendInterviewMessage` with the `Q:/A:` framing, then advances index. Tests: if recorder-machine owns it, pure reducer tests (answered → advance, reply-refresh → clamp); if component state, renderToString assertions.
- **Task 2 — recap-panel card UI + palette.** Replace L170-183 block with the card; restyle per Design §3 (tokens via inline `var(--lp-…)` style or the panel's existing pattern — match file conventions). renderToString tests: exactly one question visible when N>1; "Question 1 of 6" label; NO `#EAB308` on question text (assert the hex is absent from question card markup); chips render; empty-questions → no card.
- **Task 3 — vision gate + regression.** Full suite + tsc deltas. Then vision-verify: render the recap (fixture flowModel with 6 questions, mixed coverage) via the existing render harness to static HTML, screenshot, dispatch vision-grader with rubric: (a) one question card, legible hierarchy, no amber text wall; (b) chips visibly tappable; (c) brand-consistent dark palette; (d) autonomy line + tier badges intact. Gaps → fix → regrade (max 2 rounds; then STOP and report).

Out of scope: server/interview.ts changes · Ask-Seldon chat redesign · slice 3/4 surfaces.
