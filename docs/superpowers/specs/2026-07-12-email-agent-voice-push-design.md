# Email-agent slice: sent-mail voice ingestion + push trigger for recorded inbox agents

**Date:** 2026-07-12 · **Branch:** `feature/email-agent-voice-push` · **Status:** spec

## Why (one paragraph)

Serif, Fyxer, and Deck are each one frozen configuration of the SF agent model
(Trigger × Skill × Channel) sold at ~$30/seat: watch an inbox → triage → draft
in the owner's voice → act on a graduated trust ladder. On current `origin/main`
a /record'ed inbox routine ALREADY compiles to an hourly-poll inbox-watch agent
with Gmail triage tools and supervised runs (the trust ladder). Two gaps keep it
from being a head-on Fyxer/Serif answer: **(A)** nothing learns the operator's
writing voice from their sent mail, and **(B)** `composio.gmail.new_message`
push events only reach archetype agents — never record-compiled template
deployments, which are stuck on the hourly poll.

## Grounded state of main (verified 2026-07-12, commit `1f1932dcc`)

Every claim below was read directly from `origin/main` (L-16):

- **/record infers inbox-watch:** `inferTriggerFromModel` in
  `packages/crm/src/lib/recordings/compile-agent.ts:243` — email app +
  watch-semantics → `{kind:"schedule", cron:"0 * * * *", channel:"email"}`.
- **Gmail triage tools are default-bound:** `catalog.ts` defaults include
  `GMAIL_FETCH_EMAILS`, `GMAIL_CREATE_EMAIL_DRAFT`, `GMAIL_ADD_LABEL_TO_EMAIL`,
  `GMAIL_MODIFY_THREAD_LABELS`, `GMAIL_LIST_LABELS`, `GMAIL_CREATE_LABEL`
  (widened for recorded inbox-triage agents, commit `26f730266`).
- **Scheduled deployments run with real tools:**
  `packages/crm/src/lib/deployments/store.ts:1235` (`runDueScheduledAgents`
  scans deployments whose `blueprint.trigger.kind === "schedule"` and fires
  `runEventAgent`); supervised-run kickoff framing in
  `packages/crm/src/lib/agents/lifecycle/supervised-run.ts`.
- **Composio push bridge exists but is archetype-only:** webhook
  `app/api/webhooks/composio/route.ts` (HMAC verify) → `emitSeldonEvent`
  → `bus.onAny` composio bridge in `lib/events/listeners.ts` →
  `dispatchEventToDeployedAgents` (`lib/agents/dispatcher.ts:79`) which
  iterates `listArchetypes()` × `settings.agentConfigs` ONLY. Record-compiled
  agents live in `agent_templates`/deployments — a different population.
- **Trigger registration exists:** `createTrigger(orgId, slug, config)` in
  `lib/integrations/composio/client.ts:275`, surfaced as
  `enableComposioTriggerAction` (dashboard `integrations/actions.ts:172`).
  `GMAIL_NEW_GMAIL_MESSAGE` is the pinned `primaryTrigger` (`catalog.ts:43`).
- **Brain seam is ready:** `brain_notes` table (`db/schema/brain-notes.ts`),
  upsert/read in `lib/brain/store.ts`, and `composeSystemPrompt` already
  splices `brainNotes[]` (`lib/agents/prompt.ts:420`).
- **No voice learning exists anywhere** (grep: zero hits on style/voice-profile
  ingestion).

## Part A — Sent-mail voice ingestion (the "drafts in YOUR voice" mechanic)

### A1. Ingestion module — `packages/crm/src/lib/agents/voice-profile/ingest-sent-mail.ts`

`ingestSentMailVoiceProfile(deps, {orgId})` → `{ok:true, notePath} | {ok:false, reason}`.

1. Fetch up to 50 sent emails via the org's Composio Gmail binding:
   `GMAIL_FETCH_EMAILS` with `query: "in:sent"` (Outlook variant deferred —
   follow-up, not this slice). The tool caller is an injected dep
   (`callTool(slug, args)`) mirroring `composio-calendar-backend.ts` so unit
   tests run offline.
2. Distill ONE LLM call → a compact markdown style profile: tone, typical
   opening/closing, sentence length, formatting habits, dos/don'ts, 2–3 short
   (≤2-sentence) example fragments. **Never store full email bodies** —
   profile only (privacy posture; bodies stay in Gmail).
3. Upsert Brain note at `voice-profiles/email.md`
   (`metadata.type: "voice-profile"`, `metadata.source:
   "ingestion:sent-mail:<ISO date>"`). Re-runs overwrite (refresh semantics).
