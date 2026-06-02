# Voice Phase 2 — Per-Workspace Voice Receptionist + `/automations` Editor

**Date:** 2026-06-01
**Status:** Design (approved — ready for implementation plan)
**Predecessors:** Voice Phase 0 (SIP transport), Voice Phase 1 (tools wired, first real phone booking), the workspace-timezone slot-label fix (`fix(booking): quote slot times in workspace timezone, not UTC`, commit `cda8699f`).

---

## Goal

A call to a workspace's phone number reaches **that workspace's** voice agent — its
soul/persona, its booking calendar, its FAQ — speaks the correct workspace-local time,
logs a full transcript into the same Conversations surface as the chatbot, and is
editable from `/automations`.

This replaces the Phase 1 hack where every call booked into a single env-var workspace
(`VOICE_PHASE1_TEST_ORG_SLUG`) with a static, business-agnostic persona and no transcript.

## Current state and the gap

Phase 1 (`packages/crm/src/lib/agents/voice/`):
- `route.ts` accepts the OpenAI SIP webhook, then in `after()` calls `resolvePhase1VoiceContext()`
  (reads ONE env slug) and `runVoiceCall()`.
- `openai-realtime.ts` runs the realtime control WS with a **static** `VOICE_SDR_INSTRUCTIONS`
  string, the 6 booking/escalation tools, and a hard-coded `alloy` voice.
- `voice-workspace.ts` resolves the single env-configured workspace.

Gaps this phase closes:
1. **Routing:** the call ignores which number was dialed — every caller lands in the env workspace.
2. **Persona:** the agent has no business identity and **no date/timezone anchor** ("tomorrow"
   doesn't resolve; times were quoted in UTC until the `cda8699f` slot-label fix).
3. **No record:** calls leave no transcript; the operator can't see what happened.
4. **No operator surface:** there's no way to view or edit the voice agent.

## Locked decisions

1. **Call routing — resolve by dialed number.** Read the dialed number from OpenAI's
   `realtime.call.incoming` `sip_headers`, resolve the workspace by its stored phone number
   (reuse the existing `resolveOrgByTwilioNumber` match logic), and fall back to the env slug if
   unresolved. **No per-workspace number-provisioning flow** in this phase (that is its own future
   phase). With one number today it maps to one workspace; the architecture is ready for more.
2. **`/automations` surface — full editor.** A "Voice Receptionist" card in `/automations`
   linking to a Configure page where the operator edits the greeting, picks the TTS voice, assigns
   the workspace voice number, sets business hours (linked to booking availability), edits the FAQ,
   toggles individual tools, flips Live/Pause, and reviews call transcripts.

---

## Architecture

### Reuse, don't invent

The codebase already anticipated this work:
- `agents` table documents `channel: 'voice'` and `status: 'draft'|'test'|'live'|'paused'`.
- The skill registry (`lib/agents/skills/registry.ts`) **already lists `voice-receptionist`** as a
  known archetype for `temporal-reasoning` (date + `{{timezone}}` anchor), `be-smart-by-default`,
  and `hard-rules`. Only a voice-tuned SDR playbook is missing.
- `agentConversations` + `agentTurns` already persist chatbot transcripts; voice reuses them.
- `resolveOrgByTwilioNumber` (in `api/webhooks/twilio/voice/route.ts`) already maps a dialed number
  → workspace via `integrations.twilio.fromNumber`. The existing Twilio voice webhook even names
  this exact work as its successor ("voice-agent flows land Q3+").

No new tables. One nullable blueprint field and one new skill file.

### 1. Data model — the voice agent is an `agents` row

A workspace's voice receptionist is a row in `agents` with `channel:'voice'`,
`archetype:'voice-receptionist'`. It is **get-or-created** per workspace (lazily — on first
Configure-page open and on first inbound call), never a separate manual "create agent" step.

`AgentBlueprint` (in `db/schema/agents.ts`) gains one optional field:
- `voice?: string` — the OpenAI TTS voice id (default `"alloy"`). Reuses the existing blueprint
  shape for `greeting`, `faq`, `pricingFacts`, `toneOverrides`, `capabilities`, `customSkillMd`.

Per-tool toggles reuse `blueprint.capabilities` (the existing tool-allowlist subset). Business
hours are **not duplicated** — they live in the booking template's availability (already
per-workspace); the editor links to the booking availability surface rather than copying it.

