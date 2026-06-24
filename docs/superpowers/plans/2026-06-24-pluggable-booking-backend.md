# Pluggable Booking Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a deployed SeldonFrame agent (voice OR chat/SMS/email) book into the client's own Google/Outlook calendar via the already-built Composio integration, behind the unchanged native booking tools, with native fallback when unconnected.

**Architecture:** Introduce a `CalendarBackend` indirection resolved per-deployment from `ctx.booking`. Both runtimes converge at `tools.ts:238` (availability) and `tools.ts:519` (book) where `mode = ctx.booking?.mode ?? "native"` already branches — that is the single seam. A `native` adapter wraps today's SeldonFrame chain (no behavior change); a `composio` adapter calls `GOOGLECALENDAR_*` tools server-side via the existing `ensureSession`→`createMcpClient`→`callTool` path. The binding (Composio `connectedAccountId` + `calendarId`) is stored in the existing `deployments.calendar_ref` jsonb and set by a new client-scoped connect flow.

**Tech Stack:** TypeScript, Next.js 16, Drizzle/Neon, `@composio/core` (session + OAuth only; tool calls go over MCP-HTTP), `node --import tsx --test`.

**Commands:**
- Test: `node --import tsx --test <spec>` (run from `packages/crm`)
- Typecheck: `pnpm -C packages/crm typecheck` (baseline = 14 pre-existing errors; goal = no NEW errors)
- Build guard: `bash packages/crm/scripts/check-use-server.sh src` (run from `packages/crm`)

**Worktree:** `C:\Users\maxim\CascadeProjects\Seldon Frame\.claude\worktrees\icp3-wedge\packages\crm` (branch `feature/icp3-wedge`). All paths below are relative to `packages/crm/`.

---

## File Structure

| File | Responsibility | New/Modify |
|---|---|---|
| `src/lib/agents/booking/calendar-backend.ts` | `CalendarBackend` interface, `CalendarBinding` type, `resolveCalendarBackend()` (native\|composio + fallback). Pure, DI'd. | **Create** |
| `src/lib/agents/booking/native-calendar-backend.ts` | `native` adapter — wraps `listPublicBookingSlotsAction` + `submitPublicBookingAction`. | **Create** |
| `src/lib/agents/booking/composio-calendar-backend.ts` | `composio` adapter — maps availability+create to `GOOGLECALENDAR_*` slugs via injected `callTool`. | **Create** |
| `src/lib/agents/tools.ts` | Thread `ctx.booking.binding` into the two branch points (`:238`, `:519`); call resolved backend with native fallback. Extend `ToolExecuteContext.booking`. | Modify |
| `src/lib/agents/voice/deployment-voice.ts:197-215` | Add `binding` (from `deployment.calendarRef`) to `ctx.booking`. | Modify |
| `src/lib/agents/runtime.ts:367-373` + `src/lib/agents/channels/run-channel-turn.ts` | Thread the deployment binding into `executeTurn` and set `ctx.booking` (chat/SMS/email — net-new). | Modify |
| `src/lib/deployments/booking-providers.ts` | Promote `api_mcp`→`available` with `agentBehavior:"book_external"`; add `"book_external"` to the behavior union. | Modify |
| `src/lib/deployments/store.ts:380-466` | Add `calendarRef` to `DeploymentPatch` + an `updateDeployment` arm. | Modify |
| `src/lib/integrations/composio/catalog.ts:112-139` | Add the verified free-slots slug to `googlecalendar` (+ outlook). | Modify |
| `src/lib/deployments/connect-calendar.ts` | Client-scoped connect-link action + finalize (persist `calendarRef`). | **Create** |
| `src/app/api/deployments/[id]/calendar/callback/route.ts` | OAuth return → read `connected_account_id` → persist `calendarRef` → redirect to Studio. | **Create** |
| `src/app/(dashboard)/studio/agents/[id]/deploy/deploy-client.tsx:859-935` | Connect-calendar affordance on the (now available) card. | Modify |

