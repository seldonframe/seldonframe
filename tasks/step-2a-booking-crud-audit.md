# Step 2a — Booking CRUD audit

**Date:** 2026-04-21
**Scope:** complete the booking MCP surface alongside `create_booking` (7.h). Plan-gated under Scope 3 Step 2a per §0.5 of `tasks/v1-master-plan.md`.
**Gate:** implementation starts only after this audit's semantics choices are settled (below).

---

## Current surface

### MCP tools present (inventoried 2026-04-21)

| Tool | Shipped | Commit |
|---|---|---|
| `install_caldiy_booking` | ✅ | earlier |
| `list_appointment_types` | ✅ | Phase 2.c |
| `create_appointment_type` | ✅ | Phase 2.c |
| `update_appointment_type` | ✅ | Phase 2.c |
| `configure_booking` | ✅ | Phase 2.c |
| `create_booking` | ✅ | 7.h — `d6692737` |
| **`list_bookings`** | ✅ **already shipped** | pre-7.c micro-slice — `bb328ced` |
| `get_booking` | ✅ **shipped 2a.1** | this slice |
| `cancel_booking` | ❌ missing | 2a.2 scope |
| `reschedule_booking` | ❌ missing | 2a.3 scope |

**2a scope is 3 tools, not 4.** `list_bookings` was shipped in the pre-7.c micro-slice. Confirmed via `grep` on `skills/mcp-server/src/tools.js`.

### Server actions present (dashboard-only, session-authed)

- `cancelBookingAction(bookingId)` — `packages/crm/src/lib/bookings/actions.ts:766`. Updates `bookings.status = 'cancelled'`, sets `cancelledAt`, deletes the Google Calendar event, emits `booking.cancelled`. **Re-usable logic** for the MCP `cancel_booking` server helper.
- `completeBookingAction(bookingId)` — similar; updates `status = 'completed'`, emits `booking.completed`. Reference only.
- `markBookingNoShowAction(bookingId)` — ref only.
- **No `rescheduleBookingAction`** — net new logic for 2a.3.

### Event vocabulary present

`packages/core/src/events/index.ts` (`SeldonEvent` union):

- `booking.created` ✅
- `booking.completed` ✅
- `booking.cancelled` ✅
- `booking.no_show` ✅
- **`booking.rescheduled`** ❌ missing → needs adding for 2a.3

### Cross-block linkage discovered

- **`payment_records.bookingId`** — foreign key with `ON DELETE SET NULL`. A booking can have one or more payment records linked by this FK. Booking deletion leaves payment rows intact (FK nulls out); booking cancellation today does not touch payments.
- **`createBookingCheckoutSession`** + **`handleStripeCheckoutCompleted`** (`packages/crm/src/lib/payments/actions.ts`) — on a paid booking, the Stripe checkout flow sets `bookings.metadata.paymentStatus = "paid"` + `checkoutSessionId`. Cancel/reschedule logic must not silently invalidate these fields.
- **Google Calendar sync** — `deleteGoogleCalendarBookingEvent` on cancel, `syncBookingWithGoogleCalendar` on create. Reschedule needs an analog: either delete-and-recreate or a true move.

---

## Semantics decisions (to approve before implementation)

### Payment handling on cancel/reschedule

**Decision: payments stay untouched. 2a does NOT automatically refund, void, or modify payment state.**

Rationale:
- **Chargeback risk.** Automating a refund on cancel creates the same chargeback-adjacent pattern Win-Back explicitly avoided (§0.5 discipline) — the business may want to keep a deposit, charge a cancellation fee, or handle it case-by-case.
- **Composability principle.** `refund_payment`, `void_invoice`, `create_invoice` already exist as explicit tools. Agents that need "cancel the booking AND refund the deposit" compose two calls. That's the right abstraction.
- **Reschedule default is 'keep the deposit'.** When a customer moves their appointment from Tuesday to Thursday, the deposit transfers with it — matches real-world business workflow.

**What 2a DOES do:**
- `cancel_booking` → sets `bookings.status = 'cancelled'`, sets `cancelledAt`, deletes Google Calendar event, emits `booking.cancelled`. Does NOT touch payments. Response payload includes `linkedPaymentIds: string[]` so agents can see which payments remain if they want to refund.
- `reschedule_booking` → updates `bookings.startsAt` + `bookings.endsAt`, updates Google Calendar event (delete + recreate for simplicity; true move is future work), emits `booking.rescheduled`. Does NOT touch payments. Payment records keep their `bookingId` FK — the deposit stays linked.

**What's explicitly NOT in 2a scope:**
- Automatic refund on cancel.
- Charging a cancellation fee.
- Changing the price when rescheduling to a different appointment type.
- Partial refunds on reschedule.

Each of these is a distinct composition (`refund_payment` / `create_invoice`) an agent makes explicitly. Documented in the tool descriptions so agents don't silently assume payment follows.

### Past-time validation

- `cancel_booking` of a **past** booking → **allowed.** Legitimate use case: retroactive cleanup of records, marking a missed appointment after the fact. Note: `markBookingNoShow` is a different semantic; we keep both.
- `reschedule_booking` to a **past** `starts_at` → **rejected with 400**. Rescheduling to the past is a data-integrity red flag; explicit error message ("starts_at must be in the future").
- `reschedule_booking` of a **past** booking → **allowed** as long as the new `starts_at` is future. Unusual but not nonsense (e.g., "I missed this; let me rebook").

