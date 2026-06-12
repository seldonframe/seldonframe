# Bookings Calendar UX Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the operator's `/bookings` week calendar interactive — click an empty slot to book a prospect or block time, drag any block to reschedule (with an opt-in prospect email), and render bookings at their real duration.

**Architecture:** Extend the existing custom, timezone-aware week grid (no calendar library). New pure math/helpers are unit-tested in isolation; server actions (`rescheduleBookingAction`, `createBlockedTimeAction`) carry the persistence + conflict guard + email; the 1067-line page component is split into `WeekCalendar` + `BookingCard` + two popovers, with optimistic drag UI.

**Tech Stack:** Next.js 16 App Router (server actions + `revalidatePath`), Drizzle + Neon Postgres, React client component with native pointer events, Resend for email, `node:test` unit tests (`pnpm test:unit`), styled with the existing shadcn-style tokens.

**Spec:** `docs/superpowers/specs/2026-06-11-bookings-calendar-ux-design.md`

**Test/verify commands** (from `packages/crm`):
- Unit: `pnpm test:unit` (root) or `npx tsx --test tests/unit/<file>.spec.ts`
- Typecheck: `npx tsc --noEmit -p tsconfig.json`

---

## File Structure

**Create:**
- `packages/crm/src/lib/bookings/calendar-math.ts` — pure grid math (px↔time, snap, duration, overlap). No I/O.
- `packages/crm/tests/unit/calendar-math.spec.ts` — unit tests for the math.
- `packages/crm/src/lib/messaging/skills/booking-reschedule.ts` — reschedule email (mirrors `booking-confirmation.ts`).
- `packages/crm/src/components/bookings/week-calendar.tsx` — grid shell + pointer interaction controller.
- `packages/crm/src/components/bookings/booking-card.tsx` — one positioned block.
- `packages/crm/src/components/bookings/create-popover.tsx` — click-to-create popover (two tabs).
- `packages/crm/src/components/bookings/reschedule-confirm.tsx` — drag-drop confirm popover.

**Modify:**
- `packages/crm/src/lib/bookings/status.ts` (or the existing booking-status type location — see Task 1) — add `blocked`.
- `packages/crm/src/lib/bookings/actions.ts` — add `rescheduleBookingAction`, `createBlockedTimeAction`; add `blocked` to the public-availability conflict set.
- `packages/crm/src/components/bookings/bookings-page-content.tsx` — render `<WeekCalendar>` instead of the inline grid; thread new action props.
- The `/bookings` server page (caller of `BookingsPageContent`) — pass the new server actions + ensure each booking row carries `durationMinutes`, `endsAt`, `status`.

---

## Phase 1 — Schema: `blocked` status (no migration)

### Task 1: Add `blocked` to the booking status set + public-availability exclusion

`bookings.status` is a plain `text` column (`db/schema/bookings.ts:24`) — **no DB migration needed**. The status value set is enforced app-side.

**Files:**
- Find the existing status union: `grep -rn "no_show" packages/crm/src/lib/bookings` → the `BookingStatus` type / status const.
- Modify: that file — add `"blocked"`.
- Modify: `packages/crm/src/lib/bookings/actions.ts` — the public-availability conflict query (the `inArray(bookings.status, [...])` near `listPublicBookingSlotsAction`, ~line 652) and the day-conflict set (~line 1531).

- [ ] **Step 1: Add `blocked` to the status union/const**

In the booking-status definition, add `"blocked"` to the union and any `BOOKING_STATUSES` array. Add a comment: `// 'blocked' = operator's busy time; no contact; excluded from public availability.`

- [ ] **Step 2: Exclude `blocked` from public availability**

In `listPublicBookingSlotsAction`'s conflict query, change the status filter so blocked time counts as busy. The existing set is `["scheduled", "completed", "pending_payment"]`-style — add `"blocked"`:
```ts
inArray(bookings.status, ["scheduled", "completed", "pending_payment", "blocked"]),
```
Do the same in the operator-create day-conflict query (`createBookingAction`, ~line 1531) so a new booking can't be placed over a block.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 0 errors.

- [ ] **Step 4: Commit**
```bash
git add packages/crm/src/lib/bookings
git commit -m "feat(bookings): add 'blocked' status, excluded from public availability"
```

---

## Phase 2 — Backend: math, reschedule, block, email

### Task 2: Pure calendar math + tests (TDD)

