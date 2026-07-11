# Agent Lifecycle Slice — Learn → Verify → Connect → Run → Sell

**Date:** 2026-07-11 · **Branch:** `feature/record-to-agent` · **Flag:** `SF_AGENT_LIFECYCLE` (strict `"1"`, same pattern as `lib/recordings/policy.ts`)

## 0. What this is

The record→agent loop is live: record → interview → compile → draft `agent_templates` row. This slice turns the agent template page into the **agent's home** — a five-stage lifecycle ladder per the Claude Design handoff (`docs/design/record-to-agent-handoff/`, commit `c27ef8307`) — and closes the pipeline gaps found in live testing. Design decisions were settled 2026-07-10 (memory: record-to-agent handoff brief); this spec grounds them in verified seams.

**Non-goals (explicitly out):** /record page redesign (stays dark, untouched), intent-aware onboarding redirect, extension capture, recordings blob TTL cron, true holdout evals, landing hero wiring, a separate Agent Home route (the ladder lives at `/studio/agents/[id]`).

## 1. Verified seams (recon 2026-07-11, all paths under `packages/crm/src`)

| Seam | Location | Verified fact |
|---|---|---|
| Agent page | `app/(dashboard)/studio/agents/[id]/page.tsx` | Server component; sticky header w/ `DeployToClientsButton` + `DeployButton`; provenance panel; sections 01–04 in `AgentTemplateEditor`; 05 Try it (`run-evals.tsx`); 06 Publish (`list-on-marketplace.tsx`). No "For myself" deploy exists. No Agent Home route exists. |
| Interview merge | `lib/recordings/interview.ts` `interviewTurn()` | ONE LLM call over the whole FlowModel per operator message; inline retry; fail-soft `{ok:true, applied:false}` + honest reply. `openQuestions` lives on the FlowModel + `recordingSessions.openQuestions`. |
| Trigger inference | `lib/recordings/compile-agent.ts:205` | First-match: email-app → `{kind:"inbound", channel:"email"}` **before** schedule keywords → inbox-watch recordings compile to an inbound-email trigger they can't self-serve (no email surface wired). |
| Evals | `lib/agents/evals/run-agent-evals.ts`, `eval-runs-store.ts`, `lib/agent-templates/eval-actions.ts:89` | `runAgentEvalsAction(templateId)` returns `{passed,total,passRate}`; `EvalRun` rows persisted (`getLatestEvalRun`, subjectKind template/agent). Scenarios derived deterministically from recordings (`deriveEvalScenarios`, `recordingSessions.derivedScenarios`). |
| Composio | `lib/integrations/composio/client.ts` | `composioForOrg`, `listConnections`, `mapToolkitConnections`, `createConnectLink`, `disconnect`, `createTrigger` all exist. Catalog: 8 curated managed-auth toolkits. Runtime binding: `connector.ts` `resolveComposioBinding` executes via SDK per call. |
| Agent runtime | `lib/agents/runtime.ts` `executeTurn()` | Dispatch loop over tool_use blocks; per-turn `toolCalls`/`toolResults` persisted as jsonb on `agentTurns` (schema `db/schema/agents.ts:339`). No operator-facing "run once now" path exists. |
| Schedule rail | `lib/agents/validator.ts:121` (`ScheduleTriggerSchema`), `lib/agents/triggers/schedule-agents.ts` (`runDueScheduledAgents`, `SCHEDULE_FIRED_EVENT="schedule.fired"`), `app/api/cron/schedule-agents/route.ts` (15-min Vercel cron) | Deployments with `trigger.kind==="schedule"` fire via `runEventAgent` with a synthetic event; `lastFiredAt` idempotency. **No new trigger rail needed.** |
| Marketplace publish | `lib/marketplace/seller-actions.ts:265` `publishOrUpdateAgentListingAction` | Already reads `getLatestEvalRun` (:199, trust-stats copy-through). **No gate exists today** — the lifecycle gate inserts here. |
| Design handoff | `docs/design/record-to-agent-handoff/` | `_ds/` tokens are SINGLE-MODE light (cool slate, `--accent` violet + theme scopes, Geist/Geist Mono, 8pt spacing, motion tokens). "Agent Home.dc.html" is a light page (warm paper `#F6F2EA`, teal accent) with the lifecycle ladder (Learned/Verified/Connected/On/Sell), Q&A record, eval area, connect surface, monospace run log. `Record.dc.html` is dark. Files are ~400–650KB — treat as visual reference, never import wholesale. |

