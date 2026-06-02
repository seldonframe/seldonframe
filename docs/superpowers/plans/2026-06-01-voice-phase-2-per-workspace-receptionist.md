# Voice Phase 2 — Per-Workspace Receptionist + Agent Brain Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A call to a workspace's number reaches that workspace's voice agent (its soul, calendar, FAQ, workspace-local time), logs a transcript into Conversations, feeds + reads the shared brain so all agents improve over time, and is editable from `/automations`.

**Architecture:** The voice agent is an `agents` row (`channel:'voice'`, `archetype:'voice-receptionist'`), get-or-created per workspace. The inbound webhook resolves the workspace from the dialed number (`sip_headers`) and composes a per-workspace persona from the soul + skill registry (already wired for `voice-receptionist`) with a workspace-timezone temporal anchor. Transcripts persist to `agentConversations`/`agentTurns`. A shared brain helper reads `brain_notes` into the prompt and emits `brain_outcomes` on a booking win; the existing dream-cycle + promotion crons compile + promote — reused, not rebuilt.

**Tech Stack:** Next.js 16 App Router, Vercel Fluid Compute (`after()`), OpenAI Realtime SIP (`gpt-realtime-2`) over the `ws` package, Drizzle + Neon Postgres, `node:test` + tsx for unit tests.

**Source spec:** `docs/superpowers/specs/2026-06-01-voice-phase-2-per-workspace-receptionist-design.md` (commit `6f91be58`).

**Working dir:** the `proposal-builder` worktree (where all voice work + the deploy preview live). Test: `pnpm test:unit` from repo root. Typecheck: `pnpm typecheck` from repo root.

**Pre-existing failing tests** (unrelated — ignore): workflow-event-log/category-server-actions, block-codegen-staleness, SLICE 9 archetype-isolation, theme integration.

---

## Execution note (de-risk-first)

**Stage A is specified in full executable detail below.** Stages B and C are specified at task granularity (files, responsibilities, signatures, test intent). Per the spec's de-risk-first design, **expand B and C to full step detail after the Stage A real-call smoke test** confirms two empirical unknowns the diagnostic surfaces:
1. the exact `sip_headers` field carrying the dialed number, and
2. the exact assistant audio-transcript event name.

Both are logged by existing diagnostics in Stage A; locking them before writing B/C code avoids re-work. This is intentional, not a placeholder.

---

## File Structure

**Stage A — new files**
- `packages/crm/src/lib/agents/voice/sip-headers.ts` — pure `extractDialedNumber(sipHeaders)`.
- `packages/crm/src/lib/agents/voice/resolve-workspace-by-number.ts` — shared number→org resolver (refactored out of the Twilio voice route).
- `packages/crm/src/lib/agents/voice/voice-agent.ts` — `getOrCreateVoiceAgent(orgId)` (mirrors `lib/agents/store.ts` insert).
- `packages/crm/src/lib/agents/voice/persona.ts` — `composeVoicePersona({ soul, blueprint, timezone, now })` (soul + registry skills + temporal vars).
- `packages/crm/src/lib/agents/skills/voice-receptionist/sdr.ts` — voice-tuned SDR skill.
- `packages/crm/src/lib/agents/voice/transcript.ts` — `startVoiceConversation` / `appendVoiceTurn` / `endVoiceConversation` (best-effort).
- Tests: `packages/crm/tests/unit/agents/voice/sip-headers.spec.ts`, `resolve-workspace-by-number.spec.ts`, `voice-persona.spec.ts`, `voice-receptionist-sdr.spec.ts`, `voice-transcript.spec.ts`.

**Stage A — modified files**
- `packages/crm/src/db/schema/agents.ts` — add `voice?: string` to `AgentBlueprint`.
- `packages/crm/src/app/api/webhooks/twilio/voice/route.ts` — import the shared resolver (delete the local copy).
- `packages/crm/src/lib/agents/voice/voice-workspace.ts` — `resolveVoiceContextByNumber` (primary) wrapping the env fallback.
- `packages/crm/src/app/api/v1/voice/openai/webhook/route.ts` — log `sip_headers`; resolve by number; pass persona + voice to `runVoiceCall`.
- `packages/crm/src/lib/agents/voice/openai-realtime.ts` — accept `audioVoice` param; enable `input_audio_transcription`; thread transcript callbacks.
- `packages/crm/src/lib/agents/skills/registry.ts` — register `voice-receptionist-sdr` (scoped to `voice-receptionist`).

