# Messaging Layer — Plan

**Status:** v2 — operator approved 2026-05-18. Implementation underway, slice-by-slice.

**Author:** 2026-05-18 round of operator feedback on `/emails`, transactional confirmations, SMS, and operator-branded sends. Revised after researching what SMB operators actually love + hate about GoHighLevel's communication tools (see "Competitive read" section below).

## Decisions locked 2026-05-18

| Open question | Decision |
| ------------- | -------- |
| Resend not connected → what happens to confirmation email? | Send from default `no-reply@<slug>.app.seldonframe.com`. Operator gets a nag in the dashboard. After 30 days nag becomes a hard banner. |
| AI auto-reply scope on inbound SMS? | **Intent-gated.** FAQ / pricing / scheduling intents auto-reply 24/7. Anything ambiguous (complaints, unclear asks) lands in the operator inbox without an auto-response. |
| Inbound SMS routing across multiple client workspaces? | **Dedicated Twilio number per workspace.** Cleanest disambiguation; agency passes ~$1/mo cost through. |
| A2P 10DLC compliance walkthrough surfacing? | **Inline banner on first non-test send.** Operator self-serves with trial numbers until they hit a real send, then we walk them through Twilio brand+campaign registration. |

---

## Competitive read — what SMB operators love + hate about GHL

### Loved (we need parity or beat-by-design on these)
- **Two-way conversational texting.** When leads reply to an SMS, the reply lands in a unified inbox tied to the contact. No "no-reply wall." This is the #1 raved feature.
- **AI agents that respond 24/7.** Lead texts "what's your pricing?" at 2 AM → instant qualified response + appointment slot offered.
- **Personalization via merge fields.** "Hi {{first_name}}, your {{last_service}} is due for maintenance" feels tailor-made even in bulk.
- **Multi-channel in one trigger.** Welcome email at 0min, SMS reminder at day-3, follow-up email at day-5 — all wired together.
- **Appointment reminders.** Day-before + hour-before SMS drastically reduces no-shows for service businesses.
- **Trust-Center walkthrough for A2P 10DLC compliance.** Carriers need brand + campaign registration; "one missing line = rejection" is a real failure mode.

### Hated (we can beat by design)
- **Shared-IP email deliverability.** GHL's default IP pool puts operator emails in spam even with SPF/DKIM/DMARC. Operators end up webhooking to Postmark via Make. **BYOK Resend (operator's own domain + key) sidesteps this entirely.**
- **Cluttered UI + steep learning curve.** "So much inside" — drag-and-drop builder, custom values, snapshots, etc. Operators get lost.
- **SMS compliance confusion.** "What does the toggle actually do" — opt-in rejections happen frequently.
- **Generic blasts → high opt-out rates.** Without personalization the unsubscribe rate kills the list.

### What we should bet against
- Building a drag-and-drop workflow builder. It's IN the "hated" list. SF's bet: excellent defaults + SKILL.md prose edits = covers 80% of cases without the visual builder cognitive load.
- Trying to manage shared sender infrastructure. BYOK means we never touch the deliverability hot potato.

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
- `workflow_runs` + `workflow_waits` + `workflow_event_log` tables — already in schema; can carry delayed sends (reminder 24h before booking) without a new scheduler

## Inbound message handling — two-way conversations

> **Why this is here and not deferred:** the GHL research shows two-way SMS is the #1 raved feature. Shipping reminders without inbound handling means the customer texts back "can we move it to 3pm?" and gets silence. Worse than no reminder.

### Twilio inbound webhook

Twilio sends inbound SMS to a configured webhook. Today we don't have one for customer-to-operator messages (the existing `lib/sms/` plumbing is outbound-only). New route:

```
POST /api/v1/sms/inbound          (Twilio webhook target)
  ├── verify Twilio signature
  ├── match the from-number to a contact in any workspace
  │      (phone is workspace-scoped; resolve via contacts.phone)
  ├── insert into customer_threads / customer_messages (new tables)
  ├── if STOP / UNSUBSCRIBE / END → add to suppression list + ack
  ├── if HELP → reply with operator's support info
  ├── otherwise → emit("customer_message.received", ...) so the
  │      website-chatbot agent (or its SMS-archetype sibling) can
  │      compose an answer using the operator's SKILL.md
  └── return TwiML acknowledgment
```