**Key types (used across tasks — defined in Task 1):**
```ts
// src/lib/agents/booking/calendar-backend.ts
export type CalendarBinding = {
  mode: "native" | "external_link" | "book_external";
  externalUrl?: string | null;
  // present only for book_external once the client's calendar is connected:
  calendarRef?: { provider: "googlecalendar" | "outlook"; accountId: string; calendarId?: string } | null;
};
export type AvailabilityQuery = { date: string; durationMinutes: number; timezone: string };
export type LabeledSlot = { iso: string; label: string };
export type CreateEventInput = {
  startIso: string; durationMinutes: number; timezone: string; title: string;
  attendee: { name: string; email?: string; phone?: string }; notes?: string;
};
export type CalendarBackend = {
  findDayAvailability(q: AvailabilityQuery): Promise<{ slots: LabeledSlot[] }>;
  createEvent(input: CreateEventInput): Promise<{ ok: true; eventRef: string } | { ok: false; error: string }>;
};
```

---

## Task 1: CalendarBackend interface + resolver (pure, TDD)

**Files:**
- Create: `src/lib/agents/booking/calendar-backend.ts`
- Test: `tests/unit/agents/booking/calendar-backend.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/agents/booking/calendar-backend.spec.ts
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { resolveCalendarBackend } from "../../../../src/lib/agents/booking/calendar-backend";

const nativeStub = { findDayAvailability: async () => ({ slots: [] }), createEvent: async () => ({ ok: true as const, eventRef: "n" }) };
const composioStub = { findDayAvailability: async () => ({ slots: [] }), createEvent: async () => ({ ok: true as const, eventRef: "c" }) };
const deps = { makeNative: () => nativeStub, makeComposio: () => composioStub };

describe("resolveCalendarBackend", () => {
  test("native when binding is undefined", () => {
    assert.equal(resolveCalendarBackend(undefined, deps), nativeStub);
  });
  test("native when mode is native", () => {
    assert.equal(resolveCalendarBackend({ mode: "native" }, deps), nativeStub);
  });
  test("composio when book_external AND calendarRef.accountId present", () => {
    assert.equal(
      resolveCalendarBackend({ mode: "book_external", calendarRef: { provider: "googlecalendar", accountId: "ca_1" } }, deps),
      composioStub,
    );
  });
  test("FALLS BACK to native when book_external but calendar not yet connected (no accountId)", () => {
    assert.equal(resolveCalendarBackend({ mode: "book_external", calendarRef: null }, deps), nativeStub);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`Cannot find module …/calendar-backend`)

Run: `node --import tsx --test tests/unit/agents/booking/calendar-backend.spec.ts`

- [ ] **Step 3: Implement**

```ts
// src/lib/agents/booking/calendar-backend.ts
// (types CalendarBinding / AvailabilityQuery / LabeledSlot / CreateEventInput / CalendarBackend
//  as listed in the plan's "Key types" block — paste them at the top of this file.)

export type ResolveDeps = { makeNative: () => CalendarBackend; makeComposio: (ref: NonNullable<CalendarBinding["calendarRef"]>) => CalendarBackend };

/** Pick the backend for a deployment's booking binding. book_external requires a
 *  CONNECTED calendar (calendarRef.accountId); until then we fall back to native
 *  so a live call never breaks. */