**Stage B — new/modified (outline; expand post-smoke-test)**
- `packages/crm/src/lib/agents/brain-context.ts` — `loadAgentBrainContext` + `recordAgentBrainOutcome`.
- Tests: `packages/crm/tests/unit/agents/brain-context.spec.ts`.
- Wire into `voice/openai-realtime.ts` (read + write on booking) and the chatbot turn path.

**Stage C — new/modified (outline; expand post-smoke-test)**
- `packages/crm/src/app/(dashboard)/automations/voice-receptionist/page.tsx` + editor client + server actions.
- `packages/crm/src/app/(dashboard)/automations/page.tsx` — add the Voice Receptionist card.

---

## STAGE A — Per-workspace voice backend

### Task A0: Add `voice` to AgentBlueprint

**Files:**
- Modify: `packages/crm/src/db/schema/agents.ts` (the `AgentBlueprint` type, ~lines 25–68)

- [ ] **Step 1: Add the field.** In `AgentBlueprint`, add:

```typescript
  /** OpenAI Realtime TTS voice id for voice-channel agents (e.g. "alloy",
   *  "echo"). Ignored by non-voice archetypes. Defaults to "alloy" at use. */
  voice?: string;
```

- [ ] **Step 2: Typecheck.** Run: `pnpm typecheck` — Expected: PASS (additive optional field; no consumer breaks).
- [ ] **Step 3: Commit.** `git add packages/crm/src/db/schema/agents.ts && git commit -m "feat(voice): add voice TTS field to AgentBlueprint"`

---

### Task A1: Diagnostic — log raw `sip_headers`

**Why:** Confirm which header carries the dialed PSTN number before pinning the extractor (Phase-0 discipline). Ships first; read the field name off a real call.

**Files:**
- Modify: `packages/crm/src/app/api/v1/voice/openai/webhook/route.ts` (the `RealtimeIncomingEvent` type + the `realtime.call.incoming` branch)

- [ ] **Step 1: Widen the event type** to surface sip headers:

```typescript
type RealtimeIncomingEvent = {
  type?: string;
  data?: {
    call_id?: string;
    sip_headers?: Array<{ name?: string; value?: string }>;
  };
};
```

- [ ] **Step 2: Log them** right after `callId` is validated (before `after()`):

```typescript
  // PHASE 2 A1 diagnostic — surface the SIP headers so we can confirm which
  // one carries the dialed (To) number before wiring number→workspace routing.
  // Cheap, time-boxed: remove or downgrade once the field is confirmed.
  logEvent("voice_call_sip_headers", {
    call_id: callId,
    sip_headers: (event.data?.sip_headers ?? []).map((h) => ({
      name: h.name ?? null,
      // Values can contain a full SIP URI; truncate defensively.
      value: typeof h.value === "string" ? h.value.slice(0, 200) : null,
    })),
  });
```

- [ ] **Step 3: Typecheck.** Run: `pnpm typecheck` — Expected: PASS.
- [ ] **Step 4: Commit.** `git commit -m "diag(voice): log realtime.call.incoming sip_headers to find the dialed number"`
- [ ] **Step 5: SURFACE TO OPERATOR.** This task's verification is a real call — ask the operator to call the number once, then read `voice_call_sip_headers` from the Vercel log to record the dialed-number header name. Feed that into A2's extractor. **Do not guess.**

---

### Task A2a: `extractDialedNumber` (pure, TDD)

**Files:**
- Create: `packages/crm/src/lib/agents/voice/sip-headers.ts`
- Test: `packages/crm/tests/unit/agents/voice/sip-headers.spec.ts`

- [ ] **Step 1: Write the failing test.**

```typescript
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { extractDialedNumber } from "../../../../src/lib/agents/voice/sip-headers";

describe("extractDialedNumber", () => {
  test("pulls the E.164 number from a To: SIP URI", () => {
    const headers = [
      { name: "From", value: "<sip:+15125550111@twilio>" },
      { name: "To", value: "<sip:+18335551234@sip.api.openai.com>" },
    ];
    assert.equal(extractDialedNumber(headers), "+18335551234");
  });
  test("handles a tel: URI", () => {
    assert.equal(extractDialedNumber([{ name: "To", value: "tel:+18335551234" }]), "+18335551234");
  });
  test("is case-insensitive on the header name", () => {
    assert.equal(extractDialedNumber([{ name: "to", value: "<sip:+18335551234@x>" }]), "+18335551234");
  });
  test("returns null when no dialed-number header is present", () => {
    assert.equal(extractDialedNumber([{ name: "From", value: "<sip:+1512@x>" }]), null);
  });
  test("returns null for empty/garbage", () => {
    assert.equal(extractDialedNumber([]), null);
    assert.equal(extractDialedNumber([{ name: "To", value: "garbage" }]), null);
  });
});
```