## 2. The five stages (what ships)

### Stage rail + tokens (UI shell)

- `/studio/agents/[id]` renders the lifecycle ladder when `SF_AGENT_LIFECYCLE==="1"`; the current page is the untouched fallback (flag off = zero diff).
- Ladder = 5 numbered stages with completion state: **01 Learned · 02 Verified · 03 Connected · 04 Run · 05 Sell**. Stage completion is DERIVED, never stored redundantly: Learned = template exists (always ✓; rich content only with `recordingProvenance`); Verified = latest EvalRun for the template passes the gate; Connected = every required toolkit has an ACTIVE connection (vacuously ✓ when none required); Run = a completed supervised run exists; Sell = at least one deployment or listing.
- **Token-swap layer:** one small CSS file (`agent-lifecycle.css` scoped under a `.sf-lifecycle` root class) defining the semantic token subset the ladder consumes (`--lc-surface`, `--lc-card`, `--lc-ink`, `--lc-muted`, `--lc-line`, `--lc-accent`, radius/motion). Two mode scopes: `.sf-lifecycle` (light-first — values aligned to existing dashboard chrome, NOT the handoff's warm beige verbatim) and `.sf-lifecycle-dark` (reserved for /record adoption later; defined now so the swap layer exists, consumed nowhere else this slice). Adopt the handoff's STRUCTURE and component patterns; adopt token NAMES/scales from `_ds`; bind VALUES to SF's palette. Never link the .dc.html or `_ds` files into the app bundle.
- L-18 guard: all ladder client components live in client files; no server module imports them transitively except the page composing islands.

### 01 Learned — Q&A record + continue-the-interview

- Provenance panel grows into the Learned stage: goal, step breakdown w/ coverage badges (existing data), **Q&A record** — answered pairs rendered as question → answer, open questions rendered as BULLETS (not prose), and a "keep teaching" input.
- **Continue-the-interview editing:** authed server action `continueInterviewAction(templateId, message)` → loads the linked recording session (via `recordingProvenance.sessionId` — implementer verifies the field name at build), runs `interviewTurn`, persists model + openQuestions to the session, **then recompiles the template in place** (existing deterministic compile: skill-md + trigger + capabilities regenerated, identity preserved). Never-lies: the reply may claim an update ONLY when both the merge applied AND the recompile wrote. `applied:false` keeps the honest "couldn't apply that" shape.
- **Q&A persistence:** answered pairs `{question, answer, answeredAt}` appended to the recording session (additive jsonb column `answered_questions`, migration hand-numbered next in journal). The interview route (pre-claim, /record) also appends when a merge applies, so the record survives claim.

### Interview-merge decomposition fix (pipeline, no UI)

- In `interviewTurn`: when the operator message plausibly answers >1 open question, add a DECOMPOSE step (one LLM call → `[{question, answer}]` pairs, Zod-gated) then apply the existing single-merge machinery per pair sequentially (each pair gets the retry). Decompose failure or single-question messages → today's direct path unchanged. Direct multi-answer merges keep fail-soft `applied:false`. Partial application is honest: reply names which questions were applied.

### 02 Verified — evals with explain copy

- `RunEvalsCard` moves into the ladder with explain copy: the recordings ARE the test — each recording became a scenario; Seldon replays them against the agent before it goes live. Show derived scenarios (from `recordingSessions.derivedScenarios`) as a list with mustDo/mustNot counts, latest pass rate + per-scenario badges (existing action, restyled).
- Pass gate definition (single source of truth, exported const): latest EvalRun with `passRate >= 80` and `scenarioCount >= 1`. Used by the ladder AND the marketplace gate.

### 03 Connected — generated from the flow

- Required toolkits derived from the template's Composio bindings (compile-agent already binds green steps). Per-toolkit row: name, why ("step 3 sends the reply from Gmail" — from the binding's source step), status via `listConnections` + `mapToolkitConnections`, and a Connect button → `createConnectLink(orgId, toolkit)` redirect (return lands back on the agent page; status re-read server-side). No Composio key configured → single card linking to `/integrations` (existing key flow), no dead buttons.

### 04 Run — supervised single run w/ live action log (the centerpiece)

