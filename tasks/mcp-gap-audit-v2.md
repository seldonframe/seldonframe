# MCP gap audit v2 — archetype-driven

**Date:** 2026-04-21
**Supersedes:** Phase 2.a `tasks/mcp-gap-audit.md` (dashboard-action-driven, missed `create_booking`)
**Gate:** 7.c archetype library cannot ship until the critical gaps below are closed or explicitly scoped away.

---

## Method

Walked each of the 7 planned archetypes step-by-step against the current 76-tool MCP catalog. For each step, asked two questions:

1. **Does a tool exist that emits the required side effect?** (send an email / schedule a booking / update a field / etc.)
2. **Does the runtime primitive exist for the step type?** (`wait`, `conversation`, `branch`, `mcp_tool_call`, `end` are already defined; anything outside that list is a runtime-level gap)

Gaps are classified as:
- **Critical** — archetype cannot function without it. Must ship before the archetype does.
- **Nice-to-have** — archetype works but awkwardly. Can ship with a workaround, bundle the tool in a future slice.
- **Scope-constrained** — archetype works only for a subset of real-world use cases without V1.1 infrastructure. Doc-flag at ship time.

---

## Current catalog snapshot (76 tools)

Grouped by verb prefix for quick scanning:

- **create** (9): workspace, contact, deal, booking, appointment_type, form, invoice, subscription, landing_page
- **update** (7): landing_content, theme, contact, deal, appointment_type, form, landing_page
- **delete** (3): contact, deal, form
- **list** (17): workspaces, automations, secrets, contacts, deals, activities, appointment_types, forms, submissions, emails, suppressions, sms, sms_suppressions, invoices, subscriptions, payments, landing_pages, landing_templates *(note: 18 with landing_templates listed twice in grouping; actual count 17)*
- **get** (10): workspace_snapshot, contact, deal, form, email, sms, invoice, payment, landing_page, landing_template
- **send** (4): email, sms, invoice, conversation_turn
- **move** (1): deal_stage
- **publish** (1): landing_page
- **generate** (1): landing_page
- **configure** (1): booking
- **cancel** (1): subscription
- **refund** (1): payment
- **void** (1): invoice
- **suppress / unsuppress** (4): email, phone (×2 each)
- **install** (3): vertical_pack, caldiy_booking, formbricks_intake
- **Workspace ops** (8): clone, link_owner, revoke_bearer, rotate/store/list secret, switch, connect_custom_domain, export_agent, fetch_source_for_soul, submit_soul, customize_intake_form

**Notably absent** (flagged before walking archetypes):
- Any **activity / note creation** tool. We have `list_activities` but no writer.
- Any **booking read/write beyond create** — no `get_booking`, `list_bookings`, `cancel_booking`, `reschedule_booking`.
- Any **knowledge-base / FAQ** block or tools (block-level gap, deferred to V1.1).

---

## Per-archetype walkthrough

### 1. Speed-to-Lead ✅ *(proven by 7.a live probe + 7.h create_booking fix)*

**Trigger:** `form.submitted` (with form_id filter)
**Canonical flow:** wait 2 min → conversation (SMS) to qualify → `update_contact` with extracted fields → `create_booking` → `send_sms` + `send_email` confirmations
**Tools used:** `send_sms`, `send_conversation_turn` (implicit in conversation step), `update_contact`, `create_booking`, `send_email`

**Status:** all tools present, live-run-verified at 100% consistency across 5 determinism repeats.

**Gaps:** none.

---

### 2. Client Onboarding

**Trigger:** `payment.completed` OR `subscription.created` (new paying customer)
**Canonical flow:** `send_email` welcome → share onboarding form URL → wait for `form.submitted` → `create_booking` for kickoff call → `send_email` calendar confirm → `move_deal_stage` to "onboarded"

**Tools used:** `send_email`, `get_form` (to obtain form + slug for public URL), `create_booking`, `move_deal_stage`, `update_contact`

**Gaps:**
| Gap | Severity | Notes |
|---|---|---|
| `get_form` doesn't return the public URL — only the form record (id, slug, fields). Agents have to construct `/forms/{id}/{slug}` from the org slug + form slug. | **Nice-to-have** | Workaround works today. Cleanest fix: have `get_form` include `public_url: "https://<orgSlug>.app.seldonframe.com/forms/<id>/<slug>"` in its response. ~5 LOC change to the route. |
| `create_activity` for logging "Onboarding agent scheduled kickoff call" in the contact timeline. | **Nice-to-have** | Can log via `update_contact({notes: ...})` as a workaround, but that overwrites notes rather than appending. |

**Status:** ready to ship. Optional `get_form` URL enhancement would make the archetype JSON cleaner.

---

### 3. Review Requester

**Trigger:** `booking.completed`
**Canonical flow:** wait 1–3 days → `send_email` with review link (Google reviews or internal form) → wait 3–7 days → `send_sms` reminder if no response → `update_contact` with review-request status

**Tools used:** `send_email`, `send_sms`, `update_contact`, optionally `get_form` for an internal review form