- [ ] **Step 2: Run → FAIL.** `cd packages/crm && node --import tsx --test tests/unit/agents/voice/sip-headers.spec.ts` — Expected: FAIL (module/function missing).

- [ ] **Step 3: Implement.** (Candidate header names ordered by the A1 finding; default set covers `To` / request-URI / `Diversion`.)

```typescript
// Extract the dialed (called) PSTN number from OpenAI realtime.call.incoming
// sip_headers. Pure. Returns E.164 (e.g. "+18335551234") or null.
//
// The dialed number is the user part of the SIP/tel URI in the header that
// names the called party. Twilio's Elastic SIP Trunk forwards it as the To
// header (confirmed in A1). We also accept the request-URI / Diversion as
// fallbacks so a header-name change upstream degrades to env fallback, not a crash.
const DIALED_HEADER_NAMES = ["to", "diversion", "request-uri", "x-original-to"];

export function extractDialedNumber(
  sipHeaders: ReadonlyArray<{ name?: string; value?: string }> | undefined | null,
): string | null {
  if (!sipHeaders) return null;
  for (const wanted of DIALED_HEADER_NAMES) {
    const header = sipHeaders.find((h) => (h.name ?? "").trim().toLowerCase() === wanted);
    const num = header ? parseUserPart(header.value) : null;
    if (num) return num;
  }
  return null;
}

// Pull a "+<digits>" out of a sip:/tel: URI or raw value. Returns E.164 or null.
function parseUserPart(value: string | undefined): string | null {
  if (!value) return null;
  // sip:+1833...@host  | tel:+1833...  | <sip:+1833...@host>
  const match = value.match(/[+]?\d[\d\-\s().]{6,}/);
  if (!match) return null;
  const digits = match[0].replace(/[^\d+]/g, "");
  const e164 = digits.startsWith("+") ? digits : `+${digits}`;
  // E.164 sanity: + and 8–15 digits.
  return /^\+\d{8,15}$/.test(e164) ? e164 : null;
}
```

- [ ] **Step 4: Run → PASS.** Same command. Expected: PASS (all cases).
- [ ] **Step 5: Commit.** `git commit -m "feat(voice): extractDialedNumber from realtime sip_headers (pure)"`

---

### Task A2b: Shared `resolveWorkspaceByPhoneNumber` (refactor + TDD)

**Files:**
- Create: `packages/crm/src/lib/agents/voice/resolve-workspace-by-number.ts`
- Modify: `packages/crm/src/app/api/webhooks/twilio/voice/route.ts` (lines ~78–96: delete the local `resolveOrgByTwilioNumber`, import the shared one)
- Test: `packages/crm/tests/unit/agents/voice/resolve-workspace-by-number.spec.ts`

- [ ] **Step 1: Write the failing test** (DI over the org rows, the repo convention):

