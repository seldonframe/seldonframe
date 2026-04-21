---
id: email
scope: universal
frameworks: agency,coaching,consulting,service,realestate,ecommerce,saas
status: core
---
# BLOCK: Email

**Description**
Transactional + conversational email block. BYOK Resend (with NextAuth owner-key fallback for platform sends). Send one-off emails, route inbound replies through the Conversation Primitive runtime, track opens/clicks/bounces, and auto-suppress hard bounces + complaints.

**Behavior**
Two modes share one infrastructure:
1. **Transactional** — one email to one contact, fire-and-forget. Template variables from Soul + contact context. Emits `email.sent` and, via the Resend webhook, `email.delivered` / `email.opened` / `email.clicked` / `email.bounced`.
2. **Conversational** — multi-turn replies routed through `lib/conversation/runtime.ts::handleIncomingTurn`. The runtime is channel-agnostic; Phase 4 SMS reuses it verbatim.

**Integration Points**
- **CRM** — every send targets a contact (`contact_id`) for threading + activity timeline. Outbound emails create an `activity` row of type `email`.
- **Suppression list** (`suppression_list`) — pre-send hook skips if the recipient is opted out; emits `email.suppressed` with reason.
- **Brain v2** — `email.sent`, `email.opened`, `email.replied` feed learning signals for deliverability + engagement scoring.
- **Formbricks intake** — `form.submitted` can trigger a templated transactional send via the `triggerEvent` column on `email_templates`.
- **Automations** — node type `send-email` composes transactional sends; node type `conversation-turn` composes the runtime for chat-style follow-up.

---

## Purpose

Give a workspace a real outbound channel with real deliverability signals, and a real inbound channel that can actually reason about what came in. Without this block, every other block is "collect + display but never respond." With it, agents composed in Phase 7 can close the loop — qualify a form submission, nudge a stalled deal, answer a booking question.

---

## Entities

Minimal canonical set — full schemas in `packages/crm/src/db/schema/{emails,email-events,conversations,conversation-turns,suppression-list}.ts`.

- **Email** (`emails`): `fromEmail`, `toEmail`, `subject`, `bodyHtml`, `bodyText`, `status`, `externalMessageId`, `openCount`, `clickCount`, `sentAt`, `openedAt`, `lastClickedAt`.
- **EmailEvent** (`email_events`): `emailId`, `eventType`, `provider`, `providerEventId` (unique for idempotency), `payload`.
- **Conversation** (`conversations`): `contactId`, `channel` (`email` | `sms`), `status` (`active` | `closed` | `paused`), `subject`, `assistantState` (JSONB, runtime-maintained memory), `lastTurnAt`.
- **ConversationTurn** (`conversation_turns`): `conversationId`, `direction` (`inbound` | `outbound`), `channel`, `content`, `emailId?`, `smsMessageId?`, `metadata`.
- **Suppression** (`suppression_list`): `email`, `reason` (`manual` | `unsubscribe` | `bounce` | `complaint`), `source`.

---

## Events

### Emits (canonical `SeldonEvent` vocabulary)
- `email.sent` — outbound email accepted by the provider. Payload: `{ emailId, contactId }`.
- `email.delivered` — provider confirmed delivery via webhook. Payload: `{ emailId, contactId }`.
- `email.opened` — tracking pixel hit OR webhook `email.opened`. Payload: `{ emailId, contactId }`.
- `email.clicked` — tracked link hit OR webhook `email.clicked`. Payload: `{ emailId, contactId, url }`.
- `email.bounced` — hard bounce or complaint. Payload: `{ emailId, contactId, reason }`. Auto-suppresses the address.
- `email.replied` — reply to a trackable alias (nice-to-have). Payload: `{ emailId, contactId, conversationId }`.
- `email.suppressed` — pre-send hook skipped. Payload: `{ email, reason, contactId }`.
- `conversation.turn.received` — runtime wrote an inbound turn. Payload: `{ conversationId, turnId, contactId, channel }`.
- `conversation.turn.sent` — runtime wrote an outbound turn. Payload: `{ conversationId, turnId, contactId, channel }`.

### Listens
- `form.submitted` — triggered-template flow via `sendTriggeredEmailsForContactEvent`.
- `booking.created` — workspace-owner-configured confirmation template.
- `deal.stage_changed` — optional stage-transition outreach (automation).

---

## Composition Contract

Machine-readable contract for Phase 7 agent synthesis.

produces: [email.sent, email.delivered, email.opened, email.clicked, email.bounced, email.replied, email.suppressed, conversation.turn.received, conversation.turn.sent]
consumes: [workspace.soul.business_type, workspace.soul.tone, workspace.soul.mission, workspace.soul.offer, contact.id, contact.email, contact.firstName]
verbs: [send, email, reply, notify, message, conversation, qualify, nurture, reach out, speed to lead, follow up, welcome]
compose_with: [crm, caldiy-booking, formbricks-intake, sms, automation, brain-v2, payments]

---

## Notes for agent synthesis

When an agent needs to "send an email" in response to a trigger, compose `email.block` after the trigger-emitting block (`formbricks-intake.form.submitted`, `caldiy-booking.booking.created`, `crm.deal.stage_changed`, etc.). Prefer template-driven sends for repeatable outreach — store templates on `organizations.settings.emailTemplates` with a `triggerEvent` field so the event bus fan-out handles routing. For multi-turn reasoning ("answer the prospect's question, then book a call"), compose through `send_conversation_turn` which uses the Conversation Primitive runtime and shares state with Phase 4 SMS.

Always check the suppression list before a manual send (the pre-send hook does this automatically, but agents should consult `list_suppressions` when generating outreach strategy to avoid proposing a sequence to addresses that will be skipped).

---

## Navigation

- `/emails` — dashboard send + template management
- `/emails/compose` — compose drawer (per-contact, Soul-aware template picker)
- `/contacts/[id]` — per-contact thread view (Phase 3.j)
- `/settings/integrations/resend` — Resend connection card + webhook URL
- `/settings/suppression` — suppression list manager
