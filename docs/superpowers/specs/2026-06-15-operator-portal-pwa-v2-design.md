# Operator Portal PWA v2 — Design Spec

- **Date:** 2026-06-15
- **Status:** Approved (scope locked)
- **Surface:** `packages/crm` — operator portal at `/portal/[orgSlug]` (the branded, installable contractor app, à la GoHighLevel LeadConnector)
- **Related:** `docs/superpowers/specs/2026-06-14-client-pwa-design.md` (v1, shipped), `2026-06-14-hero-lead-form-speed-to-lead-design.md`

---

## Goal

Turn the operator portal from a read-only "glance" app (v1) into a genuinely useful daily-driver: reply to customers in-app, see pipeline $ and act fast from Today, view appointments on a real calendar, and find anything via universal search — all at Claude-Design quality, shipping the parts that work today and leaving outbound-SMS bits ready-but-dark until the A2P campaign clears.

## Architecture (summary)

v2 is **mostly gap-fill on top of v1**, not greenfield. It keeps the existing `(operator)` route group, `OperatorMobileShell`, bottom-tab nav, and the hand-rolled operator session (`sf_operator_session` HMAC cookie). It **reuses existing data actions** (passing `orgId` directly from the operator session — the established portal pattern) and adds: a few server actions, one new table (`conversation_notes`), one new column (`sms_messages.readAt`), one workspace flag (`outboundSmsEnabled`), one universal-search endpoint, and a calendar component. Every screen is built to Claude-Design quality as it's built — design is not a bolt-on pass.

## Tech stack

Next.js 16 App Router (Turbopack), React 19, Drizzle + Neon Postgres, hand-rolled operator session, `node:test` + `tsx` unit tests with **injected dependencies** (node:test has no module mocking). Build gate: `cd packages/crm && bash scripts/check-use-server.sh src && npx tsc --noEmit && npx next build`.

---

## Context — what exists today (v1 on `main`)

Bottom-tab mobile shell with 4 tabs, all wired to live data:

| Tab | Route | v1 state |
|---|---|---|
| **Today** | `(operator)/page.tsx` | 4 glance cards (new leads 7d, today's appts, unread SMS, **missed calls = stub**) + "up next" list |
| **Leads** | `(operator)/leads/page.tsx` | Contact card list via `listContacts({ orgId, sort: "recent" })` |
| **Messages** | `(operator)/messages/page.tsx` + `messages/[contactId]/page.tsx` | SMS thread list + thread view — **read-only; "Text" bounces to native SMS app** |
| **Appts** | `(operator)/appointments/page.tsx` | Flat upcoming-bookings list grouped by day via `listBookings(orgId)` |

**Auth:** `requireOperatorSessionForOrg(orgSlug)` → `{ orgId, orgSlug, email, supportOriginUserId }`. Authorized emails = workspace owner / agency-owner / `SF_SUPERADMIN_EMAILS` (`isEmailAuthorizedForWorkspace`). All data scoped by `session.orgId`.

**Known v1 gaps / loose ends (from the codebase map):**
1. Messages thread view is read-only (no in-app reply).
2. Today has no Quick Actions; "Missed calls" card is a stub.
3. Appts is a flat list — no calendar.
4. No cross-entity search anywhere (`listContacts` has `ilike` on contacts only).
5. `(operator)/contacts|deals|bookings/page.tsx` are pure **redirects into the admin shell** — they break the operator session boundary. Vestigial.
6. `operator-portal-sidebar-nav.tsx` is dead code (no consumer).
7. `createContactAction` uses NextAuth `getOrgId()` — has **no `orgId` override**, so it can't be called from the operator session as-is.
8. `sms_messages` and `conversations` (the AI-agent model) are fully decoupled; SMS "threads" are derived in JS by grouping `sms_messages` on `contactId`.

## Locked decisions

- **Sequencing = ship-now first.** Build everything that works today as v2.0; A2P-gated outbound bits ship ready-but-dark and light up on approval; the in-app dialer / Calls is a separate later milestone.
- **User model = single-operator.** Owner-only login (matches today's auth). Inbox tabs = **All / Unread**. "Internal" = **private notes pinned to a conversation** (team-eyes-only). Multi-staff (invites, roles, assignment) is a future milestone.
- **Three judgment calls (confirmed):** (1) **Scan Card** (business-card OCR) → deferred to v2.1. (2) **Messages stays SMS-only + flat model** for v2.0. (3) **Request Review** ships **email now, +SMS auto-added when A2P clears**.

---

## Feature 1 — Messages v2 (centerpiece)

### Scope
- **All / Unread** segmented tabs at the top of the inbox + search-within-inbox (filters the thread list by contact name / last-message text, client-side over the already-loaded threads).
- **In-app reply composer** in the thread view (`messages/[contactId]`): a text input + Send. Replaces the native-SMS bounce.
- **A2P gating ("ready but dark"):** the composer reads a workspace flag `outboundSmsEnabled` (see Data model). When `false`, the input is disabled with an inline notice: *"Texting turns on the moment your carrier registration (A2P) is approved."* When `true`, Send calls `sendSmsFromApi` and the message appears optimistically in the thread.
- **Private notes ("Internal"):** a per-thread notes affordance — add a note (stored in `conversation_notes`, keyed by `contactId`), rendered inline in the thread visually distinct from messages, never sent to the customer.
- **Unread:** opening a thread marks its inbound messages read (`sms_messages.readAt = now()` for that contact's inbound rows where `readAt IS NULL`). The Unread tab lists threads with ≥1 inbound `readAt IS NULL`. Today's "unread SMS" card is reconciled to this same definition.
- The 839 AI agent's outbound texts already land in `sms_messages` (it sends via `sendSmsFromApi`), so they already appear in the thread — no extra work to "show the AI's side."

### Reuse
- Thread list + thread view already exist (read-only) — extend them.
- `sendSmsFromApi({ orgId, userId: null, contactId, toNumber, body })` for outbound (already inserts the `sms_messages` row, `activities` row, emits `sms.sent`).
- `findContactByPhone(orgId, phone)` exists for inbound linking (no change needed).

### New code
- `lib/operator-portal/messages.ts` — `getInboxThreads(orgId)` (formalize the existing JS grouping incl. unread flag), `markThreadRead({ orgId, contactId })`, `listThreadNotes({ orgId, contactId })`, `addThreadNote({ orgId, contactId, authorEmail, body })`.
- A `"use server"` action wrapper `lib/operator-portal/messages-actions.ts` for: send reply (guarded by `outboundSmsEnabled`, try/catch around `sendSmsFromApi`), add note, mark read. (Must export only async fns — build rule.)
- Client components for the composer, the All/Unread tabs, the notes UI.

### Error handling
- Reply: if `outboundSmsEnabled` is false → never call Twilio; show the dark-state notice. If true and `sendSmsFromApi` throws (misconfig / suppression / provider error) → show a non-blocking inline error ("Couldn't send — {reason}"), keep the draft in the input.
- Notes never touch Twilio; pure DB.

---

## Feature 2 — Today v2

### Scope
- Keep the 4 glance cards (reconcile "unread SMS" to the new `readAt` definition; leave "missed calls" stubbed until the Calls milestone).
- **Pipeline $ card:** total value of open deals (sum of `deals.value` where the deal is not in a closed stage), tap → a by-stage breakdown sheet.
- **Quick Actions row** (large tap targets, Claude-Design):
  - **Add Contact** — opens a sheet; on submit calls a new operator-scoped create (see Cross-cutting).
  - **New Booking** — links to the existing booking flow for the workspace.
  - **Request Review** — sheet to pick a recent contact → sends a review-request. **Email now** via `sendEmailFromApi` (with `ctaLabel`/`ctaHref` to the review link). The SMS variant is wired behind `outboundSmsEnabled` and auto-included once true.

### Reuse
- `listDeals(orgId)` + `getDefaultPipeline(orgId)` (stages carry `{ name, color, probability }`; "open" = any stage not flagged closed/won-lost — derive from stage name/probability, documented in the plan).
- `sendEmailFromApi({ orgId, userId: null, contactId, toEmail, subject, body, ctaLabel, ctaHref })`.

### New code
- `lib/operator-portal/today.ts` — `getPipelineRollup(orgId)` (total + per-stage).
- `lib/operator-portal/review-request.ts` — compose + send (email now; SMS gated), injectable deps for testing.
- Quick-action client sheets.

---

## Feature 3 — Appts v2

### Scope
- **Month + Week** calendar views with a toggle (default Week on mobile). Days/slots show booking density; tapping a day scrolls to / filters that day's bookings.
- Tap a booking → **detail sheet**: contact, time, service title, status, with **Reschedule** and **Cancel** actions.

### Reuse
- `listBookings(orgId)` → rows with `startsAt`, `endsAt`, `title`, `fullName`, `status`, `contactId`, `bookingSlug`. Exclude `status in ("template","cancelled")` for display.
- Existing reschedule/cancel server actions (the `/bookings` admin actions + MCP `reschedule_booking`/`cancel_booking` indicate server actions exist — the plan confirms the exact exported names and adds operator-scoped wrappers if needed).

### New code
- `lib/operator-portal/calendar.ts` — pure date-bucketing: `buildMonthGrid(bookings, anchorDate, tz)`, `buildWeekStrip(bookings, anchorDate, tz)`. **Timezone-correct** using the workspace TZ (reuse the existing clock/TZ helpers — naive ISO parsing in workspace TZ was a prior bug class).
- Calendar client component (no heavy 3rd-party lib; hand-built grid to keep bundle small and match Claude Design).

---

## Feature 4 — Universal Search

### Scope
- A search entry in the shell header (or a dedicated search affordance) → results grouped by **Contacts / Deals / Bookings**, each row deep-linking to the relevant portal screen (contact thread, deal — falls back to Leads/contact for now, booking detail).

### New code
- `lib/operator-portal/search.ts` — `universalSearch({ orgId, query, limit })`: parallel `ilike` queries across `contacts` (name/email/company/phone), `deals` (title), `bookings` (title/fullName), each scoped by `orgId`, returns a normalized `{ type, id, title, subtitle, href }[]` with simple ranking (exact/prefix > substring; contacts weighted first). Injectable query fns for testing.
- A `GET` route handler or server action behind the operator session for type-ahead.
- Search client UI (debounced).

---

## Cross-cutting

- **Operator-scoped contact create:** add an `orgId`-override path so contacts can be created from the operator session (v1 `createContactAction` only uses NextAuth `getOrgId()`). Either a new `createContactForOrg({ orgId, ... })` lib fn that both the admin action and the operator action call (DRY), or extend the action to accept an injected orgId. Plan picks one; the lib-fn split is preferred.
- **Redirect-route cleanup:** the vestigial `(operator)/contacts|deals|bookings/page.tsx` redirects into the admin shell. Remove them (Leads + Search + thread views cover the need) so the operator never breaks out of their session. Delete dead `operator-portal-sidebar-nav.tsx`.
- **Claude Design quality:** every new surface uses the branded mobile shell's design language (agency `primary_color`/`accent_color` via `getEffectiveBrandingForWorkspace`), generous tap targets, motion, empty states, skeletons. World-class, not wireframe.

## Data model changes

1. **New table `conversation_notes`** (`db/schema/conversation-notes.ts`): `id` uuid PK, `orgId` uuid (FK orgs, indexed), `contactId` uuid (FK contacts, indexed), `authorEmail` text, `body` text, `createdAt` timestamptz default now. (Keyed by `contactId` = the SMS "conversation" for v2.0.)
2. **New column `sms_messages.readAt`** timestamptz nullable. Unread inbound = `direction='inbound' AND readAt IS NULL`. Backfill: leave NULL (existing inbound count as unread) — acceptable, or set `readAt = createdAt` for rows older than deploy to avoid a huge initial unread count (plan decides; default = backfill old rows as read).
3. **Workspace flag `outboundSmsEnabled`** stored in `organizations.integrations.twilio.outboundSmsEnabled` (boolean, default **false**). Gates the reply composer + Request-Review-SMS. Flipped to `true` (manually for now, via Settings or Neon) when the A2P campaign is approved. Future: auto-derive from Twilio's compliance API.

All schema changes go through the Drizzle migration pipeline (generate + journal + `pnpm db:migrate` wired into the Vercel build). Loud failures / drift guard already in place.

## A2P / Voice gating strategy

- **Outbound SMS** (reply, Request-Review-SMS) is gated **only** by `outboundSmsEnabled`. Until true: UI shows the "activates on A2P approval" state and never calls Twilio. After true: normal send via `sendSmsFromApi` (which still throws gracefully on misconfig). This is a one-line flip the day the campaign clears — no redeploy needed.
- **Voice / dialer / missed-calls** are entirely out of scope for v2.0 (separate Calls milestone). "Missed calls" card stays a labeled stub.

## Out of scope (v2.1+)

Scan Card (business-card OCR), in-app dialer / Calls / missed-calls, multi-staff (invites, roles, per-conversation assignment), unified inbox (SMS + email + AI conversation model), email threads in the inbox, per-agency PWA icons. None of these are blocked by v2.0 — the data model leaves room (e.g., `conversation_notes.contactId` can later point at a real conversation id).

## Testing strategy

`node:test` + `tsx`, dependency injection (no module mocking). Unit tests:
- `calendar.ts`: month-grid + week-strip bucketing across month boundaries, DST, and workspace TZ correctness.
- `search.ts`: ranking order (exact > prefix > substring; contact-first), org scoping, empty query.
- `today.ts`: pipeline rollup total + per-stage, open-vs-closed stage classification.
- `messages.ts`: unread computation, thread grouping, `markThreadRead` scoping, note CRUD scoping.
- `review-request.ts`: email path sends; SMS path skipped when `outboundSmsEnabled=false`, attempted when true (injected SMS/email senders).
- operator-scoped contact create: writes under the session `orgId`, rejects cross-org.
Integration: operator-session scoping (a session for org A cannot read/write org B).

## Rollout — slice sequence (each independently shippable + build-gated + merged to `main`)

- **Slice 0 — Foundations:** `conversation_notes` table, `sms_messages.readAt` column + migration, `outboundSmsEnabled` flag read/write, operator-scoped contact-create lib fn, redirect-route + dead-code cleanup.
- **Slice 1 — Today v2:** Pipeline $ card + Quick Actions (Add Contact, New Booking, Request Review-email). High value, low risk, mostly reuse.
- **Slice 2 — Messages v2:** All/Unread tabs + search-within + reply composer (gated) + private notes + mark-read.
- **Slice 3 — Appts v2:** month/week calendar + detail sheet + reschedule/cancel.
- **Slice 4 — Search:** universal endpoint + header search UI.
- **Slice 5 — Cohesion polish:** cross-screen Claude-Design pass (motion, empty states, skeletons, branding consistency) + a manual smoke test on a Vercel preview.

## Open questions

- **A2P privacy URL:** confirm which privacy-policy URL the live A2P campaign cited; `app.seldonframe.com/privacy` is now compliant — if the campaign used a different host, mirror the SMS sections there. (Tracked separately from this build.)
- **Reschedule/cancel exact action names:** the plan must confirm the exported server-action names from the `/bookings` surface before reuse.