export function resolveCalendarBackend(binding: CalendarBinding | undefined, deps: ResolveDeps): CalendarBackend {
  if (binding?.mode === "book_external" && binding.calendarRef?.accountId) {
    return deps.makeComposio(binding.calendarRef);
  }
  return deps.makeNative();
}
```

- [ ] **Step 4: Run it — expect PASS**
- [ ] **Step 5: Commit** — `git add src/lib/agents/booking/calendar-backend.ts tests/unit/agents/booking/calendar-backend.spec.ts && git commit -m "feat(booking): CalendarBackend interface + resolver (native fallback)"`

---

## Task 2: native adapter (thin wrapper, TDD)

**Files:**
- Create: `src/lib/agents/booking/native-calendar-backend.ts`
- Test: `tests/unit/agents/booking/native-calendar-backend.spec.ts`

The native adapter is a thin DI wrapper over the two existing actions so the seam is uniform. It does NOT re-implement slot math (that stays in `tools.ts`'s `findNextAvailableSlots` for the native path — see Task 4 note). Its job: expose `createEvent` (→ `submitPublicBookingAction`) and a `findDayAvailability` (→ `listPublicBookingSlotsAction` for one day) behind the interface.

- [ ] **Step 1: Write the failing test** — assert `findDayAvailability` calls the injected `listSlots` with `{orgSlug,bookingSlug,date}` and maps `{slots:string[],durationMinutes,workspaceTimezone}` → `LabeledSlot[]`; assert `createEvent` calls the injected `submitBooking` with the right arg object and maps `{ok,bookingId}` → `{ok,eventRef:bookingId}`.

```ts
// tests/unit/agents/booking/native-calendar-backend.spec.ts
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { makeNativeCalendarBackend } from "../../../../src/lib/agents/booking/native-calendar-backend";

test("createEvent maps to submitPublicBookingAction args + returns eventRef", async () => {
  const calls: any[] = [];
  const be = makeNativeCalendarBackend({
    orgSlug: "acme", bookingSlug: "default",
    listSlots: async () => ({ slots: [], durationMinutes: 30, workspaceTimezone: "UTC" }),
    submitBooking: async (a) => { calls.push(a); return { ok: true, bookingId: "bk_1" }; },
  });
  const r = await be.createEvent({ startIso: "2026-07-01T16:00:00Z", durationMinutes: 30, timezone: "UTC",
    title: "Service call", attendee: { name: "Pat", phone: "+15125550148" } });
  assert.deepEqual(r, { ok: true, eventRef: "bk_1" });
  assert.equal(calls[0].startsAt, "2026-07-01T16:00:00Z");
  assert.equal(calls[0].fullName, "Pat");
});
```

- [ ] **Step 2: Run — expect FAIL**
- [ ] **Step 3: Implement** `makeNativeCalendarBackend(deps)` returning a `CalendarBackend`. `findDayAvailability` calls `deps.listSlots({orgSlug,bookingSlug,date})` and maps each ISO via the existing label formatter (import `formatSlotLabel` from `tools.ts` if exported, else inline a TZ format using `Intl.DateTimeFormat`); `createEvent` builds the `SubmitPublicBookingArgs` shape (`tools.ts:403-413`: `{orgSlug,bookingSlug,fullName,email,notes,startsAt,intakeResponses}`, fold phone into `intakeResponses.phone`) and calls `deps.submitBooking`, mapping `bookingId`→`eventRef`.
- [ ] **Step 4: Run — expect PASS**
- [ ] **Step 5: Commit** — `feat(booking): native calendar adapter over existing booking actions`

---

## Task 3: Composio calendar adapter (arg-mapping, TDD)

**Files:**
- Create: `src/lib/agents/booking/composio-calendar-backend.ts`
- Test: `tests/unit/agents/booking/composio-calendar-backend.spec.ts`

The adapter is DI'd over a single `callTool(slug, args) => Promise<unknown>` (the live impl wires `ensureSession`→`createMcpClient`→`callTool` in Task 9/wiring). Slugs (from `catalog.ts`): create = `GOOGLECALENDAR_CREATE_EVENT` / `OUTLOOK_CALENDAR_CREATE_EVENT`; availability = `GOOGLECALENDAR_FIND_FREE_SLOTS` (Google) — **see Task 11: this slug is not pinned in-repo; Task 11 verifies it live and adds it to the catalog before this adapter is wired to real traffic.** The adapter must catch any `callTool` throw and return `{ok:false,error}` so the seam (Task 4) falls back to native.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/agents/booking/composio-calendar-backend.spec.ts
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { makeComposioCalendarBackend } from "../../../../src/lib/agents/booking/composio-calendar-backend";

test("createEvent calls GOOGLECALENDAR_CREATE_EVENT with mapped args", async () => {
  const calls: any[] = [];
  const be = makeComposioCalendarBackend({
    provider: "googlecalendar", accountId: "ca_1", calendarId: "primary",
    callTool: async (slug, args) => { calls.push({ slug, args }); return { successful: true, data: { id: "evt_9" } }; },
  });
  const r = await be.createEvent({ startIso: "2026-07-01T16:00:00Z", durationMinutes: 30, timezone: "America/Chicago",
    title: "Service call", attendee: { name: "Pat", email: "pat@x.com" }, notes: "AC down" });
  assert.equal(calls[0].slug, "GOOGLECALENDAR_CREATE_EVENT");
  assert.equal(calls[0].args.calendar_id, "primary");
  assert.equal(calls[0].args.start_datetime, "2026-07-01T16:00:00Z");
  assert.deepEqual(r, { ok: true, eventRef: "evt_9" });
});

test("createEvent returns {ok:false} when callTool throws (→ native fallback)", async () => {
  const be = makeComposioCalendarBackend({ provider: "googlecalendar", accountId: "ca_1",
    callTool: async () => { throw new Error("composio 502"); } });
  const r = await be.createEvent({ startIso: "x", durationMinutes: 30, timezone: "UTC", title: "t", attendee: { name: "P" } });
  assert.equal(r.ok, false);
});
```

