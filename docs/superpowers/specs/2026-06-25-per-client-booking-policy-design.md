# Per-Client Booking Policy — Design

**Date:** 2026-06-25
**Status:** Approved (design); P1 to implement first
**Author:** brainstormed with Max

## Problem

A deployed agent that books appointments currently uses hardcoded rules — 30-minute
slots, no buffer, no daily cap, no business-hours window, no required-fields gate.
But booking rules are **the client's business reality** and differ per client:
a plumber wants "Mon–Fri 9–5, 60-min jobs, 2-hour buffer, max 6/day, collect
name+phone+address"; a dentist wants "Tue–Sat 8–4, 30-min slots". These rules must
be configurable per client — and, because agents are sold/rented on the marketplace,
configurable by whoever operates the client (the agency today; the client via portal;
the SMB buyer who rents an agent directly).

## First Principle — product vs. configuration

SeldonFrame already models two layers, and this design leans on that split:

| Layer | Table | Owner | Holds |
|---|---|---|---|
| **Agent template** = the *product* | `agent_templates` | builder/agency | skill, tools, guardrails, the agent's nature ("I book appointments") + **default** booking rules |
| **Deployment** = the *instance* | `deployments` | the client (buyer/renter) | phone, calendar, business context, pricing + **the client's** booking rules |

This is the multi-tenant SaaS model: the agent is the app; each client is a tenant
with their own settings. The template **declares the contract + sensible defaults**;
the deployment **fills the client's values**. Booking rules therefore live on the
**deployment**, NOT baked into the shared/sold template.

## The data model — `BookingPolicy`

A single structured value, defaulted by the template, overridden per deployment:

```ts
// packages/crm/src/lib/agents/booking/booking-policy.ts (NEW)
export type BookingPolicy = {
  durationMinutes: number;      // appointment length            (default 30)
  bufferMinutes: number;        // gap enforced between bookings  (default 0)
  maxPerDay: number | null;     // cap on bookings/day; null=none (default null)
  leadTimeHours: number;        // min notice before a slot       (default 0)
  timezone: string;             // IANA, e.g. "America/Chicago"   (default workspace tz)
  weekdays: number[];           // 0=Sun..6=Sat                   (default [1,2,3,4,5])
  startTime: string;            // "HH:MM" 24h                    (default "09:00")
  endTime: string;              // "HH:MM" 24h                    (default "17:00")
  requiredFields: string[];     // collected before booking       (default ["name","phone"])
};
```

**Storage (additive, no destructive migration):**
- `deployments.booking_policy` — nullable `jsonb` (`Partial<BookingPolicy>` override).
- `agent_templates` blueprint gains an optional `defaultBookingPolicy?: Partial<BookingPolicy>`.

**Resolution (pure, the single source of truth):**
```ts
resolveBookingPolicy(
  deploymentPolicy?: Partial<BookingPolicy> | null,
  templateDefault?: Partial<BookingPolicy> | null,
  workspaceTimezone?: string,
): BookingPolicy   // deployment ?? template ?? SYSTEM_DEFAULTS, field-by-field
```
The resolved `BookingPolicy` is threaded onto `ctx.booking.policy` exactly like the
existing `ctx.booking.binding` — so voice, chat, SMS, and the public booking page all
read the same object.

## Enforcement — one policy, every channel

The two booking tools in `tools.ts` change from hardcoded to policy-driven:

- **`look_up_availability`** — generate candidate slots from
  `weekdays × [startTime,endTime] @ durationMinutes step + bufferMinutes`, in
  `timezone`; drop anything inside `leadTimeHours` from now; **intersect** with the
  backend's real free/busy (Composio Google/Outlook via `findDayAvailability`, or
  native); if `maxPerDay` is reached for a day, offer none that day.
- **`book_appointment`** — verify every `requiredFields` value was collected and the
  chosen slot still satisfies the policy (within window, lead time, under `maxPerDay`)
  **before** writing the event (Composio `CREATE_EVENT` or native submit).

`durationMinutes` also replaces the hardcoded `30` already passed to `createEvent`.

## Defaults + pre-fill (zero-config that still fits the client)

