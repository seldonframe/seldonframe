# SLICE 7 Audit — message triggers

**Date:** 2026-04-24
**Predecessor:** SLICE 6 (external-state branching), closed in commit `4e57cbe9`.
**Drafted by:** Claude Opus 4.7 against HEAD (branch `claude/fervent-hermann-84055b`).

---

## §1 Problem statement + strategic context

### 1.1 What message triggers unlock

Today, agents fire on **events** (`form.submitted`, `booking.completed`, `subscription.cancelled`) or **schedules** (cron). They cannot fire on **inbound messages with content matching a pattern** as a first-class trigger.

SLICE 7 adds `trigger.type: "message"` so agents can fire when an inbound SMS or email arrives whose content matches a declared pattern. Concrete examples:

- **Appointment confirmation:** patient texts "CONFIRM" to a reminder → agent marks the booking confirmed and emits `booking.confirmed`.
- **Refund triage:** customer emails `support@` with subject containing "refund" → agent looks up the contact, opens a Linear ticket, drafts a Soul-aware reply.
- **Re-engagement on reply:** dormant customer texts back any non-STOP message → agent unmutes them in CRM and pings the owner.
- **Keyword campaigns:** prospect texts "DEMO" to a marketing number → agent books a slot via `create_booking` and replies with the calendar link.

### 1.2 Relationship to existing trigger primitives

| Trigger type | Source | When does run start? | Match shape |
|---|---|---|---|
| `event` (shipped) | `emitSeldonEvent()` calls (form, booking, payment, etc.) | Synchronous wake-up scan from emission site | Event name + `filter` jsonb |
| `schedule` (SLICE 5) | Cron tick at `/api/cron/workflow-tick` | `dispatchScheduledTriggerTick` callback | Cron expression + IANA timezone |
| `message` **(NEW — SLICE 7)** | Inbound webhook (Twilio SMS, future email) | Webhook dispatcher matches message → invokes `startRun` | Pattern declaration + channel binding |

### 1.3 Why "message" is distinct from "event over inbound"

A naïve alternative is "let the existing inbound webhook keep emitting `sms.replied`, and authors use a regular event trigger with `filter: { body: { contains: "CONFIRM" } }`." This is rejected because:

1. **Pattern matching is first-class for messages, not generic.** Authors of message-triggered agents reason about "case-insensitive contains," "regex," "exact match," and channel binding. Encoding all of that into the generic `filter` jsonb conflates two different mental models and ships a worse author experience.
2. **Channel binding is structural.** A message trigger is bound to *which inbound channel* (a specific phone number, a specific email mailbox, or any). Generic events have no equivalent — they're orthogonal to delivery surface.
3. **Reply semantics need a stable address.** When an agent replies to an inbound message, it must reply *from the same channel*. A message trigger carries that binding; an event with a free-form payload does not.
4. **Loop prevention.** Agent-sent messages must not re-trigger the same agent. Encoding loop guards inside generic `filter` is awkward; making them a structural property of the message trigger keeps it correct by default.

### 1.4 Strategic boundary

SLICE 7 closes the "two-way conversation as agent surface" gap. After SLICE 7:
- **Inbound to outbound:** message trigger → agent run → reply via existing `send_sms` / `send_email`.
- **Multi-step interactions:** message trigger → agent enters conversation runtime (already shipped) → multi-turn dialog with Soul-aware replies.
- **Compliance baked in:** STOP keyword handling already runs *before* trigger dispatch (existing webhook handler), so agents never see opted-out users.

What SLICE 7 does **not** ship: voice channels, WhatsApp/Telegram, multi-channel triggers, semantic/embedding pattern matching, message scheduling (already SLICE 5), bulk inbound batching.

---

## §2 Ground-truth findings at HEAD

Verified by direct inspection at commit `7af9fa43` (post-L-23 doc commit). Eight dimensions covered. **The audit's headline finding: SLICE 7 inherits dramatically more shipped infrastructure than the original projection assumed. SMS-side machinery is largely complete; email-side is virgin territory.**

### §2.1 Twilio inbound SMS — **fully shipped**

[`packages/crm/src/app/api/webhooks/twilio/sms/route.ts`](packages/crm/src/app/api/webhooks/twilio/sms/route.ts:1) (298 LOC) handles both inbound messages AND status callbacks. The inbound branch already does:

1. **Org resolution** (lines 16-37): `resolveOrgByFromNumber(toNumber)` scans `organizations.integrations.twilio.fromNumber` to map the To-number → orgId.
2. **Signature verification** (lines 157-208): HMAC-SHA1 via [`verifyTwilioSignature`](packages/crm/src/lib/sms/webhook-verify.ts:1) using workspace-scoped `authToken`. Timing-safe compare. Unsigned requests accepted in dev.
3. **STOP keyword handling** (lines 231-243): [`isStopKeyword`](packages/crm/src/lib/sms/suppression.ts:104) → `addPhoneSuppression()` → `sms.suppressed` event. **Runs before any trigger dispatch could fire.**
4. **Idempotency** (lines 98-110): `smsEvents` table with `uniqueIndex("sms_events_provider_event_uidx").on(provider, providerEventId)` + `onConflictDoNothing`. providerEventId pattern: `${status}:${externalMessageId}:${timestamp}`.
5. **Inbound persistence** (line 248): `persistInboundSms()` writes to `smsMessages` with `direction='inbound'`, `status='received'`.
6. **Contact resolution** (line 246): [`findContactByPhone(orgId, fromNumber)`](packages/crm/src/lib/sms/api.ts) — lookup only, no auto-create on unknown numbers.
7. **Conversation runtime routing** (lines 268-275): if contact known, routes through [`handleIncomingTurn`](packages/crm/src/lib/conversation/runtime.ts) to maintain conversation/turn state.
8. **Event emission** (line 258): `emitSeldonEvent("sms.replied", { ... }, { orgId })` already fires on every inbound non-STOP message.

