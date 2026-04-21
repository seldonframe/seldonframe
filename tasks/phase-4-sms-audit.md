# Phase 4 — SMS kickoff audit

**Date:** 2026-04-21
**Slice:** 4.a
**Output:** this doc (no code)

---

## Question 1 — What already exists?

### DB
- **No `sms_messages` or `sms_events` tables.** Greenfield schema work.
- **`conversations` + `conversation_turns`** exist from Phase 3.b. Both tables have a `channel` column that already accepts `"sms"` — zero migration needed.
- **`suppression_list`** exists but is keyed on `email` string. SMS opt-outs need a phone-number equivalent — either reuse this table with a `channel` column, or introduce a parallel `sms_suppression` table. Decision below.

### Config
- **`organizations.integrations.twilio`** stores `{accountSid, authToken (encrypted), fromNumber, connected}`. `testTwilioConnectionAction` already hits Twilio's `/Accounts/{sid}.json` endpoint to verify. The `/settings/integrations` Twilio card is already built.

### Runtime
- **`lib/conversation/runtime.ts::handleIncomingTurn`** is channel-agnostic. Pass `channel: "sms"` today and it works — the system-prompt path already has SMS-specific guidance (≤320 chars, no subject line). Phase 4 requires zero changes to the runtime itself.
- **MCP tool `send_conversation_turn`** already accepts `channel: "sms"` and will route an incoming SMS through the runtime the same way email goes.

### Events
- **No `sms.*` events in the `SeldonEvent` union.** Needs `sms.sent`, `sms.delivered`, `sms.replied`, `sms.failed`.
- `conversation.turn.received` / `conversation.turn.sent` already support `channel: "sms"` in their payloads.

### Server
- No Twilio SDK dep — the existing `testTwilioConnectionAction` uses raw fetch. Phase 4 can continue with raw fetch (send POST to `https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json`) — no new npm dep needed. Keeps install surface small.

### UI
- Twilio integration card exists. No compose drawer, no SMS list view, no thread UI yet.

---

## Question 2 — What's missing for Phase 4?

| Piece | Status | Notes |
|---|---|---|
| `sms_messages` table | missing | Mirror of `emails` table shape |
| `sms_events` table | missing | Mirror of `email_events` |
| `sms.sent` / `delivered` / `replied` / `failed` events | missing | Add to `SeldonEvent` union |
| `SmsProvider` interface + `providers/twilio.ts` | missing | Mirror of `EmailProvider` + `providers/resend.ts` |
| Per-workspace Twilio key resolution | partial | Twilio creds already stored; need a `resolveTwilioClient(orgId)` helper parallel to `resolveResendApiKey(orgId)` |
| SMS suppression | missing | Design decision below |
| Twilio inbound webhook `/api/webhooks/twilio/sms` | missing | Verify via `X-Twilio-Signature` HMAC, route through runtime |
| Twilio status webhook (for delivered / failed) | missing | Same endpoint can handle both inbound + status via `MessageStatus` param |
| `sendSmsFromApi` | missing | Parallel to `sendEmailFromApi` in `lib/emails/api.ts` |
| `/api/v1/sms` + `/api/v1/sms/[id]` | missing | Mirror of `/api/v1/emails/*` |
| MCP tools | missing | `send_sms`, `list_sms`, `get_sms`. `send_conversation_turn` already covers multi-turn. |
| `sms.block.md` | missing | Day-1 composition contract |

---

## Question 3 — Design decisions

### Suppression: extend `suppression_list` with a `channel` column, or new table?

**Decision:** Extend `suppression_list`. Add `channel text NOT NULL DEFAULT 'email'` + adjust the unique index to `(org_id, channel, identifier)`, rename `email` → `identifier` conceptually (or add a parallel `phone` column — cleaner).

**Chosen approach (cleanest):** Keep `email` column name, add a nullable `phone` column + a `channel` column, with a CHECK constraint that exactly one of `email` / `phone` is set. Unique index becomes `(org_id, channel, coalesce(email, phone))`.

Rationale: a single table keeps the "do not contact" concept unified (matters for agent reasoning — "has this person opted out of outreach entirely?" is one query, not two). Defer a more elaborate identity-graph approach.

### Phone number storage: raw string or E.164-canonicalized?

**Decision:** Store E.164 (`+15551234567`). Normalize on insert. Twilio returns E.164; we should match.

### Phone-number provisioning

**Decision:** Builder buys numbers directly in Twilio, pastes number + SID into the integration card (already exists). UI wrapping of Twilio's number-search API deferred to Phase 12.

### Webhook URL per workspace

**Decision:** Single shared webhook URL at `/api/webhooks/twilio/sms`. Resolution: the inbound Twilio POST includes `To` (our number) and `From` (sender). We look up which workspace owns the `To` number via `organizations.integrations.twilio.fromNumber`. Matches the email pattern where we use the tagged `email_id` + external id to route.

### Twilio SDK or raw fetch?

**Decision:** Raw fetch. Phase 3 Resend went this way; works fine. Avoids a dep for a single-endpoint integration.

---

## Slicing

Matches the Phase 3 pattern with adjustments:

- 4.b — DB: `sms_messages` + `sms_events` + suppression_list extension for channel
- 4.c — Events: add 4 SMS event types to `SeldonEvent`
- 4.d — Provider: `SmsProvider` interface + `providers/twilio.ts`
- 4.e — Suppression: extend helpers for SMS channel
- 4.f — Twilio webhook receiver (inbound + status callbacks)
- 4.g — Send path: `lib/sms/api.ts::sendSmsFromApi` + `/api/v1/sms`
- 4.h — MCP tools: `send_sms`, `list_sms`, `get_sms`
- 4.i — `sms.block.md` with day-1 composition contract
- 4.j — UI: minimal — Twilio card already exists, add webhook URL hint + suppression page extension to show phone-number opt-outs

**Proceed to 4.b.**
