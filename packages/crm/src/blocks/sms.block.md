---
id: sms
scope: universal
frameworks: agency,coaching,consulting,service,realestate,ecommerce,saas
status: core
---
# BLOCK: SMS

**Description**
Transactional + conversational SMS block. BYOK Twilio. Send one-off texts, route inbound replies through the Conversation Primitive runtime (same module as email), track delivery + failures, and auto-suppress on STOP / carrier permanent-failure codes.

**Behavior**
Two modes share one infrastructure — identical shape to email:
1. **Transactional** — one SMS to one contact, fire-and-forget. Emits `sms.sent` immediately; `sms.delivered` / `sms.failed` arrive via the Twilio status callback.
2. **Conversational** — multi-turn replies routed through `lib/conversation/runtime.ts::handleIncomingTurn` with `channel: "sms"`. The runtime is the same module email uses; no SMS-specific reasoning code exists. Channel-specific tone guidance (≤320 chars, no subject line, plain text) is already baked into the runtime's system prompt.

**Integration Points**
- **CRM** — every outbound send targets a contact by id when known. Inbound webhook resolves contact by phone match against `contacts.phone` (normalized to E.164).
- **Suppression list** (`suppression_list`, channel='sms') — STOP keyword + carrier block 30003/30005/30006 + manual opt-outs all land here. Pre-send hook skips suppressed numbers with `sms.suppressed`.
- **Brain v2** — `sms.sent`, `sms.delivered`, `sms.replied` feed engagement signals.
- **Automations** — node type `send-sms` composes transactional sends; node type `conversation-turn` composes the runtime.
- **Email block** — shares `conversations` + `conversation_turns` tables. Both channels can exist on the same contact concurrently.

---

## Purpose

Give the workspace a second always-on channel — this time one with much higher engagement rates and a much stricter compliance surface. The "speed-to-lead chatbot that actually books the call" agent demo (Corey-Ganim pattern) composes `formbricks-intake.form.submitted` → `sms.send_conversation_turn` → (optionally) `caldiy-booking.booking.created`. That demo is the v1 hero moment; the SMS block is load-bearing for it.

---

## Entities

Minimal canonical set — full schemas in `packages/crm/src/db/schema/{sms-messages,sms-events,suppression-list,conversations,conversation-turns}.ts`.

- **SmsMessage** (`sms_messages`): `direction` (`inbound` | `outbound`), `fromNumber`, `toNumber`, `body`, `status`, `externalMessageId`, `segments`, `errorCode`, `errorMessage`, `sentAt`, `deliveredAt`.
- **SmsEvent** (`sms_events`): `smsMessageId`, `eventType`, `provider`, `providerEventId` (unique for idempotency), `payload`.
- **Conversation** + **ConversationTurn** — reused from Phase 3 with `channel: "sms"`. No SMS-specific table.
- **Suppression** (`suppression_list`, `channel='sms'`, `phone` column): `reason` (`manual` | `stop_keyword` | `carrier_block` | `complaint`), `source`.

---

## Events

### Emits (canonical `SeldonEvent` vocabulary)
- `sms.sent` — outbound accepted by Twilio. Payload: `{ smsMessageId, contactId }`.
- `sms.delivered` — Twilio status callback `MessageStatus=delivered`. Payload: `{ smsMessageId, contactId }`.
- `sms.replied` — inbound SMS persisted. Payload: `{ smsMessageId, contactId, conversationId }` (conversationId populated if the runtime opened a thread).
- `sms.failed` — Twilio status callback `MessageStatus=failed|undelivered`, OR synchronous send error. Payload: `{ smsMessageId, contactId, reason }`. Auto-suppresses the number on error codes 30003 / 30005 / 30006.
- `sms.suppressed` — pre-send hook skipped OR STOP keyword received. Payload: `{ phone, reason, contactId }`.
- `conversation.turn.received` — runtime wrote an inbound turn. Payload: `{ conversationId, turnId, contactId, channel: "sms" }`.
- `conversation.turn.sent` — runtime wrote an outbound turn. Payload: `{ conversationId, turnId, contactId, channel: "sms" }`.

### Listens
- `form.submitted` — speed-to-lead flow: immediately text the submitter with a qualifying question.
- `booking.created` — appointment confirmation + reminder.
- `deal.stage_changed` — optional stage-transition outreach.

---

## Composition Contract

Machine-readable contract for Phase 7 agent synthesis.

produces: [sms.sent, sms.delivered, sms.replied, sms.failed, sms.suppressed, conversation.turn.received, conversation.turn.sent]
consumes: [workspace.soul.business_type, workspace.soul.tone, workspace.soul.mission, workspace.soul.offer, contact.id, contact.phone, contact.firstName]
verbs: [text, sms, message, reply, chat, qualify, speed to lead, follow up, reminder, confirm, book via text]
compose_with: [crm, formbricks-intake, caldiy-booking, email, automation, brain-v2, payments]

---

## Notes for agent synthesis

Compliance comes first: STOP keyword handling is **not optional**. The webhook receiver enforces it; agents must never attempt to re-engage a STOP-responded number. Check `list_sms_suppressions` before proposing any SMS sequence so synthesis doesn't design a flow that will be silently skipped.

Prefer SMS over email for any interaction where response-time matters (speed-to-lead, appointment reminders, booking confirmations). Prefer email over SMS for content-heavy sends (newsletters, long explanations, attachments — SMS has no attachment support here). When composing agents that route between channels, the Conversation Primitive runtime handles both — a thread can start via form intake, reply via SMS, continue via email when the contact engages with a link, all on the same `conversations` row with channel-switched turns.

Twilio segment count (`segments` column on `sms_messages`) is populated from the API response. Each segment is independently billed by Twilio. Keep generated replies under 160 chars when cost matters; the runtime's SMS system prompt already enforces ≤320 chars as a soft upper bound.

---

## Navigation

- `/sms` — dashboard list + send surface (deferred; use MCP `send_sms` + `list_sms` for v1)
- `/contacts/[id]` — per-contact SMS thread appears in the shared conversation view
- `/settings/integrations/twilio` — Twilio connection card + webhook URL
- `/settings/suppression` — email suppression list (SMS-side UI deferred; `list_sms_suppressions` covers v1)