**SLICE 7 surface area on the Twilio path:** insert one new step between contact resolution and conversation routing — "find matching message triggers for this org × channel × body, call `startRun` for each match." That's it. Everything else is reused.

### §2.2 Inbound email — **does not exist**

[`packages/crm/src/app/api/webhooks/resend/route.ts`](packages/crm/src/app/api/webhooks/resend/route.ts:1) handles **outbound event notifications only** (sent / delivered / bounced / opened / clicked / complained). No inbound parsing. Search for Mailgun, SendGrid Inbound Parse, Postmark Inbound, Cloudflare Email Workers — **all return zero matches.**

**Implications for scope:** shipping inbound email in SLICE 7 means picking a provider, building a route from scratch, signature verification (likely Svix-pattern reuse from outbound Resend handler), inbound parsing (MIME-ish), thread association. Adds ~250-400 LOC depending on provider. **Strong case for deferring email to a follow-on slice (G-7-2).**

### §2.3 TriggerSchema discriminated union — virgin territory for `message`

[`packages/crm/src/lib/agents/validator.ts:133-136`](packages/crm/src/lib/agents/validator.ts:133):

```typescript
const TriggerSchema = z.discriminatedUnion("type", [
  EventTriggerSchema,
  ScheduleTriggerSchema,
]);
```