- "Run it once — watch every action" button. Server: `startSupervisedRunAction(templateId)` creates a `supervised_runs` row (`id, orgId, templateId, status: running|succeeded|failed, actionLog: jsonb[], startedAt, finishedAt, summary`), then fires the agent ONCE through the existing runtime with REAL tools bound (reuse the template-execution path the eval runner and deploy-test already use; for schedule-trigger templates the input is the synthetic `schedule.fired`-shaped event — same shape `runDueScheduledAgents` sends, NO new rail).
- **Live log:** `executeTurn` (or the template-execution wrapper) gains an optional injected `onToolEvent(event)` callback (DI, unit-testable, default no-op) invoked per tool call start/result inside the existing dispatch loop; the supervised run's callback appends `{at, tool, args-summary, status: running|ok|error, resultSummary}` to `supervised_runs.actionLog`. UI polls a thin authed GET (`/api/.../supervised-runs/[runId]`) every ~1.5s and renders the monospace log per the handoff (ok/running/error glyphs). Args/results are SUMMARIZED (tool name + short human line), never raw payloads — no secrets in the log.
- Completion: verdict + summary; row is the durable "supervised run passed" record (`status==="succeeded"`). Failure is honest: the failing action stays visible.
- Optimistic-path guard: a run that writes no actions still terminates (timeout → `failed` with reason); the button disables while a run is `running` (one at a time per template).

### 05 Sell — deploy reordered, marketplace gated

- Deploy options in ORDER: **For myself → Marketplace → To a client.**
- **For myself (new):** one-click self-deploy into the operator's own workspace — reuse the existing deployment-creation rail the client-deploy stepper calls, target = own org, surface from the template trigger (schedule triggers just start firing via the existing 15-min cron; NO new infrastructure). Success state links the deployment and states the trigger in plain words ("checks your inbox every hour").
- **Marketplace:** `ListOnMarketplace` moves here, gated in UI (checklist: evals passing ✓/✗ · supervised run completed ✓/✗) AND server-side in `publishOrUpdateAgentListingAction` (insert after trust-stats read: fail `{ok:false, error:"lifecycle_gate", missing:[...]}` unless eval pass gate + a succeeded supervised run exist). Server gate applies only when `SF_AGENT_LIFECYCLE==="1"` (dark ship = zero behavior change).
- **To a client:** existing `DeployButton` stepper + `DeployToClientsButton`, unchanged, third position.

### Trigger inference refinement (pipeline)

- `inferTriggerFromModel`: insert an **inbox-watch** check BEFORE the email-inbound check: corpus has an email app (gmail/outlook/email) AND watch-semantics (watch|check|monitor|incoming|new email|every |each morning|daily|inbox) → `{kind:"schedule", cron:"0 * * * *", channel:"email"}` (hourly default; operator edits in section 01 of the editor). Pure string heuristic, table-driven, unit-tested against the live Gmail-forwarding recording's corpus shape. Existing branches otherwise unchanged.

## 3. Data changes (additive only)

1. `supervised_runs` table (new) — columns above, org-scoped, indexed `(org_id, template_id, started_at desc)`. Org-scope every query (security invariant).
2. `recording_sessions.answered_questions` jsonb (new, nullable).
Both in ONE hand-numbered migration (next free number — verify journal at build); journal-clean.

## 4. Risks / named-failure-mode guards

- **Optimistic Path:** supervised run success = observable end state (run row `succeeded` + actions logged), never "the code ran". Continue-interview claims an update only after recompile writes.
- **Runaway Refactor:** current page is the fallback; ladder is new composition beside it. `executeTurn` change is ONE optional DI callback, default no-op.
- **Security:** supervised-run GET is org-scoped; action log summarized (no raw tool payloads); connect links minted server-side; marketplace gate enforced server-side, not just UI.
- **L-18:** poller/log/ladder = client islands; token CSS is plain CSS (no runtime import chain).
- **L-31:** any new route files export handlers only; guards in lib.

## 5. Estimate (L-17 calibrated)

UI composition on mature patterns (~0.94x): ladder shell + stages ≈ 900–1,200 LOC. State-machine-ish (poller/run log, ~1.2–1.7x): ≈ 300–450. Pipeline (decompose + trigger + recompile action, cross-ref-ish tests): ≈ 500–700. Supervised-run backend + migration + gate: ≈ 500–700. **Total ≈ 2,300–3,100 LOC incl. tests.** Stop-and-reassess at ~3,600.

## 6. Follow-ups explicitly deferred

/record token-swap adoption of `.sf-lifecycle-dark` · intent-aware onboarding (record-intent → Agent Home) · marketplace listing surfacing the supervised-run badge · approval-gated (pause-for-human) supervised runs · Composio `createTrigger`-based real-time Gmail push (cron polling is v1 by design).