- [ ] **Step 2: Run — expect FAIL**
- [ ] **Step 3: Implement** `makeComposioCalendarBackend({ provider, accountId, calendarId, callTool })`:
  - Slug map by provider: `googlecalendar` → `{ create: "GOOGLECALENDAR_CREATE_EVENT", free: "GOOGLECALENDAR_FIND_FREE_SLOTS" }`; `outlook` → `{ create: "OUTLOOK_CALENDAR_CREATE_EVENT", free: "OUTLOOK_CALENDAR_GET_SCHEDULE" /* verify in Task 11 */ }`.
  - `createEvent`: `try { const res = await callTool(map.create, { calendar_id: calendarId ?? "primary", start_datetime: startIso, event_duration_minutes: durationMinutes, summary: title, attendees: attendee.email ? [attendee.email] : [], description: notes ?? "" }); return res?.successful ? { ok: true, eventRef: String(res.data?.id ?? "") } : { ok: false, error: "create_failed" }; } catch (e) { return { ok: false, error: e instanceof Error ? e.message.slice(0,200) : "composio_error" }; }`.
  - `findDayAvailability`: call `map.free` for the day window (`time_min`/`time_max` from `date`+timezone), map the returned free windows to `LabeledSlot[]` quantized to `durationMinutes`; on throw return `{ slots: [] }` (caller treats empty as "no external availability" → native fallback in Task 4).
- [ ] **Step 4: Run — expect PASS**
- [ ] **Step 5: Commit** — `feat(booking): composio calendar adapter (create-event + free-slots, fail-soft)`

---

## Task 4: wire the seam into tools.ts (both surfaces converge here)

**Files:**
- Modify: `src/lib/agents/tools.ts` (the `ToolExecuteContext.booking` type; the branch at `:238` for availability and `:519` for book)
- Test: `tests/unit/agents/booking/tools-backend-seam.spec.ts` (drives `book_appointment.execute` with a stub backend)