Currently `event | schedule`. **No `manual` branch exists** (Max's spec mentioned it, but ground-truth confirms it has not shipped). No commented-out `MessageTriggerSchema`, no TODO scaffolding. Cross-ref edges in trigger area:

- `EventTriggerSchema`: 1 edge (event-registry cross-ref in [`validateAgentSpec`](packages/crm/src/lib/agents/validator.ts:515))
- `ScheduleTriggerSchema`: 2 edges (cron + IANA timezone refinements at [`validator.ts:120,125`](packages/crm/src/lib/agents/validator.ts:120))
- `ConditionSchema` (SLICE 6): 1 edge (operator/expected superRefine)
- **Total: 4 edges**, well within the L-17 5-8 edge interpolated band predicted for SLICE 7.

Test baseline:
- [`tests/unit/trigger-discriminated-union.spec.ts`](packages/crm/tests/unit/trigger-discriminated-union.spec.ts): 9 tests, 166 LOC
- [`tests/unit/schedule-trigger.spec.ts`](packages/crm/tests/unit/schedule-trigger.spec.ts): 21 tests, 266 LOC (the 2.63x cross-ref multiplier 3rd datapoint reference)

### §2.4 Pattern matching — **does not exist** as a reusable utility

Survey confirms zero reusable matchers in `packages/crm/src/**`:
- No `minimatch` / `micromatch` / `picomatch` in package.json
- No custom `match()` / `patternMatch()` / `matchKeyword()` helpers
- The only string-classifier is [`isStopKeyword`](packages/crm/src/lib/sms/suppression.ts:104) — a hardcoded `Set<string>` of STOP/STOPALL/UNSUBSCRIBE/CANCEL/END/QUIT
- No regex-based, glob-based, or semantic matchers

**SLICE 7 ships the first reusable pattern-matching evaluator.**

### §2.5 Webhook signature verification — proven pattern, reusable

Two working implementations:
- [`verifyTwilioSignature`](packages/crm/src/lib/sms/webhook-verify.ts:1) — HMAC-SHA1, workspace-scoped auth token, timing-safe compare
- [`verifyResendWebhook`](packages/crm/src/lib/emails/webhook-verify.ts:1) — Svix-pattern HMAC-SHA256, base64 secret, 5-min timestamp tolerance

**Reuse:** Twilio path inherits §2.1's verification unchanged. If inbound email ships in SLICE 7, the Svix pattern transfers to whichever provider is chosen.

### §2.6 Idempotency — proven pattern, mostly reusable

Three layers exist:
- **Webhook delivery dedup:** `smsEvents` + `emailEvents` tables with `(provider, providerEventId)` unique indexes (see §2.1).
- **Outbound subscription dedup:** [`resolveIdempotencyTemplate`](packages/crm/src/lib/subscriptions/idempotency.ts) — interpolates `{{ref}}` placeholders into a dedup key. Used for block-subscription delivery.
- **Drizzle `onConflictDoNothing`** is the project-wide pattern for at-most-once semantics.

**Gap for SLICE 7:** the existing `smsEvents` dedup is per-webhook-delivery. If one inbound message matches two distinct message triggers (e.g., a generic "any reply" trigger AND a specific "CONFIRM" trigger), each match should fire its own run. We need **trigger-fire dedup** keyed on `(orgId, triggerId, externalMessageId)`, not `(provider, providerEventId)`. Net new work: ~30-50 LOC + a `message_trigger_fires` table (or extend `workflow_event_log`).

### §2.7 Conversation/thread state — **fully shipped**

- [`conversations` table](packages/crm/src/db/schema/conversations.ts): `(id, orgId, contactId, channel, status, subject, assistantState, lastTurnAt, ...)` — channel enum already supports `email|sms`.
- [`conversation_turns` table](packages/crm/src/db/schema/conversation-turns.ts): `(id, orgId, conversationId, direction, channel, content, emailId, smsMessageId, metadata, createdAt)`.
- [`loadOrCreateConversation` + `handleIncomingTurn`](packages/crm/src/lib/conversation/runtime.ts): channel-agnostic, loads up to MAX_HISTORY_TURNS=20 prior turns. Already invoked from the Twilio webhook (§2.1 #7).

**Implication:** message-triggered agents that want thread context can read `conversation_turns` directly via existing primitives. No new conversation infrastructure required.

### §2.8 Reply primitives + dispatch entry point

- **Reply via existing tools:** [`sendSmsFromApi`](packages/crm/src/lib/sms/api.ts), [`sendEmailFromApi`](packages/crm/src/lib/emails/api.ts), and the [`send_conversation_turn` MCP tool](packages/crm/src/blocks/email.tools.ts:195). All shipped, all suppression-aware.
- **Dispatch entry point:** [`startRun`](packages/crm/src/lib/workflow/runtime.ts:156): `(orgId, archetypeId, spec, triggerEventId, triggerPayload) → string`. Already used by both event and schedule paths. Untyped `triggerPayload` (`Record<string, unknown>`); message dispatch reuses unchanged.
- **/agents/runs page:** [`packages/crm/src/app/(dashboard)/agents/runs/page.tsx`](packages/crm/src/app/(dashboard)/agents/runs/page.tsx) renders by run status and event type. Message-triggered runs surface out-of-the-box; no UI work.

### §2.9 Loop prevention — **does not exist**

Zero loop-detection logic for outbound-triggered-by-inbound. The only suppression is the static STOP keyword set. SLICE 7 must ship loop guards (G-7-7) — minimum: skip trigger dispatch if the inbound message's `from` matches an outbound message sent by the same agent within a window.

### §2.10 Summary of inherited vs. net-new

| Surface | Status | Notes |
|---|---|---|
| Twilio inbound webhook | **Inherited** | Just extend with one trigger-match call |
| Twilio signature verify | **Inherited** | Workspace-scoped HMAC-SHA1 |
| STOP / suppression | **Inherited** | Runs before trigger dispatch |
| Org / contact resolution | **Inherited** | `findContactByPhone` |
| Conversation / threads | **Inherited** | Channel-agnostic, already wired |
| Reply primitives | **Inherited** | `sendSmsFromApi`, `sendEmailFromApi`, `send_conversation_turn` |
| `startRun` dispatcher | **Inherited** | Untyped payload accepts message context |
| /agents/runs UI | **Inherited** | Renders message-triggered runs unchanged |
| Webhook delivery dedup | **Inherited** | `smsEvents` unique constraint |
| `MessageTriggerSchema` | **Net new** | Zod schema + cross-ref refinements |
| Pattern matching evaluator | **Net new** | Modes per G-7-1 |
| Trigger-match dispatcher | **Net new** | Find matching triggers for an inbound message |
| Trigger-fire dedup | **Net new** | `(orgId, triggerId, externalMessageId)` |
| Loop prevention | **Net new** | Per G-7-7 |
| Inbound email infra | **Net new** if in scope | ~250-400 LOC; G-7-2 decides |
| New archetype | **Net new** | 3-run baseline per L-23 |

---

## §3 Schema extension

### 3.1 `MessageTriggerSchema` shape (proposed)

```typescript
const MessageTriggerSchema = z.object({
  type: z.literal("message"),
  channel: z.enum(["sms", "email"]),
  channelBinding: z.union([
    z.object({ kind: z.literal("any") }),
    z.object({ kind: z.literal("phone"), number: z.string().min(1) }),  // E.164
    z.object({ kind: z.literal("email"), address: z.string().email() }),
  ]),
  pattern: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("exact"), value: z.string().min(1), caseSensitive: z.boolean().default(false) }),
    z.object({ kind: z.literal("contains"), value: z.string().min(1), caseSensitive: z.boolean().default(false) }),
    z.object({ kind: z.literal("starts_with"), value: z.string().min(1), caseSensitive: z.boolean().default(false) }),
    z.object({ kind: z.literal("regex"), value: z.string().min(1), flags: z.string().optional() }),
    z.object({ kind: z.literal("any") }),  // matches all messages on the channel binding
  ]).superRefine((p, ctx) => {
    if (p.kind === "regex") {
      try { new RegExp(p.value, p.flags); } catch (e) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: `invalid regex: ${(e as Error).message}` });
      }
    }
  }),
  matchTarget: z.enum(["body", "subject"]).default("body"),
  loopGuard: z.object({
    skipOutboundFromSameAgent: z.boolean().default(true),
    windowMinutes: z.number().int().min(1).max(1440).default(60),
  }).optional(),
});
```

### 3.2 Cross-reference Zod refinements

Cross-ref edges introduced (count for L-17 application — see §7):

1. `pattern.kind === "regex"` → must compile (1 edge, inline superRefine on `pattern`).
2. `channel === "sms"` ⇒ `channelBinding.kind` ∈ `{any, phone}` (1 edge, top-level superRefine).
3. `channel === "email"` ⇒ `channelBinding.kind` ∈ `{any, email}` (1 edge, same superRefine).
4. `channel === "sms"` ⇒ `matchTarget !== "subject"` (SMS has no subject) (1 edge, same superRefine).
5. `channelBinding.kind === "phone"` ⇒ `channelBinding.number` must be valid E.164 (1 edge, refine).
6. **(top-level)** if `pattern.kind === "any"` and `channelBinding.kind === "any"`, warn / forbid? — gate G-7-1b.

**Total: 5 edges (G-7-1b decision could push to 6).** Per L-17 cross-ref scaling (4-6 edges → 2.5-3.0x), the test multiplier on the schema portion lands at **~2.7-2.9x**.

### 3.3 Updated `TriggerSchema`

```typescript
const TriggerSchema = z.discriminatedUnion("type", [
  EventTriggerSchema,
  ScheduleTriggerSchema,
  MessageTriggerSchema,
]);
```

Three branches; runtime narrowing remains structural per existing pattern.

---

## §4 Webhook + dispatch infrastructure

### 4.1 Twilio inbound flow (extended)

Current:
```
POST /api/webhooks/twilio/sms
  → verify signature (workspace authToken)
  → dedup via smsEvents unique index
  → STOP check + suppression
  → resolve org from To-number
  → resolve contact from From-number
  → persistInboundSms (smsMessages row)
  → if contact: handleIncomingTurn (conversation runtime)
  → emitSeldonEvent("sms.replied")
  → 200 OK
```

Extended for SLICE 7 (one insertion, marked **NEW**):
```
POST /api/webhooks/twilio/sms
  → verify signature
  → dedup via smsEvents
  → STOP check + suppression
  → resolve org from To-number
  → resolve contact from From-number
  → persistInboundSms
  → NEW: dispatchMessageTriggers({ orgId, channel:"sms", to, from, body, externalMessageId, contactId })
  → if contact: handleIncomingTurn
  → emitSeldonEvent("sms.replied")
  → 200 OK
```

`dispatchMessageTriggers` is the new dispatcher (§5.3).

### 4.2 Inbound email flow (deferred per G-7-2 recommendation)

If G-7-2 decides email is **in scope** for SLICE 7:
- Pick provider (Resend Inbound beta vs SendGrid Inbound Parse vs Cloudflare Email Workers). Resend's beta is the lowest-friction match given outbound is already Resend; verify the beta is GA.
- Build `POST /api/webhooks/resend/inbound` (or equivalent) mirroring the Twilio shape.
- Reuse Svix signature verification pattern from outbound Resend handler.
- Add `emailMessages` table (or repurpose `emails` with `direction='inbound'`).
- Reuse `findContactByEmail` (gap: this function does not yet exist; ~30 LOC to add).
- Insert same `dispatchMessageTriggers({ ..., channel: "email", ... })` call.

**LOC delta if email is in:** +250-400 prod + ~400 tests + a 3rd inbound parser. **If email is out:** zero delta; Twilio-only ships.

### 4.3 Idempotency for trigger fires

Webhook delivery dedup is solved (§2.6). **Trigger-fire dedup** is new. Two design options:

- **Option A — dedicated table:** `message_trigger_fires (id, orgId, triggerId, externalMessageId, runId, firedAt)` with unique `(orgId, triggerId, externalMessageId)`. ~40 LOC + migration.
- **Option B — reuse `workflow_event_log`:** emit `workflow.message.matched` with the trigger key in the payload; rely on log-level dedup. Lighter but couples trigger-fire semantics to general event log.

**Recommendation: Option A** — dedicated table, structural enforcement (per L-22 addendum: prefer structural enforcement). G-7-6 decides.

### 4.4 Failure handling

- **Webhook delivery failure:** Twilio retries on 5xx. Existing handler returns 200 even if downstream work fails (logs error, persists what it can). New `dispatchMessageTriggers` follows same pattern: failures logged, do not propagate to webhook response (would cause Twilio retry storms).
- **Trigger-match failure (e.g., DB error querying triggers):** log + emit `workflow.message.dispatch_failed` for /agents/runs visibility; do not block the rest of the inbound pipeline.
- **`startRun` failure:** caught per-trigger; emit `workflow.run.start_failed`; continue to next matching trigger.

---

## §5 Runtime implementation

### 5.1 Pattern matching evaluator

[`packages/crm/src/lib/agents/message-pattern.ts`](packages/crm/src/lib/agents/message-pattern.ts) (NEW). Single export:

```typescript
export function matchesMessagePattern(
  pattern: MessagePattern,
  text: string,
): boolean
```

Five modes per the schema. Normalization (lowercase) applied per `caseSensitive` flag. Regex pre-compiled at validate-time and cached on the evaluator (or compiled per call — micro-bench during C2 to decide). ~80 LOC prod + ~150-200 LOC tests (pattern evaluators are exhaustive-by-mode test surfaces).

### 5.2 Channel binding evaluator

[`packages/crm/src/lib/agents/channel-binding.ts`](packages/crm/src/lib/agents/channel-binding.ts) (NEW). Single export:

```typescript
export function channelBindingMatches(
  binding: ChannelBinding,
  inbound: { channel: "sms" | "email"; to: string },
): boolean
```

E.164 normalization on phone, lowercase + domain on email. ~50 LOC prod + ~80 tests.

### 5.3 Trigger dispatcher

[`packages/crm/src/lib/agents/message-trigger-dispatcher.ts`](packages/crm/src/lib/agents/message-trigger-dispatcher.ts) (NEW). Core function:

```typescript
export async function dispatchMessageTriggers(
  context: DispatchContext,
  inbound: InboundMessage,
): Promise<{ matched: number; runs: string[]; skipped: SkipReason[] }>
```

Algorithm:
1. Query `messageTriggers` (or scan `agents.specSnapshot` for `trigger.type === "message"`) filtered by `(orgId, channel)`.
2. For each candidate trigger:
   - Evaluate `channelBindingMatches` → skip if no match.
   - Evaluate `matchesMessagePattern` against `body` (or `subject` per `matchTarget`) → skip if no match.
   - Evaluate loop guard (per G-7-7): if last outbound from same agent to same `from` within `windowMinutes`, skip with `loop_guard` reason.
   - Insert into `messageTriggerFires` (Option A) → on conflict, skip with `already_fired` reason.
   - Call `startRun({ orgId, archetypeId, spec, triggerEventId: messageTriggerFires.id, triggerPayload: inbound })`.
3. Return summary for observability.

This is the **dispatcher policy matrix** referenced in §7 — channel × pattern type × loop-guard × dedup outcome. Per L-17 multiplicative scaling for dispatchers, expect ~3.5-4.0x test multiplier on this file.

### 5.4 Trigger-payload contract

When a message trigger fires, `triggerPayload` shape exposed to the agent's `variables` block:

```typescript
{
  channel: "sms" | "email",
  from: string,           // normalized E.164 or email
  to: string,             // normalized E.164 or email
  body: string,
  subject?: string,       // email only
  externalMessageId: string,
  receivedAt: string,     // ISO 8601
  contactId: string | null,
  conversationId: string | null,
}
```

This contract is documented in the archetype spec template and verified by the integration test (§6).

### 5.5 New archetype: `appointment-confirm-sms`

Demonstrates the message-trigger primitive end-to-end:

```
trigger: { type: "message", channel: "sms", pattern: { kind: "exact", value: "CONFIRM" }, channelBinding: { kind: "any" } }
↓
step 1: lookup_pending_booking (mcp_tool_call → list_bookings filter by contactId + status='pending')
↓
step 2: branch (predicate: bookings.length > 0)
  on_match → step 3
  on_no_match → step 5
↓
step 3: confirm_booking (mcp_tool_call → update_booking status='confirmed')
↓
step 4: send_sms ("Confirmed! See you {bookingStartsAt}.")
  → END
↓
step 5: send_sms ("Got your CONFIRM but no pending bookings — please reply with the appointment time.")
  → END
```

Demonstrates: message trigger → branch (SLICE 6) → reply via `send_sms` → conversation thread continuity. Per L-23: 3-run baseline durability check before locking the hash.

---

## §6 Gate items

Eight substantive decisions. **Bold = decision blocks PR start.**

### **G-7-1: Pattern matching scope**

Which match modes ship in v1?

- **Option A:** `exact + contains + starts_with + regex + any` (proposed in §3.1)
- **Option B:** `exact + contains + any` only (no regex, no starts_with) — smaller surface, defer power users
- **Option C:** Option A + `ends_with` for symmetry
- **Option D:** Option A + semantic/embedding match (post-launch — embeddings infra not yet shipped)

**Recommendation:** Option A. regex is high-value for keyword campaigns and has well-understood failure modes (compile-time refinement catches malformed patterns).

### **G-7-1b: "Match anything" guardrail**

Is `pattern.kind === "any"` AND `channelBinding.kind === "any"` allowed? This combination fires on **every inbound message in the workspace** — a foot-gun.

- **Option A:** Allow but warn at validate time (audit log).
- **Option B:** Require an explicit `acceptAllMessages: true` opt-in field.
- **Option C:** Forbid; require either pattern or channel to be specific.

**Recommendation:** Option C. Builders who genuinely want "every message" can use `pattern.kind === "any"` with a specific channel binding, which is still scoped.

### **G-7-2: Channel scope (SMS-only vs SMS+email)**

- **Option A:** SMS only in SLICE 7. Email deferred to a follow-on slice. **LOC: 1,200-1,600.**
- **Option B:** SMS + email in SLICE 7. **LOC: 1,800-2,400** (likely triggers PR split per §8).
- **Option C:** SMS in PR 1, email in PR 2 — bundled into SLICE 7 as a 2-PR slice.

**Recommendation:** Option A. Inbound email infrastructure is virgin territory (§2.2), spans provider selection + signature verify + parser + new schema table + `findContactByEmail`. Bundling it forces SLICE 7 above the comfortable LOC envelope, and SMS alone is high-value (the three example use cases — CONFIRM, STOP, DEMO — are all SMS). Email gets its own clean slice with its own provider gate.

### **G-7-3: Channel binding semantics**

How specific can a builder be?

- **Option A:** `any | phone | email` (proposed §3.1) — bind to a specific number / address or all inbound for the channel.
- **Option B:** Add `phone_pattern` (E.164 prefix matching, e.g., all `+1212...` numbers) — toll-free routing use case.
- **Option C:** Option A + `tag` — bind to a Twilio number tagged with `marketing` vs `support`. Requires Twilio number tagging infrastructure (does not exist).

**Recommendation:** Option A. Option B is rare; Option C requires net-new infra not justified by any current use case. Builders needing per-prefix routing can author multiple triggers.

### **G-7-4: Conversation context attached to trigger fire**

When a message trigger fires, what conversation state is in `triggerPayload`?

- **Option A:** Just the inbound message + `conversationId` (agent reads turns via `read_state` if needed).
- **Option B:** Inbound message + last N turns inlined into payload (default N=5).
- **Option C:** Inbound message + full conversation history (unbounded — risky on long threads).

**Recommendation:** Option A. Keeps payload small and predictable; agents that need history use the existing conversation-runtime primitives. Avoids unbounded payload growth (L-22 addendum: structural enforcement of bounds).

### **G-7-5: Reply semantics — existing tools vs new primitive**

When an agent wants to reply to the inbound message:

- **Option A:** Use existing `send_sms` / `send_email` MCP tools, passing `to: trigger.from` and (for email) `inReplyTo: trigger.externalMessageId`. Threading via existing `conversation_turns`.
- **Option B:** New `reply` MCP tool that wraps the existing tools, auto-fills `to`/`inReplyTo` from trigger context, and enforces "must be in a message-triggered run."
- **Option C:** Option A + a runtime helper variable `{{trigger.replyChannel}}` that resolves the right send tool.

**Recommendation:** Option A. The existing tools are sufficient; `trigger.from` is exposed in the variable scope (§5.4); no new abstraction needed. Option B's enforcement adds complexity for marginal value.

### **G-7-6: Trigger-fire idempotency**

Per §4.3:

- **Option A:** Dedicated `message_trigger_fires` table with unique `(orgId, triggerId, externalMessageId)`.
- **Option B:** Reuse `workflow_event_log` with payload-level dedup.
- **Option C:** No dedup — webhook-delivery dedup at `smsEvents` is sufficient (claim: same delivery → same trigger evaluation → same outcome).

**Recommendation:** Option A. Per L-22 addendum, prefer structural enforcement. Option C breaks if a trigger is added retroactively to a workspace and a re-delivered message would now match — Option A makes idempotency a property of the trigger fire, not the webhook delivery.

### **G-7-7: Loop prevention design**

Two loops to prevent:

1. **Same-agent reply loop:** agent sends an SMS that triggers itself.
2. **Cross-agent reply loop:** agent A's SMS triggers agent B which sends another SMS that triggers agent A.

- **Option A:** Per-trigger `loopGuard.skipOutboundFromSameAgent` (proposed §3.1) with default ON, configurable window (default 60 min). Covers loop #1 cleanly.
- **Option B:** Option A + workspace-level "max consecutive auto-replies" counter (e.g., 3) tracked in conversation state. Covers loop #2.
- **Option C:** Option A + Option B + outbound message tagging (`X-Seldon-Origin: agent:abc123`) so trigger dispatch can detect any agent-originated message and skip.
- **Option D:** Option A only; defer #2 to a follow-on if it surfaces.

**Recommendation:** Option B. Loop #1 is the obvious foot-gun and Option A solves it. Loop #2 is plausible with multi-agent workspaces and is worth catching at the conversation level. Option C is more invasive than needed (tagging mutates outbound surface).

### **G-7-8: Trigger storage — dedicated table vs scan agents**

Where do trigger declarations live?

- **Option A:** Scan `agents.specSnapshot` jsonb for `trigger.type === "message"` at every inbound. Simple but O(N) over agents per inbound.
- **Option B:** Materialize on agent insert/update into `messageTriggers (id, orgId, agentId, channel, channelBinding jsonb, pattern jsonb)` for indexed lookup.
- **Option C:** Option B + GIN index on the channel + a partial index on active triggers.

**Recommendation:** Option B. Per-org agent count is small (tens, not thousands), so Option A's perf is fine, but Option B mirrors how `scheduledTriggers` materializes from agent specs (SLICE 5 pattern) and keeps the dispatch path consistent. Option C is premature optimization at v1 scale.

---

## §7 LOC projection (calibration applied)

### 7.1 Per-component estimates

Production code:

| Component | Prod LOC | Reasoning |
|---|---|---|
| `MessageTriggerSchema` + cross-refs | 80 | 5 cross-ref edges |
| Pattern evaluator | 80 | 5 modes × ~15 LOC each |
| Channel-binding evaluator | 50 | 3 binding kinds |
| Loop-guard evaluator | 60 | Last-outbound query + window check |
| `dispatchMessageTriggers` | 200 | 5-step pipeline + trigger materialization read |
| Twilio webhook integration | 30 | One insertion in existing flow |
| `messageTriggerFires` migration + queries | 60 | Drizzle schema + 2 queries |
| `messageTriggers` materializer | 80 | Upsert on agent save (G-7-8 Option B) |
| Archetype `appointment-confirm-sms` | 150 | Comparable to weather-aware-booking (174 LOC) |
| **Production subtotal** | **~790** | |

Test code (per L-17 calibrated multipliers):

| Component | Test LOC | Multiplier basis |
|---|---|---|
| `MessageTriggerSchema` (5 cross-ref edges) | 230 | 80 prod × ~2.85x (interpolated 2.5-3.0x band, 5 edges) |
| Pattern evaluator | 200 | 80 prod × 2.5x (exhaustive-by-mode = enum dispatcher 2.5x) |
| Channel-binding | 90 | 50 prod × 1.8x (small primitive, normalization edge cases) |
| Loop-guard | 100 | 60 prod × 1.7x |
| `dispatchMessageTriggers` (multi-policy matrix) | 750 | 200 prod × 3.75x (channel × pattern × loop × dedup multiplicative) |
| Twilio integration test fixture | 120 | 30 prod × 4x (integration overhead per L-17 artifact addendum) |
| `messageTriggerFires` table tests | 100 | 60 prod × 1.7x |
| `messageTriggers` materializer tests | 140 | 80 prod × 1.75x |
| Archetype unit + 3 probe runs (L-23) | 130 | comparable to daily-digest 95 + weather-aware 100 + L-23 audit trail |
| Integration harness (E2E) | 250 | Inbound webhook → trigger match → run → reply, single happy path + 3 failure modes |
| **Test subtotal** | **~2,110** | |

Documentation / artifacts:

| Item | LOC |
|---|---|
| Audit (this doc) | 700 |
| Close-out report | 150 |
| README / archetype docs | 60 |
| **Doc subtotal** | **~910** |

### 7.2 Total + envelope check

- **Production:** ~790
- **Tests:** ~2,110
- **Docs:** ~910 (this audit + close-out, not counted against code envelope per L-17 artifact addendum)
- **Code total:** ~2,900 LOC
- **Code + docs total:** ~3,810 LOC

Comparison to Max's projection (1,200-1,800):

The audit's data-driven projection of **~2,900 LOC of code** (~2,100 tests + ~800 prod) materially overshoots Max's 1,200-1,800 range. **Drivers of the overshoot:**

1. **L-17 multiplicative scaling on the dispatcher** (~750 test LOC for 200 prod) was not applied in Max's pre-audit estimate.
2. **3-run probe artifacts (L-23)** add ~30 LOC vs. legacy 1-run baseline.
3. **`messageTriggers` materializer** (G-7-8 Option B) is a SLICE 5-pattern-replication that Max's projection did not separately budget.

Max's stop-and-reassess trigger of **2,340 LOC** is exceeded by ~560 LOC (24% over trigger). **Per L-17 audit-time overshoot addendum**, we have two responses:

1. **Tighten scope at audit time** (preferred) — see §8 PR split recommendation.
2. **Accept overshoot with explicit decision** — log it in the audit close-out, similar to SLICE 6 PR 2's 30%-over decision.

### 7.3 Calibration notes for SLICE 7 close-out

- **Edge-count scaling 4th datapoint:** SLICE 7 schema lands at 5 edges. If actual test ratio falls in the 2.5-3.0x band, this confirms L-17's 4-6 edge band (now 4-datapoint stable). If it lands outside, the band needs revision.
- **Dispatcher multiplicative scaling 2nd datapoint:** SLICE 5 PR 1 schedule dispatcher landed at 3.5x; if SLICE 7 dispatcher lands in 3.5-4.0x range, the rule generalizes. If it lands in 2.5-3.0x range, the rule is over-stated.
- **L-23 application:** first slice to apply 3-run baseline durability *prospectively* (SLICE 5 daily-digest and SLICE 6 weather-aware-booking applied retrospectively). Records the discipline cost (1 extra probe pass).

---

## §8 Proposed PR split

Given §7's projection lands at ~2,900 LOC (24% over Max's 2,340 trigger), recommend a **2-PR split** to keep each PR under the 2,340 trigger:

### **Recommended: 2-PR split**

**PR 1 — Schema + dispatcher + Twilio integration (~1,800-2,000 LOC):**

- C1: L-17 cross-ref Zod 4th-datapoint expectation note (doc-only, ~30 LOC)
- C2: `MessageTriggerSchema` + cross-refs + tests (~310 LOC)
- C3: Pattern evaluator + channel-binding evaluator + tests (~420 LOC)
- C4: `messageTriggers` table migration + materializer + tests (~280 LOC)
- C5: `dispatchMessageTriggers` core + `messageTriggerFires` dedup + tests (~1,110 LOC)
- C6: Twilio webhook integration + integration harness happy path (~150 LOC)
- C7: Probe regression for 5 existing archetypes + PR 1 close-out (~120 LOC)

PR 1 ships the primitive end-to-end on the Twilio path with no archetype yet. Verifiable by the integration harness.

**PR 2 — Loop guard + archetype + close-out (~1,000-1,100 LOC):**

- C1: Loop-guard evaluator + tests (~160 LOC)
- C2: Loop-guard integration into dispatcher + tests (~80 LOC)
- C3: `appointment-confirm-sms` archetype + 3-run baseline (L-23) (~280 LOC)
- C4: 6-archetype regression probe + SLICE 7 close-out + push (~150 LOC)

### Alternative: single-PR with scope tightening

If Max prefers a single PR, tighten by:
- Drop G-7-8 Option B materializer (stay with O(N) scan at v1 scale): -220 LOC
- Drop G-7-7 Option B workspace-level loop counter (Option A only): -150 LOC
- Drop `starts_with` and `ends_with` pattern modes (G-7-1 Option B): -120 LOC

Saves ~490 LOC, lands at ~2,400 LOC — still ~3% over the 2,340 trigger but inside L-17's "audit-time accept" band.

### Alternative: strict scope-cut to fit 1,800

To genuinely hit Max's mid-projection (1,800), apply all three tighten-cuts above PLUS:
- Defer the new archetype to a follow-on slice: -280 LOC

Lands at ~2,120 LOC. This ships the primitive without a flagship archetype demo, which is uncomfortable — every prior slice has shipped a real archetype demonstrating the new capability.

**Audit recommendation: 2-PR split.** Loop guard is correctness, not optional; archetype is the "is it real?" check.

---

## §9 Dependencies

**Blocks SLICE 7:**
- TriggerSchema discriminated union (SLICE 5) ✅
- Workflow runtime + `startRun` (shipped) ✅
- Twilio inbound webhook with org/contact resolution (shipped) ✅
- Conversation/turn state (shipped) ✅
- Outbound `send_sms` MCP tool (shipped) ✅
- Branch step primitive (SLICE 6) — used by the new archetype ✅
- L-23 3-run baseline procedure (SLICE 7 C0, this PR) ✅

**Independent of:**
- SLICE 4 UI authoring (no UI for trigger declarations in SLICE 7; CLI/JSON only)
- SLICE 6 external_state condition (orthogonal — though message-triggered agents *can* use external_state in their workflow)

**Blocks (post-SLICE 7):**
- Inbound email (deferred per G-7-2 Option A recommendation) — separate slice
- Multi-channel triggers — separate slice
- Voice / WhatsApp / Telegram — separate slices
- Semantic/embedding pattern matching — depends on Brain v2 embedding infra
- UI authoring for message triggers — depends on SLICE 4 builder UI

---

## §10 Out of scope (explicit deferrals)

- **UI for authoring message triggers** — builders declare `trigger.type: "message"` in JSON/CLI. Author UI is a SLICE 4-class concern.
- **Multi-channel triggers** — single channel per trigger. Builder authors multiple triggers if cross-channel.
- **Voice channels** — Twilio Voice, Vapi, etc. Out of scope.
- **WhatsApp / Telegram / iMessage** — provider integrations are separate slices.
- **Message scheduling** — already SLICE 5 (cron-triggered outbound).
- **Bulk message processing** — single message per trigger fire. Bulk inbound (SMS marketing replies) is a separate concern.
- **Semantic / embedding-based pattern matching** — depends on Brain v2; post-launch.
- **Inbound email** — per G-7-2 Option A recommendation; separate slice.
- **AI-assisted pattern authoring** — "what regex would catch all booking-confirm intents?" is a Soul-layer concern, not SLICE 7.

---

## §11 Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Pattern matching false positives (regex too permissive) | Medium | Medium | G-7-1 schema constrains to declared modes; regex compile-time validated; archetype examples document tight patterns |
| Pattern matching false negatives (case sensitivity surprises) | Medium | Low | Default `caseSensitive: false`; integration test covers both |
| Auto-reply loops (agent A → B → A) | Medium | High | G-7-7 Option B (workspace counter) + Option A (per-trigger window guard) |
| Webhook delivery duplicates fire multiple runs | Low | High | G-7-6 Option A: `messageTriggerFires` unique constraint |
| Trigger evaluation latency spikes (slow `findContactByPhone` etc.) | Low | Medium | Existing query is indexed; integration test asserts p95 budget |
| Foot-gun: "any+any" trigger fires on every workspace inbound | Low | High | G-7-1b Option C: forbid combination at validate time |
| Carrier compliance violations (auto-replying to STOP) | Very low | Critical | STOP handling runs *before* trigger dispatch (existing webhook handler §2.1 #3); structural |
| Multi-tenant cross-org match (trigger from org A matches org B's inbound) | Very low | Critical | `dispatchMessageTriggers` query is `(orgId, channel)` filtered; integration test asserts cross-org isolation |
| Inbound to inactive agent fires a run | Medium | Low | Filter on `agents.active === true` at materialization time |
| Regex DoS (catastrophic backtracking) | Low | Medium | Wrap regex evaluation in a budget (~10ms) using a worker or `setImmediate` yield; G-7-1 follow-up if observed |

---

## §12 §11 End-to-end flow continuity

### 12.1 How an archetype uses message triggers

`appointment-confirm-sms` end-to-end:

1. Builder installs CRM + Cal.diy + SMS blocks; binds Twilio number to workspace.
2. Builder publishes the archetype (CLI, since no UI per §10).
3. SLICE 7's materializer writes `messageTriggers` row: `(orgId, agentId, channel:"sms", channelBinding:{kind:"any"}, pattern:{kind:"exact", value:"CONFIRM"})`.
4. Patient texts "CONFIRM" to the workspace's Twilio number.
5. Twilio POST → `/api/webhooks/twilio/sms` → existing pipeline runs → `dispatchMessageTriggers` invoked.
6. Dispatcher: matches the trigger, inserts `messageTriggerFires` row (dedup), calls `startRun(orgId, archetypeId, spec, triggerEventId, triggerPayload)`.
7. Run executes: lookup pending booking → branch → confirm/no-pending path → reply via `send_sms`.
8. Reply goes out as a normal `smsMessages` row with `direction='outbound'`. Loop guard records it.
9. Patient receives reply; thread state in `conversation_turns` reflects both inbound and outbound.

### 12.2 Observability through `/agents/runs`

- Each trigger fire creates a `workflow_runs` row visible at `/agents/runs`.
- New event types emitted: `workflow.message.matched` (per fire), `workflow.message.dispatch_failed` (on dispatcher failure), `workflow.message.skipped` (with reason: `loop_guard | already_fired | no_match`).
- Existing `/agents/runs` page renders these without UI changes (verified §2.8).

### 12.3 How webhook receivers integrate with API route patterns

- SLICE 7 does **not** create new top-level routes for SMS — extends the existing `/api/webhooks/twilio/sms` handler with a single insertion (§4.1).
- If G-7-2 ever revisits to **add email**, new route `/api/webhooks/<provider>/inbound` would mirror Twilio's shape (signature verify → org resolve → dedup → dispatch → 200).
- `dispatchMessageTriggers` is a library function, not a route — keeps the dispatch logic testable in isolation and reusable across channels.

---

## §13 Calibration methodology summary

Per CLAUDE.md and L-17 lineage:

- **Architectural multiplier:** dispatcher-heavy slice → 1.7-2.0x per L-17 dispatcher addendum.
- **Cross-ref Zod edge-count scaling:** 5 edges interpolated → 2.5-3.0x band; 4-datapoint stability check at close.
- **Dispatcher policy matrix multiplicative:** channel × pattern × loop × dedup → 3.5-4.0x; 2nd datapoint for the rule.
- **Blocked-dep inline budget:** N/A — no blocked dependencies for SLICE 7 (Twilio shipped, conversation runtime shipped, Resend outbound shipped).
- **3-run baseline durability (L-23):** applied prospectively to `appointment-confirm-sms` archetype.
- **Artifact categories:** integration harness (E2E) ~250 LOC, close-out ~150 LOC budgeted separately from code.

---

## §14 Stopping point

Per L-21: audit committed + pushed. **Stop. Wait for Max to resolve gates G-7-1 through G-7-8 + scope envelope decision (single PR with cuts vs 2-PR split) before any code commits.**

If gates resolve to the audit's recommended 2-PR split and Option recommendations:
- **PR 1 LOC:** ~1,800-2,000 (fits under 2,340 trigger comfortably)
- **PR 2 LOC:** ~1,000-1,100 (well under)
- **Combined:** ~2,900 (24% over Max's 2,340 trigger but split below per-PR risk)

If gates resolve differently, audit can be revised in 1-2 rounds before code starts.

---

## Appendix A — Audit-time deviations from Max's pre-audit framing

1. **No `manual` trigger branch exists.** Max's spec implied "after SLICE 5: event + schedule + manual." Ground-truth confirms only `event + schedule`. Manual was never shipped. SLICE 7 adds `message` as the 3rd branch; if `manual` is needed, it's a separate slice.
2. **`sms.replied` event already fires on inbound.** Max's framing assumed message triggers would be the *first* place inbound SMS becomes visible. Actually, the existing webhook already emits `sms.replied`. Builders can already author event-triggered agents listening to `sms.replied` today — but per §1.3, that path lacks pattern matching, channel binding, and loop prevention as first-class concerns.
3. **Conversation runtime is fully shipped and already wired into inbound SMS.** Substantially reduces the runtime work in §5; agents inherit thread context for free.
4. **Inbound email infrastructure does not exist.** Max's framing treated SMS and email symmetrically. Ground-truth: SMS is shipped; email is greenfield. G-7-2 Option A defers email to its own slice.
5. **Pattern matching has zero existing utilities to reuse.** Max's framing left this open; ground-truth confirms net-new.
6. **STOP keyword handling already runs *before* trigger dispatch could fire.** Compliance posture is structural, not a SLICE 7 concern. (Risk register §11 still notes for completeness.)

These deviations explain why the audit's LOC projection materially exceeds Max's pre-audit estimate while still ground-truth-justified.
