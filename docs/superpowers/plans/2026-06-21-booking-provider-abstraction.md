# Calendar-Provider Abstraction (Booking-Mode Menu for Deployed Agents) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "how a deployed agent books" a per-deployment *choice* (a menu of calendar providers) instead of a hard-coded path — shipping two working free choices now (SeldonFrame **native** booking + the client's **own external booking link**), with **API/MCP** and **Cal.com** registered as clearly-labeled "connect later" slots whose real adapters are a separate brainstorm.

**Architecture:** Each `deployments` row gains a `bookingMode` (`native` | `external_link` | `api_mcp` | `cal_com`, default `native`) + an optional `externalBookingUrl`. A pure registry (`booking-providers.ts`) describes each mode (label, description, availability status, agent behavior). `loadDeploymentVoiceContext` threads the chosen mode into a NEW optional `booking` field on `ToolExecuteContext`. The deployed agent's `look_up_availability`/`book_appointment` tools branch on `ctx.booking`: `native`/undefined → the **existing booking chain, byte-for-byte unchanged**; `external_link` → a handoff (share the client's URL, no slot lookup, no DB write); `api_mcp`/`cal_com` → a "capture the lead, scheduling to follow" handoff. Workspace/operator agents never set `ctx.booking`, so their path is provably untouched. A deploy-wizard chooser persists the selection.

**Tech Stack:** Next.js 16 / React 19, Drizzle + Neon (Postgres), `node:test` + `tsx` unit tests, pnpm. Conventions: `node --import tsx --test`; plain modules vs `"use server"` (async-only); `scripts/check-use-server.sh src` clean; client components `"use client"`; DI for network/DB so unit tests are offline; TDD pure logic; commit per task.

**Naming note:** there is already an unrelated `BookingProvider` type in `src/lib/bookings/providers.ts` (the **conferencing** provider — zoom/google-meet — stored as `bookings.provider`). This plan's concept is the **calendar backend a deployed agent books through**; to avoid collision it is named **`bookingMode`** / `BookingMode` in code (UI copy can still say "calendar provider"). Do NOT touch `bookings/providers.ts`.

**Scope guard (read before starting):** Deployed surface today is **voice** (telephony 2.2). This plan wires the voice deployment path only (`deployment-voice.ts` → `ctx` → `tools.ts`). Chat-deploy parity is explicitly deferred. The real `api_mcp` + `cal_com` booking adapters are explicitly deferred (separate brainstorm) — this plan only *registers + surfaces* them as "coming soon," it does NOT integrate them. Do not build calendar OAuth, Cal.com API calls, or MCP connectors here.

---

## File Structure

- **Create** `packages/crm/src/lib/deployments/booking-providers.ts` — pure registry: `BookingMode` type, `BOOKING_PROVIDERS`, `getBookingProvider`, `resolveBookingMode`. No I/O.
- **Create** `packages/crm/tests/unit/deployments/booking-providers.spec.ts` — registry tests.
- **Modify** `packages/crm/src/db/schema/deployments.ts` — add `bookingMode` + `externalBookingUrl` columns + re-export `BookingMode`.
- **Create** `packages/crm/drizzle/0027_*.sql` (via drizzle-kit generate) — additive migration.
- **Modify** `packages/crm/src/lib/agents/tools.ts` — widen `ToolExecuteContext` with optional `booking`; branch `look_up_availability` + `book_appointment`.
- **Modify** `packages/crm/src/lib/agents/voice/deployment-voice.ts` — populate `ctx.booking` from the deployment; widen the `Pick`.
- **Modify** `packages/crm/src/lib/agents/voice/resolve-deployment-by-number.ts` — add `bookingMode` + `externalBookingUrl` to `DeploymentNumberRow` + the `.select`.
- **Modify** `packages/crm/src/lib/deployments/actions.ts` + `store.ts` + the deploy schema — persist the two fields.
- **Modify** `packages/crm/src/app/(dashboard)/studio/agents/[id]/deploy/deploy-client.tsx` — the chooser UI.
- **Modify** the relevant `*.spec.ts` (`tools.spec.ts`, `deployment-voice.spec.ts`) — branch + threading bug-catch tests.

---

## Task 1: Booking-provider registry (pure, TDD)

