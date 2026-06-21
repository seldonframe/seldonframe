# Per-Client Context — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax. TDD every pure unit; verify with the real test runner before claiming done.

**Goal:** A deployed agent is genuinely the **client's** — it speaks the client's services/FAQ/hours (not generic, not the builder's) and books into a **client-specific calendar** (the client's hours, the client's bookings, isolated from the builder's), so a builder can deploy the same template to 50 SMBs and each one is theirs.

---

## ⚠️ Scope correction (read first)
The original idea was "book into the client's **own** Google/Outlook calendar via a cal.diy **CalDAV** bridge." **That is not reachable in the current codebase** and is explicitly OUT of this plan:
- Google Calendar sync was **removed** — `lib/.../google-calendar-sync.ts` is a no-op stub (`{ ok:false, synced:false }`) as of 2026-05-01.
- There is **zero** CalDAV / Outlook / Apple / ICS / external-calendar code. Booking is **purely native cal.diy** (rows in the `bookings` table keyed by `orgId` + a `bookingSlug` appointment-type).

So "the client's own calendar" in **v1 = a native, per-deployment cal.diy calendar** (the client's own availability + isolated bookings, inside SeldonFrame). **External-calendar sync (CalDAV to the client's real Google/Outlook) is a separate future integration** (new bridge layer — see Deferred). This plan delivers the sellable 90%: the agent *speaks as the client and books on the client's hours*, attributable per client.

---