4. Fail-soft everywhere: no Gmail connected → `{ok:false, reason:"no_gmail"}`;
   fetch/LLM error → `{ok:false, reason}` + `logEvent`. Never throws
   (Optimistic Path rule: reject missing input explicitly).

### A2. Consumption — voice note into email-turn prompts

Where brain notes are already loaded for a turn (runtime v1.26.1 seam,
`lib/agents/runtime.ts`), additionally load `voice-profiles/email.md` by exact
path for **email-channel turns and email-channel event/schedule runs**, and
splice it as its own prompt section headed "Write in the operator's voice"
(distinct from the generic learned-patterns section so the model treats it as
a style directive, not a fact). No-op when the note doesn't exist.

### A3. Ingestion trigger points

- **Deploy-time (primary):** after a record-compiled template with an email
  channel + a gmail toolkit binding deploys, fire ingestion best-effort
  (`after()`/fire-and-forget — deploy must never block or fail on it).
- **Manual refresh:** one server action `refreshVoiceProfileAction` wired into
  the existing integrations dashboard actions file (no new UI surface this
  slice — the action is the seam; UI chip is a follow-up).

## Part B — Push trigger for recorded inbox agents

### B1. Deployment dispatch on composio events — extend the existing bridge

New `dispatchComposioEventToDeployments({orgId, eventType, payload})` in the
deployments layer, called from the SAME `bus.onAny` composio bridge in
`listeners.ts` right after `dispatchEventToDeployedAgents` (archetypes keep
working unchanged). It scans deployments the same way `runDueScheduledAgents`
does, filtering `blueprint.trigger.kind === "event" && trigger.event ===
eventType`, and fires each via `runEventAgent` (which already carries
throttle/guardrail/verify/memory gates). Idempotency: pass the Gmail
`messageId` from the payload as the event identity so a webhook redelivery
can't double-run (mirror the schedule dispatcher's fire-once discipline).

### B2. Poll→push upgrade at deploy time (fail-soft, never a regression)

When a record-compiled agent whose trigger is the inferred inbox-watch hourly
schedule deploys AND the org has a Gmail Composio connection AND
`COMPOSIO_WEBHOOK_SECRET` is configured: attempt `createTrigger` for
`GMAIL_NEW_GMAIL_MESSAGE`; on success flip the deployment's trigger to
`{kind:"event", event:"composio.gmail.new_message", channel:"email"}`.
On ANY failure keep the hourly poll (the recording's inferred trigger is the
floor, never removed). The flip is recorded on the deployment (audit trail).
`trigger.event` already accepts arbitrary strings in `parseTrigger`
(`agent-trigger.ts:158-168`) — no union change needed.

### Explicitly out of scope (this slice)

- Outlook variants of A1/B2 (Gmail first; Outlook = follow-up).
- New UI surfaces (voice-profile chip, trigger-status badge).
- Autonomous graduated **sending** — recorded agents draft/label; sending
  autonomy stays behind the lifecycle ladder work already merged.
- KNOWN_EVENTS builder-picker entry for gmail (cosmetic; follow-up).
- The Deck-style CC-address flow (Resend Inbound MX is an ops flip, no code).

## Risks / invariants

- **Org-scoping (security invariant #1):** every new query filters by orgId;
  the webhook→deployment path derives orgId from `data._composio.orgId`
  exactly as the archetype bridge does.
- **No new cron, no new webhook, no migration expected.** If an audit-trail
  column proves necessary for B2, it's additive + hand-numbered per house rule.
- **Shared-path blast radius:** `listeners.ts` composio handler and the deploy
  path get additive, soft-fail calls only — a throwing voice-ingestion or
  trigger-registration must never break deploy or event dispatch.
- **L-17 sizing:** A ≈ 200 prod + 250 tests; B ≈ 250 prod + 350 tests
  (dispatcher-with-idempotency band). Total ≈ 1,050 LOC — single branch,
  commit-per-task.

## Verification

- Unit: DI'd offline tests per module (ingestion happy/no-gmail/LLM-fail;
  dispatch match/no-match/idempotent-redelivery; upgrade success/fail-soft).
- Gate: `/verify-build` via verify-runner (maker ≠ checker) + opus review
  (shared event path + deploy path ⇒ hot-path review tier).
- Live smoke (post-merge, Max): record → claim → deploy with Gmail connected →
  send self a test email → observe draft appear + voice note exists.
