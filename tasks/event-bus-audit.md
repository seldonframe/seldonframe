# Event bus audit — Phase 2.5.a

**Mode:** read-only. No code changes.
**Date:** 2026-04-20
**Question (D-4 from v1-master-plan):** does an event-bus pattern exist in the repo, or is this net-new infrastructure?

## Verdict: **A — exists + sufficient for Phases 3–6.**

Re-evaluate at Phase 7 kickoff if automation canvas needs persistence for execution history / retries across process restarts.

---

## What exists

### `packages/core/src/events/index.ts` (120 LOC)

The core event primitive. Exports:

- **Typed event union `SeldonEvent`** — 21 event types already enumerated with typed payloads: `contact.created`, `contact.updated`, `deal.stage_changed`, `form.submitted`, 4 × `booking.*`, 3 × `email.*`, 2 × `landing.*`, 4 × `payment/subscription/invoice.*`, 3 × `portal.*`. Custom objects get dynamic events via the `${string}.${string}` fallback in `EventType`.
- **`SeldonEventBus` interface** — standard `emit / on / once / off / onAny / offAny`.
- **`InMemorySeldonEventBus` class** — implementation. Maintains a `handlers: Map<EventType, Set<Handler>>` + `anyHandlers: Set<Handler>`. `emit()` uses `Promise.allSettled` to run every subscribed handler in parallel and absorb per-handler failures without losing other subscribers.
- **Global bus accessor** — `getSeldonEventBus()` lazily creates the in-memory bus on first call; `setSeldonEventBus(customBus)` for swap-in during tests or when a future persisted bus ships.

### `packages/crm/src/lib/events/bus.ts` (6 LOC)

Thin helper: `emitSeldonEvent(type, data) → Promise<void>`. All 18 emit sites in `packages/crm/src` call this helper, not `getSeldonEventBus().emit()` directly. Clean choke-point for instrumentation.

### `packages/crm/src/lib/events/listeners.ts` (201 LOC)

`registerCrmEventListeners()` — one-shot registration of CRM-side subscribers. Called at app boot. Subscribers include:

- `onAny` — routes any event carrying a `contactId` to `sendTriggeredEmailsForContactEvent` (automation email triggers).
- `contact.created` — `sendWelcomeEmailForContact`, `syncContactToNewsletter`, telemetry emit.
- `deal.stage_changed` — telemetry.
- `form.submitted` — telemetry.
- `booking.created / completed / cancelled / no_show` — telemetry + (for completed) follow-up email trigger.
- `email.sent / opened / clicked` — engagement telemetry.
- `landing.visited / converted` — funnel telemetry.
- `payment.*`, `subscription.*`, `invoice.*`, `portal.*` — various telemetry + downstream actions.

Guard `listenersRegistered` bool prevents double-registration across hot reloads.

### `packages/crm/src/lib/events/event-types.ts` (29 LOC)

`BUILT_IN_EVENT_TYPE_SUGGESTIONS` — the same 21 strings from the core type union, exported as a const array for UI autocomplete / validation. `isValidEventType()` regex `/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/` for custom event names.

## Current emit sites (18 found via grep)

```
app/api/v1/forms/submit/route.ts          contact.created, form.submitted
lib/bookings/actions.ts                   booking.{created,completed,cancelled,no_show}, contact.created (6 sites)
lib/contacts/actions.ts                   contact.created (2 sites)
lib/crm/custom-objects.ts                 <object>.created, <object>.field_changed
lib/deals/actions.ts                      deal.stage_changed
lib/emails/actions.ts                     email.sent
```

All emits go through `emitSeldonEvent()`. No raw `bus.emit()` calls anywhere. Good hygiene — makes future instrumentation cheap.

## Capabilities matrix (from v1-master-plan §D-4)

| Capability | Status | Notes |
|---|---|---|
| Cross-workspace isolation | ✅ via convention | Handlers must scope DB queries by the `orgId` derived from payload (contactId → contact.orgId, etc.). All existing handlers do this. No global leakage. |
| Async delivery | ⚠️ In-process, synchronous-to-request | `emit()` awaits every handler. Caller of `emitSeldonEvent` must `await` if they care about side effects landing before response — or `void` if fire-and-forget in a serverless request. |
| Retries on failure | ❌ Not supported | `Promise.allSettled` absorbs per-handler failures but doesn't retry. Failed handlers drop silently. |
| Subscriber registration per block | ✅ | One-shot `registerCrmEventListeners()` at boot. Extending = add `bus.on(type, handler)` in `listeners.ts`. New blocks can own their own register-listeners function and have the app-init call them all. |
| Soul-event vocabulary | ✅ | Typed union of 21 events matches what Soul expects for automation generation. Typed payloads prevent drift. |
| Persistence | ❌ Not supported today | `InMemorySeldonEventBus` loses every handler on process restart. Subscribers must re-register at boot (currently via `registerCrmEventListeners`). Events themselves aren't written to a DB — they exist only in the moment, fan out, disappear. |
| Cross-process / cross-invocation delivery | ❌ Not supported today | Vercel serverless invocation N emits event E; handlers in invocation N process it synchronously in the same request. Invocation N+1 has no memory of E. Fine for "same-request side effects" (welcome email on signup), insufficient for "queued work" (retry on failure, delayed send, etc.). |

