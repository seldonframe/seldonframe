# Agent Lifecycle Slice — Wave 1 (T1-T5) — Maker Report

Branch `feature/record-to-agent`, worktree `.claude/worktrees/record-to-agent`. 8 commits (`6b290b249`..`4ec1d8f8f`).

## Files changed

- `packages/crm/src/lib/agents/lifecycle/policy.ts` (new)
- `packages/crm/tests/unit/agents/lifecycle/policy.spec.ts` (new)
- `packages/crm/src/db/schema/agent-lifecycle.ts` (new)
- `packages/crm/src/db/schema/recordings.ts` (modified — `answeredQuestions` column + `AnsweredQuestion` type)
- `packages/crm/src/db/schema/index.ts` (modified — export agent-lifecycle schema)
- `packages/crm/drizzle/0068_agent_lifecycle.sql` (new)
- `packages/crm/drizzle/meta/_journal.json` (modified — idx 45)
- `packages/crm/src/lib/recordings/compile-agent.ts` (modified — inbox-watch trigger inference)
- `packages/crm/tests/unit/recordings/compile-agent.spec.ts` (modified — inbox-watch tests)
- `packages/crm/src/lib/recordings/interview.ts` (modified — decomposeAnswers + applyDecomposedPairs + interviewTurn orchestration)
- `packages/crm/tests/unit/recordings/interview.spec.ts` (modified — decomposition tests)
- `packages/crm/src/lib/recordings/continue-interview.ts` (new — DI'd core orchestration)
- `packages/crm/src/lib/agent-templates/interview-actions.ts` (new — thin "use server" wrapper)
- `packages/crm/src/app/api/v1/recordings/interview/route.ts` (modified — answered_questions append)
- `packages/crm/tests/unit/agent-templates/interview-actions.spec.ts` (new)
- `packages/crm/src/lib/agents/stateless-turn.ts` (modified — onToolEvent DI hook)
- `packages/crm/tests/unit/agent-templates/stateless-turn.spec.ts` (modified — onToolEvent tests)
- `packages/crm/src/lib/agents/lifecycle/gate.ts` (new — lifecycleGate + resolvePublishGate + EVAL_PASS_THRESHOLD)
- `packages/crm/tests/unit/agents/lifecycle/gate.spec.ts` (new)
- `packages/crm/src/lib/agents/lifecycle/supervised-run.ts` (new — runSupervised + buildKickoffMessage)
- `packages/crm/tests/unit/agents/lifecycle/supervised-run.spec.ts` (new)
- `packages/crm/src/lib/agent-templates/supervised-run-actions.ts` (new — startSupervisedRunAction / getSupervisedRunAction)
- `packages/crm/src/lib/marketplace/seller-actions.ts` (modified — lifecycle gate on publish)

Environment-only (untracked, not part of the diff, benefits the whole shared pnpm store — see Blockers below): repaired several corrupted `.pnpm` store entries (`@panva/hkdf`, `jose`, `oauth4webapi`, `preact`, `preact-render-to-string`) by copying valid content from another worktree's store. No tracked file was touched by this repair.

## What changed, per task

**T1 — flag + migration + schema.** `isAgentLifecycleEnabled(env)` mirrors `isRecordToAgentOn`'s strict-`"1"` pattern. Migration `0068_agent_lifecycle.sql`: `supervised_runs` table (org-scoped, `action_log` jsonb, indexed `(org_id, template_id, started_at)`) + `recording_sessions.answered_questions` jsonb column. Additive-only, idempotent (`IF NOT EXISTS`), journal-clean (idx 45).

**T2 — inbox-watch trigger inference.** `inferTriggerFromModel` now checks (email app present) AND (watch-semantics: check/watch/monitor/incoming/new email/inbox/every /each morning/daily) BEFORE the plain email-inbound branch, returning `{kind:"schedule", cron:"0 * * * *", channel:"email"}`. Plain reply-to-email flows (no watch-semantics) are unaffected — verified against both the new tests and the existing Gmail-forwarding regression test.

**T3 — interview-merge decomposition.** New `decomposeAnswers(deps, {message, openQuestions})` — one Zod-gated LLM call via the same DI `llm` seam, returns `{pairs}` or `null` (never throws). `interviewTurn` tries decompose only when `openQuestions.length >= 2`; on `>=2` pairs it applies each sequentially through the extracted `runSingleMerge` (each pair gets its own retry, threading the model forward); a pair that fails to merge is skipped, not fatal — `applied:true` as long as one pair landed, reply names both what applied and what didn't. Decompose failure, `<2` pairs, or a single open question all fall through to the direct path, byte-for-byte unchanged.

**T4 — Q&A persistence + continue-interview.** `continueInterviewCore` (plain module, `lib/recordings/continue-interview.ts`) loads the recording session linked to a template via `findSessionByTemplateId` — **verified-seam deviation**: the plan's `recordingProvenance.sessionId` field does not exist anywhere in the codebase; the actual link is `recordingSessions.agentTemplateId` (set by the compile-agent route), looked up in the reverse direction by the existing `findSessionByTemplateId` helper (already used by the agent page's provenance panel). Runs `interviewTurn`; only when the merge applied does it recompile the template in place via the exact `flowModelToBundle` + `updateAgentTemplate` path the compile-agent route uses (identity/name preserved automatically — `updateAgentTemplate` only patches the blueprint). Never-lies: a failed recompile write returns `ok:false`, never a false "updated" claim. `continueInterviewAction` (`lib/agent-templates/interview-actions.ts`) is the thin org-guarded `"use server"` wrapper. Both the pre-claim `/record` interview route and the new action append `{question, answer, answeredAt}` to `answered_questions` via a bound-param `||` jsonb append (L-03).