**Gaps:**
| Gap | Severity | Notes |
|---|---|---|
| Same `get_form` URL gap as Client Onboarding. | **Nice-to-have** | Same workaround. Only applies if the builder wants an internal SeldonFrame review form (vs. linking to Google / Yelp directly). |

**Status:** ready.

---

### 4. Appointment Confirmer ⚠️

**Trigger:** `booking.created`
**Canonical flow:** wait until 24h before the booking → `send_sms` reminder → wait until 1h before → second reminder → on reply "reschedule" → `send_conversation_turn` → `reschedule_booking` OR `cancel_booking`

**Tools used:** `send_sms`, `send_email`, `reschedule_booking`, `cancel_booking`, `get_booking`, `send_conversation_turn`

**Gaps:**
| Gap | Severity | Notes |
|---|---|---|
| `reschedule_booking` — edit an existing scheduled booking's time. | **Critical** | No equivalent today. Mirror of `create_booking` against an existing row. |
| `cancel_booking` — mark a booking cancelled, emit `booking.cancelled`. | **Critical** | No equivalent. Server-action `cancelBookingAction` exists in `lib/bookings/actions.ts` (used by dashboard); MCP surface missing. |
| `get_booking` — look up a booking by id. | **Critical** | No equivalent. Needed so the agent can reference the booking's `startsAt` when computing reminder timing. |
| `list_bookings` — list scheduled bookings (filtered by contact / time range). | **Nice-to-have** | Useful for listing "upcoming" or "today's bookings" but the archetype itself can work via trigger payload. |
| **Wait until a specific moment (not a duration).** `wait.seconds: number` supports fixed durations. "24 hours before `{{booking.startsAt}}`" requires either a computed-expression `wait.seconds` (runtime evaluates `secondsUntil(booking.startsAt - 24h)`) or a scheduled trigger. | **Critical — but architectural, not tool-level.** Cannot be fixed by adding tools; requires either an AgentSpec schema extension or acceptance of the "fire at trigger time, not 24h before" degraded shape. |

**Status:** **BLOCKED for v1 in canonical shape.** Two ship paths:
- **(a) Defer to V1.1** alongside scheduled triggers + booking CRUD (4 booking tools). Honest; keeps v1 archetype library tighter.
- **(b) Ship degraded v1** — send a single reminder at `booking.created` time (with "we'll see you at {{startsAt}}" in the message) rather than 24h-before. No new tools needed. Limited value vs. a real reminder flow.

**Recommendation: defer to V1.1.** A ship-now Appointment Confirmer that just echoes the booking at creation isn't what agency users expect when they hear "appointment confirmer" — it'll be disappointing. Ship the 4 booking CRUD tools + dynamic wait expressions as a V1.1 slice, then ship the real archetype.

---

### 5. Support Deflection

**Trigger:** `form.submitted` (support-intake form) OR `email.replied` (inbound support reply — from Phase 3)
**Canonical flow:** `send_conversation_turn` to classify urgency + intent against Soul FAQs → branch on confidence → `send_email` auto-reply if FAQ match → `send_email` escalation to owner if not → `update_contact` to tag "support_escalated"

**Tools used:** `send_email`, `send_conversation_turn`, `update_contact`

**Gaps:**
| Gap | Severity | Notes |
|---|---|---|
| No knowledge-base block. Without one, Claude answers from Soul `customContext` + mission + offer. This only covers "where are you located" / "what hours" / "what services" — not product-specific FAQs. | **Scope-constrained** | Flag in 7.c archetype docs: "Support Deflection handles Soul-known questions (hours, services, location). For product-specific FAQs, install the KB block (V1.1)." |
| `create_activity` for logging "auto-reply fired with confidence 0.82" traces. | **Nice-to-have** | Same as other archetypes. |

**Status:** **ship with scoped docs.** Explicitly describe the Soul-FAQ-only range at archetype install.

---

### 6. Proposal Follow-Up

**Trigger:** `deal.stage_changed` (filter on `to: "Proposal Sent"`)
**Canonical flow:** wait 3 days → `send_email` check-in → wait 4 days → `send_sms` nudge → on no reply after 10 total days → `move_deal_stage` to "Stale" + `update_contact` with follow-up notes → owner notification email

**Tools used:** `send_email`, `send_sms`, `move_deal_stage`, `update_contact`, `update_deal`

**Gaps:**
| Gap | Severity | Notes |
|---|---|---|
| `create_activity` for logging the follow-up cadence on the deal. | **Nice-to-have** | Workaround via `update_deal({notes: ...})` or `update_contact({notes: ...})`. |

**Status:** ready.

---

### 7. Win-Back *(event+wait shape approved 2026-04-21)*

**Trigger:** `subscription.cancelled` OR `payment.failed`
**Canonical flow:** wait 3 days → `send_email` "we miss you, here's 20% off" → wait 7 days → `send_sms` reminder → on reply "yes" → `send_conversation_turn` to confirm intent → `create_invoice` with discount applied in metadata/line-item → `send_email` with hosted Stripe Checkout URL

**Tools used:** `send_email`, `send_sms`, `create_invoice`, `send_conversation_turn`, `update_contact`

