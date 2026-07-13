# Plan: email-agent slice — voice ingestion + push trigger

Spec: `docs/superpowers/specs/2026-07-12-email-agent-voice-push-design.md`.
Branch `feature/email-agent-voice-push` (worktree `.claude/worktrees/email-agent`, base `1f1932dcc`).
TDD per task (watch each test fail first), ONE commit per task, diff-only edits.
Never modify existing behavior — every wiring change is additive + soft-fail.

## Regression set (run before first commit to baseline, judge by delta — ~75-failure baseline expected)

- `node scripts/run-unit-tests.js` (full unit suite)
- Named watchpoints: `lib/integrations/composio/catalog.spec.ts`,
  listeners/dispatcher specs, deployments store specs, recordings compile-agent specs.

## Task 1 — Voice-profile ingestion module (Part A1)

**New:** `packages/crm/src/lib/agents/voice-profile/ingest-sent-mail.ts` + `ingest-sent-mail.spec.ts`

- `export type VoiceIngestDeps = { callTool(slug, args): Promise<unknown>; distill(emails: SentEmailSample[]): Promise<string>; writeNote(path, body, metadata): Promise<void>; log?(event, data): void }` — read `lib/agents/booking/composio-calendar-backend.ts` first and mirror its DI + fail-soft idiom exactly.
- `export async function ingestSentMailVoiceProfile(deps, {orgId}): Promise<{ok:true; notePath:string} | {ok:false; reason:string}>`
  - `callTool("GMAIL_FETCH_EMAILS", {query:"in:sent", max_results:50})`; tolerate the envelope shapes the read-back slice documented (data-wrapped, list under varying keys) — parse defensively, empty→`{ok:false, reason:"no_sent_mail"}`.
  - Map to `SentEmailSample = {subject, snippet}` — TRUNCATE bodies to ≤500 chars before they ever leave the function; assert in a test that the note body contains no sample longer than 2 sentences.
  - `distill()` prod impl = one LLM call via the same client seam other agent-side LLM calls use (find it: grep `anthropic` under `lib/agents` — reuse, don't rebuild); prompt: distill tone/openings/closings/sentence-length/dos-donts + 2–3 tiny fragments into ≤40-line markdown.
  - `writeNote` prod impl = brain store upsert (`lib/brain/store.ts`) at path `voice-profiles/email.md`, `metadata.type:"voice-profile"`, `metadata.source:"ingestion:sent-mail:2026-07-12"`.
  - Every failure path returns `{ok:false, reason}` — NEVER throws.
- Tests (offline, DI fakes): happy path writes note; no gmail binding → `no_gmail`; tool error → fail-soft; LLM error → fail-soft; body-truncation privacy assertion; idempotent re-run overwrites (writeNote called with same path).

**Commit:** `feat(voice): sent-mail voice-profile ingestion (Composio Gmail → Brain note)`

## Task 2 — Voice note consumption in email turns (Part A2)

**Edit:** the runtime seam where brain notes are loaded for a turn (`lib/agents/runtime.ts` — grep `brain` there; v1.26.1 loader) + `lib/agents/prompt.ts` if a distinct section is needed.

- For turns whose channel is email (inbound email channel turns AND event/schedule runs with `channel:"email"`), read the brain note at exact path `voice-profiles/email.md` (org-scoped, by-path read in `lib/brain/store.ts`). If present, add its body as a separate prompt section: `## Write in the operator's voice` + body. Absent → no-op, zero added latency beyond the single indexed read.
- Do NOT widen the generic brain-notes recall — this is one exact-path read.
- Tests: email turn with note present → section appears in composed prompt; absent → prompt unchanged; non-email channel → not loaded. Use existing prompt/runtime spec patterns (find the nearest existing spec for composeSystemPrompt inputs and extend it).

**Commit:** `feat(voice): email turns write in the operator's voice (brain voice-profile injection)`

## Task 3 — Ingestion trigger points (Part A3)

**Edit:** the deploy path for agent templates (find where a record-compiled template deploy completes — the same layer `deploy_agent`/deployments store uses) + the integrations actions file (`app/(dashboard)/integrations/actions.ts`).

- After a successful deploy of a template whose blueprint channel is email AND whose tools include a gmail toolkit binding: fire `ingestSentMailVoiceProfile` best-effort (Next `after()` if in a route/action context, else void-promise with `.catch(log)`). Deploy result must be unaffected by ingestion outcome — test this explicitly (ingestion throws → deploy still ok).
- `refreshVoiceProfileAction(orgId-scoped)` server action wired next to `enableComposioTriggerAction` — same auth pattern, returns the `{ok,reason}` verbatim.
- Tests: deploy fires ingestion for email+gmail template; NOT for sms template; ingestion failure never fails deploy.

**Commit:** `feat(voice): auto-ingest voice profile on email-agent deploy + manual refresh action`

## Task 4 — Composio event → deployments dispatcher (Part B1)

**New:** `packages/crm/src/lib/deployments/composio-event-dispatch.ts` + spec.

- `export async function dispatchComposioEventToDeployments(deps, {orgId, eventType, payload}): Promise<{attempted:number; started:string[]; skipped:string[]}>`
- Read `lib/deployments/store.ts:1235` (`runDueScheduledAgents`) FIRST and mirror its deployment-scan + `runEventAgent` invocation shape; filter `resolveAgentTrigger(...).kind === "event" && trigger.event === eventType`.
- Idempotency: extract gmail `messageId` from payload (defensive; missing → still run but log). Dedupe = skip if a run for (deploymentId, messageId) already recorded — reuse whatever fire-once discipline `runDueScheduledAgents`/`runEventAgent` already has; if none exists at this granularity, record last-N processed message ids on the deployment row's existing JSONB config (jsonb_set with bound text[] path per L-03/L-04 — NO new migration unless unavoidable; if a migration becomes necessary, STOP and flag it in the report instead of hand-adding one).
- org-scoped every query. Fail-soft per deployment (one bad deployment never blocks the rest).
- Tests: match fires runEventAgent (fake); kind/event mismatch skipped; redelivery with same messageId skipped; per-deployment error isolated.

**Commit:** `feat(triggers): composio events dispatch to record-compiled deployments (idempotent)`

## Task 5 — Wire the bridge (Part B1 wiring)

**Edit:** `packages/crm/src/lib/events/listeners.ts` composio `bus.onAny` handler.

- After the existing `dispatchEventToDeployedAgents` call (archetypes unchanged), add a try/catch'd call to `dispatchComposioEventToDeployments` with the same `{orgId, eventType: event.type, payload: data}`. Console.warn on failure, mirroring the surrounding idiom exactly.
- Tests: extend the existing listeners composio-bridge spec (find it; if none, add a minimal one with a fake bus) — both dispatchers called; deployment-dispatch throw doesn't break archetype dispatch.

**Commit:** `feat(triggers): bridge composio events to deployments in the event listeners`

## Task 6 — Poll→push upgrade at deploy (Part B2)

**New:** `packages/crm/src/lib/deployments/upgrade-inbox-trigger.ts` + spec; **edit:** the same deploy-completion path as Task 3.

- `maybeUpgradeInboxTriggerToPush(deps, {orgId, deploymentId}): Promise<{upgraded:boolean; reason?:string}>`
- Conditions (ALL must hold, checked cheaply first): deployment trigger is `kind:"schedule"` with `channel:"email"` AND cron is the inferred inbox-watch `0 * * * *` AND blueprint has a gmail binding AND `COMPOSIO_WEBHOOK_SECRET` set AND org has a Composio Gmail connection.
- Action: `createTrigger(orgId, "GMAIL_NEW_GMAIL_MESSAGE", {})` (client.ts:275 seam); on success persist the deployment trigger as `{kind:"event", event:"composio.gmail.new_message", channel:"email"}` + stamp `triggerUpgradedAt` in the deployment's existing JSONB (bound-path jsonb_set). Any failure → `{upgraded:false, reason}` and the schedule stays (the floor).
- Call it from the deploy path after Task 3's hook, same fire-and-forget posture BUT await it (it's fast) and include `upgraded` in the deploy log line.
- Tests: full-conditions → upgraded + trigger flipped; each missing condition → not upgraded + schedule intact; createTrigger failure → not upgraded; never throws.

**Commit:** `feat(triggers): poll→push upgrade for recorded inbox-watch agents at deploy`

## Task 7 — Close-out

- Full regression run, judge by delta vs baseline. `npx tsc --noEmit` in `packages/crm`
  (junction method: `New-Item -ItemType Junction` packages/crm/node_modules from the
  main checkout if missing — re-verify the junction exists, they vanish).
- `check:use-server` script + regression-grep per verify-build.
- Report: per-task commit shas + test delta + any flagged deviations. NO push, NO merge.

## Sizing guardrail (L-17)

A ≈ 450 LOC, B ≈ 600 LOC, total ≈ 1,050. Stop-and-reassess at ~1,300: if the
overrun is capability, accept + report; if it's horizontal infra (e.g. a new
dedupe table), STOP and flag instead of building it.