- [ ] **Step 1:** Extend `ctx.booking` type: add `binding?: CalendarBinding` (import from calendar-backend.ts). Keep existing `mode`/`externalUrl` for back-compat.
- [ ] **Step 2: Write the failing test** — call `bookAppointment.execute({...confirmed:true}, ctx)` with `ctx.booking.binding.mode = "book_external"` + a connected `calendarRef`, injecting a fake `resolveCalendarBackend` (via the existing `deps` injection point at `tools.ts:423-433`) whose `composio.createEvent` records the call; assert it routed to composio, and a second test where `composio.createEvent` returns `{ok:false}` asserts it **fell back** to the native `submitBooking`.
- [ ] **Step 3: Implement** — at `:519` (book) replace the direct native path: resolve `const backend = resolveCalendarBackend(ctx.booking?.binding, backendDeps)`; call `backend.createEvent(...)`; if `!res.ok && binding.mode === "book_external"` then **retry once via the native backend** (the fallback) and log a structured `booking_external_fallback` event. Preserve the confirmation gate (`tools.ts:541-554`) — it runs BEFORE backend selection. At `:238` (availability), for `book_external` with a connected calendar, prefer `backend.findDayAvailability`; if it returns 0 slots, fall back to native `fetchSlotsForDay`. Keep `external_link`/`followup` handoff branches unchanged.
- [ ] **Step 4: Run — expect PASS**; also run the existing booking tests to confirm native path unchanged: `node --import tsx --test tests/unit/agents/tools*.spec.ts` (or the booking-tool spec).
- [ ] **Step 5: Commit** — `feat(booking): route native booking tools through CalendarBackend seam + fallback`

---

## Task 5: populate ctx.booking.binding on the VOICE path

**Files:**
- Modify: `src/lib/agents/voice/deployment-voice.ts:197-215`
- Test: `tests/unit/agents/voice/deployment-voice-binding.spec.ts` (if `loadDeploymentVoiceContext` is DI-testable; else assert the pure mapper)

- [ ] **Step 1:** Extract a pure helper `deploymentToBinding(deployment): CalendarBinding` (new tiny exported fn, e.g. in `src/lib/deployments/booking-binding.ts`) mapping `{ bookingMode, externalBookingUrl, calendarRef }` → `CalendarBinding` (`api_mcp`/`composio`→`book_external`, carry `calendarRef.accountId`).
- [ ] **Step 2: Test** the pure helper: native→native; external_link→external_link+url; api_mcp+connected calendarRef→book_external+ref; api_mcp+null calendarRef→book_external+null (resolver will fall back).
- [ ] **Step 3: Implement** the helper; set `ctx.booking = { ...existing mode/externalUrl, binding: deploymentToBinding(args.deployment) }` at deployment-voice.ts:197-215.
- [ ] **Step 4: Run — expect PASS**
- [ ] **Step 5: Commit** — `feat(booking): voice deployment context carries the calendar binding`

---

## Task 6: populate ctx.booking.binding on the CHAT/SMS/email path (net-new)

**Files:**
- Modify: `src/lib/agents/runtime.ts:367-373` (build `ctx.booking`); `src/lib/agents/channels/run-channel-turn.ts` (thread the binding through the `executeTurn` dep)
- Test: `tests/unit/agents/runtime-booking-binding.spec.ts`

Chat/SMS/email never load the deployment today. `run-channel-turn.ts:117-124` already resolves deployment→client-org for agent selection; extend that to also produce the `CalendarBinding` and pass it to `executeTurn`.

- [ ] **Step 1: Test** — drive `executeTurn` (its DI form) with a `bookingBinding` input and assert the `ctx` passed to `tool.execute` has `ctx.booking.binding` set; and that absent a deployment it stays undefined (→ native).
- [ ] **Step 2: Implement** — add optional `bookingBinding?: CalendarBinding` to `executeTurn`'s input; set `ctx.booking = bookingBinding ? { mode: bookingBinding.mode, externalUrl: bookingBinding.externalUrl, binding: bookingBinding } : undefined` at runtime.ts:367-373. In `run-channel-turn.ts`, where the deployment is resolved (`:117-124`), compute `deploymentToBinding(deployment)` (Task 5 helper) and pass it into the `executeTurn` call (`:288`).
- [ ] **Step 3: Run — expect PASS**
- [ ] **Step 4: Commit** — `feat(booking): chat/SMS/email turn threads the deployment calendar binding`

---

## Task 7: persist the binding — DeploymentPatch.calendarRef

**Files:**
- Modify: `src/lib/deployments/store.ts:380-466`
- Test: extend `tests/unit/deployments/store.spec.ts`

