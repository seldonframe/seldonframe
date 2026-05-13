# Agent archetype library

**Phase 7.c.** Pre-validated AgentSpec templates with typed placeholder slots. Synthesis fills the slots from Soul + user-provided context + NL customization; the filled spec ships to the runtime (7.e).

## Why archetypes, not NL-from-scratch

Phase 7.a live-run evidence (`tasks/phase-7-synthesis-spike.md`) showed:

- Claude synthesizes **coherent but shape-variable** agents from the same prompt (4 / 5 / 7-step versions of Speed-to-Lead on consecutive runs).
- Claude **silently fabricates** a plausible agent from vague prompts rather than asking for clarification.
- Claude **declines grounded** (with specific catalog references) when capabilities are genuinely missing.

The product implication: **archetype + NL customization** is the primary UX, not NL-from-scratch. An archetype pins the structural skeleton to a canonical shape; Claude only varies copy + placeholders. Low variance, high reliability.

## File layout

```
archetypes/
├── README.md                    ← you are here
├── types.ts                     ← Archetype / ArchetypePlaceholder types
├── index.ts                     ← registry: listArchetypes(), getArchetype(id)
├── speed-to-lead.ts             ← shipped 2026-04-21 (reference implementation)
├── win-back.ts                  ← (coming)
├── review-requester.ts          ← (coming)
├── client-onboarding.ts         ← (coming)
├── proposal-followup.ts         ← (coming)
└── support-deflection.ts        ← (coming, scoped to Soul-known FAQs)
```

## Marker conventions

Two marker types appear in `specTemplate`:

| Marker | Resolved | Purpose |
|---|---|---|
| `$placeholderName` | **Synthesis time** — once per deploy | `user_input` (e.g., `$formId`) OR `soul_copy` (e.g., `$openingMessage`) per the `placeholders` metadata. |
| `{{expression}}` | **Runtime** — every time the agent fires | Trigger-payload refs (`{{contact.id}}`, `{{trigger.data.name}}`) + variables extracted by conversation steps (`{{preferred_start}}`). |

Two conventions → two resolution paths → clean separation of "filled once per deploy" vs "filled every time the agent fires."

## Known limitations (archetype-wide)

- **No scheduled/cron triggers in v1.** Archetypes that need "N days before booking starts" or "N days since last contact" are V1.1. Appointment Confirmer deferred for this reason. Event + `wait.seconds` handles the rest.
- **Placeholder resolution is single-pass.** `$placeholders` in string fields are substituted once during synthesis; nested `${...}` references aren't re-evaluated. Keep it flat.
- **Validator (from the 7.a spike) checks tool names, not argument keys.** Argument-name drift across synthesis runs is mitigated by defensive aliases at the API route layer (e.g., `start_time → starts_at` shipped 2026-04-21). Structural fix lands with V1.1 composition-contract-schema-v2.

## Ship order (for 7.c — from `tasks/mcp-gap-audit-v2.md`)

1. ✅ **Speed-to-Lead** — reference implementation.
2. ✅ **Win-Back** — event+wait shape with `create_coupon`.
3. ✅ **Review Requester**.
4. ⏳ **Client Onboarding**.
5. ⏳ **Proposal Follow-Up**.
6. ⏳ **Support Deflection** (Soul-scoped).

**Deferred to V1.1:** Appointment Confirmer (needs scheduled triggers + booking CRUD mutation tools).

Each archetype ships with:
1. The JSON template file under this directory.
2. A README section below in this file describing what it does, what blocks it requires, and known limitations.
3. A live probe run showing it synthesizes cleanly against the synthesis engine (via `scripts/phase-7-spike/probe-archetype.mjs`).
4. Entry in the `archetypes` registry.

---

## Archetype: Speed-to-Lead

**ID:** `speed-to-lead`
**Shipped:** 2026-04-21 (commit pending)
**Blocks required:** `crm`, `formbricks-intake`, `sms`, `caldiy-booking`, `email`
**Events used:** trigger = `form.submitted`; produces `conversation.turn.received`, `conversation.turn.sent`, `booking.created`, `email.sent`.
**Tools used:** `create_booking`, `send_email`, `create_activity`. The SMS conversation step uses the Conversation Primitive runtime implicitly.

**What it does.** When a prospect submits an intake form, the agent waits a short delay, texts them to qualify via the Conversation Primitive runtime, extracts their preferred appointment time + insurance status, books the consultation, logs an activity on the contact, and emails a confirmation.

**Placeholders the user provides:**
- `$formId` — which intake form triggers this agent (picker from `list_forms`).
- `$appointmentTypeId` — which appointment type to book into (picker from `list_appointment_types`).
- `$waitSeconds` — initial delay in seconds (default 120).

