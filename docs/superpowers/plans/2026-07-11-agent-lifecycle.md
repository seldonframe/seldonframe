# Plan — Agent Lifecycle Slice (Learn→Verify→Connect→Run→Sell)

Spec: `docs/superpowers/specs/2026-07-11-agent-lifecycle-design.md`. Branch `feature/record-to-agent`, worktree `.claude/worktrees/record-to-agent`. Flag `SF_AGENT_LIFECYCLE` strict-"1". All paths under `packages/crm/src` unless noted. TDD per task (watch the test fail first), commit per task, diff-only edits. Unit tests run offline via DI — no DB, no network.

## Wave 1 — pipeline + backend (no UI)

### T1 — flag + migration + schema
- `lib/agents/lifecycle/policy.ts` (new): `isAgentLifecycleEnabled(env)` — copy the strict-"1" pattern from `lib/recordings/policy.ts`. Spec test.
- Migration (next free hand-number; check `db/migrations/` journal): `supervised_runs` table — `id uuid pk, org_id (fk orgs, not null), template_id (not null), status text ('running'|'succeeded'|'failed'), action_log jsonb default '[]', summary text, started_at, finished_at`; index `(org_id, template_id, started_at desc)`. Plus `recording_sessions.answered_questions` jsonb nullable. Journal-clean (house rule: hand-numbered, additive only).
- Drizzle schema: `db/schema/agents.ts` (or sibling) `supervisedRuns` + type `SupervisedRunActionEvent = {at: string, tool: string, line: string, status: "running"|"ok"|"error"}`; `recordingSessions` gains `answeredQuestions`.

### T2 — inferTriggerFromModel: inbox-watch → schedule
- `lib/recordings/compile-agent.ts`: before the email-inbound branch, inbox-watch check — email app present AND any of `watch|check|monitor|incoming|new email|inbox|every |each morning|daily` → `{kind:"schedule", cron:"0 * * * *", channel:"email"}`. Table-driven keyword lists as consts.
- Tests in the existing compile-agent spec: gmail-forwarding-style corpus ("check my inbox … forward …") → schedule; plain "reply to emails" support flow → still inbound email; existing branches regression-covered.

### T3 — interview decomposition (per-question deltas)
- `lib/recordings/interview.ts`: new exported `decomposeAnswers(deps, {message, openQuestions})` → `{pairs: [{question, answer}]} | null` (one LLM call via the same DI llm seam as `interviewTurn`, Zod-gated, null on any failure). In `interviewTurn`: if `openQuestions.length >= 2` → try decompose; on ≥2 pairs apply the existing single-merge (with its retry) per pair sequentially, threading the model; reply names which questions were applied; any pair-merge failure → that pair skipped, honest partial reply. Decompose null or <2 pairs → existing direct path UNCHANGED. Fail-soft `applied:false` shape preserved.
- Tests (DI fake llm): multi-answer → 2 sequential merges, both applied; pair 2 merge fails → pair 1 applied + honest reply; decompose fails → direct path; single open question → no decompose call.

### T4 — Q&A record persistence + continue-interview action
- Where a merge applies (interview route handler AND the new action), append `{question, answer, answeredAt}` pairs (from decompose pairs, or `{question: null, answer: message}` for direct merges) to `recording_sessions.answered_questions` via jsonb append (L-03: `jsonb_set`/`||` with bound params, no read-modify-write clobber of siblings — column is dedicated so straight `||` array append is fine).
- `lib/agent-templates/interview-actions.ts` (new): `continueInterviewAction(templateId, message)` — org-guard (copy an existing template action's guard, e.g. eval-actions), resolve `recordingProvenance.sessionId` (verify exact field name in compile-agent's provenance write; adapt), load session model, `interviewTurn`, persist model+openQuestions+answeredQuestions, then RECOMPILE the template in place reusing the exact compile path the compile-agent route uses (skill-md + trigger + capabilities regenerated; identity/name preserved). Returns `{reply, applied, openQuestions}`. Reply claims an update ONLY when merge applied AND recompile persisted (never-lies).
- Tests: applied+recompiled happy path (fake deps, assert template write called with regenerated skillMd); `applied:false` → no recompile, no answered append; template without provenance → `{ok:false}` clean error.