**Files:**
- Create: `packages/crm/src/lib/bookings/calendar-math.ts`
- Test: `packages/crm/tests/unit/calendar-math.spec.ts`

- [ ] **Step 1: Write the failing test**
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  yToSnappedMinutes, minutesToClock, computeRescheduledEnd, intervalsOverlap,
  HOUR_HEIGHT_PX, SNAP_MINUTES,
} from "@/lib/bookings/calendar-math";

test("yToSnappedMinutes snaps to 15-min and clamps to the grid", () => {
  assert.equal(yToSnappedMinutes(0), 0);
  assert.equal(yToSnappedMinutes(HOUR_HEIGHT_PX), 60);          // 1h down = 60 min
  assert.equal(yToSnappedMinutes(HOUR_HEIGHT_PX / 4 + 3), SNAP_MINUTES); // ~15 min, snapped
  assert.equal(yToSnappedMinutes(-50), 0);                      // clamp low
  assert.ok(yToSnappedMinutes(100000) <= (20 - 8) * 60 - SNAP_MINUTES); // clamp high
});

test("minutesToClock offsets from the 8:00 grid start", () => {
  assert.deepEqual(minutesToClock(0), { hours: 8, minutes: 0 });
  assert.deepEqual(minutesToClock(90), { hours: 9, minutes: 30 });
});

test("computeRescheduledEnd preserves the original duration", () => {
  const start = new Date("2026-06-12T13:30:00Z");
  const end = new Date("2026-06-12T14:00:00Z"); // 30 min
  const newStart = new Date("2026-06-13T09:15:00Z");
  assert.equal(
    computeRescheduledEnd(start, end, newStart).toISOString(),
    "2026-06-13T09:45:00.000Z",
  );
});