**Placeholders Claude fills from Soul:**
- `$openingMessage` — opening SMS copy.
- `$qualificationCriteria` — natural-language exit condition for the conversation.
- `$confirmationSubject` / `$confirmationBody` — confirmation email copy.

**Known limitations:**
- Qualification logic is Soul-derived, not user-configured. Strict qualification rules (e.g., "reject all under $X budget") require post-synthesis exit_when editing; advanced qualification UI is V1.1.
- Booking assumes standard business-hours availability. `create_booking` schedules against the existing appointment type's availability window (Mon–Fri 9–5 by default, editable on `/bookings`). If the extracted `preferred_start` is outside that window, the booking create call 422s and the agent logs a fallback activity.

**Live probe evidence:** see `tasks/phase-7-synthesis-spike/live-01-happy-path.json` from the 2026-04-21 post-7.h run. 5/5 determinism repeats converged on the same skeleton (`wait → conv:sms → create_booking → send_email`) with 0 hallucinations and 100% grounding.

---

## Archetype: Win-Back

**ID:** `win-back`
**Shipped:** 2026-04-21
**Blocks required:** `crm`, `email`, `sms`, `payments`
**Events used:** trigger = `subscription.cancelled`; produces `email.sent`, `sms.sent`.
**Tools used:** `create_coupon`, `create_activity` (×2 — initiated + complete), `send_email`, `send_sms`.

**What it does.** When a customer cancels their subscription, the agent immediately creates a per-contact unique Stripe promotion code (14-day expiry by default) on the workspace's connected Stripe account. It logs the initiation with the code captured in the activity metadata, waits 3 days, sends a warm brand-matched email referencing the code, waits 4 more days, sends a shorter SMS reminder with the same code, and logs sequence complete. The customer redeems the code at checkout if they come back — no auto-invoicing.

**Flow (7 steps):**

```
trigger (subscription.cancelled)
  ↓
create_coupon (capture → coupon)
  ↓
create_activity (type: agent_action, includes {{coupon.code}})
  ↓
wait $initialDelaySeconds (default 3 days)
  ↓
send_email (references {{coupon.code}})
  ↓
wait $reminderDelaySeconds (default 4 days)
  ↓
send_sms (references {{coupon.code}}, shorter/less formal)
  ↓
create_activity (type: agent_action, sequence complete)
```

**Placeholders the user provides:**
- `$discountPercent` — discount percentage (1–100). Common Win-Back range: 15–30.
- `$couponDurationDays` — how many days the code stays redeemable. Default 14.
- `$initialDelaySeconds` — delay before first email. Default 259200 (3 days).
- `$reminderDelaySeconds` — delay before SMS reminder. Default 345600 (4 days).

**Placeholders Claude fills from Soul:**
- `$couponName` — human-readable coupon name for the Stripe dashboard.
- `$winBackEmailSubject` / `$winBackEmailBody` — warm, on-brand, references `{{coupon.code}}`.
- `$winBackSmsBody` — shorter, less formal, references `{{coupon.code}}` and the imminent expiry.

**Why no `create_invoice` at the end (intentional omission).**

The `create_invoice` tool exists (Phase 5.f) and Win-Back looks superficially like a flow that should end by sending the ex-customer an invoice pre-discounted with their coupon. The archetype deliberately stops at the SMS reminder and lets the customer self-serve via the coupon. Three reasons:

1. **Chargeback risk.** Auto-billing a customer who just cancelled dramatically increases the odds of a dispute. Stripe's chargeback threshold is 1% — a single Win-Back-triggered chargeback per 100 customers tanks the SMB's processing risk rating.
2. **Trust cost.** The customer cancelled. Sending a pre-filled invoice reads as hostile — "we didn't hear no." The coupon-plus-reminder pattern lets the customer *opt back in*, which preserves the relationship for the next cycle even if this one doesn't convert.
3. **Attribution integrity.** A Win-Back redeemed at checkout carries the promotion code, which surfaces cleanly on the resulting `payment.completed` event for attribution. An auto-invoice doesn't require the code, so redemption-via-agent can't be cleanly distinguished from organic re-signup.

`create_invoice` is still available to agents that genuinely need it (dunning, mid-cycle upgrades, etc.). It's specifically wrong for Win-Back's "offer, don't bill" shape.

**Note on per-contact uniqueness.** The `create_coupon` tool (shipped in the pre-7.c micro-slice) creates a Stripe `Coupon` + a matching `PromotionCode` with `max_redemptions: 1` by default. Each call produces a new redeemable code string. Stripe natively supports this pattern — shared codes with per-contact redemption caps aren't needed. The returned `data.code` is the string agents embed in outgoing messages; the `data.couponId` + `data.promotionCodeId` are stored for audit.

