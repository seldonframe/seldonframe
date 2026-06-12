# Bookings Calendar UX Overhaul — Design

**Date:** 2026-06-11
**Status:** Design approved — ready for implementation plan
**Scope:** The operator's `/bookings` calendar (`app.seldonframe.com/bookings`). The light-mode beige/parchment rebrand is a **separate, deferred project** (already decomposed out).

## Goal

Turn the read-only week grid into a world-class interactive calendar: click an empty slot to **book a prospect or block time**, **drag any block to reschedule** (with an opt-in email to the prospect), and render bookings at their **real duration**.

## Current state

- `packages/crm/src/components/bookings/bookings-page-content.tsx` — a custom, timezone-aware week grid (8:00–20:00, 80px/hour, cards absolutely positioned by start time). Read-only: cards link to the contact record. Every card is a fixed **60 min** tall (ignores real duration). ~1067 lines, doing too much.
- `packages/crm/src/lib/bookings/actions.ts` — has `createBookingAction`, `cancelBookingAction`, `completeBookingAction`, `markBookingNoShowAction`, `listBookings`. **No reschedule action. No blocked-time concept.** Statuses: `scheduled` / `completed` / `cancelled` / `no_show` / `template` / `pending_payment`.
- Public availability (`listPublicBookingSlotsAction`) already excludes `scheduled`/`completed`/`pending_payment` from open slots.

## Approach

**Extend the existing custom grid** rather than adopt a calendar library (react-big-calendar / FullCalendar). The grid already solves the hard, correct part — TZ-accurate time↔pixel mapping — and is styled to our tokens; a library would discard both and need heavy restyling. Interactions are added with direct pointer math against the existing grid coordinates. (`@dnd-kit` is available but unnecessary for free-position calendar drag.)

## Features

### 1. Click-to-create

Clicking an empty area of a day column opens a popover anchored at the click; start time derived from the click's y-position, snapped to 15 min. Two tabs:

- **Book a prospect** — contact combobox (search existing or "+ create new" inline) + appointment-type select; submits `createBookingAction` with the chosen contact, type, and start time.
- **Block time** — a free-text label + duration; submits `createBlockedTimeAction` (no contact).

### 2. Drag-to-reschedule

Pointer-drag a block: `pointerdown` captures it, `pointermove` shows a live ghost following the cursor (snapped to 15-min rows, can cross day columns), `pointerup` computes the new start time.

- **Prospect booking** → confirmation popover: *"Move {title} to {new time} and email {contact}? [Confirm] [Cancel]"*. Confirm → `rescheduleBookingAction(id, newStart, notify:true)` + reschedule email. Cancel → revert (no DB write).
- **Blocked time** → commits immediately via `rescheduleBookingAction(id, newStart, notify:false)` (no contact → no email, no confirm).
- **Conflict guard:** server rejects a move overlapping another non-template booking in the same workspace (reuse the existing day-conflict query).

### 3. Real-duration cards

Card height = `(durationMinutes / 60) × HOUR_HEIGHT_PX`. Duration resolved from the booking's appointment-type metadata (fallback 30 min). Fixes the current fixed-60 bug.

## Schema

Add `blocked` to the booking status set (Drizzle enum / status validator):

- Renders greyed, labeled "Blocked", no contact link.
- `listPublicBookingSlotsAction`'s conflict set gains `blocked`, so blocked time is unavailable for public booking.
- Migration adds the value, matching the existing enum/constraint migration pattern in `packages/crm/drizzle`.

## Backend (`lib/bookings/actions.ts`)

- **`rescheduleBookingAction(bookingId, newStartsAtISO, notify)`** — authz (operator owns the booking's org); load booking; compute `newEndsAt` preserving existing duration; conflict-guard against other non-`template` bookings that day; update `startsAt`/`endsAt`/`updatedAt`; `revalidatePath('/bookings')`. When `notify` and the booking has a `contactId` and status ≠ `blocked`, send the reschedule email. Returns the updated row for optimistic reconcile. Pure helpers (`computeRescheduledEnd`, conflict predicate) extracted for unit testing.
- **`createBlockedTimeAction(formData)`** — insert a booking with status `blocked`, no contact, given label + start/end.
- **Reschedule email** — new `lib/messaging/skills/booking-reschedule.ts`, mirroring `booking-confirmation.ts`: Resend, to the contact's email; subject "Your {appointment} time changed"; body with old→new time (workspace TZ) + a link to re-book / cancel. Only sent on operator confirm (the `notify` flag).

## Frontend structure

Split the 1067-line component into focused units (it's too large to extend safely):

- `WeekCalendar` — grid shell + pointer interaction controller (drag state, click-to-create).
- `BookingCard` — one positioned block (drag handle, real height, status styling, contact link preserved).
- `CreatePopover` — click-to-create popover (two tabs).
- `RescheduleConfirm` — drag-drop confirm popover.
- Appointment-Types + Upcoming sections stay as-is.
- Server actions passed in as props (existing pattern).

## Data flow

Server page → `listBookings` + types + contacts → `WeekCalendar`. Interactions call server actions (`createBookingAction`, `createBlockedTimeAction`, `rescheduleBookingAction`) → `revalidatePath('/bookings')` → fresh data. Drag uses optimistic UI: move the ghost immediately, reconcile on action result, revert on error.

## Error handling

- Reschedule conflict → action returns `{ ok:false, error:'conflict' }`; UI reverts the block + toasts "That slot's taken."
- Email send failure → non-fatal; the move persists; toast "Moved, but the email didn't send."
- Drag onto off-hours/disabled area → snap to nearest valid slot.

## Testing

- **Unit:** time↔pixel + snap-to-15 math; `computeRescheduledEnd` (duration preserved); the reschedule conflict predicate; email-gating (prospect + `notify` → send; `blocked` or `notify:false` → no send).
- **Manual:** Vercel-preview smoke — click-create a prospect + a block; drag a prospect booking (confirm + email received) and a block (silent); verify public availability excludes a blocked slot.

## Out of scope (this project)

- **Resize** (drag the edge to change duration) — fast-follow.
- **Beige light-mode rebrand** — separate project.
- Month/day views, recurring blocks, calendar-library swap.

## Phasing (for the implementation plan)

1. **Schema** — `blocked` status + migration + public-availability exclusion.
2. **Backend** — `rescheduleBookingAction`, `createBlockedTimeAction`, reschedule email (with extracted pure helpers + unit tests).
3. **Frontend extract** — `WeekCalendar` / `BookingCard` + real-duration cards (pure refactor, visual parity, no interactions yet).
4. **Click-to-create** popover.
5. **Drag-to-reschedule** + confirm + optimistic UI.
6. **Tests + preview smoke.**