Inbound email is a separate problem (IMAP / Resend webhooks). Out of scope for slice 1; revisit when SMS works.

### Tables for two-way threads

```sql
CREATE TABLE customer_threads (
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  channel TEXT NOT NULL,            -- 'sms' | 'email'
  customer_address TEXT NOT NULL,   -- phone or email
  last_message_at TIMESTAMP NOT NULL DEFAULT NOW(),
  unread_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',  -- 'open' | 'snoozed' | 'archived'
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE customer_messages (
  id UUID PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES customer_threads(id) ON DELETE CASCADE,
  direction TEXT NOT NULL,          -- 'inbound' | 'outbound'
  body TEXT NOT NULL,
  sent_by TEXT NOT NULL,            -- 'customer' | 'operator' | 'agent'
  message_send_id UUID REFERENCES message_sends(id) ON DELETE SET NULL,
  external_message_id TEXT,         -- Twilio sid for delivery tracking
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### Unified inbox UI at `/conversations`

A surface that lists every open thread across email + SMS, sorted by `last_message_at`. The website-chatbot agent's existing `/agents/<id>/conversations` route is the same shape — the inbox extends/parallels it. Click a thread → see the back-and-forth, inline reply box (operator types → outbound SMS via Twilio + appended to thread).

When the AI agent has auto-replied to a customer, the thread shows an "AI replied" badge + lets the operator take over. This is the GHL "AI did the heavy lifting, human escalates when needed" pattern.

## Scheduled sends — reminders, follow-ups, delays

> **Without this we can't ship the day-before booking reminder.** Event-bus dispatch is reactive only.

Two paths considered:

**Path A — reuse `workflow_waits`.** The `workflow_runs` + `workflow_waits` tables already exist (SLICE 9 / scope 3 work). On `booking.created` we'd start a workflow run with a wait for `startsAt - 24h`. The existing scheduler wakes it up + fires the next step.

**Path B — new `scheduled_message_sends` table + cron worker.** Simpler shape: insert a row with `fire_at` timestamp, worker polls every minute, dispatches if `now >= fire_at`. Less infrastructure reuse but lower cognitive load.

Recommendation: **Path A** for consistency. The workflow infra already handles retries, observability, and durable state. New messaging triggers just lower themselves into it.

## Compliance — A2P 10DLC + TCPA opt-in + STOP handling

> **Not deferred. Real legal exposure. Three concrete additions:**

### 1. Intake form auto-checkbox
Every workspace's default intake form template gets an opt-in checkbox seeded:

```
[ ] I agree to receive booking confirmations and reminders by SMS
    from {{businessName}}. Reply STOP to unsubscribe. Message and
    data rates may apply.