### 2. Routing — dialed number → workspace

- **Diagnostic-first (Phase-0 lesson).** Before trusting any field, the webhook logs the raw
  `data.sip_headers` array on the next real call (`voice_call_sip_headers`). We confirm exactly
  which header carries the dialed PSTN number (likely the `To` header or the request-URI user part;
  Twilio's Elastic SIP Trunk forwards the original dialed number). Only then is the extractor pinned.
- **Extractor** (pure, unit-tested): `extractDialedNumber(sipHeaders)` scans the header array for the
  dialed-number header (case-insensitive `To` / `Diversion` / request URI), parses the `sip:` / `tel:`
  user part, and normalizes to E.164. Returns `null` if absent.
- **Shared resolver.** Extract the existing `resolveOrgByTwilioNumber` match logic out of the Twilio
  voice route into a shared `lib` helper (`resolveWorkspaceByPhoneNumber`) so both the Twilio webhook
  and the voice path use one implementation. It matches the E.164 number against each workspace's
  stored Twilio number.
- **Fallback chain** (graceful — a call never drops): dialed-number match → `VOICE_PHASE1_TEST_ORG_SLUG`
  env (kept as a safety net during dogfooding) → tool-less greeting persona. Each outcome logs a
  distinct event (`voice_call_workspace_resolved_by_number` / `..._by_env_fallback` / `..._unresolved`).
- After resolution, **get-or-create** the workspace's `voice-receptionist` agent and build the
  `ToolExecuteContext` (orgId, orgSlug, agentId, conversationId, `testMode:false`).

### 3. Persona — per-workspace, temporally grounded

Replace the static `VOICE_SDR_INSTRUCTIONS` with instructions composed at call time from:
- The workspace **soul** (business name, services, tone, FAQ) — the same source the chatbot uses.
- The skill registry for `voice-receptionist`: `temporal-reasoning` (filled with `currentDate`,
  `currentTime`, `timezone` = the **workspace timezone** via `organizations.timezone`),
  `be-smart-by-default`, and a **new `voice-receptionist-sdr` skill** — a concise, TTS-tuned
  front-desk playbook (short sentences, read the slot `label` aloud, confirm before booking), scoped
  to `voice-receptionist` only (the chatbot's `website-chatbot-sdr` stays chatbot-scoped).
- `hard-rules` (platform-enforced, non-editable).

The composer is the existing skill-registry pipeline (`getSkillsForArchetype` + `renderSkill` + soul
facts); the voice path supplies the workspace-timezone render vars. This gives calls the same
temporal grounding the chatbot has — "tomorrow" / "this Friday" resolve to concrete dates, and times
are quoted in workspace-local time (reinforcing the `cda8699f` slot-label fix).

The TTS voice is set per agent from `blueprint.voice` via `session.update` (`audio.output.voice`) —
the mechanism Phase 1 already uses, now data-driven instead of a constant.

If the operator set `blueprint.customSkillMd`, it replaces the default composed playbook (same
override semantics as the chatbot).

### 4. Transcript persistence

Voice calls log into the existing `agentConversations` + `agentTurns` tables so they appear in
**Conversations** next to chat:
- **Call start:** insert an `agentConversations` row (`agentId` = voice agent, `orgId`,
  `status:'active'`, `channelMeta = { call_id, from_number, to_number }`).
- **During the call:** enable input-audio transcription in the `session.update` config
  (`input_audio_transcription`), then capture both sides from the realtime event stream — caller
  speech from `conversation.item.input_audio_transcription.completed`, agent speech from the
  assistant audio-transcript event — and write each as an `agentTurns` row (`role:'user'|'assistant'`,
  `content`, monotonically increasing `turnIndex`). Tool calls/results piggyback on the assistant
  turn's `toolCalls`/`toolResults` JSON. (The exact assistant-transcript event name is confirmed from
  the existing `voice_call_realtime_event` log during A1, alongside the `sip_headers` confirmation —
  same de-risk-first discipline.)
- **Call end:** mark the conversation `status:'completed'`, set `endedAt` + `turnCount`.
- All persistence is **best-effort and non-blocking** — a DB hiccup must never tear down a live call
  (wrap in try/catch, log `voice_call_transcript_persist_error`).

### 5. `/automations` Voice Receptionist editor

- **Card** in the `/automations` catalog: title "Voice Receptionist", a phone icon, status derived
  from the voice agent row (`live`/`paused`/not-configured) plus whether a number is assigned. Its
  `Configure` link points to a dedicated voice editor route (NOT the generic archetype-config route —
  the voice agent is an `agents` row, not a `settings.agentConfigs` automation).
- **Editor page** (`/automations/voice-receptionist`): server-loads (get-or-create) the voice agent,
  renders a client editor to set greeting, TTS voice (select), assigned voice number, FAQ (the voice
  agent's `blueprint.faq`, seeded from the same workspace soul-synthesized FAQ the chatbot uses —
  edits update this agent's blueprint; a future pass can unify both agents to one soul-level FAQ),
  tool toggles
  (`blueprint.capabilities`), a Live/Pause control (`agents.status`), a link to business-hours
  (booking availability), and a transcript list (recent `agentConversations` for this agent, each
  expandable to its `agentTurns`). Saving patches `agents.blueprint`/`status` and writes an
  `agentVersions` row (same audit/rollback pattern as `update_website_chatbot`).

---

## Decomposition — two independently-shippable stages

Each stage produces working, testable software on its own.

### Stage A — Backend (the substance)
Makes calls per-workspace, grounded, and recorded. Delivers value with zero new UI.
- A1. **Diagnostic:** log raw `sip_headers` on inbound calls; confirm the dialed-number field.
- A2. **Routing:** `extractDialedNumber` (pure) + shared `resolveWorkspaceByPhoneNumber` (refactored
  from the Twilio route) + fallback chain; get-or-create the voice agent.
- A3. **Persona:** `voice-receptionist-sdr` skill; compose per-workspace instructions from soul +
  registry with workspace-timezone temporal vars; per-agent TTS voice via `session.update`.
- A4. **Transcripts:** conversation + turn persistence over the call lifecycle (best-effort).

### Stage B — `/automations` editor
- B1. Voice Receptionist **card** in the catalog with agent-row-derived status.
- B2. **Editor page + server actions** (get-or-create, save blueprint/status, assign number,
  version row) and the **transcript viewer**.

Surface to the user between stages for a real-call smoke test of Stage A before building Stage B.

## Error handling / graceful degradation

- Unresolved workspace → env fallback → tool-less greeting. A call always connects.
- Transcript persistence failures are swallowed + logged; the call continues.
- Unknown/invalid timezone → the slot-label formatter already falls back to UTC (`cda8699f`).
- The validated Phase 0/1 transport (accept body shape, `ws` package, header set, accept↔WS
  adjacency) is **not touched** — only the persona/tools/persistence layered on top change.

## Testing strategy

- **Pure unit tests** (`node:test` + tsx, the repo convention): `extractDialedNumber` (To header,
  request-URI, tel:, missing, malformed → null); `resolveWorkspaceByPhoneNumber` (match, no-match,
  multiple workspaces) via injected lookups; the persona composer (voice archetype yields
  temporal-reasoning + voice-sdr, timezone interpolated, customSkillMd override); the
  `voice-receptionist-sdr` skill prose checks.
- **Transcript persistence:** DI over the DB writers (the repo's pattern in `voice-workspace.ts` /
  `realtime-tools.spec.ts`) — assert conversation-created + turn-rows for a scripted event stream.
- **Manual integration:** real phone call on the Vercel preview — confirm correct workspace, business
  identity, workspace-local times, and a transcript in Conversations. **Surfaced to the operator;
  not run autonomously.**

## Out of scope (YAGNI)

- Per-workspace number **provisioning/purchase** + SIP-trunk assignment + telephony billing.
- Outbound Speed-to-Lead calling (Phase 3).
- Multi-number-per-workspace, IVR menus, voicemail, call recording audio storage.
- Voice evals / validator gating (the chatbot's eval infra can extend later).

## Open risks

- **`sip_headers` field name** for the dialed number is confirmed empirically in A1 before the
  extractor is finalized; until then the env fallback keeps dogfooding alive. This is the one
  unknown and it is explicitly de-risked first.