**New template feature used: `capture`.** The `create_coupon` step carries `capture: "coupon"`, which binds the tool's response `data` object to the `coupon` runtime variable. Downstream steps reference `{{coupon.code}}`, `{{coupon.couponId}}`, etc. The 7.e runtime (not yet shipped) will honor this; the validator accepts the field as-is. First use of `capture` in the archetype library — documented in `types.ts`.

**Known limitations:**
- Single-event trigger (`subscription.cancelled`). For `payment.failed`-triggered variant, clone + swap the trigger event. Multi-event triggers are V1.1.
- Shared expiry window — every contact gets a unique code but all share `$couponDurationDays` from agent-fire time. Per-contact custom expiry is V1.1.
- **Inactivity-based Win-Back (yoga / gym / fitness studios)** — requires Brain v2's `contact.inactive_Nd` synthetic event emitter. Not available in v1; attendance-based verticals get a "Coming V1.1" flag in the archetype library UI.

**Live probe evidence:** `tasks/phase-7-archetype-probes/win-back.report.md` — 3× PASS, 0 hallucinations, `capture` threading verified across 6 references in 4 distinct step types.

---

## Archetype: Review Requester

**ID:** `review-requester`
**Shipped:** 2026-04-21
**Blocks required:** `crm`, `email`, `sms`, `caldiy-booking`
**Events used:** trigger = `booking.completed`; produces `email.sent`, `sms.sent`.
**Tools used:** `send_email`, `send_sms`, `create_activity`.

**What it does.** Fires on `booking.completed`. Waits a short reflect window (default 2 days), sends a warm email asking for a review with the configured URL, waits 5 days, sends a shorter SMS reminder with the same URL, logs a sequence-complete activity.

**Flow (5 steps):**

```
trigger (booking.completed)
  → wait $initialDelaySeconds (default 2 days)
  → send_email (includes $reviewLink)
  → wait $reminderDelaySeconds (default 5 days)
  → send_sms (includes $reviewLink, shorter)
  → create_activity (type: review_request, sequence complete)
```

**Placeholders the user provides:**
- `$reviewLink` — URL where reviews land. Full `https://` URL. Embedded verbatim in email + SMS copy.
- `$initialDelaySeconds` — delay before the email. Default 172800 (2 days).
- `$reminderDelaySeconds` — delay before the SMS reminder. Default 432000 (5 days).

**Placeholders Claude fills from Soul:**
- `$reviewEmailSubject` / `$reviewEmailBody` — warm, on-brand, includes `$reviewLink` inline, offers a reply-path for customers who had issues.
- `$reviewSmsBody` — shorter (<200 chars), less formal, includes `$reviewLink`.

### SMS reminder behavior — honest upfront disclosure

This archetype sends the SMS reminder 3–7 days after the email, **regardless of whether the customer has already submitted a review**. V1 has no `review.submitted` event in the SeldonEvent vocabulary; V1.1 will add a conditional branch that suppresses the reminder when the review is detected as submitted, once the `branch` step type supports external-state checks.

**Workarounds available today:**
- Manually deactivate the agent for customers you've already received reviews from (one-click on the agent page per contact).
- Pair with a custom block that emits `review.submitted` events scraped from whichever review destination you use — then rewrite the archetype to use a `branch` step reading those.

**Don't let users discover the duplicate-ask issue at use-time.** The archetype detail pane surfaces this known-limitation up front per the `knownLimitations` array.

### `$reviewLink` flexibility note

`$reviewLink` can point anywhere:

- **Google Business Profile review URL** (recommended for local SEO value — reviews rank the business in Google Maps + search).
- **Yelp or industry-specific review sites** (Avvo for lawyers, Healthgrades for medical practices, etc.).
- **An internal form** — a SeldonFrame intake form that captures rating + feedback.

Sophisticated implementations use an internal form that asks "how was your experience?" first, then:
- **Positive responses (4–5 stars)** → redirect to the public review site (Google / Yelp) to capture the public review.
- **Negative responses (1–3 stars)** → captures the feedback privately for the business to respond before it goes public.

**Compliance flag — review gating.** The pattern above (filtering which customers get directed to public review sites based on predicted sentiment) is known as "review gating" and has compliance considerations in some jurisdictions. The FTC in the United States has been increasingly active on this since 2019; Google's review policies explicitly prohibit it; some industries (medical, legal) have additional regulation. **Users should consult local regulations + platform terms if implementing this pattern.** The archetype itself doesn't enforce or forbid it — we teach the pattern, surface the flag, and leave the decision to the user.

**Known limitations:**
- SMS reminder fires unconditionally (see above).
- `$reviewLink` is treated as opaque — the archetype doesn't know whether you're pointing at Google, Yelp, or an internal form. Copy in email + SMS is generic enough to work with any destination, but builders who want destination-specific copy ("leave us a Google review!") can hand-edit after synthesis.