- [ ] **Step 1: Test** — `updateDeployment({ id, patch: { calendarRef: { provider:"googlecalendar", accountId:"ca_1", calendarId:"primary" } }, deps })` writes `calendar_ref` (assert via the injected update spy).
- [ ] **Step 2: Implement** — add `calendarRef?: DeploymentCalendarRef | null` to `DeploymentPatch` (store.ts:380-395) and the arm `if (p.calendarRef !== undefined) patch.calendarRef = p.calendarRef;` alongside the existing arms (store.ts:426-461).
- [ ] **Step 3: Run — expect PASS**; `pnpm -C packages/crm typecheck` (no new errors).
- [ ] **Step 4: Commit** — `feat(deployments): allow calendarRef in DeploymentPatch`

---

## Task 8: registry — promote api_mcp to available "book into their calendar"

**Files:**
- Modify: `src/lib/deployments/booking-providers.ts`
- Test: extend `tests/unit/deployments/booking-providers.spec.ts`

- [ ] **Step 1: Test** — `getBookingProvider("api_mcp").status === "available"` and `.agentBehavior === "book_external"`; `resolveBookingMode("api_mcp") === "api_mcp"`.
- [ ] **Step 2: Implement** — add `"book_external"` to the `AgentBookingBehavior` union (booking-providers.ts:15-18); change the `api_mcp` entry (`:49-57`) to `status:"available"`, `agentBehavior:"book_external"`, `label:"Book into the client's Google/Outlook"`, `description:"The agent reads availability and books straight into the client's connected Google or Outlook calendar."`. Leave `cal_com` coming_soon.
- [ ] **Step 3: Run — expect PASS**
- [ ] **Step 4: Commit** — `feat(deployments): api_mcp booking mode = book_external (available)`

---

## Task 9: client-scoped connect-link action + finalize

