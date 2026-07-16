# interview-one-question — build report

Branch `feat/interview-one-question`, worktree `.claude/worktrees/interview-ux`.
Spec: `docs/superpowers/specs/2026-07-16-interview-one-question-design.md`.

## Shas

- `31e622fac` — Task 1: `<QuestionCard>` (presentational) + `nextQuestionIndex`/`clampQuestionIndex` pure helpers, 12 new tests.
- `f538bca2a` — Tasks 1-2 wiring: `record-client.tsx` questionIndex state + `handleQuestionAnswer`/`handleQuestionSkip`; `recap-panel.tsx` swaps the old amber (`#EAB308`) "Open questions (N)" `<ul>` for `<QuestionCard>`; 5 new `<RecapPanel>` integration tests.
- `4abfb50fa` — Task 3 report (no code changes; vision gate passed round 1).
- `9d6318949` — Review fix: `fix(record): question card is a queue, not a pointer — server prunes drive advancement (review blocking fix) + a11y nits`. Killed `questionIndex`/`nextQuestionIndex`/`clampQuestionIndex` entirely; replaced with `skippedQuestions: Set<string>` + a pure `selectVisibleQuestion(questions, skipped)` queue selector (see below).
- **This commit** — Visibility fix: `fix(record): question card chips readable — explicit dashboard-dark palette, no unresolved tokens (visibility invariant test)`. Root-caused and fixed the live blank-cream-pill bug (see "Visibility fix" below).

## Deviations from the plan