## Architecture & design decisions
- **One new jsonb field, `deployments.clientContext`**, holds the client's business soul (services / description / hours / voice) + FAQ. Captured at deploy (generate-from-description via the existing soul compiler, then editable). Threaded into the persona at call time, replacing the `{ businessName: clientName }` minimal soul.
- **Booking targeting** changes from "always `ctx.orgId`" to "a per-deployment appointment-type selector." We provision a per-deployment appointment type (in the builder's org, the only place cal.diy data lives today) carrying the **client's** availability, store its slug in `deployments.calendarRef`, thread it into the voice tool context, and **tag created bookings with `deploymentId`** for per-client isolation/visibility.
- **Reuse, don't rebuild:** `compileSoulService` (soul from description), `composeVoicePersona` (already reads soul.services + blueprint.faq), the existing booking actions (`listPublicBookingSlotsAction` / `submitPublicBookingAction`) + appointment-type creation.
- **Voice path first** (it's live + what Max tests). **Chat/embed parity is deferred** — the chat deploy route (`api/v1/public/agent/[slug]/turn`) doesn't resolve deployments today (it runs on the builder's workspace soul); wiring deployment resolution into it is its own task once the chat-deploy routing is settled.

**Tech stack / conventions:** Drizzle + Neon (additive migration via `drizzle-kit generate` → journal; verify additive + journal append, per the 0025 precedent), `node --import tsx --test`, local `tsc` binary (0 new src errors), pure logic in plain modules, `"use server"` only-async, DI for LLM/DB so unit tests are network-free.

---

## Phase 0 — schema: `deployments.clientContext`

### Task 1: add the column + types (migration)
**Files:** `db/schema/deployments.ts`; migration.
- [ ] Define the type next to `DeploymentClientContact`:
```ts
export type DeploymentClientSoul = {
  businessName?: string;
  businessDescription?: string;
  services?: Array<{ name: string; description?: string }>;
  business_hours?: Record<string, unknown>; // WeeklyHours shape (see lib/workspace/format-hours)
  voice?: { style?: string };
};
export type DeploymentClientContext = {
  soul?: DeploymentClientSoul;
  faq?: Array<{ q: string; a: string }>;
};
```
- [ ] Add column `clientContext: jsonb("client_context").$type<DeploymentClientContext>()` (nullable).
- [ ] `drizzle-kit generate` → verify the SQL is a single additive `ALTER TABLE "deployments" ADD COLUMN "client_context" jsonb;` and the journal gained exactly one appended entry (mirror the 0025 verification). Paste the SQL in the commit body.
- [ ] tsc clean. Commit `feat(deploy): deployments.client_context (additive migration)`.

---

## Phase 1 — capture the client's context at deploy

### Task 2: `generateClientContext` (pure mapping, DI'd) + action
**Files:** create `lib/deployments/client-context.ts` (plain) + a `"use server"` action in `lib/deployments/actions.ts`; test `tests/unit/deployments/client-context.spec.ts`.
- [ ] **Step 1 (failing test):** pure `mapSoulToClientContext(soul: SoulV4-or-OrgSoul-shape): DeploymentClientContext` — maps a compiled soul → `{ soul: { businessName, businessDescription, services }, faq }`, dropping anything not in `DeploymentClientContext`. Tests: services pass through; description maps; missing fields → omitted; an empty soul → `{}`.
- [ ] **Step 2 (implement)** `mapSoulToClientContext` (pure). Read `lib/soul-compiler/service.ts` (`compileSoulService(description) → SoulV4`) + `lib/soul-compiler/schema.ts` to map the real SoulV4 field names → `DeploymentClientSoul` + `faq`.
- [ ] **Step 3:** add `generateClientContextAction({ description })` (`"use server"`): org-guard; if `description` blank → `{ ok:false, error:'empty' }`; else `compileSoulService(description)` → `mapSoulToClientContext` → `{ ok:true, clientContext }`. (No persistence — the wizard holds it until deploy.) DI the compile call so a unit test uses a fake. tsc + check-use-server. Commit `feat(deploy): generate client business context from a description`.

### Task 3: capture UI in the deploy wizard
**Files:** `app/(dashboard)/studio/agents/[id]/deploy/deploy-client.tsx` (Step 2 ~219-282); extend `createDeploymentAction` + `createDeployment` store to accept + persist `clientContext`.
- [ ] After the client-name input, add a collapsible **"Client's business (optional — makes the agent speak as them)"**: a textarea ("Paste their website text or describe their services & hours") + an **"Auto-fill"** button → `generateClientContextAction({ description })` → on success, render editable **services rows** (name/description, add/remove — mirror the FAQ rows pattern) + **FAQ rows** + a short **description** field, all pre-filled from the result and hand-editable. Keep it entirely optional (blank → today's behavior: name-only).
- [ ] Thread the assembled `clientContext` into the wizard's `createDeploymentAction` payload; extend `createDeploymentAction` + the `createDeployment` store insert to persist `clientContext` (additive; default `null`).
- [ ] tsc; commit `feat(deploy): capture + persist client business context in the deploy wizard`.

---

## Phase 2 — speak as the client (voice deploy path)

### Task 4: thread `clientContext` into the deployed persona
**Files:** `lib/agents/voice/deployment-voice.ts` (+ its spec).
- [ ] In `loadDeploymentVoiceContext`, replace the minimal `{ businessName: args.deployment.clientName }` soul with a soul built from `deployment.clientContext?.soul` (set `businessName = clientContext.soul?.businessName || clientName`). When `clientContext.faq` is present, **override the template blueprint's `faq`** with the client's faq (compose a `{ ...templateBlueprint, faq: clientContext.faq }`). Keep builder timezone/intake/booking ctx unchanged. Keep the **no-builder-soul** guarantee (never read `personaInputs.soul`).
- [ ] Widen the `loadDeploymentVoiceContext` `Pick<Deployment, …>` to include `clientContext` (the webhook already passes the full row — confirm `resolve-deployment-by-number.ts` projects `clientContext`; add it to the `.select` + `DeploymentNumberRow` like `clientName` was added).
- [ ] **Tests (bug-catch style):** inject a `clientContext` with a sentinel service (`"CLIENT-SERVICE-XYZ"`) + a sentinel FAQ; assert the composed `instructions` contain BOTH, contain the client name, and STILL contain none of the builder soul (reuse the existing builder-soul sentinels). Add a no-clientContext case → falls back to name-only (today's behavior). Keep all existing deployment-voice tests green.
- [ ] tsc 0; commit `feat(voice): deployed agent speaks the client's services + FAQ`.

**Exit of Phase 2 (shippable):** a deployed voice agent answers "what do you offer?" / FAQ with the *client's* services + answers — Max's #1 ask, fully on the live path. Phase 3 makes the *booking* client-specific.

---

## Phase 3 — book into the client's own (native) calendar

### Task 5: SPIKE — pin the booking-availability internals (no code; output into this plan)
The booking engine is regression-sensitive and only partially mapped. Before changing it, pin:
- [ ] How an **appointment type** is created (the `bookings` row with `status='template'` — `lib/bookings/actions.ts:~314`; the `create_appointment_type` MCP tool) and what fields hold **availability/hours** (days, hours, slot length, timezone). Exact function + payload to create one programmatically.
- [ ] The exact params of `listPublicBookingSlotsAction` + `submitPublicBookingAction` (`lib/bookings/actions.ts:504,1384`) — confirm they key off `{ orgSlug, bookingSlug }` → `resolvePublicBookingContext` → `orgId` + the appointment type, and where the `WHERE bookings.orgId` lives.
- [ ] Whether `bookings` has (or needs) a `deployment_id` column for per-client attribution.
- [ ] Append findings here. **If creating a per-deployment appointment type with custom availability is NOT a clean reuse, STOP and flag** — we'll re-scope to "tag bookings with deploymentId + the agent uses the client's hours from clientContext for its spoken availability" (a smaller, LLM-guided fallback) rather than a full second appointment type.

### Task 6: provision a per-deployment appointment type (client hours) on activate
**Files:** `lib/deployments/actions.ts` (activate/provision path) + a new `lib/deployments/provision-calendar.ts` (DI'd).
- [ ] On activation, if `clientContext.soul.business_hours` exists, create a per-deployment appointment type in the **builder org** carrying the **client's** hours + name (reuse the Task-5 creation fn), and store its slug in `deployments.calendarRef = { provider:'caldiy', calendarId:<bookingSlug> }`. Idempotent (don't double-create; reuse if `calendarRef` set). TDD the pure "build appointment-type payload from clientContext" mapping with a fake creator.
- [ ] tsc; commit `feat(deploy): provision a per-deployment booking calendar from client hours`.

### Task 7: target the per-deployment calendar from the agent + tag bookings
**Files:** `lib/agents/tools.ts` (the `ToolExecuteContext` + `lookUpAvailability`/`bookAppointment`), `lib/agents/voice/deployment-voice.ts` (set the selector on ctx), `lib/bookings/actions.ts` (accept the selector + tag).
- [ ] Add an optional `bookingSlug?: string` (+ `deploymentId?: string`) to `ToolExecuteContext`; `lookUpAvailability` + `bookAppointment` pass it through to the public-booking actions as the appointment-type selector (falling back to the org default when unset — **the workspace path is untouched**).
- [ ] `loadDeploymentVoiceContext` sets `ctx.bookingSlug = deployment.calendarRef?.calendarId` + `ctx.deploymentId = deployment.id`.
- [ ] `listPublicBookingSlotsAction` + `submitPublicBookingAction` accept the optional selector → use the per-deployment appointment type's slots; `submit` writes `deployment_id` on the booking row (add the column if Task 5 found it absent — additive migration). TDD the selector-resolution + the "defaults to org behavior when unset" path with fakes.
- [ ] **Regression guard:** add/keep a test that a NON-deployment (workspace) booking is unchanged.
- [ ] tsc 0; commit `feat(booking): agent books into the per-deployment calendar; bookings tagged by deployment`.

### Task 8: per-client bookings view
**Files:** `studio/clients/*` (the Clients screen / a deployment detail).
- [ ] Surface a deployment's bookings (query `bookings` by `deployment_id`) on the Clients screen so the builder sees "acme hvac: N bookings." (The no-login client doesn't see SeldonFrame; the builder is the operator of record — v1.)
- [ ] tsc; commit `feat(clients): per-deployment bookings on the Clients screen`.

---

## Phase 4 — verify
- [ ] Full deployments + voice + bookings + telephony unit suites green; tsc 0 src+test errors; check-use-server.
- [ ] **Manual (Max):** deploy a voice agent WITH a client description (auto-filled) → call it → it answers with the *client's* services/FAQ → books a slot → the slot respects the *client's* hours → the booking shows under that client on the Clients screen → the builder's own 839 bookings are unaffected.

---

## Deferred (explicit — not this plan)
- **External-calendar sync (the real CalDAV/Google/Outlook bridge):** new integration layer (OAuth or CalDAV creds per client, sync engine). The single biggest follow-on; only worth it after the native per-deployment calendar proves demand.
- **Chat / embed / link deploy parity:** the `api/v1/public/agent/[slug]/turn` route doesn't resolve deployments today (runs on the builder workspace soul). Wire deployment resolution + `clientContext` into it once the chat-deploy routing is settled. (Voice is the live path; do it first.)
- **Per-client FAQ-from-URL:** v1 generates from a pasted description (the backend `compileSoulService` takes text, not URLs — URL→soul lives in the MCP client). A backend URL-scrape→clientContext is a nice follow-on.

## Risks & mitigations
- **Booking-engine regression** (Phase 3 touches shared booking actions) → the selector is OPTIONAL and defaults to today's behavior; explicit "workspace booking unchanged" regression test; the Task-5 spike gates the approach.
- **Migration safety** → additive nullable columns only; verify journal append (0025 precedent).
- **Empty/garbage client description** → `generateClientContextAction` returns `empty`/falls back to name-only; the agent degrades to the proven name-only persona, never worse than today.
- **No-builder-soul guarantee must hold** → keep the Phase-2 bug-catch test (sentinels) so the builder's identity can never leak back in.
