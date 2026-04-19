---
id: caldiy-booking
scope: universal
frameworks: agency,coaching,consulting,service,realestate
source_repo: https://github.com/calcom/cal.diy
source_version_verified: v6.2.0 (2026-03-01)
---
# BLOCK: Cal.diy Booking

**Description**
Drop-in replacement for the basic SeldonFrame booking form with a full Cal.diy-parity scheduling system: multiple event types, availability schedules, round-robin / collective hosts, calendar sync, custom booking fields, confirmations, reschedules, cancellations, payments, webhooks, and recurring bookings — all schema-driven through this BLOCK.md, installable via the existing block installer, and client-scopable via `end_client_mode`.

**Trigger Phrases**
- "Install the Cal.diy booking system"
- "Upgrade my booking to Cal.diy"
- "Add round-robin scheduling for my team"
- "Let my clients pick a time with Google Calendar sync"

**Behavior**
Materialize a Cal.diy-equivalent scheduling subsystem on top of SeldonFrame's existing `booking` primitive without breaking any existing booking route. The block installer already supports `blockType: "booking"`; this skill defines the schema, pages, events, and customization contract that agents must follow when creating or updating booking entities via Seldon It. When installed in `end_client_mode`, all entities are scoped to `client_id` via the existing `writeClientScopedOverride` path — no new scoping mechanism is introduced.

**Integration Points**
- CRM (Contact ↔ Attendee, Deal ↔ Booking)
- Brain v2 (`booking_created`, `booking_completed`, `caldiy_block_configured`)
- Forms (custom booking fields, pre-booking intake)
- Email (confirmation, reminder, reschedule, cancellation)
- Pages (public booking pages, team pages)
- Automation (reminders, no-show flagging, round-robin rotation)

**Self Improve**
self_improve: true

---

## Purpose
Provide agencies, coaches, consultants, and real-estate agents a production-grade booking system that matches Cal.diy (community fork of Cal.com, MIT, v6.2.0 verified 2026-03-01) in capability and flow, while staying native to the SeldonFrame architecture: thin harness, fat BLOCK.md, owned Brain v2, client-scoped overrides, schema-driven everything.

---

## Entities

### EventType
A bookable offering (30-min intro call, 60-min strategy session, round-robin sales demo, etc.).

- title (text, required)
- slug (text, required, unique per owner)
- description (long text)
- length (integer, minutes, required)
- hidden (boolean, default: false)
- locations (json: [{ type: "zoom" | "google_meet" | "daily" | "in_person" | "phone" | "custom", details?: string }])
- schedulingType (enum: solo, round_robin, collective, managed; default: solo)
- schedule_id (relation -> Schedule)
- price (currency, default: 0)
- currency (text, default: "usd")
- minimumBookingNotice (integer, minutes, default: 120)
- beforeEventBuffer (integer, minutes, default: 0)
- afterEventBuffer (integer, minutes, default: 0)
- seatsPerTimeSlot (integer, nullable)
- requiresConfirmation (boolean, default: false)
- disableGuests (boolean, default: false)
- bookingFields (json: custom field definitions; see "Custom Booking Fields" below)
- successRedirectUrl (url, nullable)
- hashedLink (text, nullable, for private sharing)
- periodType (enum: unlimited, rolling, range; default: unlimited)
- periodStartDate (timestamp, nullable)
- periodEndDate (timestamp, nullable)
- periodDays (integer, nullable)
- recurringEvent (json, nullable: { freq, count, interval })
- ownerContactId (relation -> Contact, required)
- teamId (relation -> Team, nullable)
- createdAt (timestamp, auto)
- updatedAt (timestamp, auto)

### Schedule
A named availability profile (e.g. "Working hours", "Weekend slots").

- name (text, required)
- timeZone (text, required, IANA format)
- ownerContactId (relation -> Contact, required)
- isDefault (boolean, default: false)
- createdAt (timestamp, auto)

### Availability
A single recurring time window attached to a Schedule OR directly to an EventType.