```

Operator can edit the wording but the checkbox is mandatory if SMS is connected to that workspace. Submitting without checking → no SMS opt-in flag → no SMS triggers fire for that contact (email still works).

### 2. Auto-appended footer
Every outbound SMS gets ` Reply STOP to unsubscribe.` appended at send time if not already present. Counts against the 160-char ceiling for length budgeting.

### 3. STOP / HELP keyword handling
Inbound message route (see above) parses for STOP / UNSUBSCRIBE / END / QUIT / CANCEL → adds to `sms_suppression` (already exists) → replies with confirmation. HELP → replies with workspace name + support URL from soul.

### 4. A2P 10DLC walkthrough docs
A short doc at `/docs/sms-compliance` covering: brand registration, campaign registration, expected approval timeline (5-10 business days), common rejection reasons. Link from `/sms` "Connect Twilio" flow.

## Placeholder catalog

Operators editing SKILL.md need to know what variables exist. Documented inline + surfaced as an "Insert variable" dropdown in the editor:

| Placeholder | Resolves to | Available in |
| ----------- | ----------- | ------------ |
| `{{businessName}}` | soul.businessName | All events |
| `{{businessPhone}}` | soul.phone | All events |
| `{{timezone}}` | organizations.timezone | All events |
| `{{voice}}` | soul.voice.style summary | All events |
| `{{contactFirstName}}` | contacts.firstName | All contact-linked events |
| `{{contactEmail}}` | contacts.email | All contact-linked events |
| `{{contactPhone}}` | contacts.phone | All contact-linked events |
| `{{bookingTitle}}` | bookings.title | booking.* events |
| `{{bookingStartsAt}}` | bookings.startsAt formatted in workspace tz | booking.* events |
| `{{bookingEndsAt}}` | bookings.endsAt formatted in workspace tz | booking.* events |
| `{{bookingDuration}}` | endsAt - startsAt, "30 min" / "1 hour" | booking.* events |
| `{{bookingPageUrl}}` | public `/book/<orgSlug>/<bookingSlug>` URL | booking.* events |
| `{{rescheduleUrl}}` | deep link with booking id | booking.* events |
| `{{customerPortalUrl}}` | `/customer/<orgSlug>` | All contact-linked events |
| `{{intakeFormName}}` | intake_forms.name | intake.* events |
| `{{intakeData.<key>}}` | submitted field value by key | intake.* events |
| `{{lastService}}` | most recent completed booking title for this contact | All contact-linked events |

Editor renders the available list as a sidebar. The LLM at send-time also sees the catalog so it can compose without operator-placed placeholders if needed.

## Unified inbox + agent overlap

The website-chatbot agent (Phase 4 work) already has conversation handling for **web chat**. The same agent should handle **SMS** when the inbound SMS comes from a contact whose workspace has a website-chatbot agent in `status=live`. New agent archetype `sms-conversational-agent` shares the SKILL.md pack with the website-chatbot but adds a "responses must be under 320 chars" hard rule + SMS-shaped greeting.

When the customer's SMS arrives:
1. Insert inbound message into `customer_messages`
2. Look up the workspace's `sms-conversational-agent` (or fall back to the `website-chatbot` agent with an SMS-shaped system prompt prefix)
3. Build conversation context from the last 20 turns in the thread
4. Compose reply via LLM
5. Send outbound SMS via `sendSmsFromApi`
6. Insert outbound message into `customer_messages`
7. Mark thread unread for the operator (they can review + take over)

This is where the antifragile-to-LLM bet pays off most clearly: SMS conversation handling is dominated by composition quality, and the skill pack is the only thing that changes when Claude improves.

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

## Rollout (reordered after competitive read)

1. **Slice 1 — Surface what already works.** Update `/emails` copy to say "Kit will receive every new lead automatically once connected" (with a sample contact preview if there's data). No new tables. **1 day.**
2. **Slice 2 — Email booking confirmation (outbound only).** New `message_triggers` + `message_sends` tables, single default trigger (`booking.created → booking-confirmation`), single skill, single send path. No editor UI yet — uses platform default verbatim. Wire `bus.on('booking.created')` → dispatch via `sendEmailFromApi`. Hard-append the "powered by SeldonFrame" line only if branding tier permits it (white-label hides it). **2-3 days.**
3. **Slice 3 — SMS outbound + compliance.** `sendSmsFromApi` adapter, default `booking-confirmation-sms` trigger, `/sms` settings page (Twilio connect + opt-in copy preview), STOP/HELP handler on inbound, auto-appended STOP footer, intake-form opt-in checkbox seeded into the default template. **3-4 days.** (Compliance work is what makes this slice longer than slice 2.)
4. **Slice 4 — Two-way SMS conversations.** Twilio inbound webhook, `customer_threads` + `customer_messages` tables, unified `/conversations` inbox listing all open threads, inline reply box. The `sms-conversational-agent` archetype + auto-reply path. **4-5 days.** This is where SF starts to outclass GHL on the killer feature.
5. **Slice 5 — Editor UI.** Per-trigger SKILL.md editor mirroring the Phase 4 + 6 agent-blueprint pattern: pre-filled with platform default, "Platform default / Customized / Reset" chip, placeholder catalog dropdown. **2 days.**
6. **Slice 6 — Scheduled reminders.** Wire `workflow_waits` so `booking.created` enqueues a wait for `startsAt - 24h` → fires `booking-reminder-24h` skill. Add the `booking-reminder-1h` skill on the same primitive. **2-3 days.**
7. **Slice 7 — Remaining default triggers.** Intake auto-reply (email + SMS), booking cancellation, intake-followup-3d (silent if customer replies in between). **2 days.**

Total: ~3 weeks. Slices 1-4 deliver the "most-raved GHL features" minus the visual builder. Slices 5-7 round it out.

### Why not in this plan
- **Drag-and-drop workflow builder.** Confirmed against the GHL "hated" list — adds clutter without proportional value for SMB operators. SKILL.md prose edits + a few defaults cover 80% of cases.
- **Conditional branches ("if customer replies in 1h, do X").** Deferred. Workflow_waits + a `parent_trigger_id` self-reference is the future shape; not needed for v1.
- **A/B testing on message variants.** Newsletter tool's job, not ours.
- **Bulk campaigns.** Newsletter tool's job. SF stays transactional + conversational.

## Open questions for the operator

1. **Branding fallback** — when an operator hasn't connected Resend, do we (a) silently skip the send, (b) send from a SeldonFrame default `no-reply@<workspace>.app.seldonframe.com` address, or (c) block booking creation until Resend is connected? My recommendation: (b) for the first 30 days, then nag, then (a). Less abandonment risk.
2. **Voice** — should the LLM always compose, or should we offer a "use template literally" toggle for operators who want exact-match copy across every send (e.g., legal disclaimer requirements)? Recommendation: ship both. Default = LLM compose. Toggle exists for legal use cases. Costs nothing extra.
3. **Trust Center / A2P 10DLC walkthrough** — Twilio brand+campaign registration is a slow async process. Do we (a) build a one-click registration helper that POSTs to Twilio's API on the operator's behalf, (b) just link to Twilio's docs from `/sms` and let operators do it themselves, or (c) wait until first non-test send and surface a banner walking them through? Recommendation: (c) — operators self-serve until they actually try to send to a non-trial number, then we walk them through it inline.
4. **Inbound SMS routing when multiple workspaces share the operator's Twilio number** — agency-managed clients might all use the same Twilio number. We need to disambiguate which workspace's contact a reply belongs to. Probably via per-workspace dedicated subaccount/number rather than shared number routing — but that has cost implications for the agency.
5. **AI auto-reply scope** — when an SMS comes in, the conversational agent could (a) always auto-reply, (b) auto-reply only outside business hours, (c) auto-reply only for FAQ / pricing / scheduling intents and escalate everything else as unread. Recommendation: (c) — matches what operators love about GHL's AI but with sensible defaults that won't accidentally close deals badly.

---

End of plan v2. No code lands until the above is approved.

## Changelog

- **v1 → v2 (2026-05-18 same-day revision)** after researching GHL operator feedback:
  - Added Competitive read section (loved / hated / bet-against)
  - Added Inbound message handling (two-way conversations) as first-class concern (was missing from v1)
  - Added Scheduled sends section using `workflow_waits` infrastructure (v1 had no scheduler primitive)
  - Promoted Compliance from "open question" to a dedicated section with 4 concrete additions (auto-checkbox, footer, STOP/HELP, docs)
  - Added Placeholder catalog table (v1 said "{{placeholder}}" but didn't enumerate)
  - Reordered rollout: SMS + two-way conversations move from "follow-up" to slices 3 + 4 (this is the most-raved GHL feature; can't be deferred)
  - Explicitly rejected drag-and-drop workflow builder in "Why not in this plan" — GHL operators hate the clutter
  - Added two open questions surfaced by the research (Trust Center walkthrough, AI auto-reply scope)