**Files:**
- Create: `packages/crm/src/lib/deployments/booking-providers.ts`
- Test: `packages/crm/tests/unit/deployments/booking-providers.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/crm/tests/unit/deployments/booking-providers.spec.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BOOKING_PROVIDERS,
  getBookingProvider,
  resolveBookingMode,
  type BookingMode,
} from "../../../src/lib/deployments/booking-providers.ts";

test("native + external_link are available; api_mcp + cal_com are coming_soon", () => {
  assert.equal(getBookingProvider("native").status, "available");
  assert.equal(getBookingProvider("external_link").status, "available");
  assert.equal(getBookingProvider("api_mcp").status, "coming_soon");
  assert.equal(getBookingProvider("cal_com").status, "coming_soon");
});

test("every provider has label, description, and agentBehavior", () => {
  for (const p of BOOKING_PROVIDERS) {
    assert.ok(p.label.length > 0, `${p.id} label`);
    assert.ok(p.description.length > 0, `${p.id} description`);
    assert.ok(
      ["book_native", "handoff_link", "handoff_followup"].includes(p.agentBehavior),
      `${p.id} agentBehavior`,
    );
  }
});

test("native behaves via the native chain; external_link hands off a link", () => {
  assert.equal(getBookingProvider("native").agentBehavior, "book_native");
  assert.equal(getBookingProvider("external_link").agentBehavior, "handoff_link");
  assert.equal(getBookingProvider("cal_com").agentBehavior, "handoff_followup");
});

test("resolveBookingMode falls back to native on unknown / null / undefined", () => {
  assert.equal(resolveBookingMode("external_link"), "external_link");
  assert.equal(resolveBookingMode("bogus"), "native");
  assert.equal(resolveBookingMode(null), "native");
  assert.equal(resolveBookingMode(undefined), "native");
});

test("requiresUrl is true only for external_link", () => {
  assert.equal(getBookingProvider("external_link").requiresUrl, true);
  assert.equal(getBookingProvider("native").requiresUrl, false);
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd packages/crm && node --import tsx --test tests/unit/deployments/booking-providers.spec.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the registry**

```typescript
// packages/crm/src/lib/deployments/booking-providers.ts
//
// The calendar-backend a DEPLOYED agent books through. Distinct from the
// conferencing `BookingProvider` in src/lib/bookings/providers.ts.
//
// native        — book directly into SeldonFrame's own booking (current chain).
// external_link — the client already has a booking page; the agent hands off
//                 its URL and captures the lead (no slot lookup, no DB write).
// api_mcp       — (coming soon) book via the client's own booking API/MCP.
// cal_com       — (coming soon) managed Cal.com per-client calendar.

export type BookingMode = "native" | "external_link" | "api_mcp" | "cal_com";

/** How the deployed agent's tools behave for this mode. */
export type AgentBookingBehavior =
  | "book_native" // run the existing availability + booking chain
  | "handoff_link" // share externalBookingUrl + capture the lead
  | "handoff_followup"; // capture the lead; scheduling follows out of band

export type BookingProviderInfo = {
  id: BookingMode;
  label: string;
  description: string;
  status: "available" | "coming_soon";
  agentBehavior: AgentBookingBehavior;
  /** UI: this mode needs the operator to supply a booking URL. */
  requiresUrl: boolean;
};

export const BOOKING_PROVIDERS: readonly BookingProviderInfo[] = [
  {
    id: "native",
    label: "SeldonFrame booking",
    description:
      "Zero setup. The agent checks availability and books straight into this workspace's calendar.",
    status: "available",
    agentBehavior: "book_native",
    requiresUrl: false,
  },
  {
    id: "external_link",
    label: "Their own booking link",
    description:
      "The client already has a booking page (Calendly, Cal.com, Acuity…). The agent captures the caller and shares their link.",
    status: "available",
    agentBehavior: "handoff_link",
    requiresUrl: true,
  },
  {
    id: "api_mcp",
    label: "Connect via API / MCP",
    description:
      "Bind the agent to the client's own calendar or booking tool over API/MCP. Coming with the connector directory.",
    status: "coming_soon",
    agentBehavior: "handoff_followup",
    requiresUrl: false,
  },
  {
    id: "cal_com",
    label: "Cal.com (managed)",
    description:
      "Real Google/Outlook/Apple sync via Cal.com Platform. Per-booking pricing applies. Coming soon.",
    status: "coming_soon",
    agentBehavior: "handoff_followup",
    requiresUrl: false,
  },
] as const;