- scheduleId (relation -> Schedule, nullable)
- eventTypeId (relation -> EventType, nullable)
- days (integer array: 0=Sun … 6=Sat)
- startTime (time, required)
- endTime (time, required)
- date (date, nullable; if set, overrides the weekly pattern for a single date)

### Booking
A confirmed, pending, cancelled, or rejected instance of an EventType.

- uid (text, required, unique — public id)
- eventTypeId (relation -> EventType, required)
- title (text, required)
- description (long text, nullable)
- startTime (timestamp, required)
- endTime (timestamp, required)
- status (enum: accepted, pending, cancelled, rejected, awaiting_host; default: accepted)
- location (text, nullable — resolved location string at booking time)
- responses (json — the attendee's answers to booking fields)
- paid (boolean, default: false)
- cancellationReason (text, nullable)
- rescheduled (boolean, default: false)
- fromReschedule (text, nullable — uid of the previous booking)
- recurringEventId (text, nullable — groups recurring bookings)
- iCalUID (text, nullable)
- iCalSequence (integer, default: 0)
- scheduledTriggers (json — webhook jobs scheduled for this booking)
- hostContactId (relation -> Contact, required)
- metadata (json, nullable)
- createdAt (timestamp, auto)
- updatedAt (timestamp, auto)

### Attendee
A person (or multiple, for group bookings) attending a Booking.

- bookingId (relation -> Booking, required)
- email (text, required)
- name (text, required)
- timeZone (text, required)
- phoneNumber (phone, nullable)
- locale (text, default: "en")
- contactId (relation -> Contact, nullable — links to CRM if matched)
- noShow (boolean, default: false)

### SelectedCalendar
A calendar the user has chosen to check for conflicts or write events to.

- ownerContactId (relation -> Contact, required)
- integration (enum: google_calendar, microsoft_graph, apple, caldav)
- externalId (text, required — the calendar's id in the provider)
- credentialId (relation -> Credential, required)
- eventTypeId (relation -> EventType, nullable — scope to one event type)
- syncedAt (timestamp, nullable)
- syncErrorAt (timestamp, nullable)

### Credential
An encrypted OAuth or API credential for an external provider.

- ownerContactId (relation -> Contact, required)
- type (text, required — e.g. "google_calendar", "zoom_video", "office365_calendar")
- encryptedKey (text, required — encrypted token blob)
- appId (text, required)
- invalid (boolean, default: false)

### BookingReference
Links a Booking to external artifacts (calendar event ids, meeting urls).

- bookingId (relation -> Booking, required)
- type (text, required — e.g. "google_calendar", "zoom_video")
- externalId (text, required)
- meetingUrl (url, nullable)
- credentialId (relation -> Credential, nullable)

---

## Relations
- Contact → EventType (one-to-many): a user owns many event types.
- Contact → Schedule (one-to-many): a user owns many availability schedules.
- Schedule → EventType (one-to-many): a schedule powers many event types.
- Schedule → Availability (one-to-many): a schedule has many time windows.
- EventType → Booking (one-to-many): an event type has many bookings.
- Booking → Attendee (one-to-many): a booking has one or more attendees.
- Booking → BookingReference (one-to-many): a booking has zero or more external refs.
- Contact → SelectedCalendar (one-to-many): a user has many connected calendars.
- Contact → Credential (one-to-many): a user has many OAuth credentials.

---

## Dependencies
- Required:
  - Contact (SeldonFrame built-in)
  - Identity (SeldonFrame built-in — soul, theme, labels)
- Optional:
  - Deal (SeldonFrame built-in — link a Booking to a Deal)
  - Payments (SeldonFrame built-in — for paid event types)
  - Email (SeldonFrame built-in — confirmations, reminders)
  - Pages (SeldonFrame built-in — public booking pages)
  - Automation (SeldonFrame built-in — scheduled reminders)

---

## Events

### Emits
- `booking_created` — new Booking row in any status (reuse existing BrainEventType)
- `booking_completed` — Booking.status transitions to accepted + endTime is in the past (reuse existing)
- `caldiy_block_configured` — emitted once when this block is first installed into a workspace (new BrainEventType)

### Listens
- `payment.received` — set Booking.paid = true, transition status from awaiting_host → accepted if requiresConfirmation was gating payment
- `contact.created` — opportunistically link any Attendee rows with matching email to the new Contact
- `integration.credential_connected` — trigger a calendar list refresh for the user

### Brain v2 payload contract
`caldiy_block_configured` payload shape:
```json
{
  "scope": "workspace" | "client",
  "client_id": "<hashed>" | null,
  "installed_event_types": <int>,
  "installed_schedules": <int>,
  "connected_calendars": <int>,
  "locations_enabled": ["zoom", "google_meet", ...]
}
```

---

## Pages

### Admin pages
1. `/bookings`
   - Table of all bookings with status, attendee, event type, start time filters.
   - Actions: cancel, reschedule, reassign host, mark no-show, download ics.
   - Empty state: "Create your first event type" CTA.

2. `/bookings/event-types`
   - List of event types with toggle for hidden, duplicate, hashed-link copy.
   - Actions: create, duplicate, archive, reorder (position).

3. `/bookings/event-types/[eventTypeId]`
   - Editor: title, slug, length, locations, schedule, buffers, booking fields, confirmation, price, recurring, custom redirect.
   - Tabs: General, Availability, Advanced, Workflows, Limits, Apps.

4. `/bookings/availability`
   - Schedules list + editor. Weekly pattern + date overrides.
   - Actions: create, rename, set default, delete.

5. `/bookings/settings/integrations`
   - Connect/disconnect Google Calendar, Microsoft Graph, Apple, Zoom, Daily.co, Google Meet.
   - Selected Calendars picker per integration.
   - Destination calendar for new bookings.

### Public pages
1. `/book/[contactSlug]`
   - Booker profile page: avatar, bio, list of visible event types.
   - Empty state: friendly "no public event types yet".

2. `/book/[contactSlug]/[eventTypeSlug]`
   - Calendar + time slot picker.
   - Booking form (default fields: name, email, timezone, notes; plus EventType.bookingFields).
   - Locations selector if EventType.locations has > 1 option.
   - Payment step if EventType.price > 0.
   - Confirmation view with ics download, reschedule and cancel links.

3. `/book/[contactSlug]/[eventTypeSlug]/[bookingUid]/reschedule`
   - Same calendar UI, pre-filled from existing booking, writes a new Booking with `fromReschedule = <old uid>`.

4. `/book/[contactSlug]/[eventTypeSlug]/[bookingUid]/cancel`
   - Confirmation + optional reason + cancel action.

5. `/team/[teamSlug]/[eventTypeSlug]`
   - Team booking page (collective or round-robin), picks host according to schedulingType.

### Integration pages
1. Contact detail integration
   - Adds "Bookings" tab on contact profile with past and upcoming bookings.
   - Shows per-contact booking stats, no-show count.
2. Deal detail integration
   - Adds "Linked bookings" section when Deal.metadata.bookingUid is set.

Identity usage:
- Uses soul labels for all people-facing copy ("Book a call with {{ownerFirstName}}").
- Uses soul voice for confirmation and reminder email bodies.
- Uses soul branding (primary color, logo) on public booking pages.

---

## Navigation
- label: Bookings
- icon: CalendarClock
- order: 30

---

## Customization (how Seldon It should modify this block)

### Customizable without any code changes
Any of the following MUST be achievable through pure BLOCK.md + schema edits and the existing `installBlock` path — no new routes, no new tables beyond what is listed here:

1. Adding/removing an EventType (with any combination of the listed fields).
2. Adding/removing a Schedule or Availability window.
3. Changing booking field composition on any EventType (via `bookingFields` JSON).
4. Changing locations offered on any EventType.
5. Switching schedulingType on any EventType (solo / round_robin / collective / managed).
6. Enabling/disabling requiresConfirmation, disableGuests, recurringEvent.
7. Changing minimumBookingNotice, buffers, seatsPerTimeSlot, periodType.
8. Connecting/disconnecting calendar providers via SelectedCalendar + Credential rows.
9. Client-scoped overrides when `end_client_mode` is active — the installer writes a `writeClientScopedOverride(orgId, clientId, "booking", "create"|"update", params)` row instead of a workspace-wide entity. The end client sees their override; the master template is untouched.

### End-client self-service contract
When installed or modified with `end_client_mode === true`:
- `clientId` MUST be set on every created/updated entity.
- Only the subset of fields in the "Allowed for end_client" list below may be written.
- Writes that fall outside the allowed list MUST be rejected by the existing OpenClaw scope guard (`packages/crm/src/lib/openclaw/scope-guard.ts`) before reaching this block.

Allowed for end_client (client-scoped):
- EventType: title, description, length, locations (from a pre-approved set), minimumBookingNotice, buffers (up to 60min), hidden
- Schedule: name, timeZone, availability windows (within the owner's master schedule)
- Booking: own bookings only (view, reschedule, cancel)
- SelectedCalendar: own connected calendars only

NOT allowed for end_client:
- price, currency, successRedirectUrl, hashedLink
- schedulingType changes
- teamId assignment
- Credential creation or deletion (provider connect/disconnect stays with the workspace owner)
- Workflow, webhook, or automation definitions

---

## Brain v2 signals — what to record and why

On install:
- Emit `caldiy_block_configured` once per workspace (or once per client_id if client-scoped).
- Payload captures installed_event_types count, installed_schedules count, connected_calendars count, locations_enabled.

On live traffic (already covered by existing events):
- `booking_created` — salience scoring decides which bookings are noteworthy (e.g. paid, first-of-kind, no-show pattern).
- `booking_completed` — feeds conversion and revenue attribution.

Do NOT emit new per-booking events beyond `booking_created` / `booking_completed` — the existing Brain v2 schema already covers the signal.

---

## Integration with Seldon It

This block is picked up automatically by `seedInitialBlocks` (via `packages/crm/src/lib/soul-compiler/blocks.ts`) because of the frontmatter. No registry edit is needed.

Seldon It can propose changes to this block through the normal `runSeldonItAction` flow:
- `builder_mode` → edits apply workspace-wide.
- `end_client_mode` → edits route through `writeClientScopedOverride` and are guarded by `guardEndClientDescription` from slice #1.
- Multi-client propagation via `propagateSeldonChangeToWorkspaces` (slice #2) works unchanged — each target workspace receives the same description and the installer handles it per-workspace.

---

## Karpathy Guidelines (apply to every code change derived from this block)
- Think Before Coding: no code edit without stating the exact entity/field touched and the expected Brain-visible result.
- Simplicity First: reuse `installBlock` with `blockType: "booking"`; never introduce a new installer path.
- Surgical Changes: adding an EventType MUST NOT alter any existing booking route behavior.
- Goal-Driven Execution: every change ends with a measurable Brain event or a verifiable DB row, not with "should work now".

---

## DO — the agent implementing this block MUST

1. Use `blockType: "booking"` in `installBlock` calls. Never invent a new block type.
2. Pass `clientId` to `installBlock` when `end_client_mode === true` so the existing override path is used.
3. Reuse the built-in Contact object for attendees and owners. Never duplicate a user/person schema.
4. Persist locations as a JSON array under `EventType.locations`. Never create a separate Location table.
5. Persist booking-form field definitions as JSON under `EventType.bookingFields`. Never create a per-field table.
6. Encrypt every OAuth token at rest. Reuse the existing Credential encryption path.
7. Respect `minimumBookingNotice`, `periodType`, `beforeEventBuffer`, `afterEventBuffer`, and `schedulingType` when computing slots.
8. Emit `caldiy_block_configured` exactly once per install (workspace or client), with the payload shape documented in Events.
9. When `end_client_mode` is active, write only the fields on the "Allowed for end_client" list above.
10. Pre-flight every end-client change through `guardEndClientDescription` from `packages/crm/src/lib/openclaw/scope-guard.ts`.
11. When a Booking is cancelled or rescheduled, update the linked Google / Microsoft / Apple calendar event via the provider API using the stored BookingReference.
12. Use soul voice + soul branding on all public pages.

## DO NOT — the agent implementing this block MUST NOT

1. Do NOT touch, rename, remove, or change the behavior of any existing route under `/api/v1/portal`, `/api/v1/workspaces`, or any pre-existing `/api/bookings` route. Additive only.
2. Do NOT add a new `blockType` to the block installer's `isSupportedBlockType` allowlist.
3. Do NOT add a new top-level directory under `packages/crm/src/app/api/` unless it is strictly `/bookings-admin` or `/bookings-public` and only after confirming no collision.
4. Do NOT persist unencrypted OAuth tokens.
5. Do NOT read another workspace's bookings — every query MUST be `orgId`-scoped, and when `clientId` is present, `clientId`-scoped on top.
6. Do NOT introduce a new Brain event type beyond `caldiy_block_configured`. Reuse `booking_created` and `booking_completed`.
7. Do NOT bypass `guardEndClientDescription` when handling end-client input, even for "obviously safe" reads.
8. Do NOT expose private booker emails on a page accessible without a session or hashed link.
9. Do NOT call external provider APIs (Google, Microsoft, Zoom) from client components. All provider I/O MUST happen in a server action or API route.
10. Do NOT invent new enum values beyond those listed in this file.
11. Do NOT add a migration that drops or renames any existing booking column.
12. Do NOT ship UI strings that bypass the soul's tone/labels.

---

## Success criteria — ALL eight must be verifiably true after install

A. A new BLOCK.md skill file exists at `packages/crm/src/blocks/caldiy-booking.block.md` with the frontmatter `id: caldiy-booking` and `scope: universal`.
B. `seedInitialBlocks(orgId, …)` picks this file up on first workspace setup, and `organizations.settings.soulCompiler.seededBlocks` contains an entry with `id === "caldiy-booking"`.
C. When a Seldon It run uses `end_client_mode === true` and targets this block, the resulting write lands in the client-scoped overrides store (via `writeClientScopedOverride`), not in a workspace-wide table.
D. A Seldon It description such as *"add a 30-min discovery call with a 2h notice"* resolves to an `installBlock(blockType: "booking", ...)` call and produces an EventType row with the correct `length` and `minimumBookingNotice`.
E. Exactly one `caldiy_block_configured` Brain v2 event is recorded per install, with the documented payload fields populated.
F. `pnpm build` passes. No existing route under `/api/v1/portal/**` or `/api/v1/workspaces/**` changes its status code or response shape for unchanged inputs.
G. The file at `packages/crm/src/blocks/caldiy-booking.block.md` parses successfully through `parseFrontmatter` in `packages/crm/src/lib/soul-compiler/blocks.ts` (frontmatter opens `---\n` and closes `\n---\n`).
H. Every customization path in the "Customization" section above maps to at least one allowed field listed in the Entities section. No "how to customize" claim references a field that does not exist.

---

## Stop condition

Stop immediately once all eight success criteria (A–H) are verifiably true. Do NOT continue to refactor, reorganize directories, rename files, or "while I'm here" clean up adjacent booking code. The slice is complete.

---

## Reference — Cal.diy source mapping

- Cal.diy is the MIT community fork of Cal.com: https://github.com/calcom/cal.diy
- Verified at repository version v6.2.0 (release 2026-03-01) at slice time.
- Prisma source file read to derive this schema: `packages/prisma/schema.prisma`.
- Models mirrored (renamed to SeldonFrame conventions): `User` → Contact, `EventType` → EventType, `Booking` → Booking, `Attendee` → Attendee, `Schedule` → Schedule, `Availability` → Availability, `SelectedCalendar` → SelectedCalendar, `Credential` → Credential, `BookingReference` → BookingReference.
- Excluded from this block (out of scope; future slices if needed): workflows/reminders engine, API keys, webhooks, OAuth server (`PlatformOAuthClient`), instant meetings, platform billing, watchlist, audit log, delegation credentials, Cal.ai phone agents.
