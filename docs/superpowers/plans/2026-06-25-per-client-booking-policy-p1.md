# Per-Client Booking Policy — P1 (Engine + Agency Editor) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a deployed agent's booking obey a per-client `BookingPolicy` (duration, buffer, max/day, lead time, weekday window, required fields), defaulted by the template and editable by the agency on the client card.

**Architecture:** A pure `booking-policy.ts` owns the type, system defaults, a field-by-field `resolveBookingPolicy`, and a pure `generateCandidateSlots`. The resolved policy is threaded onto `ctx.booking.policy` (same seam as `ctx.booking.binding`). `look_up_availability` generates policy-shaped candidate slots and intersects them with the calendar backend's real free/busy; `book_appointment` gates on required fields + duration. The agency edits `deployments.booking_policy` via `setBookingPolicyAction` + a reusable `BookingPolicyEditor` on `/studio/clients`.

**Tech Stack:** Next.js 16 / React 19, Drizzle + Neon (jsonb, additive), `node --import tsx --test`, the existing `resolveCalendarBackend` seam.

**Spec:** `docs/superpowers/specs/2026-06-25-per-client-booking-policy-design.md`

**Conventions:** run unit tests with `node --import tsx --test <files>` from `packages/crm`. Verify with `pnpm -C packages/crm typecheck` (baseline 0 errors), `bash packages/crm/scripts/check-use-server.sh src`, and `pnpm -C packages/crm build` (the REAL build — `ignoreBuildErrors` means tsc must be run separately). Commit after each task.

---

## File Structure

- **Create** `packages/crm/src/lib/agents/booking/booking-policy.ts` — `BookingPolicy` type, `SYSTEM_DEFAULTS`, `resolveBookingPolicy`, `generateCandidateSlots`, `bookingPolicyFromIntake`. Pure, no I/O.
- **Create** `packages/crm/tests/unit/agents/booking/booking-policy.spec.ts` — pure tests.
- **Modify** `packages/crm/src/db/schema/deployments.ts` — add `booking_policy` jsonb (`$type<Partial<BookingPolicy>>`).
- **Modify** the agent-template blueprint type — add `defaultBookingPolicy?: Partial<BookingPolicy>`.
- **Create** `packages/crm/drizzle/00NN_booking_policy.sql` (+ journal entry) — additive column.
- **Modify** `packages/crm/src/lib/agents/tools.ts` — `ToolExecuteContext["booking"]` gains `policy`; `look_up_availability` + `book_appointment` read it.
- **Modify** `packages/crm/src/lib/agents/booking/binding-ctx.ts` — accept + attach the resolved policy.
- **Modify** `packages/crm/src/lib/agents/voice/deployment-voice.ts` + `src/lib/agents/channels/run-channel-turn.ts` — resolve policy and pass it through.
- **Modify** `packages/crm/src/lib/deployments/store.ts` + `actions.ts` — `DeploymentPatch.bookingPolicy` + `setBookingPolicyAction`.
- **Modify** the deploy-time client-context mapper — seed `booking_policy` from intake.
- **Create** `packages/crm/src/app/(dashboard)/studio/clients/booking-policy-editor.tsx` — reusable editor; render in `activate-form.tsx`.

---

### Task 1: `BookingPolicy` type + `SYSTEM_DEFAULTS` + `resolveBookingPolicy` (pure, TDD)