- **State location:** the design left open whether `questionIndex` lives in `recorder-machine.ts` or as component state. It's `useState` in `record-client.tsx`, matching the existing `interviewInput`/`fallbackText` pattern — the reducer's `openQuestions` stays the sole source of truth for *what* the questions are; `questionIndex` is only ever a read position into it, never persisted/replayed.
- **Advance timing:** index advances *synchronously* right after dispatching `INTERVIEW_USER_SENT` (before `sendInterviewMessage`'s fetch resolves), not after the reply lands — chosen for responsiveness (no round-trip wait to move to the next question) and it composes cleanly with the existing `interviewPending` disable-guard (set synchronously inside `sendInterviewMessage` before its first `await`), so a second click can't race a second interview turn.
- **Testability extraction:** pulled `nextQuestionIndex`/`clampQuestionIndex` into `question-card.tsx` as pure exported functions (not spec'd explicitly) since `record-client.tsx`'s hooks aren't reachable via `renderToString` (no jsdom harness on this surface, confirmed via the existing `record-page-render.spec.ts` convention). This gave direct unit coverage of the index math instead of only indirect coverage through rendered markup.
- **No server changes:** confirmed `interview.ts`'s `Q: <question>\nA: <answer>` framing doesn't break `interview.spec.ts` — that suite DI's a fake `llm` and never asserts on message content; the framing only affects the multi-question decompose path (`DECOMPOSE_MIN_PAIRS = 2`), and a single Q/A pair always falls through to the unchanged direct-merge path.
- **Environment repair (not in plan scope but required to run tests at all):** `packages/crm/node_modules` and root `node_modules` junctions were missing from the worktree (`ERR_MODULE_NOT_FOUND: tsx`) — recreated via `mklink /J` from the parent repo, per the `worktree-typecheck-method` memory note.
- **Full-suite runner flakiness (environmental, not code):** `node scripts/run-unit-tests.js` intermittently fails with Windows `ENAMETOOLONG` — the 737-file argv is ~32.7K chars, right at the ~32.7K `CreateProcess` command-line ceiling. One full clean run succeeded early (baseline, below); three subsequent attempts after this branch's file additions failed at the OS level before any test executed. `scripts/run-unit-tests.js` isn't in this task's files-touched scope, so it wasn't patched — instead relied on targeted `node --import tsx --test <touched specs>` runs (which the VERIFY GATE asks for anyway) plus the one clean full-suite baseline to confirm no cross-cutting regression.
- **Vision gate render path:** the SKILL's `vision-shot.mjs` needs a *public* URL (microlink can't reach `localhost`), and the Chrome-MCP `computer` screenshot action timed out repeatedly against a local static server (the exact flakiness the skill's own notes call out — "Chrome-MCP screenshot path is unreliable here"). Publishing the fixture as an Artifact didn't work either (artifacts are private by default; microlink's headless fetch hit "Page not found"). Used the Playwright MCP (`browser_navigate` + `browser_take_screenshot`) against a local `npx serve` static server instead — same render→screenshot→independent-grade shape the skill prescribes, different (working) screenshot mechanism. No repo files were left behind: the fixture-render script, the temp `.claude/launch.json` attempt, the HTML fixture, and the screenshots all lived in the OS scratchpad/temp dirs or were deleted before finishing; `git status` is clean of anything but the two real commits.
- **Self-caught rendering artifact (CORRECTED — see "Visibility fix" below):** the first screenshot showed invisible Yes/No button text (cream-on-cream) — at the time this was attributed entirely to the fixture's hand-rolled CSS reset missing Preflight's button-background override, and the fixture's CSS (not the component) was fixed before grading. **That conclusion was wrong, or at least incomplete.** Max rendered the actual branch in a real browser afterward and saw the identical blank-cream-pill bug on the real page — it was never purely a harness artifact. See "Visibility fix" below for the corrected root cause and the real component fix.

## Review fix (blocking bug + a11y nits)

Post-review, a blocking state bug was found: the original `questionIndex` design advanced +1 synchronously on every answer/skip, which is wrong against `interviewTurn`'s actual contract (`interview.ts`). An **applied** turn returns `openQuestions` with the answered question **pruned** server-side — advancing +1 on top of that shorter list skips whatever took the pruned slot. On **applied:false** (the merge didn't land), `openQuestions` is **unchanged** — advancing +1 there silently drops an uncaptured question instead of leaving it visible for a retry.

Fix: killed the index entirely. `record-client.tsx` now tracks `skippedQuestions: Set<string>` (question text, never cleared automatically); `question-card.tsx` exports a pure `selectVisibleQuestion(questions, skipped)` selector — the visible question is always the first entry of the *current* `openQuestions` not in the skip set, and `position`/`total` are derived from that filtered list. `handleQuestionAnswer` no longer advances anything locally: it dispatches `INTERVIEW_USER_SENT` and sends the turn; on an applied reply, `state.openQuestions` refreshes with the answered question already gone, and the selector naturally reveals the next one. On `applied:false`, `openQuestions` is unchanged, so the same question stays visible — honest, since it wasn't captured. `handleQuestionSkip(question)` just adds the text to the skip set (now also guarded by `interviewPending`, matching the answer path, not just the UI's `disabled` attribute — nit 1). `QuestionCard`'s `onSkip` signature changed from `() => void` to `(question: string) => void` so it can report which question to skip without record-client duplicating the selector logic. No more `useEffect`/clamping — there's no index left to go stale.

A11y nits also landed: the free-text input carries `aria-label="Answer this question"` (nit 2), and the question text renders inside `aria-live="polite"` so a screen reader announces the change when the visible question swaps in place (nit 3).

Tests: deleted the `nextQuestionIndex`/`clampQuestionIndex` describe blocks; added `selectVisibleQuestion` coverage including the two loop tests the review flagged as missing — the **applied** path (`["Q1?","Q2?","Q3?"]` → refreshed `["Q2?","Q3?"]` reveals `Q2?`) and the **applied:false** path (`openQuestions` unchanged → `Q1?` stays visible, no advance) — plus the same two scenarios re-verified through `<RecapPanel>` integration tests (`skippedQuestions` prop, not `questionIndex`).

## Visibility fix (Yes/No chips render as blank cream pills — live browser bug)

**Root-cause investigation.** The coordinator's hypothesis was that `question-card.tsx` referenced a dashboard-scoped shadcn token (`--card`/`--foreground`/`--primary`) that doesn't exist in `/record`'s CSS scope (only `.lp-root[data-mode="record"]`'s `--lp-*` tokens do), so the chip label fell back to inheriting cream-on-cream. **That hypothesis does not hold** — verified, not assumed:
- Static check: `question-card.tsx` never referenced `--card`/`--foreground`/`--primary` at all. The Yes/No chips set `color: var(--lp-ink)` and no background, relying on Tailwind Preflight's `background-color: transparent` default for `<button>`.
- Live check: built a temporary diagnostic route (`src/app/(public)/visioncheckxyz/page.tsx`, deleted before finishing — not part of Files-touched, confirmed absent from `git status`) rendering `<RecapPanel>` inside the *real* `.lp-root[data-mode="record"]` + `globals.css`/`landing-theme.css` cascade via `next dev`, then read `getComputedStyle` on the real DOM via Playwright: `color: rgb(246, 242, 234)` (correctly resolved `--lp-ink`), `backgroundColor: rgba(0, 0, 0, 0)` (correctly transparent). The chip rendered correctly under Chromium — screenshotted, confirmed legible.

