# Phase 3 — Email kickoff audit

**Date:** 2026-04-20
**Slice:** 3.a
**Blocker for:** 3.b–3.j
**Output:** this doc (no code)

---

## Question 1 — What already exists?

### DB
- **`emails` table** (`packages/crm/src/db/schema/emails.ts`) — full-featured row: `orgId`, `contactId`, `userId`, `provider`, `from/to`, `subject`, `bodyText`, `bodyHtml`, `status`, `externalMessageId`, `openCount`, `clickCount`, `sentAt`, `openedAt`, `lastClickedAt`, `metadata`. Three indexes. Covers transactional send needs as-is.
- **`organizations.settings.emailTemplates` JSONB** — templates live inside the org's `settings` bag, not a separate table. `extractEmailTemplates()` merges root + soul-package templates. Works fine for v1; no need to normalize to a `email_templates` table (deferred per YAGNI).
- **`organizations.integrations.resend.apiKey`** — per-workspace BYO Resend key, optionally AES-encrypted with `v1.` prefix (per `lib/encryption.ts`).

### Server
- **`lib/emails/actions.ts`** — 812 LOC. Core `sendEmailForOrg()` handles: provider resolve, tier limit check, DB insert, tracking-pixel injection, Resend fetch, DB update with `externalMessageId`, `email.sent` event, activity timeline entry, learning record, usage increment, webhook dispatch. `sendEmailTemplateToContactAction`, `sendWelcomeEmailForContact`, `sendTriggeredEmailsForContactEvent`, `markEmailOpenedAction`, `markEmailClickedAction` all present.
- **`lib/emails/providers.ts`** — thin resolver that picks from `["resend", "sendgrid", "postmark"]` based on `findAdapterById(...).isConfigured()`. No actual send implementation here — Resend fetch is inline in `actions.ts::sendViaResend`.
- **`lib/emails/templates.ts`** — `renderPlainEmailTemplate({heading, body, ctaLabel?, ctaHref?})` → `{html, text}`. Simple dark-theme wrapper.
- **Tracking pixel endpoint** — `/api/email/open/[emailId]` fires `markEmailOpenedByPixelAction`.
- **Event bus** — `lib/events/bus.ts` wraps `@seldonframe/core/events` `InMemorySeldonEventBus`. Already supports `email.sent`, `email.opened`, `email.clicked`.

### UI
- **`components/emails/email-page-content.tsx`** — dashboard email page (list + templates).

### NextAuth vs per-workspace Resend
- **Coexist cleanly**, question answered. `resolveResendApiKey(orgId)` reads workspace key first, falls back to `process.env.RESEND_API_KEY` (NextAuth's magic-link key). Different env vars, different code paths, same SDK/HTTP surface. No conflict at runtime.

---

## Question 2 — What's missing for Phase 3?

| Piece | Status | Notes |
|---|---|---|
| `email_events` table | missing | Raw provider webhook events for audit + dashboarding |
| `conversations` table | missing | Multi-turn stateful conversations, shared by email + SMS |
| `conversation_turns` table | missing | Individual message turns within a conversation |
| `suppression_list` table | missing | Per-org opt-out list, checked pre-send |
| `email.delivered` event | missing | From Resend webhook |
| `email.bounced` event | missing | From Resend webhook |
| `email.replied` event | missing | Inbound reply (nice-to-have, aliased reply-to) |
| `email.suppressed` event | missing | Emitted when pre-send hook skips |
| `conversation.turn.received` event | missing | Runtime emits on incoming |
| `conversation.turn.sent` event | missing | Runtime emits on outgoing |
| Clean provider abstraction | partial | `providers.ts` resolves but doesn't send. Refactor `sendViaResend` into `providers/resend.ts` with an `EmailProvider` interface |
| Suppression pre-send hook | missing | Every `sendEmailForOrg` call must check the list first |
| Resend webhook receiver | missing | `/api/webhooks/resend` — verifies signature, emits `email.*` events |
| Conversation Primitive runtime | missing | `lib/conversation/runtime.ts`, ~400 LOC, channel-agnostic (email + SMS) |
| MCP tools | missing | `send_email`, `list_emails`, `get_email`, `suppress_email`, `unsuppress_email`, `list_suppressions`, `send_conversation_turn` |
| `email.block.md` | missing | New block metadata file w/ Phase 2.75 composition contract |
| Compose drawer UI | partial | Dashboard page exists, but no per-contact drawer with Soul-aware template picker |
| Per-contact email thread view | missing | Already have `activities` entries but not a threaded view grouped by conversation |
| Suppression list manager | missing | Settings surface for viewing/editing the list |
| Resend integration card | partial | `organizations.integrations.resend` stored, but no visible `/settings/integrations` card showing status |

---

## Question 3 — Reuse vs rebuild decisions

- **`emails` table:** **KEEP as-is.** Covers v1 needs.
- **`sendEmailForOrg`:** **EXTEND** — insert suppression-hook call before DB insert, emit `email.suppressed` on skip.
- **`providers.ts`:** **REFACTOR** — extract `sendViaResend` from `actions.ts` into `providers/resend.ts`, define `EmailProvider` interface with `send({from, to, subject, html, text})` → `{externalMessageId}`.
- **`email.sent/opened/clicked` events:** **KEEP.** Adding five more (`delivered`, `bounced`, `replied`, `suppressed` + the two `conversation.turn.*`).
- **`email_templates` table:** **DEFER.** Org-settings JSONB works for v1; migration to a normalized table is future work.
- **Tracking pixel:** **KEEP.** Default-on per phase design.

---

## Slicing decisions

The original 10-slice breakdown stands but 3.d is a refactor (not net-new) and 3.b only adds 4 tables (not 5 — `email_events` + `conversations` + `conversation_turns` + `suppression_list`). `email_templates` deferred per above.

**Proceed to 3.b** — schema migration for the 4 new tables.