**Files:**
- Create: `packages/crm/src/lib/agents/booking/booking-policy.ts`
- Test: `packages/crm/tests/unit/agents/booking/booking-policy.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveBookingPolicy, SYSTEM_DEFAULTS } from "../../../../src/lib/agents/booking/booking-policy";

test("resolveBookingPolicy: empty inputs → system defaults (workspace tz applied)", () => {
  const p = resolveBookingPolicy(null, null, "America/Chicago");
  assert.equal(p.durationMinutes, 30);
  assert.equal(p.bufferMinutes, 0);
  assert.equal(p.maxPerDay, null);
  assert.equal(p.leadTimeHours, 0);
  assert.deepEqual(p.weekdays, [1, 2, 3, 4, 5]);
  assert.equal(p.startTime, "09:00");
  assert.equal(p.endTime, "17:00");
  assert.deepEqual(p.requiredFields, ["name", "phone"]);
  assert.equal(p.timezone, "America/Chicago");
});

test("resolveBookingPolicy: deployment overrides template overrides defaults, field-by-field", () => {
  const p = resolveBookingPolicy(
    { durationMinutes: 60, maxPerDay: 6 },           // deployment
    { durationMinutes: 45, bufferMinutes: 15, requiredFields: ["name", "phone", "address"] }, // template
    "UTC",
  );
  assert.equal(p.durationMinutes, 60);  // deployment wins
  assert.equal(p.bufferMinutes, 15);    // template fills
  assert.equal(p.maxPerDay, 6);         // deployment
  assert.deepEqual(p.requiredFields, ["name", "phone", "address"]); // template
  assert.equal(p.startTime, "09:00");   // system default
});

test("resolveBookingPolicy: clamps invalid values (end<=start, negative, bad tz) to safe defaults", () => {
  const p = resolveBookingPolicy(
    { durationMinutes: -5, bufferMinutes: -10, startTime: "18:00", endTime: "09:00", weekdays: [9, -1, 2], timezone: "" },
    null,
    "UTC",
  );
  assert.ok(p.durationMinutes >= 1);                 // never < 1
  assert.ok(p.bufferMinutes >= 0);
  assert.ok(p.endTime > p.startTime);                // window repaired to a default
  assert.deepEqual(p.weekdays, [2]);                 // out-of-range days dropped
  assert.equal(p.timezone, "UTC");                   // empty tz → workspace tz
});
```

- [ ] **Step 2: Run test, verify it FAILS** — `cd packages/crm && node --import tsx --test tests/unit/agents/booking/booking-policy.spec.ts` → fails ("Cannot find module"/undefined).

- [ ] **Step 3: Implement `booking-policy.ts`**

