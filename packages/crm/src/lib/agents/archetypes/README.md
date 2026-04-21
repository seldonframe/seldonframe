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
2. ⏳ **Win-Back** — event+wait shape with `create_coupon`.
3. ⏳ **Review Requester**.
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
