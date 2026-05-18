# Messaging Layer — Plan

**Status:** Design draft. Not implemented. Operator approval required before any code lands.

**Author:** 2026-05-18 round of operator feedback on `/emails`, transactional confirmations, SMS, and operator-branded sends.

---

## What the operator asked

1. How does the Kit / Mailchimp / Beehiiv "Connect" button on `/emails` actually wire up? When a new lead comes in via an intake form or booking, is the contact pushed to the operator's list?
2. When a customer books on the public booking page, how does the operator send them a transactional confirmation email **from the operator's branding** (not "noreply@seldonframe.com")?
3. SMS via Twilio — how does the operator send confirmations / reminders to customers from their own branded sender (like GoHighLevel does)?

## What already exists (audit, not speculation)

I read the code before writing this plan. The plumbing is mostly there — discoverability and event-wiring are what's missing.

### Email
- **`sendEmailFromApi(orgId, contactId, toEmail, subject, body, provider?)`** in `packages/crm/src/lib/emails/api.ts` is the single send path. It:
  - Checks suppression list per workspace
  - Resolves the operator's Resend config via `loadLiveResendConfig(orgId)` — uses **the operator's API key + from-address**, NOT a SF default
  - Routes through `resolveResendConfig` which honours test-mode for sandbox routing
  - Inserts an `emails` row (status=queued)
  - Hands off to the Resend provider implementation in `lib/emails/providers/resend.ts`
  - Tracks opens via a 1x1 pixel at `/api/email/open/<id>`
- Templates live in `packages/crm/src/db/schema/emails.ts` → `email_templates`. CRUD is wired through `lib/emails/actions.ts`.
- Triggered sends already exist for one event: `sendTriggeredEmailsForContactEvent({ eventType, contactId })` runs templates whose `triggerEvent` matches. The handler is registered, but **no triggers are currently emitted from the booking / intake paths**.

### SMS
- Provider abstraction at `packages/crm/src/lib/sms/providers/{interface,twilio,index}.ts` matches the email provider shape exactly. Twilio's `sendSms({ accountSid, authToken, fromNumber, toNumber, body })` is the implementation.
- Per-workspace config lives in `organizations.integrations.twilio = { accountSid, authToken, fromNumber, connected }` — already in the schema.
- **What's missing**: an `sms_messages` listing UI, a templating layer parallel to email templates, and trigger wiring.

### Newsletter sync
- `lib/integrations/newsletter-sync.ts` exists with Kit / Mailchimp / Beehiiv branches.
- **It's already wired**: `lib/events/listeners.ts` calls `syncContactToNewsletter({ contactId })` on `contact.created`. So when an intake submission lands or a booking creates a contact, the Kit / Mailchimp / Beehiiv sync fires automatically (no-op if not connected). This already works; the operator just didn't know.

### Events
- `emitSeldonEvent` + the `bus.on(...)` listener pattern is consistent. Today's emitters:
  - `contact.created` — public intake POST, manual create, booking-creates-contact
  - `booking.created` / `.completed` / `.cancelled` / `.no_show` / `.rescheduled`
- Today's only listener that does customer-facing messaging: `syncContactToNewsletter` on `contact.created`. No email or SMS trigger fires on `booking.created`.

## Diagnosis

- **Newsletter sync works today** — operator hooks up Kit key in `/emails`, every new intake submission / booking-created-contact lands in their list automatically. Just needs surfacing in the UI ("Kit will receive every new lead automatically once connected").
- **Transactional email from the operator's branding works mechanically** — `sendEmailFromApi` already pulls the operator's Resend config. But no event listener fires `sendEmailFromApi` on `booking.created`, so booking confirmations never actually send.
- **SMS has the same gap**: provider + config exist; no event listener fires `sendSmsFromApi` on `booking.created`.
- **Operator can't see / edit the templates** these triggers would use because the trigger layer doesn't exist yet.

## Proposed architecture

> **Karpathy frame:** thin harness + fat skills. The dispatch loop stays small and stable. Each customer-facing message (booking confirmation, intake auto-reply, reminder, follow-up) is a **skill markdown file** that operators can edit, that pulls in the operator's voice + facts, and that lets the LLM compose the actual message at send time. As Claude improves, the messages improve — no code change.

```
event (booking.created)
  → MessageRouter (thin harness)
    → load TriggerRule rows for this event
    → for each rule:
      → load SKILL.md (e.g. skills/messaging/booking-confirmation/SKILL.md)
      → render skill prose with operator context (soul + facts + booking data)
      → LLM composes final email body / SMS body
      → sendEmailFromApi() or sendSmsFromApi() with operator's Resend / Twilio config
      → log into messages table for audit + retry
```