- **System defaults** make it work out-of-the-box (Mon–Fri 9–5, 30-min, 0 buffer, no
  cap, name+phone).
- **Template default** lets the agency ship a recommended policy with the agent.
- **Deploy-time pre-fill** maps the client's already-captured intake
  (`clientContext.soul.business_hours`, `services`) into the deployment's initial
  `booking_policy` + `requiredFields`, so the operator rarely starts from blank.

## Editing surfaces — one config, three doors (P1→P3)

A **single reusable editor component** (`BookingPolicyEditor`) writes
`deployment.booking_policy`. It is rendered in three places, shipped in value order:

- **P1 — Agency, on the client card** (`/studio/clients`): edit each client's policy
  on the deployment, pre-filled from intake. (Client never logs in — today's model.)
- **P2 — Client self-serve, in the portal** (the existing no-login portal link): the
  client tunes their own hours/duration. Reuses the P1 editor.
- **P3 — Marketplace-buyer setup step**: right after a buyer installs/rents an agent,
  a "set your booking rules" step. Reuses the P1 editor.

## Architecture / components

```
booking-policy.ts        BookingPolicy type, SYSTEM_DEFAULTS, resolveBookingPolicy (pure)
                         + generateCandidateSlots(policy, date) (pure)
deployments schema       + booking_policy jsonb
agent-templates blueprint + defaultBookingPolicy
booking-binding.ts /     thread resolved policy onto ctx.booking.policy (voice + chat seam)
binding-ctx.ts
tools.ts                 look_up_availability + book_appointment read ctx.booking.policy
client-context mapper    pre-fill booking_policy from intake at deploy time
BookingPolicyEditor.tsx  reusable editor (P1 client card; P2 portal; P3 marketplace)
deployment store/actions setBookingPolicyAction (org-guarded)
```

## Data flow

1. Deploy: intake → `bookingPolicyFromIntake()` seeds `deployment.booking_policy`.
2. Operator/client/buyer edits via `BookingPolicyEditor` → `setBookingPolicyAction`.
3. Inbound call/chat: `deploymentToBinding` + `resolveBookingPolicy` → `ctx.booking.policy`.
4. `look_up_availability` offers policy-shaped slots ∩ real calendar free/busy.
5. `book_appointment` validates required fields + policy, then writes the event.

## Error handling

- Missing/partial policy → `resolveBookingPolicy` fills from template → system default
  (never throws; agent always has a usable policy).
- Invalid stored values (e.g. end before start, bad tz) → clamp/fallback to defaults in
  the resolver; never break a live call.
- Calendar backend empty/error → existing fail-soft to native availability is unchanged
  (the policy still shapes the native slots).

## Testing

- **Pure (TDD):** `resolveBookingPolicy` (override precedence, clamping, bad input);
  `generateCandidateSlots` (weekday filter, duration+buffer stepping, lead-time cutoff,
  tz correctness); `bookingPolicyFromIntake` (hours/services → policy).
- **Tool seam:** `look_up_availability` respects the window/duration/buffer/maxPerDay and
  still intersects with an injected free/busy fake; `book_appointment` rejects when a
  required field is missing.
- **Action:** `setBookingPolicyAction` org-guard + persist (DI form).

## Scope / phasing

- **P1 (this plan — the engine + agency editor):** `booking-policy.ts` (types, defaults,
  resolver, slot generator) · schema (`deployments.booking_policy` +
  `defaultBookingPolicy`) · thread `ctx.booking.policy` · enforcement in both tools ·
  intake pre-fill · `setBookingPolicyAction` · `BookingPolicyEditor` on the client card.
  *After P1, every agent respects each client's real hours/duration/buffer/cap/lead-time
  and required-fields — ~80% of the value.*
- **P2:** the `BookingPolicyEditor` in the client portal (reuse).
- **P3:** the marketplace-buyer setup step (reuse).

P2 and P3 add no new policy logic — only new render locations for the same editor +
`setBookingPolicyAction`. They are separate plans.

## Non-goals (YAGNI for now)

- Per-day distinct windows (uniform window + weekday set covers the 80%); revisit if asked.
- Multiple appointment *types* per agent with different durations (one policy per
  deployment for v1).
- Deposits / payment-to-book, approval-required holds.