**Files:**
- Create: `src/lib/deployments/connect-calendar.ts` (`"use server"` action)
- Create: `src/app/api/deployments/[id]/calendar/callback/route.ts`
- Test: `tests/unit/deployments/connect-calendar.spec.ts` (DI'd: assert it authorizes builder owns the deployment, calls `createConnectLink(clientOrgId, toolkit, callbackUrl)`)

- [ ] **Step 1: Test** — `startCalendarConnect({ deploymentId, toolkit:"googlecalendar" }, deps)` with `deps.getDeployment` returning a deployment whose `builderOrgId !== caller` → `{ok:false,error:"not_found"}`; with ownership OK + `clientOrgId` set → calls `deps.createConnectLink(clientOrgId, "googlecalendar", callbackUrl)` and returns its `redirectUrl`.
- [ ] **Step 2: Implement** `startCalendarConnect`: `getOrgId()` guard → load deployment → assert `builderOrgId === orgId` and `clientOrgId` present → `callbackUrl = ${APP_URL}/api/deployments/${deploymentId}/calendar/callback?toolkit=${toolkit}` → `createConnectLink(clientOrgId, toolkit, callbackUrl)` (import from `@/lib/integrations/composio/client`) → return `{ ok:true, redirectUrl }`. (Reuses the lib fn that already takes an explicit orgId — client.ts:201-218.)
- [ ] **Step 3: Implement the callback route** — read `connected_account_id` + `status` from the query (Composio appends them, per client.ts:198-200), load the deployment, persist `calendarRef = { provider: toolkit, accountId: connected_account_id, calendarId: "primary" }` via `updateDeployment` (Task 7), then redirect to `/studio/clients` (or `/studio/agents/[id]/deploy`) with a `?calendar=connected` flag. Guard: only the deployment's builder may finalize (the callback is unauthenticated → verify via a signed `state` param minted in Step 2, OR accept the Composio-supplied account id only when `status==="ACTIVE"` and the deployment's `clientOrgId` matches the connection's user_id).
- [ ] **Step 4: Run tests + typecheck + `bash scripts/check-use-server.sh src`** (the action file must export only async fns).
- [ ] **Step 5: Commit** — `feat(deployments): client-scoped calendar connect link + callback persists calendarRef`

---

## Task 10: deploy UI — Connect-calendar affordance

**Files:**
- Modify: `src/app/(dashboard)/studio/agents/[id]/deploy/deploy-client.tsx:859-935` (`BookingModeChooser`)

No new pure logic; this is wiring. The `api_mcp` card is now `available` (Task 8) so it's already selectable. Add: when `value === "api_mcp"`, render a toolkit picker (Google / Outlook) + a "Connect now" button (calls `startCalendarConnect` → `window.location = redirectUrl`) and a "Copy link to send to the client" button (copies the same `redirectUrl`). Show "Pending — calendar not connected yet; the agent will use SeldonFrame booking until connected" until `calendarRef.accountId` exists. Because `calendarRef` is set post-create via the callback (Task 9), the connect button is enabled only after the deployment row exists (i.e. on an already-created deployment / the `/studio/clients` management view) — for the create wizard, persist `bookingMode:"api_mcp"` first, then surface Connect on the resulting client card.

- [ ] **Step 1:** Implement the toolkit picker + the two buttons calling `startCalendarConnect`.
- [ ] **Step 2:** Add the "pending" hint keyed on `calendarRef?.accountId`.
- [ ] **Step 3: Run** `pnpm -C packages/crm typecheck` + `bash scripts/check-use-server.sh src`.
- [ ] **Step 4: Commit** — `feat(studio): connect the client's calendar from the deploy/clients UI`

---

## Task 11: verify + pin the free-slots slug

**Files:**
- Modify: `src/lib/integrations/composio/catalog.ts:112-139`

- [ ] **Step 1: Verify live** — with `COMPOSIO_API_KEY` set, run a one-off node script (`node --import tsx -e "…"`) that lists `googlecalendar` tools via the Composio SDK and greps for a free/busy or find-free-slots action. Record the EXACT slug (expected `GOOGLECALENDAR_FIND_FREE_SLOTS`; Outlook expected `OUTLOOK_CALENDAR_GET_SCHEDULE` or equivalent).
- [ ] **Step 2:** Add the confirmed slug(s) to `DEFAULT_TOOLS_BY_TOOLKIT.googlecalendar` (catalog.ts:112-116) and `.outlook` (catalog.ts:134-138). If a free-slots action does NOT exist, switch the Composio adapter's `findDayAvailability` (Task 3) to use `GOOGLECALENDAR_LIST_EVENTS` (already pinned) to read busy events and subtract them from native availability rules — update Task 3's implementation + test accordingly and note the change here.
- [ ] **Step 3:** Update the slug constant in `composio-calendar-backend.ts` to the verified value; re-run the Task 3 spec.
- [ ] **Step 4: Commit** — `feat(composio): pin verified calendar free-slots slug`

---

## Task 12: verify + integration smoke

- [ ] **Step 1:** `pnpm -C packages/crm typecheck` → confirm NO new errors beyond the 14 baseline.
- [ ] **Step 2:** `node --import tsx --test tests/unit/agents/booking/*.spec.ts tests/unit/deployments/*.spec.ts` → all pass.
- [ ] **Step 3:** `bash scripts/check-use-server.sh src` → clean.
- [ ] **Step 4 (MANUAL — surface to the user, do not run autonomously):** On a Vercel preview: deploy an agent with booking mode "Book into the client's Google/Outlook" → click Connect → authorize a real Google account → place a booking through the agent (voice call or chat) → confirm the event lands in that Google calendar AND a `booking_external_fallback` event is ABSENT (i.e. the external path was used, not the fallback). Then revoke the calendar and confirm the agent still books (native fallback).
- [ ] **Step 5: Commit** any fixes; the feature branch is ready to merge to main.

---

## Notes / decisions carried from the spec
- **Fallback = native** (not handoff): a real booking beats a deferred one; logged as `booking_external_fallback`.
- **Voice works** because the backend call happens server-side inside `book_appointment.execute` — the model-visible tool list is unchanged.
- **Out of scope (v1):** Cal.com adapter, generic-MCP adapter, reschedule/cancel into the external calendar, CRM mirroring of externally-created events.
