# interview-one-question — build report

Branch `feat/interview-one-question`, worktree `.claude/worktrees/interview-ux`.
Spec: `docs/superpowers/specs/2026-07-16-interview-one-question-design.md`.

## Shas

- `31e622fac` — Task 1: `<QuestionCard>` (presentational) + `nextQuestionIndex`/`clampQuestionIndex` pure helpers, 12 new tests.
- `f538bca2a` — Tasks 1-2 wiring: `record-client.tsx` questionIndex state + `handleQuestionAnswer`/`handleQuestionSkip`; `recap-panel.tsx` swaps the old amber (`#EAB308`) "Open questions (N)" `<ul>` for `<QuestionCard>`; 5 new `<RecapPanel>` integration tests.
- `4abfb50fa` — Task 3 report (no code changes; vision gate passed round 1).
- **Review fix** — `fix(record): question card is a queue, not a pointer — server prunes drive advancement (review blocking fix) + a11y nits`. Killed `questionIndex`/`nextQuestionIndex`/`clampQuestionIndex` entirely; replaced with `skippedQuestions: Set<string>` + a pure `selectVisibleQuestion(questions, skipped)` queue selector (see below).

## Deviations from the plan

- **State location:** the design left open whether `questionIndex` lives in `recorder-machine.ts` or as component state. It's `useState` in `record-client.tsx`, matching the existing `interviewInput`/`fallbackText` pattern — the reducer's `openQuestions` stays the sole source of truth for *what* the questions are; `questionIndex` is only ever a read position into it, never persisted/replayed.
- **Advance timing:** index advances *synchronously* right after dispatching `INTERVIEW_USER_SENT` (before `sendInterviewMessage`'s fetch resolves), not after the reply lands — chosen for responsiveness (no round-trip wait to move to the next question) and it composes cleanly with the existing `interviewPending` disable-guard (set synchronously inside `sendInterviewMessage` before its first `await`), so a second click can't race a second interview turn.
- **Testability extraction:** pulled `nextQuestionIndex`/`clampQuestionIndex` into `question-card.tsx` as pure exported functions (not spec'd explicitly) since `record-client.tsx`'s hooks aren't reachable via `renderToString` (no jsdom harness on this surface, confirmed via the existing `record-page-render.spec.ts` convention). This gave direct unit coverage of the index math instead of only indirect coverage through rendered markup.
- **No server changes:** confirmed `interview.ts`'s `Q: <question>\nA: <answer>` framing doesn't break `interview.spec.ts` — that suite DI's a fake `llm` and never asserts on message content; the framing only affects the multi-question decompose path (`DECOMPOSE_MIN_PAIRS = 2`), and a single Q/A pair always falls through to the unchanged direct-merge path.
- **Environment repair (not in plan scope but required to run tests at all):** `packages/crm/node_modules` and root `node_modules` junctions were missing from the worktree (`ERR_MODULE_NOT_FOUND: tsx`) — recreated via `mklink /J` from the parent repo, per the `worktree-typecheck-method` memory note.
- **Full-suite runner flakiness (environmental, not code):** `node scripts/run-unit-tests.js` intermittently fails with Windows `ENAMETOOLONG` — the 737-file argv is ~32.7K chars, right at the ~32.7K `CreateProcess` command-line ceiling. One full clean run succeeded early (baseline, below); three subsequent attempts after this branch's file additions failed at the OS level before any test executed. `scripts/run-unit-tests.js` isn't in this task's files-touched scope, so it wasn't patched — instead relied on targeted `node --import tsx --test <touched specs>` runs (which the VERIFY GATE asks for anyway) plus the one clean full-suite baseline to confirm no cross-cutting regression.
- **Vision gate render path:** the SKILL's `vision-shot.mjs` needs a *public* URL (microlink can't reach `localhost`), and the Chrome-MCP `computer` screenshot action timed out repeatedly against a local static server (the exact flakiness the skill's own notes call out — "Chrome-MCP screenshot path is unreliable here"). Publishing the fixture as an Artifact didn't work either (artifacts are private by default; microlink's headless fetch hit "Page not found"). Used the Playwright MCP (`browser_navigate` + `browser_take_screenshot`) against a local `npx serve` static server instead — same render→screenshot→independent-grade shape the skill prescribes, different (working) screenshot mechanism. No repo files were left behind: the fixture-render script, the temp `.claude/launch.json` attempt, the HTML fixture, and the screenshots all lived in the OS scratchpad/temp dirs or were deleted before finishing; `git status` is clean of anything but the two real commits.
- **Self-caught rendering artifact:** the first screenshot showed invisible Yes/No button text (cream-on-cream) — traced to the fixture's hand-rolled CSS reset missing the browser's default button-background override that the real app gets for free from Tailwind's Preflight. Fixed the *fixture's* CSS (not the component) and re-shot before grading, so the grade reflects the actual component contrast, not a harness artifact.

## Review fix (blocking bug + a11y nits)

Post-review, a blocking state bug was found: the original `questionIndex` design advanced +1 synchronously on every answer/skip, which is wrong against `interviewTurn`'s actual contract (`interview.ts`). An **applied** turn returns `openQuestions` with the answered question **pruned** server-side — advancing +1 on top of that shorter list skips whatever took the pruned slot. On **applied:false** (the merge didn't land), `openQuestions` is **unchanged** — advancing +1 there silently drops an uncaptured question instead of leaving it visible for a retry.

Fix: killed the index entirely. `record-client.tsx` now tracks `skippedQuestions: Set<string>` (question text, never cleared automatically); `question-card.tsx` exports a pure `selectVisibleQuestion(questions, skipped)` selector — the visible question is always the first entry of the *current* `openQuestions` not in the skip set, and `position`/`total` are derived from that filtered list. `handleQuestionAnswer` no longer advances anything locally: it dispatches `INTERVIEW_USER_SENT` and sends the turn; on an applied reply, `state.openQuestions` refreshes with the answered question already gone, and the selector naturally reveals the next one. On `applied:false`, `openQuestions` is unchanged, so the same question stays visible — honest, since it wasn't captured. `handleQuestionSkip(question)` just adds the text to the skip set (now also guarded by `interviewPending`, matching the answer path, not just the UI's `disabled` attribute — nit 1). `QuestionCard`'s `onSkip` signature changed from `() => void` to `(question: string) => void` so it can report which question to skip without record-client duplicating the selector logic. No more `useEffect`/clamping — there's no index left to go stale.

A11y nits also landed: the free-text input carries `aria-label="Answer this question"` (nit 2), and the question text renders inside `aria-live="polite"` so a screen reader announces the change when the visible question swaps in place (nit 3).

Tests: deleted the `nextQuestionIndex`/`clampQuestionIndex` describe blocks; added `selectVisibleQuestion` coverage including the two loop tests the review flagged as missing — the **applied** path (`["Q1?","Q2?","Q3?"]` → refreshed `["Q2?","Q3?"]` reveals `Q2?`) and the **applied:false** path (`openQuestions` unchanged → `Q1?` stays visible, no advance) — plus the same two scenarios re-verified through `<RecapPanel>` integration tests (`skippedQuestions` prop, not `questionIndex`).

## Test results (verbatim tails)

Targeted specs (Task 1+2, post-wiring):
```
▶ <RecapPanel> question card (interview-one-question)
  ✔ empty openQuestions renders no question card at all (0.5793ms)
  ✔ exactly ONE question renders when there are 6 open questions — 'Question 1 of 6', not a wall (0.719ms)
  ✔ questionIndex advances which single question shows (0.5921ms)
  ✔ the question card carries no #EAB308 amber (token hierarchy only) (0.6633ms)
  ✔ Yes/No chips and Skip render alongside the free-text input (0.7225ms)
✔ <RecapPanel> question card (interview-one-question) (3.4052ms)
ℹ tests 14
ℹ pass 14
ℹ fail 0
```

Full regression sweep (question-card, record-ui-v3, record-page-render, interview, recorder-machine, continue-interview) — pre-review-fix:
```
ℹ tests 109
ℹ suites 30
ℹ pass 109
ℹ fail 0
ℹ cancelled 0
```

Same sweep, post-review-fix (queue selector + a11y nits):
```
ℹ tests 114
ℹ suites 29
ℹ pass 114
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```
(net +5 tests: 2 loop tests + 1 skip-narrows-the-queue test in `question-card.spec.ts`'s new `selectVisibleQuestion` describe block replacing the deleted index-math block, plus 2 applied/applied:false `<RecapPanel>` integration tests replacing the deleted `questionIndex advances...` test.)

`npx tsc --noEmit` (packages/crm): exit 2, 1 error — identical to the pre-change baseline (`src/app/api/copilot/turn/route.ts(315,9)`, unrelated `persist` property, pre-existing) both before and after the review fix (`diff baseline.log reviewfix2.log` → empty). One intermediate round had 8 `Set<unknown>` inference errors from bare `new Set()` calls in the new tests — fixed by making the empty-set literals `new Set<string>()`.

`pnpm check:use-server`: `✓ All 'use server' files export only async functions / types.` (re-run post-fix, clean.)

Full-suite baseline (one clean run, before this branch's changes): 12022 pass / 135 fail — all DB-bound (Neon `ECONNREFUSED`/workflow-runtime tests), none in `recordings`/`record-ui`. Confirmed via `diff` against the post-change targeted-spec results that nothing in this branch's area regressed.

## Vision-grade verdict

**Round 1: PASS, no gaps.** Independent `vision-grader` agent (haiku, per the skill's pin) graded the fixture screenshot (`Question 1 of 6`, mixed-tier flowModel with 4 steps, 6 open questions) against the Task 3 rubric:
- (a) exactly one question card, not a wall — pass
- (b) legible hierarchy, muted label / prominent question text — pass
- (c) Yes/No chips + Skip + free-text input all visible and tappable-looking — pass
- (d) no amber on the question card itself; amber correctly still present on the "needs approval" summary/badge — pass
- (e) autonomy summary line + per-step tier badges intact — pass
- (f) no layout defects — pass

No second round needed.

## Open risks

- The full-suite runner's `ENAMETOOLONG` flakiness is a pre-existing environmental issue (Windows argv-length ceiling) that will keep affecting any worktree once the test-file count crosses ~32.7K chars of relative paths — worth a follow-up to batch `scripts/run-unit-tests.js`'s invocation, but out of this slice's scope.
- The `Q: <question>\nA: <answer>` framing is a client-side convention only; if `interviewTurn`'s prompt/parsing ever changes to rely on a different framing, this UI's reliability improvement would silently regress without a contract test pinning the framing string itself (none was added, per "no server changes" scope — flagging for awareness, not blocking).