```typescript
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { matchWorkspaceByPhoneNumber } from "../../../../src/lib/agents/voice/resolve-workspace-by-number";

const rows = [
  { id: "org-a", integrations: { twilio: { fromNumber: "+18335551234" } } },
  { id: "org-b", integrations: { twilio: { fromNumber: "(512) 555-0111" } } },
  { id: "org-c", integrations: {} },
];

describe("matchWorkspaceByPhoneNumber", () => {
  test("matches on normalized E.164", () => {
    assert.equal(matchWorkspaceByPhoneNumber("+18335551234", rows), "org-a");
  });
  test("normalizes the stored number before comparing", () => {
    assert.equal(matchWorkspaceByPhoneNumber("+15125550111", rows), "org-b");
  });
  test("returns null when nothing matches", () => {
    assert.equal(matchWorkspaceByPhoneNumber("+19998887777", rows), null);
  });
});
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** the pure matcher + a DB-backed wrapper. Move the body of the Twilio route's `resolveOrgByTwilioNumber` here; export both `matchWorkspaceByPhoneNumber(e164, rows)` (pure, tested) and `resolveWorkspaceByPhoneNumber(e164)` (selects org rows then calls the matcher). Reuse `toE164` from `@/lib/sms/providers`.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Refactor the Twilio route** to `import { resolveWorkspaceByPhoneNumber }` and delete its local copy. Run: `pnpm typecheck` — Expected: PASS.
- [ ] **Step 6: Commit.** `git commit -m "refactor(voice): shared resolveWorkspaceByPhoneNumber (reused by twilio + voice)"`

---

### Task A3: `getOrCreateVoiceAgent` (TDD)

**Files:**
- Create: `packages/crm/src/lib/agents/voice/voice-agent.ts`
- Test: `packages/crm/tests/unit/agents/voice/voice-agent.spec.ts`
- Reference: `packages/crm/src/lib/agents/store.ts:161` (the existing `agents` insert pattern)

- [ ] **Step 1: Write the failing test** with injected `findExisting`/`insert` deps: returns the existing voice agent if present (no insert); otherwise inserts one with `channel:'voice'`, `archetype:'voice-receptionist'`, `status:'draft'`, default blueprint `{ voice: "alloy" }`, slug `voice-receptionist`.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** `getOrCreateVoiceAgent({ orgId, deps? })` returning `{ id, blueprint, status }`. Default deps select `agents` where `orgId` + `archetype='voice-receptionist'` (limit 1); insert mirrors `store.ts:161`.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit.** `git commit -m "feat(voice): getOrCreateVoiceAgent per workspace"`

---

### Task A4: `voice-receptionist-sdr` skill + registry (TDD)

**Files:**
- Create: `packages/crm/src/lib/agents/skills/voice-receptionist/sdr.ts`
- Modify: `packages/crm/src/lib/agents/skills/registry.ts` (add a registry entry scoped to `voice-receptionist`)
- Test: `packages/crm/tests/unit/agents/voice/voice-receptionist-sdr.spec.ts`

- [ ] **Step 1: Write the failing test** — `getSkillsForArchetype("voice-receptionist")` includes id `voice-receptionist-sdr`; the chatbot's `website-chatbot-sdr` is NOT in the voice set; the skill prose contains the load-bearing rules (reads the slot `label` aloud, confirms before booking, short sentences).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** the skill (a concise, TTS-tuned distillation of the chatbot SDR: emergency triage → identify → qualify → capture → book/escalate, but short spoken sentences, "read the slot's label aloud", "confirm the label before booking"). Register it in `REGISTRY` scoped `["voice-receptionist"]`, ordered after `be-smart-by-default`, before `hard-rules`.
- [ ] **Step 4: Run → PASS** (this spec + the existing `registry` tests).
- [ ] **Step 5: Commit.** `git commit -m "feat(voice): voice-receptionist-sdr skill + registry entry"`

---

### Task A5: `composeVoicePersona` (TDD)

**Files:**
- Create: `packages/crm/src/lib/agents/voice/persona.ts`
- Test: `packages/crm/tests/unit/agents/voice/voice-persona.spec.ts`
- Reference: `lib/agents/skills/registry.ts` (`getSkillsForArchetype` + `renderSkill`), `lib/agents/prompt.ts` (how the chatbot folds soul facts in)

- [ ] **Step 1: Write the failing test** — `composeVoicePersona({ soul, blueprint, timezone:"America/Los_Angeles", now })` returns a string that: includes the business name + services from soul; includes the temporal anchor with the workspace timezone (the `{{timezone}}` placeholder is filled, not literal); includes the voice-sdr prose; respects `blueprint.customSkillMd` override when set.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — compute `{ currentDate, currentTime, timezone }` via `Intl.DateTimeFormat` in the workspace tz (mirror `temporal-reasoning` render vars); `composeDefaultSkillMd("voice-receptionist", vars)` for the skill body (or `blueprint.customSkillMd` if set); prepend soul-derived business facts (name, services, FAQ from `blueprint.faq`). Pure (inject `now`).
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit.** `git commit -m "feat(voice): composeVoicePersona — per-workspace, timezone-grounded"`

---

### Task A6: `resolveVoiceContextByNumber` (TDD)

**Files:**
- Modify: `packages/crm/src/lib/agents/voice/voice-workspace.ts`
- Test: extend `packages/crm/tests/unit/agents/voice/voice-workspace.spec.ts` (or the existing voice-workspace test)

- [ ] **Step 1: Write the failing test** for `resolveVoiceContextByNumber({ dialedNumber, deps })`: (a) dialed number matches a workspace → `{ ok:true, ctx, resolvedBy:"number" }`; (b) no match but env slug set → `{ ok:true, ctx, resolvedBy:"env_fallback" }`; (c) neither → `{ ok:false }`. Reuse the Phase 1 agent-id/ctx shape.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — try `resolveWorkspaceByPhoneNumber(dialedNumber)`; on hit, `getOrCreateVoiceAgent` + build ctx; on miss, delegate to the existing `resolvePhase1VoiceContext` (env) and tag `resolvedBy:"env_fallback"`. Keep `testMode:false`.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit.** `git commit -m "feat(voice): resolveVoiceContextByNumber with env fallback"`

---

### Task A7: Transcript persistence helpers (TDD)

**Files:**
- Create: `packages/crm/src/lib/agents/voice/transcript.ts`
- Test: `packages/crm/tests/unit/agents/voice/voice-transcript.spec.ts`
- Reference: `agentConversations`/`agentTurns` schema (`db/schema/agents.ts`), the chatbot insert in `api/v1/public/agent/[slug]/turn/route.ts`

- [ ] **Step 1: Write the failing test** (DI over inserts): `startVoiceConversation` inserts one `agentConversations` row (agentId/orgId, `status:'active'`, channelMeta = call_id/from/to) and returns its id; `appendVoiceTurn` inserts an `agentTurns` row with monotonically increasing `turnIndex`; `endVoiceConversation` updates `status:'completed'` + `turnCount`. Every function swallows + logs errors (assert a throwing dep does not throw out).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** the three helpers, best-effort (try/catch + `logEvent("voice_call_transcript_persist_error", …)`); maintain an in-memory `turnIndex` counter passed by the caller.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit.** `git commit -m "feat(voice): best-effort transcript persistence helpers"`

---

### Task A8: Wire it into the live call (integration)

**Files:**
- Modify: `packages/crm/src/lib/agents/voice/openai-realtime.ts` (`runVoiceCall` params + `session.update` + the transcription event cases ~line 621)
- Modify: `packages/crm/src/app/api/v1/voice/openai/webhook/route.ts` (the `after()` block — resolve by number, compose persona, pass to `runVoiceCall`)

- [ ] **Step 1: Extend `runVoiceCall` params** — add `audioVoice?: string` (default `VOICE_AUDIO_OUTPUT_VOICE`) and optional transcript callbacks `onUserTurn?`/`onAssistantTurn?`/`onCallEnd?`. In the `session.update` (line ~524) use `audio: { output: { voice: params.audioVoice ?? VOICE_AUDIO_OUTPUT_VOICE }, input: { transcription: { model: "whisper-1" } } }` to ENABLE input transcription. (Confirm the exact transcription-config key against the realtime event log from A1; the `input_audio_transcription.completed` case already exists at line 621.)
- [ ] **Step 2: Capture transcripts** — in the existing `conversation.item.input_audio_transcription.completed` case, call `onUserTurn(text)`; add the assistant audio-transcript case (name confirmed in A1) → `onAssistantTurn(text)`; on WS close → `onCallEnd()`.
- [ ] **Step 3: Wire the webhook `after()`** — replace `resolvePhase1VoiceContext()` with `extractDialedNumber(event.data?.sip_headers)` → `resolveVoiceContextByNumber({ dialedNumber })`; on resolve, load the voice agent's blueprint, `composeVoicePersona(...)`, `startVoiceConversation(...)`, and call `runVoiceCall({ callId, apiKey, toolContext, instructions: persona, audioVoice: blueprint.voice, onUserTurn, onAssistantTurn, onCallEnd })` with the turn callbacks wired to `appendVoiceTurn`/`endVoiceConversation`. Log `voice_call_workspace_resolved_by_number` / `..._by_env_fallback` / `..._unresolved`.
- [ ] **Step 4: Typecheck + full affected tests.** `pnpm typecheck`; `cd packages/crm && node --import tsx --test tests/unit/agents/voice/*.spec.ts` — Expected: all PASS. **Do not modify** the validated transport (accept body, `ws`, headers, accept↔WS adjacency).
- [ ] **Step 5: Commit.** `git commit -m "feat(voice): per-workspace persona + voice + transcripts in the live call"`

---

### Task A9: Stage A verification + smoke-test handoff

- [ ] **Step 1:** `pnpm typecheck` (clean) + `pnpm test:unit` (new voice tests green; pre-existing failures ignored per the list above).
- [ ] **Step 2: Push** `proposal-builder` (clean fast-forward → preview deploy).
- [ ] **Step 3: SURFACE TO OPERATOR — real-call smoke test** (do NOT run autonomously): call the workspace number; verify (a) the agent greets as the right business, (b) quotes workspace-local times, (c) books into the right `/clients/<slug>` calendar, (d) a transcript appears in Conversations. Capture the `voice_call_sip_headers` + assistant-transcript event names from the log to finalize B/C.

---

## STAGE B — Agent brain feedback loop (outline; expand after A9)

Reuses `lib/brain/store.ts` (`listBrainDir`, `readBrainNote`, `markBrainOutcome`), `lib/analytics/brain.ts` (the `brain_outcomes` emitter), and the scheduled `brain-compile` + `brain-promote` crons. **No engine changes.**

### Task B1: `loadAgentBrainContext` + `recordAgentBrainOutcome` (TDD)
- Create `packages/crm/src/lib/agents/brain-context.ts` + spec.
- `loadAgentBrainContext({ orgId, archetype })` → `{ notes: string[]; consumedNoteIds: string[] }`: `listBrainDir` the workspace + global notes under the agent path prefix (confirm the prefix the dream cycle writes), `readBrainNote` the top-confidence few (ticks `uses`), return bodies + ids. `recordAgentBrainOutcome({ orgId, eventType, outcome, valueCents, noteIds, context })` → emit via `lib/analytics/brain.ts` + `markBrainOutcome(noteIds, outcome)` on a win. Both best-effort + injectable.
- Tests: returns notes + ids and ticks uses; emits the right outcome row; `markBrainOutcome` only on win-with-ids; errors swallowed.

### Task B2: Wire voice (read + write)
- In the webhook `after()` / persona compose: call `loadAgentBrainContext`, pass `notes` into `composeVoicePersona` (extend it to accept `brainNotes`), stash `consumedNoteIds` on the conversation `channelMeta`.
- On a landed booking (the `book_appointment` tool result `ok:true`): `recordAgentBrainOutcome({ eventType:"voice_booking", outcome:"win", valueCents, noteIds, context })`. On abandoned/escalated end: `outcome:"loss"`.

### Task B3: Wire chatbot (read + write)
- Populate the chatbot turn's existing `brainNotes` slot from `loadAgentBrainContext("website-chatbot")` if not already; emit `chat_booking` win on a chatbot booking via `recordAgentBrainOutcome`. (Confirm whether the live chatbot turn already loads notes; if so, only add the write.)

### Task B4: Verify + smoke test
- Unit green; push; SURFACE TO OPERATOR: a booked call/chat writes a `brain_outcomes` row (verify via DB) and bumps consumed-note `wins`.

---

## STAGE C — `/automations` voice editor (outline; expand after A9/B)

### Task C1: Voice Receptionist card
- Modify `packages/crm/src/app/(dashboard)/automations/page.tsx`: add a special catalog entry "Voice Receptionist" (phone icon via `ARCHETYPE_VISUALS`) whose status comes from the voice `agents` row (`live`/`paused`/not-configured) + whether a number is assigned, linking to `/automations/voice-receptionist` (NOT the generic `/automations/[id]/configure`).

### Task C2: Editor page + actions + transcript/patterns views
- Create `packages/crm/src/app/(dashboard)/automations/voice-receptionist/page.tsx` (server: get-or-create the voice agent, load recent `agentConversations` + top `brain_notes`) and a client editor.
- Server actions: save blueprint (greeting, `voice`, FAQ, `capabilities`), set `status` (Live/Pause), assign the workspace voice number (`integrations.twilio.fromNumber`), write an `agentVersions` row (mirror `update_website_chatbot`).
- Views: a transcript list (expandable to `agentTurns`) and a "patterns this agent has learned" panel (top workspace `brain_notes` by confidence).

### Task C3: Verify + smoke test
- Typecheck + tests; push; SURFACE TO OPERATOR: edit greeting/voice in `/automations`, confirm the next call reflects it; transcripts + patterns render.

---

## Final review

After all stages: dispatch a final code review over the whole Phase 2 diff, then use superpowers:finishing-a-development-branch. Re-confirm the validated voice transport was never altered.