const BY_ID = new Map<BookingMode, BookingProviderInfo>(
  BOOKING_PROVIDERS.map((p) => [p.id, p]),
);

export function getBookingProvider(id: BookingMode): BookingProviderInfo {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`unknown booking mode: ${id}`);
  return found;
}

/** Coerce any stored value to a known mode, defaulting to native. */
export function resolveBookingMode(value: string | null | undefined): BookingMode {
  if (value && BY_ID.has(value as BookingMode)) return value as BookingMode;
  return "native";
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `cd packages/crm && node --import tsx --test tests/unit/deployments/booking-providers.spec.ts`
Expected: PASS (all 5).

- [ ] **Step 5: Commit**

```bash
git add packages/crm/src/lib/deployments/booking-providers.ts packages/crm/tests/unit/deployments/booking-providers.spec.ts
git commit -m "feat(deploy): booking-mode provider registry (native/external/api-mcp/cal.com)"
```

---

## Task 2: Schema + additive migration

**Files:**
- Modify: `packages/crm/src/db/schema/deployments.ts`
- Create: `packages/crm/drizzle/0027_*.sql` (generated)

- [ ] **Step 1: Add the columns + re-export**

In `deployments.ts`, import the type and add two columns to the `deployments` table (place them near `calendarRef`):

```typescript
import type { BookingMode } from "@/lib/deployments/booking-providers";
// ...
  bookingMode: text("booking_mode").$type<BookingMode>().notNull().default("native"),
  externalBookingUrl: text("external_booking_url"),
```

Add a re-export near the other type exports so downstream imports are stable:

```typescript
export type { BookingMode } from "@/lib/deployments/booking-providers";
```

- [ ] **Step 2: Generate the migration**

Run the repo's drizzle generate script (check `package.json` scripts — likely `pnpm --filter @seldonframe/crm db:generate` or `drizzle-kit generate`).

- [ ] **Step 3: VERIFY the migration is additive + journal-clean**

The generated `0027_*.sql` must be ONLY:

```sql
ALTER TABLE "deployments" ADD COLUMN "booking_mode" text DEFAULT 'native' NOT NULL;
ALTER TABLE "deployments" ADD COLUMN "external_booking_url" text;
```

Confirm `meta/_journal.json` gained exactly one appended entry (tag `0027_*`) — mirror the 0026 precedent; `git diff` of the journal must be a pure append. Run the journal check if present: `node scripts/check-migrations-journaled.* ` (or the package script). Paste the SQL into the commit body.

- [ ] **Step 4: tsc**

Run: `packages/crm/node_modules/.bin/tsc -p packages/crm/tsconfig.json --noEmit`
Expected: 0 new errors (the only allowed pre-existing errors are the `.next/types/validator.ts` React-19 artifacts).

- [ ] **Step 5: Commit**

```bash
git add packages/crm/src/db/schema/deployments.ts packages/crm/drizzle/
git commit -m "feat(deploy): deployments.booking_mode + external_booking_url (additive migration)"
```

---

## Task 3: Thread the booking mode into the deployed-agent tool context

**Files:**
- Modify: `packages/crm/src/lib/agents/tools.ts` (the `ToolExecuteContext` type, ~lines 22-44)
- Modify: `packages/crm/src/lib/agents/voice/deployment-voice.ts` (`loadDeploymentVoiceContext`, the `Pick` + ctx assembly ~lines 103-170)
- Modify: `packages/crm/src/lib/agents/voice/resolve-deployment-by-number.ts` (`DeploymentNumberRow` + `.select`)
- Test: `packages/crm/tests/unit/agents/voice/deployment-voice.spec.ts`

- [ ] **Step 1: Widen `ToolExecuteContext`**

In `tools.ts`, add an OPTIONAL field (workspace agents leave it undefined → native):

```typescript
export type ToolExecuteContext = {
  orgId: string;
  orgSlug: string;
  agentId: string;
  conversationId: string;
  testMode: boolean;
  callerPhone?: string;
  timezone?: string;
  /** Deployed-agent only. Absent for workspace/operator agents (→ native booking). */
  booking?: {
    mode: import("@/lib/deployments/booking-providers").BookingMode;
    externalUrl?: string | null;
  };
};
```

- [ ] **Step 2: Write the failing threading test**

Add to `deployment-voice.spec.ts` (follow the file's existing harness/fixtures — it already injects a `clientContext`; reuse that deployment fixture and add `bookingMode`/`externalBookingUrl`):

```typescript
test("loadDeploymentVoiceContext threads external_link booking into ctx", async () => {
  const result = await loadDeploymentVoiceContext({
    deployment: makeDeployment({
      bookingMode: "external_link",
      externalBookingUrl: "https://book.acme.test/clientx",
    }),
    now: FIXED_NOW,
    deps: TEST_DEPS,
  });
  assert.equal(result.ctx.booking?.mode, "external_link");
  assert.equal(result.ctx.booking?.externalUrl, "https://book.acme.test/clientx");
});

test("loadDeploymentVoiceContext defaults to native when bookingMode unset", async () => {
  const result = await loadDeploymentVoiceContext({
    deployment: makeDeployment({ bookingMode: "native", externalBookingUrl: null }),
    now: FIXED_NOW,
    deps: TEST_DEPS,
  });
  assert.equal(result.ctx.booking?.mode, "native");
});
```

(If the spec lacks a `makeDeployment` helper, construct the deployment object inline matching the existing fixtures, adding the two new fields. Backfill `bookingMode: "native"` / `externalBookingUrl: null` into any existing fixtures so types compile.)

- [ ] **Step 3: Run it, verify it fails**

Run: `cd packages/crm && node --import tsx --test tests/unit/agents/voice/deployment-voice.spec.ts`
Expected: FAIL (`ctx.booking` undefined).

- [ ] **Step 4: Populate `ctx.booking` + widen the `Pick`**

In `deployment-voice.ts`: add `"bookingMode" | "externalBookingUrl"` to the `Pick<Deployment, …>` in the args type. After the `ctx` is assembled (~line 170), set:

```typescript
import { resolveBookingMode } from "@/lib/deployments/booking-providers";
// ...
ctx.booking = {
  mode: resolveBookingMode(args.deployment.bookingMode),
  externalUrl: args.deployment.externalBookingUrl ?? null,
};
```

- [ ] **Step 5: Add fields to the number-resolver projection**

In `resolve-deployment-by-number.ts`: add `bookingMode` + `externalBookingUrl` to the `DeploymentNumberRow` type AND to the active-deployments `.select({ … })` projection (mirror how `clientContext`/`clientName` were added). This guarantees the live webhook row carries the fields.

- [ ] **Step 6: Run, verify pass + no regressions**

Run: `cd packages/crm && node --import tsx --test tests/unit/agents/voice/deployment-voice.spec.ts`
Expected: PASS (new + existing).

- [ ] **Step 7: Commit**

```bash
git add packages/crm/src/lib/agents/tools.ts packages/crm/src/lib/agents/voice/deployment-voice.ts packages/crm/src/lib/agents/voice/resolve-deployment-by-number.ts packages/crm/tests/unit/agents/voice/deployment-voice.spec.ts
git commit -m "feat(deploy): thread booking mode into deployed-agent tool context"
```

---

## Task 4: Branch the deployed-agent tools on booking mode

**Files:**
- Modify: `packages/crm/src/lib/agents/tools.ts` (`look_up_availability` ~197-280, `book_appointment` ~399-540)
- Test: `packages/crm/tests/unit/agents/tools.spec.ts` (or the file where tool execution is unit-tested — locate it; if none exists for these tools, create `tests/unit/agents/tools-booking-mode.spec.ts`)

**Design:** at the TOP of each tool's execute body, before any availability/booking call, compute `const mode = ctx.booking?.mode ?? "native";`. If `mode === "native"` → existing code path UNCHANGED. Else branch to a handoff result. This guarantees workspace agents (no `ctx.booking`) hit the identical native path.

- [ ] **Step 1: Write failing branch tests**

```typescript
// look_up_availability
test("look_up_availability native path is unchanged when ctx.booking absent", async () => {
  // Arrange a ctx WITHOUT booking; stub listPublicBookingSlotsAction via deps.
  // Assert the stub WAS called and slots flow through (existing behavior).
});

test("look_up_availability external_link does NOT call availability, returns the link", async () => {
  const ctx = makeCtx({ booking: { mode: "external_link", externalUrl: "https://book.acme.test/x" } });
  const res = await runLookUpAvailability(ctx, { date: "2026-07-01" }, { listSlots: shouldNotBeCalled });
  assert.match(JSON.stringify(res), /book\.acme\.test\/x/);
  // shouldNotBeCalled throws if invoked → proves no native availability call
});

// book_appointment
test("book_appointment external_link does NOT write a booking, returns handoff + link", async () => {
  const ctx = makeCtx({ booking: { mode: "external_link", externalUrl: "https://book.acme.test/x" } });
  const res = await runBookAppointment(ctx, { fullName: "Pat Lee", slotIso: "2026-07-01T15:00:00Z", confirmed: true },
    { submitBooking: shouldNotBeCalled });
  assert.match(JSON.stringify(res), /book\.acme\.test\/x/);
});

test("book_appointment cal_com (coming soon) captures intent, no write, promises follow-up", async () => {
  const ctx = makeCtx({ booking: { mode: "cal_com" } });
  const res = await runBookAppointment(ctx, { fullName: "Pat Lee", slotIso: "2026-07-01T15:00:00Z", confirmed: true },
    { submitBooking: shouldNotBeCalled });
  assert.match(JSON.stringify(res).toLowerCase(), /follow|reach|schedul/);
});
```

(Match the test harness to how `tools.ts` exposes execution. If the tools are only invokable through a registry/`executeVoiceToolCall`, drive them that way and inject the `submitBooking`/`listSlots` deps the file already uses — the map showed `deps.submitBooking` is DI'd. `shouldNotBeCalled = () => { throw new Error("native path must not run for non-native mode"); }`.)

- [ ] **Step 2: Run, verify fail**

Expected: FAIL (no branch yet; native path runs / calls the stub).

- [ ] **Step 3: Implement the branch**

In `look_up_availability` execute, before the `listPublicBookingSlotsAction` call:

```typescript
const mode = ctx.booking?.mode ?? "native";
if (mode === "external_link") {
  const url = ctx.booking?.externalUrl ?? null;
  return {
    bookingHandoff: "external_link",
    message: url
      ? `We book through our online scheduler. I can text you the link: ${url}`
      : "We book through our online scheduler — I can have someone send you the link.",
    url,
  };
}
if (mode === "api_mcp" || mode === "cal_com") {
  return {
    bookingHandoff: "followup",
    message: "I've got your details — our team will reach out shortly to lock in a time.",
  };
}
// mode === "native": existing code path continues unchanged ↓
```

In `book_appointment` execute, before the `deps.submitBooking(...)` call, add the SAME branch (returning a confirmation-style handoff message; for `external_link` include the `url`; for `api_mcp`/`cal_com` a "we'll follow up to schedule" message). The native branch continues to call `deps.submitBooking` exactly as today.

Keep the return shape compatible with how the realtime layer serializes tool results (the map shows tools return plain objects that get JSON-stringified to the model — a `message` field the agent can speak is sufficient; do not change the native return shape).

- [ ] **Step 4: Run, verify pass + full tools/voice suites green**

Run: `cd packages/crm && node --import tsx --test tests/unit/agents/tools*.spec.ts tests/unit/agents/voice/*.spec.ts`
Expected: PASS, no regressions.

- [ ] **Step 5: Commit**

```bash
git add packages/crm/src/lib/agents/tools.ts packages/crm/tests/unit/agents/
git commit -m "feat(deploy): deployed agent honors booking mode (native books, external hands off link)"
```

---

## Task 5: Deploy-wizard chooser UI + persistence

**Files:**
- Modify: `packages/crm/src/lib/deployments/actions.ts` (`createDeploymentAction` + its zod schema) and `packages/crm/src/lib/deployments/store.ts` (`createDeployment`)
- Modify: `packages/crm/src/app/(dashboard)/studio/agents/[id]/deploy/deploy-client.tsx`
- Test: extend the deployments store/schema spec used in the persona build (`tests/unit/deployments/generate-client-context.spec.ts` exercised `CreateDeploymentSchema` + `createDeployment` persistence — follow that pattern in a new or existing spec)

- [ ] **Step 1: Persist the two fields (schema + store), TDD**

Extend the create-deployment zod schema with:

```typescript
bookingMode: z.enum(["native", "external_link", "api_mcp", "cal_com"]).default("native"),
externalBookingUrl: z.string().url().optional().nullable(),
```

Add a validation refinement: if `bookingMode === "external_link"` then `externalBookingUrl` must be a non-empty URL (else `native`). Write a failing test asserting (a) the schema accepts a valid external_link+url, (b) rejects external_link without a url, (c) `createDeployment` persists both fields (DI'd insert, mirror the persona build's persistence test). Then thread the fields through `createDeploymentAction` → `createDeployment` insert values.

- [ ] **Step 2: Run, verify fail → implement → pass**

Run: `cd packages/crm && node --import tsx --test tests/unit/deployments/*.spec.ts`

- [ ] **Step 3: Chooser UI in the deploy wizard**

In `deploy-client.tsx`, add a **"How should this agent book?"** section (import `BOOKING_PROVIDERS`). Render the four options as selectable cards/radios:
- `available` ones (native, external_link) are selectable.
- `coming_soon` ones (api_mcp, cal_com) render **disabled** with a "Coming soon" pill + their `description` (cal_com shows the pricing note from its description). Visible but not selectable.
- When `external_link` is selected, reveal a required URL input (`externalBookingUrl`) with placeholder `https://…` and inline validation.
- Default selection: `native`.
Thread `bookingMode` + `externalBookingUrl` into the existing `createDeploymentAction` call on Deploy. Keep it consistent with the wizard's existing styling (reuse the Step-2 patterns from the persona-context section).

- [ ] **Step 4: Verify build-time checks**

Run: `packages/crm/node_modules/.bin/tsc -p packages/crm/tsconfig.json --noEmit` (0 new errors) and `bash scripts/check-use-server.sh src` (clean). `deploy-client.tsx` must keep `"use client"`.

- [ ] **Step 5: Commit**

```bash
git add packages/crm/src/lib/deployments/ packages/crm/src/app/\(dashboard\)/studio/agents/\[id\]/deploy/deploy-client.tsx packages/crm/tests/unit/deployments/
git commit -m "feat(deploy): calendar-provider chooser in deploy wizard (native + your-own-link; API/MCP + Cal.com coming soon)"
```

---

## Task 6: Final verification

- [ ] **Step 1: Full relevant suites**

Run: `cd packages/crm && node --import tsx --test tests/unit/deployments/*.spec.ts tests/unit/agents/voice/*.spec.ts tests/unit/agents/tools*.spec.ts`
Expected: all green.

- [ ] **Step 2: tsc + use-server + migrations journal**

Run: `packages/crm/node_modules/.bin/tsc -p packages/crm/tsconfig.json --noEmit` (0 new src+test errors) · `bash scripts/check-use-server.sh src` (clean) · the migrations-journaled check (28 journaled, 0 orphans expected).

- [ ] **Step 3: Regression proof (state it in the report)**

Confirm in the final report: no workspace/operator booking code (`bookings/actions.ts`, `bookings/create-for-customer.ts`, `bookings/providers.ts`) was modified; the only tool change is an early `ctx.booking`-guarded branch; workspace agents (no `ctx.booking`) provably hit the unchanged native path.

---

## Self-Review

- **Spec coverage:** menu of choices (Task 1 registry + Task 5 chooser) ✓; native works unchanged (Task 4 native branch) ✓; external link works (Task 4 handoff) ✓; API/MCP + Cal.com registered as coming-soon (Task 1 + Task 5) ✓; per-deployment persistence (Task 2 + Task 5) ✓; voice ctx threading (Task 3) ✓.
- **Deferred (NOT in this plan, by design):** real api_mcp/cal_com adapters, chat-deploy parity, per-deployment native calendar with the client's own hours/isolation (that's the per-client plan's Phase 3 — separate), SMS-delivery of the external link.
- **Type consistency:** `BookingMode` defined once in `booking-providers.ts`, re-exported from schema; `ctx.booking.mode` uses it; the zod enum mirrors it. `bookingMode` (this plan) ≠ `BookingProvider` (conferencing, untouched).
- **Placeholder scan:** none — all steps carry real code.