test("intervalsOverlap is true on overlap, false on adjacency", () => {
  const a0 = new Date("2026-06-12T10:00:00Z"), a1 = new Date("2026-06-12T11:00:00Z");
  assert.equal(intervalsOverlap(a0, a1, new Date("2026-06-12T10:30:00Z"), new Date("2026-06-12T11:30:00Z")), true);
  assert.equal(intervalsOverlap(a0, a1, a1, new Date("2026-06-12T12:00:00Z")), false); // touching edge
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `npx tsx --test tests/unit/calendar-math.spec.ts`
Expected: FAIL — module `@/lib/bookings/calendar-math` not found.

- [ ] **Step 3: Implement `calendar-math.ts`**
```ts
// Pure grid math for the /bookings week calendar. No DOM, no I/O — unit-tested.
// Grid constants mirror bookings-page-content.tsx so the controller and the
// renderer agree on the same coordinate system.
export const WEEK_VIEW_START_HOUR = 8;
export const WEEK_VIEW_END_HOUR = 20; // exclusive
export const HOUR_HEIGHT_PX = 80;
export const SNAP_MINUTES = 15;

/** y-offset (px from the top of the grid) → minutes-from-grid-start, snapped to
 *  SNAP_MINUTES, clamped so a dropped block always lands inside the visible grid. */
export function yToSnappedMinutes(yPx: number): number {
  const rawMinutes = (yPx / HOUR_HEIGHT_PX) * 60;
  const snapped = Math.round(rawMinutes / SNAP_MINUTES) * SNAP_MINUTES;
  const maxMinutes = (WEEK_VIEW_END_HOUR - WEEK_VIEW_START_HOUR) * 60 - SNAP_MINUTES;
  return Math.max(0, Math.min(snapped, maxMinutes));
}

/** minutes-from-grid-start → wall-clock {hours, minutes} (grid starts at 8:00). */
export function minutesToClock(minutesFromGridStart: number): { hours: number; minutes: number } {
  const total = WEEK_VIEW_START_HOUR * 60 + minutesFromGridStart;
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}

/** new end preserves the original duration. */
export function computeRescheduledEnd(oldStart: Date, oldEnd: Date, newStart: Date): Date {
  return new Date(newStart.getTime() + (oldEnd.getTime() - oldStart.getTime()));
}

/** half-open [start,end) overlap — adjacency (touching edges) is NOT overlap. */
export function intervalsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}
```

- [ ] **Step 4: Run tests; verify pass**

Run: `npx tsx --test tests/unit/calendar-math.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**
```bash
git add packages/crm/src/lib/bookings/calendar-math.ts packages/crm/tests/unit/calendar-math.spec.ts
git commit -m "feat(bookings): pure calendar math (snap, duration, overlap) + tests"
```

### Task 3: `rescheduleBookingAction` + email gating (TDD on the pure gate)

**Files:**
- Modify: `packages/crm/src/lib/bookings/actions.ts`
- Test: `packages/crm/tests/unit/reschedule-email-gate.spec.ts`

- [ ] **Step 1: Write the failing test for the email gate**

Extract the gate as a pure exported helper so it's testable without a DB:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldSendRescheduleEmail } from "@/lib/bookings/actions";

test("reschedule email sends only for a notified, contact-linked, non-blocked booking", () => {
  assert.equal(shouldSendRescheduleEmail({ notify: true, contactId: "c1", status: "scheduled" }), true);
  assert.equal(shouldSendRescheduleEmail({ notify: false, contactId: "c1", status: "scheduled" }), false);
  assert.equal(shouldSendRescheduleEmail({ notify: true, contactId: null, status: "scheduled" }), false);
  assert.equal(shouldSendRescheduleEmail({ notify: true, contactId: "c1", status: "blocked" }), false);
});
```

- [ ] **Step 2: Run it; verify it fails** (`shouldSendRescheduleEmail` not exported).

- [ ] **Step 3: Implement the gate + the action**

Add to `actions.ts`:
```ts
export function shouldSendRescheduleEmail(input: {
  notify: boolean; contactId: string | null; status: string;
}): boolean {
  return input.notify && Boolean(input.contactId) && input.status !== "blocked";
}
```
Then `rescheduleBookingAction`, following the `cancelBookingAction` authz pattern (get the operator's org via `getOrgId()`, scope every query by `orgId`):
```ts
export async function rescheduleBookingAction(input: {
  bookingId: string; newStartsAtISO: string; notify: boolean;
}): Promise<{ ok: true } | { ok: false; error: "not_found" | "conflict" }> {
  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "not_found" };

  const [current] = await db.select().from(bookings)
    .where(and(eq(bookings.orgId, orgId), eq(bookings.id, input.bookingId), ne(bookings.status, "template")))
    .limit(1);
  if (!current) return { ok: false, error: "not_found" };

  const newStart = new Date(input.newStartsAtISO);
  const newEnd = computeRescheduledEnd(current.startsAt, current.endsAt, newStart);

  // Conflict: any other non-template, non-cancelled booking that overlaps.
  const sameDay = await db.select({ id: bookings.id, startsAt: bookings.startsAt, endsAt: bookings.endsAt })
    .from(bookings)
    .where(and(
      eq(bookings.orgId, orgId),
      ne(bookings.id, current.id),
      inArray(bookings.status, ["scheduled", "completed", "pending_payment", "blocked"]),
    ));
  const conflict = sameDay.some((r) => intervalsOverlap(newStart, newEnd, r.startsAt, r.endsAt));
  if (conflict) return { ok: false, error: "conflict" };

  await db.update(bookings)
    .set({ startsAt: newStart, endsAt: newEnd, updatedAt: new Date() })
    .where(and(eq(bookings.orgId, orgId), eq(bookings.id, current.id)));

  if (shouldSendRescheduleEmail({ notify: input.notify, contactId: current.contactId, status: current.status })) {
    await sendBookingRescheduleEmail({ orgId, bookingId: current.id, oldStartsAt: current.startsAt, newStartsAt: newStart }).catch(() => {});
  }

  revalidatePath("/bookings");
  return { ok: true };
}
```
Import `computeRescheduledEnd`, `intervalsOverlap` from `./calendar-math` and `sendBookingRescheduleEmail` from `../messaging/skills/booking-reschedule` (Task 5). Email failure is swallowed (`.catch`) so the move always persists.

- [ ] **Step 4: Run the gate test; verify pass.**

- [ ] **Step 5: Typecheck** (`npx tsc --noEmit -p tsconfig.json`) — note `sendBookingRescheduleEmail` must exist; do Task 5 in the same commit if needed.

- [ ] **Step 6: Commit**
```bash
git add packages/crm/src/lib/bookings/actions.ts packages/crm/tests/unit/reschedule-email-gate.spec.ts
git commit -m "feat(bookings): rescheduleBookingAction with conflict guard + email gate"
```

### Task 4: `createBlockedTimeAction`

**Files:** Modify `packages/crm/src/lib/bookings/actions.ts`.

- [ ] **Step 1: Implement**, mirroring `createBookingAction`'s insert (org-scoped), but with `status: "blocked"`, `contactId: null`, `provider: "manual"`, `title` = the operator's label, `startsAt`/`endsAt` from input:
```ts
export async function createBlockedTimeAction(input: {
  label: string; startsAtISO: string; durationMinutes: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "not_found" };
  const startsAt = new Date(input.startsAtISO);
  const endsAt = new Date(startsAt.getTime() + input.durationMinutes * 60_000);
  await db.insert(bookings).values({
    orgId, title: input.label.trim() || "Blocked", status: "blocked",
    contactId: null, provider: "manual", bookingSlug: "blocked",
    startsAt, endsAt,
  });
  revalidatePath("/bookings");
  return { ok: true };
}
```
(Check `createBookingAction`'s `.values({...})` for any other NOT NULL columns and supply them.)

- [ ] **Step 2: Typecheck + Commit**
```bash
git add packages/crm/src/lib/bookings/actions.ts
git commit -m "feat(bookings): createBlockedTimeAction"
```

### Task 5: Reschedule email

**Files:** Create `packages/crm/src/lib/messaging/skills/booking-reschedule.ts` (mirror `booking-confirmation.ts` exactly for Resend client, from-address, org/contact lookup, and TZ formatting).

- [ ] **Step 1: Read the sibling** `booking-confirmation.ts` to copy its Resend setup, org-name + contact-email resolution, and workspace-TZ time formatting.

- [ ] **Step 2: Implement** `sendBookingRescheduleEmail({ orgId, bookingId, oldStartsAt, newStartsAt })`: resolve the contact email + business name + booking link the same way confirmation does; subject `Your {businessName} appointment time changed`; body shows the **old** time struck/labeled and the **new** time (workspace TZ), plus the public re-book/cancel link. Reuse the confirmation email's HTML shell. Return early (no throw) if no contact email.

- [ ] **Step 3: Typecheck + Commit**
```bash
git add packages/crm/src/lib/messaging/skills/booking-reschedule.ts
git commit -m "feat(bookings): reschedule notification email"
```

---

## Phase 3 — Frontend: extract grid + real-duration cards (visual parity)

### Task 6: Split out `WeekCalendar` + `BookingCard`, render real durations

This is a **pure refactor + one fix** — no new behavior yet. Goal: identical look except cards now reflect real duration.

**Files:**
- Create `week-calendar.tsx`, `booking-card.tsx`.
- Modify `bookings-page-content.tsx` (render `<WeekCalendar bookings=… contacts=… timezone=… />` where the inline grid was) and the `/bookings` server page (ensure each `BookingRow` carries `endsAt` and `durationMinutes` — derive `durationMinutes` from the appointment-type metadata or `(endsAt-startsAt)`).

- [ ] **Step 1:** Move the grid markup (header lines 409–533 of `bookings-page-content.tsx`) into `WeekCalendar`, and the per-event card (lines 470–528) into `BookingCard`. Keep all existing TZ helpers (`timeInZone`, `bookingTopPx`, `keyYmd`, etc.) — move the shared ones into `calendar-math.ts` or a small `calendar-time.ts` if they need the component; **do not duplicate**.

- [ ] **Step 2: Fix real-duration height** in `BookingCard`: replace the fixed `(DEFAULT_BOOKING_DURATION_MIN / 60) * HOUR_HEIGHT_PX - 4` with `(durationMinutes / 60) * HOUR_HEIGHT_PX - 4` using the row's real `durationMinutes`. Style `status === "blocked"` cards greyed (`bg-muted text-muted-foreground`, no contact link).

- [ ] **Step 3: Verify visual parity** — `npx tsc --noEmit` clean; run the app (or preview) and confirm the calendar renders with correctly-sized cards and the existing bookings still link to contacts.

- [ ] **Step 4: Commit**
```bash
git add packages/crm/src/components/bookings/
git commit -m "refactor(bookings): extract WeekCalendar/BookingCard, real-duration cards"
```

---

## Phase 4 — Click-to-create

### Task 7: `CreatePopover` (book prospect / block time)

**Files:** Create `create-popover.tsx`; modify `week-calendar.tsx` (capture empty-slot clicks) + `bookings-page-content.tsx` (pass `createBookingAction`, `createBlockedTimeAction`, `contacts`, `bookingTypes`).

- [ ] **Step 1:** In `WeekCalendar`, add an `onClick` on each day column's empty area that computes the clicked day + `yToSnappedMinutes(offsetY)` → start time, and opens `CreatePopover` anchored at the click with that start.
- [ ] **Step 2:** `CreatePopover` has two tabs:
  - **Book a prospect** — a contact combobox (filter the passed `contacts`; "+ create new" submits name to `createBookingAction` which already create-or-links a contact) + appointment-type `<select>` + read-only start time. Submit → `createBookingAction`.
  - **Block time** — label `<input>` + duration `<select>` (15/30/60/90). Submit → `createBlockedTimeAction`.
  Use the existing `Sheet`/popover primitives + `crm-input`/`crm-button-primary` classes for visual consistency.
- [ ] **Step 3:** On success, close + rely on `revalidatePath('/bookings')` to refresh. On error, toast the message.
- [ ] **Step 4: Typecheck + manual check + Commit**
```bash
git add packages/crm/src/components/bookings/
git commit -m "feat(bookings): click-empty-slot to book a prospect or block time"
```

---

## Phase 5 — Drag-to-reschedule

### Task 8: drag controller + `RescheduleConfirm` + optimistic UI

**Files:** Modify `week-calendar.tsx`, `booking-card.tsx`; create `reschedule-confirm.tsx`.

- [ ] **Step 1:** Add pointer-drag in `WeekCalendar`: `onPointerDown` on a `BookingCard` captures `{ bookingId, pointerOffsetY }` and sets drag state; `onPointerMove` (on the grid) computes the hovered day column + `yToSnappedMinutes` and renders a ghost block at that position (optimistic); `onPointerUp` computes the dropped start time.
- [ ] **Step 2:** On drop:
  - If the booking has a `contactId` and `status !== "blocked"` → open `RescheduleConfirm` ("Move {title} to {newTime} and email {contact}? [Confirm] [Cancel]"). Confirm → `rescheduleBookingAction({ bookingId, newStartsAtISO, notify: true })`. Cancel → drop the ghost, no write.
  - Else (block) → call `rescheduleBookingAction({ …, notify: false })` immediately.
- [ ] **Step 3:** Optimistic reconcile: keep the ghost at the new position until the action resolves; on `{ ok:false, error:'conflict' }` revert + toast "That slot's taken"; on success let `revalidatePath` refresh.
- [ ] **Step 4:** Accessibility/escape: ESC during drag cancels; clicking a card without moving (>5px threshold) still navigates to the contact (preserve the existing click-through).
- [ ] **Step 5: Typecheck + manual drag test + Commit**
```bash
git add packages/crm/src/components/bookings/
git commit -m "feat(bookings): drag-to-reschedule with confirm + optimistic UI"
```

---

## Phase 6 — Verify

### Task 9: Full verification

- [ ] **Step 1:** `pnpm test:unit` (root) — all green, including the new `calendar-math` + `reschedule-email-gate` specs.
- [ ] **Step 2:** `npx tsc --noEmit -p tsconfig.json` — 0 errors.
- [ ] **Step 3: Push + open PR**, then **manual smoke on the Vercel preview** (surface this to the operator — don't claim done from local):
  - Click an empty slot → book a prospect; it appears at the right time/height.
  - Click an empty slot → block time; it renders greyed AND the public `/book` page no longer offers that slot.
  - Drag a prospect booking → confirm → it moves and the contact receives the reschedule email.
  - Drag a block → it moves silently (no email).
  - Drag a booking onto an occupied slot → "That slot's taken", reverts.

---

## Self-Review

- **Spec coverage:** click-to-create (Task 7) ✓; drag-reschedule + confirm + email (Tasks 3, 5, 8) ✓; blocked status + availability exclusion (Task 1) ✓; real-duration cards (Task 6) ✓; conflict guard (Tasks 2, 3) ✓; testing (Tasks 2, 3, 9) ✓. Resize + beige rebrand correctly **excluded** (deferred).
- **Type consistency:** `rescheduleBookingAction(input: { bookingId, newStartsAtISO, notify })` and `shouldSendRescheduleEmail({ notify, contactId, status })` and `computeRescheduledEnd(oldStart, oldEnd, newStart)` are used identically everywhere they appear.
- **Placeholders:** none — every code step has real code; integration steps name exact files, functions, and the patterns to mirror.