**Actual mechanism.** Tailwind v4's Preflight (`node_modules/tailwindcss/preflight.css`) pairs `background-color: transparent` with `appearance: button` (not `none`) on raw `<button>` elements. `background-color: transparent` held under Chromium/Playwright here, but pairing it with `appearance: button` (rather than `none`) is a known cross-browser inconsistency — some browser/OS theme combinations paint a native widget face underneath an author's transparent background when `appearance` isn't explicitly `none`. That's consistent with Max reproducing the bug live while the Chromium-based tooling here didn't. The `--lp-*` custom-property scope was never actually broken.

**Fix.** Restyled the whole card to hardcoded, literal hex values — never a bare `var(--lp-*)` reference — plus `appearance-none` on every button, closing the gap regardless of which exact browser/OS quirk was in play:
- Card surface: `#1A1713` (elevated vs. the page's `#14110D`), `1px solid rgba(246,242,234,0.08)` border.
- "QUESTION N OF M" label: `#A39B8D`, 11px, uppercase, tracking-wide (unchanged size/weight, now literal color).
- Question text: `#F6F2EA`, 15px, 600 weight, still `aria-live="polite"`.
- Yes/No chips: `background: #F6F2EA`, `color: #1F2B24` (forest ink on paper — landing-theme.css's own `--lp-cta-bg`/`--lp-cta-ink` pairing for record-mode, hardcoded here for defense in depth), 500 weight, squared corners (`rounded-none`), `hover:bg-[#E8E2D6]`, `appearance-none`, disabled 50% opacity (unchanged).
- Skip: `#A39B8D`, underlined, `appearance-none`.
- Input: unchanged pattern, now literal `#F6F2EA` text / `rgba(246,242,234,0.14)` border.
- Send: same explicit `#F6F2EA`/`#1F2B24` paper/ink pairing as the chips (was `var(--lp-accent)`/`var(--lp-on-accent)`), `hover:bg-[#E8E2D6]`, `appearance-none`.
- Font: `var(--font-hanken, ui-sans-serif), ui-sans-serif, system-ui, sans-serif` on the card wrapper (matches the dashboard sans; graceful fallback if the var is ever unset).

Re-verified live: same diagnostic route, `getComputedStyle` now reports `backgroundColor: rgb(246, 242, 234)`, `color: rgb(31, 43, 36)`, `appearance: none`, `borderRadius: 0px` on both chips — screenshotted, chips clearly legible.

**Invariant test (TDD — written first, watched fail).** New describe block in `question-card.spec.ts`: asserts the Yes/No chip markup contains BOTH `#F6F2EA` (background) AND `#1F2B24` (text) explicitly, the question text markup contains an explicit `#F6F2EA`, and disabled chips still carry both colors. All 5 tests failed against the pre-fix markup (`Yes chip is missing its explicit paper background (#F6F2EA)`, etc.) before the fix landed, then passed after.

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

Same sweep, post-visibility-fix (explicit dashboard-dark palette + invariant tests):
```
ℹ tests 119
ℹ suites 30
ℹ pass 119
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```
(net +5 tests: the new "visibility invariant" describe block in `question-card.spec.ts` — 5 tests, all watched fail against the pre-fix markup first, then pass post-fix.)

`npx tsc --noEmit` (packages/crm): exit 2, 1 error — identical to the pre-change baseline (`src/app/api/copilot/turn/route.ts(315,9)`, unrelated `persist` property, pre-existing) across all three checkpoints (post-review-fix, post-visibility-fix — both `diff`s against baseline are empty). Two intermediate hiccups, both self-fixed before the final check: 8 `Set<unknown>` inference errors from bare `new Set()` in tests (fixed with `new Set<string>()`), and one stale `.next/dev/types/validator.ts` reference to the deleted temporary diagnostic route (fixed by removing the `.next` build cache, which is gitignored — confirmed via `git status`).

`pnpm check:use-server`: `✓ All 'use server' files export only async functions / types.` (re-run post-visibility-fix, clean.)

Full-suite baseline (one clean run, before this branch's changes): 12022 pass / 135 fail — all DB-bound (Neon `ECONNREFUSED`/workflow-runtime tests), none in `recordings`/`record-ui`. Confirmed via `diff` against the post-change targeted-spec results that nothing in this branch's area regressed.

## Vision-grade verdict

**Round 1: PASS, no gaps.** Independent `vision-grader` agent (haiku, per the skill's pin) graded the fixture screenshot (`Question 1 of 6`, mixed-tier flowModel with 4 steps, 6 open questions) against the Task 3 rubric:
- (a) exactly one question card, not a wall — pass
- (b) legible hierarchy, muted label / prominent question text — pass
- (c) Yes/No chips + Skip + free-text input all visible and tappable-looking — pass
- (d) no amber on the question card itself; amber correctly still present on the "needs approval" summary/badge — pass
- (e) autonomy summary line + per-step tier badges intact — pass
- (f) no layout defects — pass

No second round needed for the Task 3 fixture render.

**Visibility-fix round: PASS, no gaps.** Independent `vision-grader` agent graded a *real-browser* screenshot (via the `next dev` diagnostic route + Playwright, not a static-HTML mockup) against the added rubric line "every label readable — no element whose text color matches its background":
- (a) Yes/No chips clearly legible — solid paper background, dark ink text — pass
- (b) Skip legible muted underline — pass
- (c) question label + text legible against the dark card — pass
- (d) input + Send legible — pass
- (e) scanned every other section (header, step badges, Branches, Ask Seldon, footer CTA) for the same text-matches-background failure mode — none found — pass
- (f) no layout defects — pass

No second round needed.

## Open risks

- The full-suite runner's `ENAMETOOLONG` flakiness is a pre-existing environmental issue (Windows argv-length ceiling) that will keep affecting any worktree once the test-file count crosses ~32.7K chars of relative paths — worth a follow-up to batch `scripts/run-unit-tests.js`'s invocation, but out of this slice's scope.
- The `Q: <question>\nA: <answer>` framing is a client-side convention only; if `interviewTurn`'s prompt/parsing ever changes to rely on a different framing, this UI's reliability improvement would silently regress without a contract test pinning the framing string itself (none was added, per "no server changes" scope — flagging for awareness, not blocking).
- The visibility fix hardcodes hex literals instead of `--lp-*` tokens, which means this one component will silently drift from `landing-theme.css` if the record-mode palette ever changes (e.g. a future rebrand). This is the explicit tradeoff the fix directive asked for ("never bare tokens, since /record lacks the dashboard CSS scope") — worth a follow-up note if `--lp-cta-bg`/`--lp-cta-ink`/`--lp-ink`/`--lp-muted` ever change, to check this file too.
- The exact cross-browser mechanism (Preflight's `appearance: button` vs `none`) was inferred from a known class of browser inconsistency and confirmed by elimination (the dashboard-token hypothesis definitively does not apply; Chromium renders the pre-fix markup correctly) rather than reproduced directly in the specific browser/OS Max used. The fix (explicit background + `appearance-none` on every button) closes the gap regardless of the exact browser, so this doesn't block the fix, but it's not a byte-for-byte repro.