## Implications for each Phase 3–7

| Phase | Fit |
|---|---|
| **Phase 3 — Email** | ✅ Perfect fit. Emit `email.sent` / `.opened` / `.clicked` / `.bounced` on webhook receipt. Subscribers (automation trigger, activity log, counter increment) fire in-request. No new infra needed. |
| **Phase 4 — SMS** | ✅ Same shape as email. Emit `sms.sent` / `.delivered` / `.replied`. Add these to the `SeldonEvent` union. No new infra. |
| **Phase 5 — Payments** | ✅ `payment.*`, `subscription.*`, `invoice.*` already in the union. Stripe webhook handlers emit; subscribers fire. No new infra. |
| **Phase 6 — Landing pages** | ✅ `landing.visited` / `.converted` already in union. Existing. |
| **Phase 6.5 — Static automation preview** | ✅ Read-only canvas doesn't depend on event plumbing at all — only renders Soul's automation metadata. |
| **Phase 7 — Automation canvas with execution history + retries** | ⚠️ Re-evaluate. In-memory bus loses events on crash; automation runs need durable history. Options: (a) add a `soul_events` DB table on top of the bus — every `emit` also writes a row, subscribers read history via SQL; (b) move to pg-LISTEN/NOTIFY for cross-process fan-out; (c) keep in-memory + add per-automation execution_log table that stores runs only when an automation fires. Decision at Phase 7.a kickoff. |

## What Phase 3 integration looks like (concrete)

Example: when an email is sent, emit `email.sent` and have the automation engine subscribe.

**Emit side** (Phase 3 Email block):

```ts
// packages/crm/src/lib/emails/actions.ts — already exists at line 255
await emitSeldonEvent("email.sent", { emailId, contactId });
```

**Subscribe side** (Phase 7 Automation engine — or Phase 3 mini-handler if automation isn't ready):

```ts
// packages/crm/src/lib/events/listeners.ts — extend registerCrmEventListeners()
bus.on("email.sent", async (event) => {
  await advanceAutomationStep({ eventType: "email.sent", ...event.data });
});
```

Nothing else needed — the bus singleton is already live, the typed union already includes `email.sent`, and the registration pattern is established.

## What Phase 2.5.b/c/d need

Given Verdict A, the downstream 2.5 slices simplify:

- **2.5.b Event bus scaffold** — **mostly a no-op.** The scaffold exists. Actions:
  - Add remaining event types to the `SeldonEvent` union as we need them (`sms.*`, `signature.*`, `automation.*`). Additive, no breaking changes.
  - Document the "fire-and-forget vs await" semantics in `AGENTS.md`.
  - Add a sample subscriber in `listeners.ts` for each new block at Phase 3–6 kickoff (not 2.5).
  - No new DB table for v1.
- **2.5.c Unified integration UX** — unchanged. `/settings/integrations` card page + `connect_integration` MCP tool. Proceeds as planned.
- **2.5.d Secret encryption audit** — unchanged. Audit `lib/encryption.ts` + `workspace_secrets` table.

## What I'm NOT doing in this slice

- Writing tests for the existing bus (tests exist elsewhere; verification is orthogonal).
- Extending `SeldonEvent` with `sms.*` / `payment.stripe.*` / `automation.*` — those come with their respective phases.
- Moving to a persisted queue. The in-memory bus is enough for v1 up to Phase 7. Phase 7.a re-evaluates.

## Action items blocked before

- ~~D-4: does an event bus pattern exist?~~ → **Resolved. Verdict A.**

## Action items now unblocked

- Phase 3 — Email block implementation.
- Phase 2.5.c — Unified integration UX.
- Phase 2.5.d — Secret encryption audit.

## Risks that remain open

- **R-1: In-memory bus loses events on restart.** Impact: low for v1. Mitigation: critical side effects (welcome email, automation triggers) are awaited in-request so they complete before response returns. If response returns, the work happened. Process restarts lose only unqueued work.
- **R-2: `Promise.allSettled` silently drops failed handlers.** Impact: medium. A buggy subscriber that throws won't be logged anywhere today. Mitigation (future): add `logEvent("subscriber_failed", ...)` around each handler invocation. Track as a Phase 12 polish item.
- **R-3: Custom-object events use string template literal `${string}.${string}` — no type safety on payloads.** Impact: low. Subscribers can use `onAny` and type-check inside, or register typed handlers per-object-slug. Acceptable for v1.
- **R-4: Cross-process fan-out not supported.** Impact: zero today (Vercel request model doesn't need it); re-evaluate if we move to a long-running worker for automation retries.