**Gaps:**
| Gap | Severity | Notes |
|---|---|---|
| No discount-code primitive. Builder hand-builds the discount into the invoice line items. | **Nice-to-have** | Stripe supports coupon codes natively; exposing a `create_coupon` MCP tool would be a V1.1 polish. |

**Status:** ready for the event+wait shape. **Attendance-based Win-Back (yoga / gym / fitness) requires Brain v2's `contact.inactive_Nd` synthetic event emitter — V1.1 dependency already captured in the spike doc's V1.1 queue.**

---

## Consolidated gap ledger

### Critical (block at least one archetype)

| # | Tool / capability | Archetypes blocked | Est. LOC | Notes |
|---|---|---|---|---|
| G1 | `cancel_booking({booking_id})` | Appointment Confirmer | ~60 | Server action `cancelBookingAction` exists; MCP surface missing. |
| G2 | `reschedule_booking({booking_id, starts_at})` | Appointment Confirmer | ~80 | Mirror of create_booking against an existing row. |
| G3 | `get_booking({booking_id})` | Appointment Confirmer | ~40 | Straightforward lookup. |
| G4 | **Dynamic `wait` expression OR scheduled trigger** | Appointment Confirmer | — | **Architectural.** Either extend AgentSpec `wait.seconds` to accept expressions (`seconds_until(trigger.booking.startsAt - 24h)`), or add `trigger.type: "schedule"`, or accept Appointment Confirmer doesn't ship at v1 quality. |

### Nice-to-have (unblock polish / cleaner archetype JSON)

| # | Tool / capability | Archetypes affected | Est. LOC | Notes |
|---|---|---|---|---|
| N1 | `create_activity({contact_id, type, subject, body, metadata?})` | Client Onboarding, Support Deflection, Proposal Follow-Up, Win-Back | ~50 | Activity-log writer. Reads cleaner than `update_contact({notes})`. |
| N2 | `public_url` field on `get_form` response | Client Onboarding, Review Requester | ~5 | Additive response-shape change; zero breaking risk. |
| N3 | `list_bookings({contact_id?, from?, to?})` | Appointment Confirmer (post-V1.1) | ~40 | Useful-but-not-archetype-blocking. |
| N4 | `create_coupon({percent_off, code?, duration})` → Stripe | Win-Back | ~50 | Stripe already supports this; MCP surface missing. |

### Scope-constrained (ship with docs flag)

| # | Capability | Archetypes affected | Notes |
|---|---|---|---|
| S1 | Knowledge-base block | Support Deflection | No v1 KB block. Support Deflection ships limited to Soul-known FAQs (hours, services, location). Docs must flag that product-specific Q&A is V1.1. |
| S2 | Brain v2 `contact.inactive_Nd` synthetic event | Win-Back (attendance-based) | Already in V1.1 queue with the dependency call-out. Subscription-cancelled Win-Back ships in 7.c. |

---

## Recommendation for 7.c

### Ship now (5 archetypes)

**Ready without any tool work:**
1. **Speed-to-Lead** (proven)
2. **Client Onboarding** (minor N2 polish optional)
3. **Review Requester** (minor N2 polish optional)
4. **Proposal Follow-Up** (N1 useful but workaround exists)
5. **Win-Back (event+wait)** (N4 useful but workaround exists)

These 5 cover Speed-to-Lead (the headline demo), two CRM lifecycle agents (onboarding + follow-up), one retention agent (Win-Back), and one post-service agent (Review Requester). Strong range.

### Ship after a pre-7.c micro-slice (1 archetype)

**Support Deflection** — ships with a scoped docs callout ("Soul-FAQ-only; product-KB requires V1.1 block"). No blocking tool work. Include in 7.c alongside the first 5.

### Defer to V1.1 (1 archetype)

**Appointment Confirmer** — blocked by the dynamic-wait / scheduled-trigger architectural gap AND missing booking CRUD. Cleaner to ship properly in V1.1 alongside:
- G1–G3: booking CRUD quartet (`cancel_booking`, `reschedule_booking`, `get_booking`, `list_bookings`)
- G4: scheduled triggers (already V1.1 queued)

### Optional pre-7.c micro-slice ("7.h.2")

If you want to improve archetype JSON cleanliness, ship the **nice-to-have quartet** as a single slice before 7.c: `create_activity` (N1) + `public_url` on `get_form` (N2) + `list_bookings` (N3) + `create_coupon` (N4). ~145 LOC total. Makes all 6 v1 archetypes read noticeably cleaner in the JSON. Non-blocking; skipping is also fine.

---

## Summary for decision

**Hard scope call for 7.c:** 5 archetypes + Support Deflection (scoped) = **6 archetypes at ship**, not 7. Appointment Confirmer is the one that has to wait for V1.1.

**Optional pre-7.c slice:** micro-slice of 4 nice-to-have tools (N1–N4) for cleaner archetype JSON. ~145 LOC. Go / no-go is yours.

**Critical tool work (G1–G3) is V1.1 scope** alongside scheduled triggers — not worth shipping booking CRUD in isolation without the wait-expression work it'd pair with.

Awaiting your approval of the 6-archetype ship plan + the nice-to-have micro-slice go/no-go before any archetype JSON is written.