### Already-cancelled idempotency

- `cancel_booking` on an already-cancelled booking → **200 success, no-op.** Do NOT re-emit `booking.cancelled`; do NOT re-run Google Calendar delete. Response includes `alreadyCancelled: true` so callers can distinguish the no-op case.
- `reschedule_booking` on a cancelled booking → **rejected with 422**. Reviving a cancelled booking should be a new `create_booking`, not a reschedule.

### `booking.rescheduled` event shape

New entry in `SeldonEvent` union:

```ts
| { type: "booking.rescheduled"; data: {
    appointmentId: string;
    contactId: string | null;
    previousStartsAt: string;  // ISO — so downstream agents know what the old slot was
    newStartsAt: string;        // ISO
  } }
```

Rationale for including both `previousStartsAt` and `newStartsAt`: downstream agents that react to reschedules (sending "your new time is …" follow-up messages, updating calendar-invite emails) need both. Without `previousStartsAt`, a subscribing agent couldn't describe the change.

---

## Cross-block flag (per 2a discipline note)

The 2a scope is Booking-local in code logic. Three changes **touch files outside `lib/bookings/`** that warrant surfacing:

1. **`packages/core/src/events/index.ts`** — adding `booking.rescheduled` to the `SeldonEvent` union. Declarative schema extension owned by the Booking block's event vocabulary; no logic touched. Precedent: Phase 4.c / 5.d / 6.d all added events to this same file as part of their respective scopes.
2. **`packages/crm/src/lib/events/event-types.ts`** — the `BUILT_IN_EVENT_TYPE_SUGGESTIONS` list. Same precedent; additive only.
3. **`packages/crm/src/blocks/caldiy-booking.block.md`** — composition contract's `produces` gains `booking.rescheduled`; verbs optionally gain "reschedule" + "cancel" + "get" as routing tokens.

No changes to CRM / Email / SMS / Payments / Intake / Landing logic or schemas. No cross-block orchestration added in 2a (e.g., no "on booking.rescheduled, auto-send an email" — that would be an agent composition, not a 2a deliverable).

**If 2b.1 finds that contract v2 changes the shape of this produces-list addition, we'll re-migrate.** Noted for the 2b.1 pattern-validator.

---

## Implementation plan

**Per-tool commits for clean bisect-ability** (per user directive):

- **2a.1 — `get_booking`** — read-only, simplest. Establishes the API route pattern for the set.
- **2a.2 — `cancel_booking`** — write, idempotent. Reuses `cancelBookingAction` logic via a new `cancelBookingFromApi` helper (mirror of how 7.h built `createBookingFromApi` alongside the existing `createBookingAction`).
- **2a.3 — `reschedule_booking`** — net-new logic: update `startsAt`/`endsAt`, Google Calendar re-sync, emit `booking.rescheduled`. Adds the event to `SeldonEvent` union in the same commit.
- BLOCK.md composition-contract update ships **with 2a.3** (the commit that introduces `booking.rescheduled` to produces).

Each tool's commit includes:
- Server helper in `packages/crm/src/lib/bookings/api.ts` (extending the file shipped in 7.h).
- API route under `packages/crm/src/app/api/v1/bookings/[id]/…`.
- MCP tool entry in `skills/mcp-server/src/tools.js`.
- Inline smoke check (build + tool count).

### Smoke tests per tool

- **`get_booking`:** happy path + nonexistent id (404) + wrong-org id (404).
- **`cancel_booking`:** happy path (scheduled → cancelled) + already-cancelled (200 no-op with `alreadyCancelled: true`) + past booking (200 success).
- **`reschedule_booking`:** happy path (move future to future) + past-time `starts_at` (400) + cancelled booking (422) + nonexistent id (404).

### Final tool count expectation

- Start of 2a: 79 tools.
- After 2a ships: **82 tools** (+3 new: `get_booking`, `cancel_booking`, `reschedule_booking`).
- Confirm in the final commit message.

### Stop point

After 2a.3 ships + BLOCK.md update lands. Await Max's approval of 2a results before starting 2b.1.

---

## Open questions (surface now, not mid-implementation)

1. **Google Calendar reschedule — true-move vs delete-recreate?**
   Delete-recreate is simpler + matches existing cancel logic. True-move preserves the Calendar event id (better UX for attendees with the event on their calendars). **Decision: delete-recreate for v1**, flagged as V1.1 polish. If Max prefers true-move, add ~1 day of scope.
2. **Reschedule changing the appointment type?**
   The archetype-confirmer use case wants "move from 30-min consult to 60-min emergency visit." Reschedule API signature: just `starts_at`, or also optional `appointment_type_id`? **Decision: `starts_at` only for 2a.** Changing appointment type is a different composition (cancel + create). Keeps 2a.3 tight.
3. **Bulk reschedule / cancel?**
   Not in 2a scope. Agents that need it compose with `list_bookings` + N× single calls.

All answers above are the default recommendations. Max can overrule any before implementation starts.