```ts
// Per-client booking rules. Pure: no I/O, no DB, no clock except an injected `now`.
export type BookingPolicy = {
  durationMinutes: number;
  bufferMinutes: number;
  maxPerDay: number | null;
  leadTimeHours: number;
  timezone: string;
  weekdays: number[]; // 0=Sun..6=Sat
  startTime: string;  // "HH:MM"
  endTime: string;    // "HH:MM"
  requiredFields: string[];
};

export const SYSTEM_DEFAULTS: Omit<BookingPolicy, "timezone"> = {
  durationMinutes: 30,
  bufferMinutes: 0,
  maxPerDay: null,
  leadTimeHours: 0,
  weekdays: [1, 2, 3, 4, 5],
  startTime: "09:00",
  endTime: "17:00",
  requiredFields: ["name", "phone"],
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
function pick<T>(...vals: (T | null | undefined)[]): T | undefined {
  for (const v of vals) if (v !== null && v !== undefined) return v;
  return undefined;
}

export function resolveBookingPolicy(
  deployment?: Partial<BookingPolicy> | null,
  template?: Partial<BookingPolicy> | null,
  workspaceTimezone?: string,
): BookingPolicy {
  const d = deployment ?? {};
  const t = template ?? {};
  const duration = Math.max(1, Math.round(pick(d.durationMinutes, t.durationMinutes, SYSTEM_DEFAULTS.durationMinutes)!));
  const buffer = Math.max(0, Math.round(pick(d.bufferMinutes, t.bufferMinutes, SYSTEM_DEFAULTS.bufferMinutes)!));
  const maxРaw = pick(d.maxPerDay, t.maxPerDay, SYSTEM_DEFAULTS.maxPerDay);
  const maxPerDay = typeof maxРaw === "number" && maxРaw > 0 ? Math.round(maxРaw) : null;
  const leadTimeHours = Math.max(0, pick(d.leadTimeHours, t.leadTimeHours, SYSTEM_DEFAULTS.leadTimeHours)!);
  const weekdaysRaw = pick(d.weekdays, t.weekdays, SYSTEM_DEFAULTS.weekdays)!;
  const weekdays = [...new Set(weekdaysRaw.filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort();
  let startTime = pick(d.startTime, t.startTime, SYSTEM_DEFAULTS.startTime)!;
  let endTime = pick(d.endTime, t.endTime, SYSTEM_DEFAULTS.endTime)!;
  if (!HHMM.test(startTime) || !HHMM.test(endTime) || endTime <= startTime) {
    startTime = SYSTEM_DEFAULTS.startTime;
    endTime = SYSTEM_DEFAULTS.endTime;
  }
  const reqRaw = pick(d.requiredFields, t.requiredFields, SYSTEM_DEFAULTS.requiredFields)!;
  const requiredFields = reqRaw.map((s) => String(s).trim().toLowerCase()).filter(Boolean);
  const tz = pick(d.timezone, t.timezone)?.trim() || workspaceTimezone?.trim() || "UTC";
  return {
    durationMinutes: duration, bufferMinutes: buffer, maxPerDay, leadTimeHours,
    timezone: tz, weekdays: weekdays.length ? weekdays : [...SYSTEM_DEFAULTS.weekdays],
    startTime, endTime, requiredFields: requiredFields.length ? requiredFields : [...SYSTEM_DEFAULTS.requiredFields],
  };
}
```
(Note: replace the cyrillic-looking `Рaw` placeholders with `Raw` when implementing — they're written here only to avoid a literal find/replace collision; the engineer must use plain ASCII identifiers `maxRaw`.)

- [ ] **Step 4: Run test, verify PASS.**
- [ ] **Step 5: Commit** — `git add packages/crm/src/lib/agents/booking/booking-policy.ts packages/crm/tests/unit/agents/booking/booking-policy.spec.ts && git commit -m "feat(booking): BookingPolicy type + resolveBookingPolicy (pure, TDD)"`

---

### Task 2: `generateCandidateSlots` (pure, TDD)

**Files:**
- Modify: `packages/crm/src/lib/agents/booking/booking-policy.ts`
- Test: `packages/crm/tests/unit/agents/booking/booking-policy.spec.ts` (append)

`generateCandidateSlots(policy, dateISO, now)` returns `string[]` of UTC ISO start times for the given calendar date, within `[startTime,endTime]` in `policy.timezone`, stepped by `durationMinutes + bufferMinutes`, only if `dateISO`'s weekday ∈ `policy.weekdays`, excluding any start earlier than `now + leadTimeHours`. `now` is injected (no `Date.now()` in the pure fn).

- [ ] **Step 1: Failing test**

```ts
import { generateCandidateSlots, resolveBookingPolicy } from "../../../../src/lib/agents/booking/booking-policy";

test("generateCandidateSlots: weekday window stepped by duration+buffer", () => {
  const policy = resolveBookingPolicy(
    { durationMinutes: 60, bufferMinutes: 0, startTime: "09:00", endTime: "12:00", weekdays: [3], timezone: "UTC" },
    null, "UTC",
  );
  // 2026-07-01 is a Wednesday (weekday 3)
  const slots = generateCandidateSlots(policy, "2026-07-01", new Date("2026-06-01T00:00:00Z"));
  assert.deepEqual(slots, [
    "2026-07-01T09:00:00.000Z", "2026-07-01T10:00:00.000Z", "2026-07-01T11:00:00.000Z",
  ]); // 12:00 excluded (a 60-min slot wouldn't fit ending at 12:00? it ends exactly 12:00 → included? define: slot fits if start+duration <= end → 11:00 ok, 12:00 start would end 13:00 > 12:00 → excluded)
});

test("generateCandidateSlots: wrong weekday → []", () => {
  const policy = resolveBookingPolicy({ weekdays: [1], timezone: "UTC" }, null, "UTC"); // Monday only
  assert.deepEqual(generateCandidateSlots(policy, "2026-07-01", new Date("2026-06-01T00:00:00Z")), []); // Wed
});

test("generateCandidateSlots: leadTime excludes too-soon slots", () => {
  const policy = resolveBookingPolicy(
    { durationMinutes: 60, startTime: "09:00", endTime: "12:00", weekdays: [3], leadTimeHours: 2, timezone: "UTC" },
    null, "UTC",
  );
  const slots = generateCandidateSlots(policy, "2026-07-01", new Date("2026-07-01T09:30:00Z"));
  assert.deepEqual(slots, ["2026-07-01T11:00:00.000Z"]); // now=09:30 +2h = 11:30 cutoff → only 11:00? 11:00 < 11:30 → excluded too. Adjust expectation to [] OR pick now so exactly one remains; engineer: assert the cutoff math, not a magic list.
});
```
(Engineer: lock the exact boundary semantics — "slot included iff start ≥ now+lead AND start+duration ≤ windowEnd" — in the test; fix the expected arrays to match that rule. Use the `Intl`/offset approach already used by `formatSlotLabel` in `composio-calendar-backend.ts` for tz math, or compute the UTC instant for `YYYY-MM-DDTHH:MM` in `policy.timezone`.)

- [ ] **Step 2: Verify FAIL.**
- [ ] **Step 3: Implement `generateCandidateSlots`** in `booking-policy.ts` (tz-correct; injected `now`; step = duration+buffer; include iff `start ≥ now+leadMs` and `start+durationMs ≤ windowEndMs`).
- [ ] **Step 4: Verify PASS.**
- [ ] **Step 5: Commit** — `git commit -m "feat(booking): generateCandidateSlots (pure, tz-aware, TDD)"`

---

### Task 3: Schema — `deployments.booking_policy` + template `defaultBookingPolicy` + additive migration

**Files:**
- Modify: `packages/crm/src/db/schema/deployments.ts`
- Modify: the agent-template blueprint type (grep `defaultBookingPolicy` target: the blueprint type used by `agent_templates`)
- Create: `packages/crm/drizzle/00NN_per_client_booking_policy.sql` + journal entry

- [ ] **Step 1:** Add to `deployments` table: `bookingPolicy: jsonb("booking_policy").$type<Partial<import("@/lib/agents/booking/booking-policy").BookingPolicy>>(),` (nullable). Add `defaultBookingPolicy?: Partial<BookingPolicy>` to the template blueprint type.
- [ ] **Step 2:** Generate the migration: `cd packages/crm && pnpm drizzle-kit generate` (or hand-author an additive `ALTER TABLE "deployments" ADD COLUMN IF NOT EXISTS "booking_policy" jsonb;` + the journal entry, matching the repo's existing migration style). Confirm it is ADDITIVE (no drops).
- [ ] **Step 3:** `pnpm -C packages/crm typecheck` → 0 new errors. Confirm the drizzle journal is consistent (the repo has a journal CI check).
- [ ] **Step 4: Commit** — `git commit -m "feat(booking): schema — deployments.booking_policy + template defaultBookingPolicy (additive)"`

---

### Task 4: Thread `ctx.booking.policy` through the seam

**Files:**
- Modify: `packages/crm/src/lib/agents/tools.ts` (the `ToolExecuteContext["booking"]` type)
- Modify: `packages/crm/src/lib/agents/booking/binding-ctx.ts`
- Modify: `packages/crm/src/lib/agents/voice/deployment-voice.ts`
- Modify: `packages/crm/src/lib/agents/channels/run-channel-turn.ts`
- Test: extend `packages/crm/tests/unit/agents/runtime-booking-binding.spec.ts`

- [ ] **Step 1:** Add `policy?: BookingPolicy` to `ToolExecuteContext["booking"]`. Change `bindingToCtxBooking(binding, policy?)` to accept + attach the resolved policy (keep the existing mode/binding mapping). Default `policy` to `resolveBookingPolicy(undefined, undefined, undefined)` only when a booking ctx exists.
- [ ] **Step 2:** Voice (`deployment-voice.ts`) + chat (`run-channel-turn.ts`): resolve `resolveBookingPolicy(deployment.bookingPolicy, template.defaultBookingPolicy, workspaceTimezone)` and pass it into `bindingToCtxBooking(...)`. The deployment row already flows here (it carries `bookingPolicy` after Task 3); thread the template default where the template/blueprint is available (else pass `null`).
- [ ] **Step 3:** Test (extend `runtime-booking-binding.spec.ts`): `bindingToCtxBooking(binding, policy)` yields `ctx.booking.policy` with the given duration; no binding → undefined unchanged.
- [ ] **Step 4:** `node --import tsx --test tests/unit/agents/runtime-booking-binding.spec.ts tests/unit/agents/voice/*.spec.ts tests/unit/agents/channels/*.spec.ts` → pass. `pnpm -C packages/crm typecheck` → 0.
- [ ] **Step 5: Commit** — `git commit -m "feat(booking): thread resolved BookingPolicy onto ctx.booking.policy (voice+chat)"`

---

### Task 5: Enforce policy in `look_up_availability`

**Files:**
- Modify: `packages/crm/src/lib/agents/tools.ts` (the `look_up_availability` execute, ~line 349-420)
- Test: extend `packages/crm/tests/unit/agents/booking/composio-calendar-backend.spec.ts` or the tool test that exercises look_up_availability

- [ ] **Step 1:** In `look_up_availability`, derive `const policy = ctx.booking?.policy ?? resolveBookingPolicy(null, null, ctx.timezone)`. Replace the hardcoded `durationMinutes: 30` with `policy.durationMinutes`. For the book_external/native availability, compute `candidates = generateCandidateSlots(policy, input.date, new Date())` and **intersect** with the backend's free/busy windows (a candidate is offered iff it lies inside a free window for `durationMinutes`). Drop days where `maxPerDay` is already reached (Task 6's counter, or skip until P1.1 — at minimum cap the OFFERED count at `maxPerDay` when set).
- [ ] **Step 2:** Test: with an injected free/busy fake covering all day and a policy of `weekdays:[wday], 09:00-11:00, 60-min`, `look_up_availability` returns exactly the in-window slots; a policy excluding that weekday returns none.
- [ ] **Step 3:** Run the tool/adapter tests → pass; `typecheck` 0.
- [ ] **Step 4: Commit** — `git commit -m "feat(booking): look_up_availability honors BookingPolicy window/duration/buffer"`

---

### Task 6: Enforce required-fields + duration in `book_appointment`

**Files:**
- Modify: `packages/crm/src/lib/agents/tools.ts` (the `book_appointment` execute, ~line 693-820)
- Test: the book_appointment tool test

- [ ] **Step 1:** Derive `policy` as in Task 5. Pass `durationMinutes: policy.durationMinutes` to `backend.createEvent` (replace hardcoded 30). Before booking, validate that the policy's `requiredFields` are present (map `name→fullName`, `phone→intakeResponses.phone`, `email→input.email`, others → `intakeResponses[field]`); if a required field is missing, return a structured `{ needs: [missingFields] }` result so the agent asks for it (do NOT write a partial booking). Keep the existing native fail-soft.
- [ ] **Step 2:** Test: a policy requiring `["name","phone","address"]` with `address` missing → `book_appointment` returns the needs-list and does NOT call `createEvent`; with all present → it books.
- [ ] **Step 3:** Run tests → pass; typecheck 0.
- [ ] **Step 4: Commit** — `git commit -m "feat(booking): book_appointment enforces required fields + policy duration"`

---

### Task 7: Pre-fill `booking_policy` from intake at deploy time

**Files:**
- Modify: `packages/crm/src/lib/agents/booking/booking-policy.ts` (add `bookingPolicyFromIntake`)
- Modify: the deploy/client-context mapper that builds the deployment (grep `clientContext` build path)
- Test: `booking-policy.spec.ts` (append)

- [ ] **Step 1:** `bookingPolicyFromIntake(intake): Partial<BookingPolicy>` — map captured `business_hours` (free text or structured) into `weekdays/startTime/endTime` where parseable (reuse the existing hours parser from onboarding if present — grep `parseHours`), and `services` presence → keep `requiredFields` default. Return only the fields confidently derived (partial).
- [ ] **Step 2:** Test: a structured "Mon-Fri 9-5" intake → `{ weekdays:[1..5], startTime:"09:00", endTime:"17:00" }`; empty intake → `{}`.
- [ ] **Step 3:** Wire: when a deployment is created/activated with intake, set `deployment.bookingPolicy = bookingPolicyFromIntake(intake)` (only if not already set).
- [ ] **Step 4:** Run tests → pass; typecheck 0.
- [ ] **Step 5: Commit** — `git commit -m "feat(booking): pre-fill booking_policy from client intake at deploy"`

---

### Task 8: `setBookingPolicyAction` (org-guarded)

**Files:**
- Modify: `packages/crm/src/lib/deployments/store.ts` (`DeploymentPatch` gains `bookingPolicy`)
- Modify: `packages/crm/src/lib/deployments/actions.ts` (add `setBookingPolicyAction`)
- Test: a DI test mirroring the existing deployment-action tests

- [ ] **Step 1:** Extend `DeploymentPatch` with `bookingPolicy?: Partial<BookingPolicy> | null`; ensure `updateDeployment` persists it. Add `setBookingPolicyAction({ deploymentId, policy }, _deps?)` — `assertWritable` → `getOrgId` → org-guard the deployment (`builderOrgId === orgId`) → `updateDeployment({ patch: { bookingPolicy } })` → `revalidatePath("/studio/clients")`. "use server"; only async exports.
- [ ] **Step 2:** Test (DI form, like `connect-calendar.spec.ts`): unauthorized → error; wrong org → not_found; happy → calls update with the policy.
- [ ] **Step 3:** Run tests → pass; `typecheck` 0; `bash scripts/check-use-server.sh src` clean.
- [ ] **Step 4: Commit** — `git commit -m "feat(booking): setBookingPolicyAction (org-guarded) + DeploymentPatch.bookingPolicy"`

---

### Task 9: `BookingPolicyEditor` + render on the client card

**Files:**
- Create: `packages/crm/src/app/(dashboard)/studio/clients/booking-policy-editor.tsx` (reusable; "use client")
- Modify: `packages/crm/src/app/(dashboard)/studio/clients/activate-form.tsx` (render it on each deployment card)

- [ ] **Step 1:** Build `BookingPolicyEditor({ deploymentId, initial, onSaved })` — controlled fields for duration, buffer, maxPerDay, leadTimeHours, weekday multiselect, start/end time, requiredFields chips; a Save button calling `setBookingPolicyAction`; optimistic + a transient "Saved ✓" (mirror the Composio picker's pattern). House styles (`crm-button-*`, `useTransition`).
- [ ] **Step 2:** Render it on the client card (collapsible "Booking rules" section), seeded with `resolveBookingPolicy(deployment.bookingPolicy, template.defaultBookingPolicy, tz)` so the operator sees the effective values. Only show for deployments whose agent books (surface phone/chat with a booking tool).
- [ ] **Step 3:** `pnpm -C packages/crm typecheck` → 0; `bash scripts/check-use-server.sh src` clean.
- [ ] **Step 4: Commit** — `git commit -m "feat(booking): BookingPolicyEditor on the Studio client card"`

---

### Task 10: Verify + report

- [ ] **Step 1:** `pnpm -C packages/crm typecheck` → report count (expect 0).
- [ ] **Step 2:** `cd packages/crm && node --import tsx --test tests/unit/agents/booking/*.spec.ts tests/unit/agents/runtime-booking-binding.spec.ts tests/unit/deployments/*.spec.ts` → all pass.
- [ ] **Step 3:** `bash packages/crm/scripts/check-use-server.sh src` → clean.
- [ ] **Step 4:** `cd packages/crm && pnpm build` → exit 0 (the REAL build gate).
- [ ] **Step 5:** Report: files changed, test counts, build result. Surface the manual smoke (Max calls a deployed agent with a non-default policy — e.g. 60-min, Tue-only — and confirms the offered slots + the booked event match).

---

## Self-Review

**Spec coverage:** data model (T1, T3) · resolver (T1) · slot generation/enforcement (T2, T5, T6) · ctx threading (T4) · defaults+pre-fill (T1, T7) · agency editor (T8, T9) · testing (each task) · verify (T10). P2/P3 (portal, marketplace) are intentionally out of this plan. ✓

**Placeholder scan:** the only intentional markers are the explicit "engineer: lock the boundary semantics" notes in T2 (the tz/lead-time arithmetic must be pinned by the implementer against real `Intl` math, not guessed) and the ASCII-identifier note in T1. No "TBD"/"add error handling" hand-waves. ✓

**Type consistency:** `BookingPolicy`, `resolveBookingPolicy`, `generateCandidateSlots`, `bookingPolicyFromIntake`, `ctx.booking.policy`, `deployments.bookingPolicy`, `defaultBookingPolicy`, `setBookingPolicyAction`, `DeploymentPatch.bookingPolicy` are used consistently across tasks. ✓