### Three new tables (one migration)

```sql
-- message_triggers: which event → which skill, per workspace
-- (operator can disable a default skill or add custom ones)
CREATE TABLE message_triggers (
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,           -- 'booking.created', 'intake.submitted', ...
  channel TEXT NOT NULL,              -- 'email' | 'sms'
  skill_id TEXT NOT NULL,             -- 'booking-confirmation', 'intake-auto-reply', ...
  delay_minutes INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  custom_skill_md TEXT,               -- operator override of the platform skill, same pattern as agents.blueprint.customSkillMd
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- message_sends: audit log of every customer-facing send
CREATE TABLE message_sends (
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  trigger_id UUID REFERENCES message_triggers(id) ON DELETE SET NULL,
  channel TEXT NOT NULL,              -- 'email' | 'sms'
  event_type TEXT NOT NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  to_address TEXT NOT NULL,           -- email OR phone, stored verbatim
  subject TEXT,                       -- nullable for SMS
  body TEXT NOT NULL,                 -- final composed message
  status TEXT NOT NULL,               -- 'queued' | 'sent' | 'failed' | 'suppressed'
  external_message_id TEXT,           -- Resend message id / Twilio sid
  error TEXT,
  sent_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- message_skill_versions: every operator edit bumps a version (rollback-safe)
CREATE TABLE message_skill_versions (
  id UUID PRIMARY KEY,
  trigger_id UUID NOT NULL REFERENCES message_triggers(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  custom_skill_md TEXT NOT NULL,
  edited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  edited_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(trigger_id, version)
);
```

### Skill registry (the fat part)

Following the pattern we shipped for agent skills in Phase 4 + Phase 6.

```
packages/crm/src/lib/messaging/skills/
├── registry.ts                          # Lists default skills per event
├── booking-confirmation/
│   ├── SKILL.md                         # The prompt operators edit
│   └── index.ts                         # Exports the SKILL.md as a string
├── booking-reminder-24h/
├── booking-cancellation/
├── intake-auto-reply/
├── intake-followup-3d/                  # SMS day-3 nudge if no reply
└── missed-call-text-back/               # Already exists as an agent skill — reuse
```

Each `SKILL.md` is operator-readable markdown with `{{placeholder}}` slots the harness fills:

```markdown
## When this fires
A customer just booked an appointment with {{businessName}}.

## Tone
{{voice}}

## Required content
- Confirm the appointment (date + time in {{timezone}})
- Include the calendar add-to-calendar link if available
- Mention how to reschedule or cancel
- Sign off as {{businessName}}, not as SeldonFrame

## Forbidden content
- Never mention "Seldon" or "SeldonFrame"
- Never invent pricing not in the booking metadata

## Available data
- Booking title: {{bookingTitle}}
- Starts at: {{startsAt}}
- Booking page URL: {{bookingPageUrl}}
- Contact first name: {{contactFirstName}}
```

The harness:
1. Reads the skill markdown.
2. Substitutes `{{...}}` slots from the operator's soul + the event payload.
3. Asks the operator's LLM (using their own Anthropic key — same path as the chatbot) to produce the final message.
4. Validates: must be plaintext (no markdown markers), must not contain "Seldon", must be under length cap (sms=320 chars, email=2000 chars).
5. Sends via `sendEmailFromApi` / `sendSmsFromApi`.

### Default triggers seeded per workspace

When a new workspace is created (via the `runCreateFromUrl` path), seed these triggers enabled by default:

| Event | Channel | Skill | Delay |
| ----- | ------- | ----- | ----- |
| `booking.created` | email | booking-confirmation | 0 min |
| `booking.created` | sms | booking-confirmation-sms | 0 min |
| `booking.created` | email | booking-reminder-24h | 1380 min (23h) |
| `booking.cancelled` | email | booking-cancellation | 0 min |
| `intake.submitted` | email | intake-auto-reply | 0 min |
| `intake.submitted` | sms | intake-auto-reply-sms | 0 min |

Operators can disable any of these per workspace via `/automations` (renamed from the current `/automations` shell if needed).

### `/emails` page rework

Today the page mixes three concerns into one:
1. Connect newsletter providers (Kit / Mailchimp / Beehiiv) — kept
2. Connect Resend for transactional — kept
3. Email templates — repurpose as the **trigger editor** (above)

Layout:

```
EMAIL
├── Transactional triggers
│   ├── booking.created → confirmation (Enabled)         [Edit skill]
│   ├── booking.created → reminder 24h (Enabled)         [Edit skill]
│   └── intake.submitted → auto-reply (Enabled)          [Edit skill]
│
├── Newsletter sync
│   ├── Kit (Connected)         Every new lead lands in your list automatically.
│   ├── Mailchimp (Not connected)
│   └── Beehiiv (Not connected)
│
├── Transactional provider
│   └── Resend (Connected, sends from no-reply@hvac.com)
│
└── Sent log (replaces "Sent" tab)
    └── Last 50 sends with status + retry button
```

Clicking "Edit skill" opens the same in-place editor pattern we shipped in Phase 4 + 6 for agent SKILL.md — pre-fills with the platform default rendered for this workspace, operator edits the lines they care about, save persists `custom_skill_md`. "Platform default" / "Customized" chip + "Reset to default" button.

### `/sms` page (new, mirrors `/emails`)

Same shape. Twilio connect block, trigger list, sent log.

### Reuse existing infrastructure

- `sendEmailFromApi` — already routes through operator's Resend ✓
- `sendSmsFromApi` — needs to exist with the same shape (route through operator's Twilio) — small adapter, the provider interface is already there
- `lib/agents/skills/registry.ts` `composeDefaultSkillMd` pattern — copy verbatim for `lib/messaging/skills/registry.ts`
- `customSkillMd` blueprint pattern from Phase 4 — copy for `message_triggers.custom_skill_md`
- Event bus from `lib/events/` — already emits all the events we need

## Why this is antifragile to LLM upgrades

- The harness (event dispatch, provider routing, suppression, audit log) is ~300 LoC and never changes.
- Each message is composed by the LLM at send time from a skill that's plain prose.
- Better LLM → better wording, more natural tone-matching → same code.
- Operator edit → improves their voice → no engineer involvement.
- No prompt-engineering buried in TypeScript files.

## What this is NOT

- **Not a workflow builder.** Each trigger does one thing (send a message). If operators want branching ("if customer doesn't reply in 3 days, send SMS"), that's a follow-up — add a `delay_minutes` ladder + a `parent_trigger_id` self-reference. Day-1 is one trigger = one send.
- **Not multi-channel orchestration.** Email and SMS are separate triggers. They can both fire on the same event; we don't deduplicate.
- **Not a CRM-grade campaign tool.** No A/B testing, no sequences, no segmentation. Those belong in the newsletter tool (Kit / Mailchimp), which is what the integration is for.

## Comparison to GoHighLevel

GHL's "workflows" are a more elaborate version of this — drag-and-drop sequences with conditions, delays, branches, tags. SF's bet (per CLAUDE.md): operators don't need that complexity, and what they DO need is a chatbot that handles the inbound + a few sensible default triggers for the outbound transactional moments. If we discover operators are recreating GHL workflows in their heads, we can ladder up — the `message_triggers` table is workflow-shaped enough that a chain would be a parent_id self-reference + ordering field.

## Rollout

1. **Slice 1 — Surface what already works.** Update `/emails` copy to say "Kit will receive every new lead automatically once connected" (with a sample contact preview if there's data). No new tables. Estimated 1 day.
2. **Slice 2 — Booking confirmation email.** New `message_triggers` table, single default trigger (`booking.created → booking-confirmation`), single skill, single send path. No editor UI yet — uses platform default verbatim. Wire `bus.on('booking.created')` → dispatch. Estimated 2-3 days.
3. **Slice 3 — Editor UI.** Reuse the agent-blueprint editor shape from Phase 4 + 6. Per-trigger SKILL.md editor with the same "Platform default / Customized / Reset" chip pattern. Estimated 1-2 days.
4. **Slice 4 — SMS parallel.** `sms_send_from_api` adapter, default booking-confirmation-sms trigger, Twilio config UI on `/sms` page. Estimated 2-3 days.
5. **Slice 5 — Remaining default triggers.** Intake auto-reply, reminder 24h, cancellation. Estimated 1-2 days.

Total: ~2 weeks of focused work, very low blast radius (each slice ships independently).

## Open questions for the operator

1. **Branding fallback** — when an operator hasn't connected Resend, do we (a) silently skip the send, (b) send from a SeldonFrame default `no-reply@<workspace>.app.seldonframe.com` address, or (c) block booking creation until Resend is connected? My recommendation: (b) for the first 30 days, then nag, then (a). Less abandonment risk.
2. **Voice** — should the LLM always compose, or should we offer a "use template literally" toggle for operators who want exact-match copy across every send (e.g., legal disclaimer requirements)?
3. **SMS opt-in** — TCPA / A2P 10DLC compliance means we need explicit opt-in language somewhere. Where does it live — booking page footer, intake form checkbox, both? This isn't a code question; it's a product / compliance question.

---

End of plan. No code lands until the above is approved.