**Live probe evidence:** pending — see `tasks/phase-7-archetype-probes/review-requester.report.md` after the 3× probe run.

---

## Archetype: Missed-Call Text Back

**ID:** `missed-call-text-back`
**Shipped:** 2026-05-12 (v1.46.0)
**Blocks required:** `crm`, `sms`
**Events used:** trigger = `call.missed`; produces `sms.sent`, `activity.created`.
**Tools used:** `send_sms`, `create_activity`.

**What it does.** Fires on `call.missed` — emitted by the Twilio Voice
status-callback webhook (`/api/webhooks/twilio/voice`) when an inbound
call ends with `CallStatus ∈ no-answer | busy | failed`. Waits a short
delay (default 30 seconds — fast enough to catch the caller before
they dial the next contractor, slow enough to not interrupt a quick
ring-back), sends a vertical-aware SMS qualifying message via the
Conversation Primitive runtime, waits a follow-up window (default 4
hours), and logs a sequence-complete activity. The follow-up SMS
conversation flows back through the existing inbound-SMS pipeline,
which routes to the workspace's chatbot agent for full qualification
+ booking.

**Flow (4 steps):**

```
trigger (call.missed)
  → wait $delaySeconds (default 30s)
  → send_sms (with $textBackBody from the missed-call skill pack)
  → wait $followupDelaySeconds (default 14400 = 4 hours)
  → create_activity (type: missed_call, includes CallSid + status)
```

**Placeholders the user provides:**
- `$delaySeconds` — seconds after `call.missed` before SMS fires.
  Default 30. Lower for emergency-positioned verticals (HVAC: 15);
  higher for low-urgency verticals (real estate: 120).
- `$followupDelaySeconds` — seconds after SMS before still-pending
  activity logs. Default 14400 (4 hours).

**Placeholders Claude fills from Soul:**
- `$textBackBody` — vertical-aware SMS body. Synthesis reads the
  per-vertical templates at
  `packages/crm/src/lib/agents/skills/missed-call/vertical-templates.md`.
  HVAC gets emergency-vs-routine framing; dental gets insurance pre-
  qualification; salon gets stylist preference; etc. The harness is
  vertical-agnostic; the *intelligence* lives in the skill pack —
  when Claude/GPT/Gemini get better, the synthesized SMS gets better
  without code changes.

### Twilio configuration (BYOK)

The agency configures their workspace's Twilio number with the
SeldonFrame voice webhook URL. Both the Voice URL and the
StatusCallback URL point at `/api/webhooks/twilio/voice`:

- **Voice URL** (when call arrives): returns empty TwiML, Twilio hangs
  up cleanly. The agency's own voicemail/IVR/voice-agent runs on
  their main phone line; Twilio is the catch-all that fires the
  status callback when the main line doesn't answer.
- **StatusCallback URL** (when call ends): receives the terminal
  status. If `no-answer | busy | failed`, emits `call.missed` and
  the archetype fires.

For agencies that want Twilio to BE the main phone line (not a
catch-all), the voice-agent infrastructure ships Q3 2026 — same
endpoint, different TwiML response that connects the call to
LiveKit + OpenAI Realtime for live AI answering. The archetype
stays valid for unanswered calls regardless.

### Known limitations

- **Anonymous callers (caller-ID blocked).** Twilio sends
  From="anonymous" or empty. The archetype skips the SMS step (the
  SMS provider's E.164 validation rejects empty numbers). The call
  still logs to the activity timeline; operator follows up manually
  if voicemail was left.
- **Voicemail-left calls do NOT fire `call.missed`.** When a caller
  leaves voicemail, Twilio sends `CallStatus="completed"` with a
  RecordingUrl — not a missed status. Voicemail-as-CRM-activity
  (transcribe + emit `voicemail.left`) is a separate archetype
  (Q4 2026). If the agency wants one text-back per unanswered call
  regardless of voicemail, configure Twilio to disable voicemail.
- **No conditional suppression on already-texted-back callers.**
  Same caller within the follow-up window triggers the archetype
  twice. Workaround: tighten `$delaySeconds` to >300 (5 min) so the
  follow-up activity logs before a second call can fire. Real fix
  is V1.1's branch step with external-state checks.
- **A2P 10DLC compliance is the agency's responsibility.** Outbound
  SMS to US numbers requires the agency's Twilio number to be A2P-
  approved. Pre-flight check ships with the partner-agency onboarding
  wizard (Q3 2026).

**Live probe evidence:** pending — first deployment will be the live
probe. Determinism: spec is structurally simpler than review-
requester (4 steps, 1 mcp_tool_call before the activity log), so
synthesis-shape variance should be ≤ review-requester's 5/5.