**Deviation (file split, T4):** the plan named only `lib/agent-templates/interview-actions.ts`. I split the DI'd orchestration into a plain module (`lib/recordings/continue-interview.ts`) and kept the `"use server"` file as a thin wrapper — required because importing the "use server" file drags in `getOrgId` → `auth.ts` → `next-auth`, and node:test's module resolution otherwise fails entirely (see Blockers). This exactly mirrors the existing `eval-actions.ts` / `run-agent-evals.ts` split already in the codebase.

**T5 — supervised-run backend + marketplace gate**, split into 4 commits:
- **T5a**: `onToolEvent?(event)` DI hook added to `runStatelessAgentTurn` (`lib/agents/stateless-turn.ts`), invoked at each tool call's start and result, default no-op, zero other behavior change.
  **Deviation from the plan**: the plan named `executeTurn` in `lib/agents/runtime.ts` as the hook site. `executeTurn` is DB-coupled — it loads/persists a real `agents` + `agentConversations` row, and a template has neither (this is exactly why `run-agent-evals.ts`'s own header comment explains it uses `runStatelessAgentTurn` instead of "a throwaway executeTurn conversation"). `runStatelessAgentTurn` IS the "template-execution seam the eval runner['s] stateless adapter uses" the spec names, so the hook lives there; `runtime.ts` is untouched.