### T5 — supervised run backend + marketplace gate
- `lib/agents/runtime.ts`: `executeTurn` deps gain optional `onToolEvent?(e: {tool, phase: "start"|"result", ok?, line})` — invoked in the existing tool_use dispatch loop at call-start and result. Default no-op. NO other behavior change.
- `lib/agents/lifecycle/supervised-run.ts` (new): `runSupervised(deps, {orgId, templateId})` — pure orchestration w/ DI: create run row (`running`) → resolve template + real tool bindings (reuse the template-execution seam the eval runner's stateless adapter uses, but with REAL resolved tools — find via `eval-actions.ts` deps builder) → input = synthetic `schedule.fired`-shaped event text for schedule triggers, else a neutral kickoff turn → per tool event append summarized entry to `action_log` (updates via deps) →终 status `succeeded`/`failed` + summary; hard timeout (deps-injected clock/timeout, default 120s) → `failed` honestly. One `running` run per template enforced at start.
- `lib/agents/lifecycle/gate.ts` (new): `EVAL_PASS_THRESHOLD = 80`; `lifecycleGate(deps, {orgId, templateId})` → `{evalPass: boolean, supervisedRun: boolean, missing: string[]}` reading `getLatestEvalRun` + latest succeeded supervised run.
- Server surface: `lib/agent-templates/supervised-run-actions.ts` — `startSupervisedRunAction(templateId)` (org-guard, fires runSupervised without awaiting completion if the platform allows, else awaits — keep it simple: await, action log still streams via row updates) + `getSupervisedRunAction(runId)` org-scoped poll read. If a route file is needed instead, handlers-only (L-31).
- `lib/marketplace/seller-actions.ts` `publishOrUpdateAgentListingAction`: after trust-stats read, when `isAgentLifecycleEnabled(process.env)` AND subject is a template → `lifecycleGate`; on missing → `{ok:false, error:"lifecycle_gate", missing}`. Flag off → zero change.
- Tests: runSupervised happy path (events appended in order, succeeded); tool error → failed + error entry visible; timeout → failed; second concurrent start rejected; gate matrix (eval only / run only / both / neither); publish action blocked+allowed by flag × gate.

## Wave 2 — UI (after Wave 1 merges to the branch)

### T6 — token layer + ladder shell
- `app/(dashboard)/studio/agents/[id]/lifecycle/agent-lifecycle.css` (new): `.sf-lifecycle` (light values bound to existing dashboard palette) + `.sf-lifecycle-dark` (defined, unconsumed) semantic tokens `--lc-*` per spec; radius/motion from the `_ds` scale. Plain CSS import.
- `lifecycle/ladder.tsx` (client): 5-stage rail w/ derived completion (props from server page); handoff structure (numbered stages, checkmarks) restyled to SF chrome.
- `page.tsx`: when flag on → compose ladder layout (server derives stage completion: template, `lifecycleGate` pieces, connections via `listConnections`+`mapToolkitConnections`, deployments/listing existence); flag off → EXISTING page untouched (early return, current JSX intact).
- Test: stage-derivation pure fn unit-tested (all completion combinations); render smoke.

### T7 — Learned stage
- `lifecycle/learned-stage.tsx`: provenance summary + step/coverage rows (existing provenance data), Q&A record (answeredQuestions pairs: question → answer), open questions as BULLETS, "keep teaching" input → `continueInterviewAction`, optimistic pending turn + honest `applied:false` rendering. Non-recording templates: compact "built from your description" card, no interview UI.

### T8 — Verified stage
- `lifecycle/verified-stage.tsx`: wrap/restyle `RunEvalsCard` machinery (reuse `runAgentEvalsAction` + result rendering; move, don't fork) + derived-scenarios list (mustDo/mustNot counts) + explain copy per spec ("your recordings are the test…"). Pass state from `EVAL_PASS_THRESHOLD`.

### T9 — Connected stage
- `lifecycle/connected-stage.tsx` (+ server data in page): required toolkits from template Composio bindings w/ source-step "why" line; status rows; Connect button → server action minting `createConnectLink` + redirect; no-key state → link card to `/integrations`. Vacuous state (no toolkits) → single-line "nothing to connect" ✓.

### T10 — Run stage (centerpiece)
- `lifecycle/run-stage.tsx`: "Run it once — watch every action" → `startSupervisedRunAction`; poll `getSupervisedRunAction` ~1.5s while `running`; monospace action log per handoff (running/ok/error glyphs), final verdict + summary; last run's log shown on revisit; button disabled while running. Reducer extracted pure (L-17: reducer-extracted state machine) — `runStageReducer` unit-tested for the poll/append/terminal transitions.

### T11 — Sell stage + deploy reorder
- `lifecycle/sell-stage.tsx`: order **For myself → Marketplace → To a client**. For-myself card → `deployToSelfAction` (new thin action in `lib/agent-templates/`): reuse the deployment-creation rail the client-deploy stepper calls with target = own org + template trigger; success links deployment + plain-words trigger sentence. Marketplace card embeds `ListOnMarketplace` behind the gate checklist (evals ✓/✗ · supervised run ✓/✗ from `lifecycleGate`). To-a-client card links existing stepper + deploy-to-clients. Sticky-header deploy buttons unchanged when flag off; when on, header keeps a single primary that scrolls to Sell.
- Tests: deployToSelfAction org/target assertions (agency-side-write vs client-side-read class — 3 catches last branch; assert org ids explicitly); gate checklist rendering states.

## Verification
- Per task: spec files colocated, `pnpm -F crm test <specs>` (judge by stash-delta baseline per worktree method), watch fail-first.
- Wave gates: `/verify-build` via verify-runner (worktree junction method; re-verify junction exists). Vision gate: vision-verify on the flag-ON agent page (ladder, run log) — grader = haiku (pinned).
- Regression set named for implementers: compile-agent specs, interview specs, seller-actions specs, runtime specs, recorder-machine spec.
- L-18: no server module imports client islands; token CSS plain import. L-31: routes export handlers only. Migrations: journal count +1, additive.
- Live smoke (post-deploy, flag off): agent page unchanged; flag on (env): ladder renders, supervised run streams, publish gate blocks.

## Stop-and-reassess
At ~3,600 LOC total (spec estimate 2,300–3,100). If T5's runtime seam turns out not to support template-execution-with-real-tools without a deployment, STOP and surface — do not invent a parallel runtime.