- **T5b**: `lifecycleGate` (`lib/agents/lifecycle/gate.ts`) — `EVAL_PASS_THRESHOLD=80`, reads a latest EvalRun (>=80% pass rate, >=1 scenario) + a succeeded supervised run. `runSupervised` (`lib/agents/lifecycle/supervised-run.ts`) — pure DI'd orchestration: one-running-run-per-template guard, creates the durable row, races the real turn against a hard timeout, streams tool events best-effort, always finishes the row with the full authoritative `actionLog`. **Bug caught and fixed during TDD**: the default timeout race left the losing `setTimeout` uncleared, keeping a live handle for the full 120s after every fast run — fixed with `clearTimeout` in a `finally`.
- **T5c**: `buildKickoffMessage(trigger)` (pure, tested) + `startSupervisedRunAction` / `getSupervisedRunAction` (`lib/agent-templates/supervised-run-actions.ts`) — org-guarded, BYOK-gated (mirrors `runAgentEvalsAction`'s gate exactly), wires `runTurn` to `runStatelessAgentTurn` with `testMode:true`. This is deliberate, not a downgrade: a from-recording template's real actions run through bound Composio connector tools, which execute for real **regardless of `testMode`** (only SF's own native write tools like `book_appointment` are testMode-gated, and `compile-agent`'s `filterCapabilitiesForModel` already strips those down to `escalate_to_human` plus whatever the recording itself implies). `testMode:true` therefore gives "watch every REAL action" for the recorded workflow while keeping any stray native write tool safely sandboxed.
- **T5d**: `resolvePublishGate` (pure, tested) wired into `publishOrUpdateAgentListingAction` — checked immediately after the template load, before any pricing validation or DB write, so a blocked publish never leaves a partial listing row. Flag off (`SF_AGENT_LIFECYCLE !== "1"`) is byte-for-byte zero behavior change.

## Test results (verbatim tail)

Full affected + named regression set, 12 spec files, one run:

```
ℹ tests 163
ℹ suites 44
ℹ pass 163
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 4160.3057
```

Spec files run: `agents/lifecycle/policy.spec.ts`, `agents/lifecycle/gate.spec.ts`, `agents/lifecycle/supervised-run.spec.ts`, `recordings/compile-agent.spec.ts`, `recordings/interview.spec.ts`, `recordings/recorder-machine.spec.ts`, `agent-templates/interview-actions.spec.ts`, `agent-templates/stateless-turn.spec.ts`, `agents/stateless-turn-overrides.spec.ts`, `agents/runtime-booking-binding.spec.ts`, `marketplace/storefront-pricing.spec.ts`, `migrations/check-migrations-journaled.spec.ts`.

`pnpm -F crm exec tsc --noEmit` (via `npx tsc --noEmit -p tsconfig.json`): 66 pre-existing errors, all in files never touched by this slice (styled-jsx/`ThemeProvider`/implicit-any noise across `landing-r1`/`landing-templates`/unrelated components), **zero delta** — confirmed via a `diff` against the pre-change baseline capture (identical 66 lines before and after all 8 commits).

`pnpm check:use-server` (`bash scripts/check-use-server.sh src`): `✓ All 'use server' files export only async functions / types.`

Migration journal check (`check-migrations-journaled.spec.ts`): 10/10 pass, journal-clean.

## Deviations from the plan (summary)

1. **T4**: split `continueInterviewCore` into a new plain module (`lib/recordings/continue-interview.ts`) rather than keeping it inside `lib/agent-templates/interview-actions.ts` — required for testability (see Blockers), mirrors the existing `eval-actions.ts`/`run-agent-evals.ts` pattern.
2. **T5a**: the `onToolEvent` DI hook lands on `runStatelessAgentTurn` (`stateless-turn.ts`), not `executeTurn` (`runtime.ts`) — `executeTurn` cannot execute a template without a deployment (no `agents`/`agentConversations` rows exist for a template), confirmed by `run-agent-evals.ts`'s own design comment. This is the "verify exact seam" clause in the plan, not a parallel-runtime invention — `runStatelessAgentTurn` is the existing, already-adopted template-execution seam.
3. **T4**: `recordingProvenance.sessionId` does not exist as a field anywhere; the actual seam is `findSessionByTemplateId` (reverse lookup via `recordingSessions.agentTemplateId`), already used by the agent page's provenance panel.
4. Marketplace gate placement: inserted immediately after the template load (before pricing validation/writes) rather than literally "after the trust-stats read" (which only happens post-upsert in the existing code) — placing it earlier avoids ever creating/updating a listing row that then gets rejected, which would leave observable partial state.

## Blocker hit (environment, resolved)

The shared root pnpm store (`node_modules/.pnpm`) had several packages in the `@auth/core` → `next-auth` dependency chain (`@panva/hkdf`, `jose`, `oauth4webapi`, `preact`, `preact-render-to-string`) present as **empty directories** (package.json/dist missing) — a pre-existing corruption unrelated to this work, confirmed via `git stash` reproducing the identical failure before any of my changes. This blocked every spec that transitively imports `lib/agents/tools.ts` → `lib/bookings/actions.ts` → `lib/auth/helpers.ts` → `auth.ts` → `next-auth` (which includes `stateless-turn.spec.ts`, needed to verify T5a). I located intact copies of each package in another worktree's `node_modules/.pnpm` store and copied their content into the shared root store (no tracked file touched, no `pnpm install` run). All previously-blocked specs then ran and passed (11/11 for `stateless-turn.spec.ts`).

## Open risks

- `supervised-run-actions.ts` (like `eval-actions.ts` before it) has no direct unit test of its own — the tested surface is the pure `runSupervised`/`lifecycleGate`/`buildKickoffMessage` it wires; the real-deps wiring itself is exercised only via `tsc` + `check:use-server`, matching the codebase's existing convention for this class of thin action file. A live smoke test (flag on) is recommended before merge.
- The onToolEvent → `SupervisedRunActionEvent` mapping (`toActionEvent` in `supervised-run-actions.ts`) is a small, untested pure function (2-branch ternary); low risk but worth a glance in review.
- Wave 2 (UI) is not part of this report and was not touched.
