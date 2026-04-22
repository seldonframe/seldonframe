# SLICE 1 — Subscription primitive for blocks: audit

**Draft:** 2026-04-22
**Sprint:** Scope 3 rescope, SLICE 1 of 9 (primitive-completion)
**Status:** AUDIT ONLY. No code until every gate item in §8 resolves.
**Inputs:** Scope 3 rescope message (2026-04-22), `tasks/step-2c-mid-flow-events-audit.md`, `tasks/step-2c-completion-summary.md`, `tasks/lessons.md` L-15 through L-21 + L-17 addendum.

---

## 1. Problem statement

### 1.1 What this slice exists to ship

Blocks produce events (via v2 `produces` declarations — empirically stable across 7 blocks since 2b.2). Blocks also declare `consumes: {kind: "event"}` entries — but those declarations are **inert**: no runtime machinery reads a block's consumes list and wires handlers. Cross-block autonomous composition today is partial — it happens through AgentSpec archetype chaining, not block-level event reaction.

**Goal:** first-class subscription primitive. A block declares in BLOCK.md "when event X arrives, run handler Y" and the runtime reliably delivers events with idempotency, retry, and failure isolation per declaration. This generalizes to builder-authored blocks: a new block scaffolded from NL (SLICE 2) can declare a subscription and the runtime picks it up without hand-wiring.

### 1.2 Why autonomous reaction matters vs archetype chaining

Two distinct patterns with different semantics:

- **Archetype chaining (AgentSpec):** an agent's lifecycle reacts to a trigger event. The agent's identity is the trigger. Every archetype is event-scoped. Archetypes have the agent-model semantics: variables, captures, interpolation, branches.
- **Subscriptions (this slice):** a block reacts to events unconditionally, with no agent semantics. "When a booking is created, log an activity on the contact." Not an agent — just a block-to-block side effect. Pure handler, idempotent, retryable.

Keeping these distinct matters because:
- Archetypes carry cost ($0.07+ per synthesis, multi-step state machine) that a one-shot reactive side-effect doesn't need.
- Subscriptions are per-block, owned by the block author. Archetypes are per-workspace, composed by the builder.
- A block without subscriptions can still compose via archetypes (today's reality). A block with subscriptions composes autonomously (the gap this closes).

### 1.3 Ground-truth findings at HEAD (L-16 / L-20 verification)

Verified 2026-04-22 against files on `claude/fervent-hermann-84055b`:

1. **`consumes: {kind: "event"}` is declarative-only.** Two of the seven core blocks currently declare event consumers:
   - `payments.block.md` (verified line 102): `booking.created`, `form.submitted`
   - `formbricks-intake.block.md` (verified line 151): `contact.created`, `booking.created`
   No code path reads these declarations; they exist as documentation for agent synthesis. The TypedConsumesEntrySchema comment at `contract-v2.ts:28` even flags "2c's await_event work may add more variants" — confirming the schema was designed for extension.

2. **Prose `## Listens` sections** exist in all 7 BLOCK.md files. These are documentation for authors and AI readers, not machine-readable. No parser extracts them.

3. **In-memory event listeners live in `packages/crm/src/lib/events/listeners.ts`** (201 LOC). Key properties observed:
   - Hand-wired — each `bus.on("event.name", handler)` call is hard-coded TypeScript.
   - Registered at dashboard layout render time via `registerCrmEventListeners()` (guarded by `listenersRegistered` flag).
   - In-process only — events fired outside a dashboard request cycle (webhooks, cron jobs, other API routes) land on the listeners only if the process happens to have rendered the dashboard first. Not reliable.
   - No retry, no idempotency, no dead-letter. A handler throws → the failure bubbles to the event emitter.
   - Not block-scoped. One file mixes handlers for contact / booking / email / landing / portal events with cross-block imports.
   - Not discoverable from BLOCK.md. An author reading payments.block.md sees the prose `## Listens` and no code.

4. **2c's `workflow_event_log`** (table shipped `0019_workflow_tables.sql`) durably persists every emission when `orgId` is passed. This is the substrate a subscription primitive should use; no reason to introduce a second event log.

5. **2c's `await_event` step** is for in-workflow pausing, NOT for block-level reactive subscription. A workflow_wait has a specific `runId`; subscription deliveries don't (they're not runs).

6. **`TypedConsumesEntrySchema` at `contract-v2.ts:101`** is a discriminated union with `kind: "event"` / `kind: "soul_field"` / `kind: "trigger_payload"` — three variants, extendable.

7. **`registerCrmEventListeners` invocation at `app/(dashboard)/layout.tsx:32`** runs ONCE per process (guarded). This is incidentally the only entry point for the listener registration. API-only requests don't hit the dashboard layout and wouldn't trigger registration. Confirmed fragility.

### 1.4 What "subscription" means concretely

A subscription is a 4-tuple:

```
(block, event_type, handler_fn, idempotency_key_template)
  + retry_policy
  + (optional) filter_predicate
```

When an event of `event_type` arrives in a workspace:
- The runtime finds all active subscriptions matching the event.
- For each, evaluates the idempotency key template against the event payload.
- If the key is new for this subscription, claims a delivery slot (CAS) and invokes the handler.
- On handler success: delivery marked complete.
- On handler failure: delivery marked failed with retry-count incremented; cron-tick retry schedules next attempt per policy.
- After max retries: delivery marked dead; admin surface shows the dead-letter.

This is structurally similar to `workflow_waits` — same CAS pattern, same substrate, same cron sweeper — but semantically distinct (no advancement, no parent run, just one-shot handler execution).

### 1.5 Why not repurpose AgentSpec?

A subscription could theoretically be modeled as a tiny AgentSpec with a trigger and one step. Rejected because:

- AgentSpec implies run lifecycle, variable scope, capture scope — none apply to subscriptions.
- Synthesis cost: an archetype is expected to be $0.07+ to generate via Claude. A block author's subscription handler is hand-authored TS; no synthesis.
- Conceptual clarity: agents do goal-directed work; subscriptions do reactive side effects. Conflating them makes both harder to teach.

---

## 2. Atomic decomposition

Nine atoms ship in this slice:

| Atom | Scope |
|---|---|
| **Subscription declaration** | BLOCK.md syntax (see §3) |
| **Handler code location + signature** | `packages/crm/src/blocks/<name>/subscriptions.ts` (see §3) |
| **Validator parse + schema check** | Extends `parseBlockMd` + new `validateSubscriptions` function |
| **Runtime delivery dispatch** | Fans out from event emit or cron tick (see §4) |
| **Idempotency key evaluation** | Template interpolated against event payload (see §5) |
| **Retry policy execution** | Per-subscription retry config; cron-tick retries |
| **Failure isolation** | One handler's throw doesn't affect siblings |
| **Observability** | Admin surface + structured logging (see §7) |
| **Cross-block dependency check** | "Block A subscribes to B" → soft-check at parse time (see §6) |

### 2.1 What reuses from 2c

- **`workflow_event_log`** — event source of truth. Subscription delivery reads from here.
- **CAS pattern** — `UPDATE ... WHERE resumedAt IS NULL` model for claim-once delivery.
- **Vercel cron** — the existing `/api/cron/workflow-tick` handler either adds subscription sweep OR a sibling handler at the same cadence.
- **`DrizzleRuntimeStorage` / `RuntimeStorage` interface** — extend with subscription-specific methods OR ship a parallel `SubscriptionStorage`.
- **`getOrgId()` auth pattern** — admin surface endpoints reuse (no new scope guard).
- **2b.2 containment principle** — subscription types live under `lib/subscriptions/`, NOT in shared `lib/agents/types.ts`.

### 2.2 What's new

- **New Drizzle schema: `subscription_deliveries`** — one row per (subscription, event) attempt.
- **New Drizzle schema: `subscription_registry`** (or inline metadata on block-level registry) — tracks active subscriptions per org + block.
- **Handler registration path** — runtime discovery of `packages/crm/src/blocks/*/subscriptions.ts` exports.
- **BLOCK.md `## Subscriptions` section** — new parsed-and-validated syntax.
- **Dead-letter surface** — admin page + manual retry action.

---

## 3. BLOCK.md syntax design

### 3.1 Where subscription declarations live

**Recommendation:** new `## Subscriptions` section — NOT extended `consumes` field.

Rationale:
- `consumes` today is a flat list of typed entries. Subscription metadata (handler name, idempotency key, retry policy, optional filter) doesn't fit a single-entry shape cleanly.
- Authors reading BLOCK.md benefit from a dedicated section with clear structure. Subscriptions are a distinct concept from "what data this block reads".
- The parser can auto-populate `consumes:{kind:"event"}` entries from `subscribes_to` declarations — so authors don't duplicate.
- Gate G-1 calls out the alternative (extend `consumes`) for explicit review.

### 3.2 Strawman syntax (refined from the rescope message)

```markdown
## Subscriptions

subscribes_to:
  - event: "booking.created"
    handler: "logActivityOnBookingCreate"
    idempotency_key: "{{data.contactId}}:{{data.appointmentId}}"
    retry: { max: 3, backoff: "exponential", initial_delay_ms: 1000 }
    filter: { kind: "field_exists", field: "data.contactId" }

  - event: "form.submitted"
    handler: "createContactFromForm"
    idempotency_key: "{{id}}"
    retry: { max: 5, backoff: "exponential", initial_delay_ms: 2000 }
```

Per-field contract:

- **`event` (required, string)** — a `SeldonEvent` name. Validator checks against the event registry (same pattern as `await_event` step validation).
- **`handler` (required, string)** — a function name exported from `packages/crm/src/blocks/<block-slug>/subscriptions.ts`. Validator loads the module at parse time (build step) and confirms the export exists + has the expected signature.
- **`idempotency_key` (required, string template)** — an interpolation template that resolves against the event envelope at delivery time. Special variable: `{{id}}` = event log row id (guaranteed unique; default for "at-most-once" semantics).
- **`retry` (optional, object)** — retry policy. Defaults: `{ max: 3, backoff: "exponential", initial_delay_ms: 1000 }`. After `max` attempts, delivery marked dead.
- **`filter` (optional, Predicate)** — reuses the existing `Predicate` primitive from `lib/agents/types.ts` (the same one `await_event` uses for match conditions). If the predicate returns false, delivery is skipped (not retried — filter failures are terminal). **Containment wins:** no new primitive.

### 3.3 Handler code location + signature

**Location convention:** `packages/crm/src/blocks/<block-slug>/subscriptions.ts`.

(SLICE 2 scaffolding will generate this file; this slice establishes the convention.)

**Signature:**

```ts
import type { EventEnvelope } from "@seldonframe/core/events";
import type { SubscriptionContext } from "@/lib/subscriptions/types";

export async function logActivityOnBookingCreate(
  event: EventEnvelope<"booking.created">,
  context: SubscriptionContext,
): Promise<void> {
  // Handler body. Can use context.db, context.orgId, context.deliveryId
  // (for tracing / logging). Returns void on success; throws on failure
  // (triggers retry per policy).
}
```

**`SubscriptionContext`** carries:
- `orgId` — workspace the event fired in.
- `deliveryId` — the `subscription_deliveries` row id for this attempt (for logging + tracing).
- `attempt` — 1-indexed attempt number (1 = first try, 2 = first retry, etc.).
- `db` — Drizzle client (same instance the runtime uses).
- `emitSeldonEvent` — bound emitter so handlers can emit downstream events with `orgId` already threaded.

**Isolation from HTTP request lifecycle:** handlers run inside the cron-tick or async-emit path, NEVER inside the emit-caller's request. This is a G-2-style decision for subscriptions (see §4.3); locked to async per recommendation.

### 3.4 Composition with existing `consumes` field

When a block declares `subscribes_to: [{event: "X"}]`, the parser auto-appends `{kind: "event", event: "X"}` to the block's `consumes` list (deduping). Authors don't hand-write the consumes entry.

Inverse is NOT required: a block can `consumes` an event without subscribing (e.g., intake consumes `booking.created` to trigger a form, but doesn't need a subscription handler — its reaction is a UI concern, not a side effect). So `consumes` ⊇ `subscribes_to.events`.

### 3.5 Parser + validator changes

- `parseBlockMd` gets a new section parser for `## Subscriptions`. Output populates a new `subscriptions: SubscriptionEntry[]` field on `BlockMdCompositionContract`.
- New `validateSubscriptions` function runs alongside `validateCompositionContract`:
  - Every `event` name resolves in the SeldonEvent registry (reuses PR 1's event-registry lookup).
  - Every `handler` name exports from the expected file path (build-time check via module import).
  - Every `idempotency_key` parses (basic syntax; full interpolation walk happens at delivery time).
  - Every `filter` parses as a valid `Predicate` (reuses `PredicateSchema`).
  - Every `retry.max` is a positive integer ≤ some ceiling (recommend 10 — deep retries usually mean the wrong remediation).

---

## 4. Runtime design

### 4.1 Data model

Two new Drizzle schemas under `packages/crm/src/db/schema/`:

**`subscription_registry.ts`** — one row per installed subscription per workspace. Built from BLOCK.md parse at install time (or migration time for the 7 existing core blocks).

```ts
{
  id: uuid (pk),
  orgId: uuid (fk -> organizations, cascade),
  blockSlug: text,                          // e.g., "crm"
  eventType: text,                          // e.g., "booking.created"
  handlerName: text,                        // e.g., "logActivityOnBookingCreate"
  idempotencyKeyTemplate: text,             // e.g., "{{data.contactId}}:{{data.appointmentId}}"
  filterPredicate: jsonb (nullable),        // resolved Predicate (optional)
  retryPolicy: jsonb,                       // {max, backoff, initial_delay_ms}
  active: boolean (default true),           // admin can pause
  createdAt, updatedAt: timestamp,
}
```

Indexes: `(orgId, eventType, active)` for delivery scan; `(orgId, blockSlug)` for admin list.

**`subscription_deliveries.ts`** — one row per (subscription, event) attempt.

```ts
{
  id: uuid (pk),
  subscriptionId: uuid (fk -> subscription_registry, cascade),
  eventLogId: uuid (fk -> workflow_event_log, cascade — the event that triggered delivery),
  idempotencyKey: text,                     // resolved from template at delivery time
  status: text,                             // pending | in_flight | delivered | failed | dead
  attempt: integer (default 1),
  nextAttemptAt: timestamp,                 // when to retry (pending/failed status)
  claimedAt: timestamp (nullable),          // CAS cursor — NULL → claimable
  deliveredAt: timestamp (nullable),
  lastError: text (nullable),
  createdAt: timestamp,
}
```

Indexes:
- `(subscriptionId, idempotencyKey)` UNIQUE — enforces dedup on key collision.
- `(status, nextAttemptAt)` partial index on `status in ('pending', 'failed')` — cron-tick sweep.
- `(eventLogId)` — observability (which deliveries fired for this event).

### 4.2 Subscriber discovery on emit

`emitSeldonEvent(type, data, { orgId })` already:
1. In-memory dispatch (listeners.ts fire).
2. Writes `workflow_event_log` row.
3. Scans `workflow_waits` for matching awaits (sync resume).

**Extension:** after step 3, scan `subscription_registry` for `eventType = type AND orgId = orgId AND active = true`. For each:

1. Evaluate idempotency key template against the event payload.
2. Insert `subscription_deliveries` row: `status='pending', nextAttemptAt=now()`. Unique constraint on `(subscriptionId, idempotencyKey)` absorbs retries.
3. Do NOT invoke the handler synchronously. Leave for cron tick (see §4.3).

### 4.3 Sync vs async delivery (Gate G-2)

**Recommendation: async — defer handler invocation to the cron tick.**

Rationale:
- Handlers may call external services (HTTP out, DB ops), taking 100ms to seconds. Blocking the emit-caller's request for every subscription is unacceptable at scale.
- G-2 for 2c's await_event was locked sync because resumption is a distinct semantic moment ("the awaited event arrived, advance the workflow"). Subscriptions are reactive side effects — deferring 60 seconds is acceptable.
- Async simplifies the retry loop: the same cron that claims failed deliveries handles first attempts. Single code path.
- Async isolates the emit-caller from handler failures. A handler that throws can't corrupt the emit-caller's request.

**Tradeoff:** first-attempt latency. Events emitted at t=0 reach their handler at t ∈ [0, 60s]. Cron-tick cadence governs it. Acceptable because Client Onboarding and sibling archetypes' business-level SLAs are minutes-scale, not sub-second.

### 4.4 Cron integration

Extends the existing `/api/cron/workflow-tick` handler (currently sweeps workflow_waits) with a second scan: `subscription_deliveries WHERE status IN ('pending', 'failed') AND nextAttemptAt <= now() LIMIT 100`. For each:

1. CAS claim: `UPDATE SET status='in_flight', claimedAt=now() WHERE id=? AND claimedAt IS NULL`.
2. If claim succeeds, load subscription row + event_log row + the handler module.
3. Construct `SubscriptionContext`, invoke handler inside `try/catch`.
4. On success: `status='delivered', deliveredAt=now()`.
5. On failure: `status='failed', attempt=attempt+1, lastError=err.message, nextAttemptAt=now() + backoff(attempt)`. If `attempt > retryPolicy.max`: `status='dead'`.

**Why reuse the cron handler** instead of a new `/api/cron/subscription-tick`:
- Both sweep `workflow_*` tables on the same cadence.
- One cron invocation = two scans = one Vercel function cold-start. Cheaper.
- Ordering: waits drain before subscriptions (or vice versa) — audit decides (recommend subscriptions first, so handler-emitted downstream events have time to propagate before their dependent waits sweep).

Alternative (rejected): separate cron at different cadence. Adds a second Vercel function, second cold-start cost. Unmotivated.

### 4.5 Transaction semantics

Delivery is NOT wrapped in a DB transaction with the handler. Rationale:
- Handlers may call external services; rollback doesn't unring those bells.
- We commit `status='in_flight'` BEFORE invoking the handler so the CAS is durable.
- On handler success, we commit `status='delivered'`.
- On handler failure, we commit `status='failed'`.

Consequence: a handler that succeeds externally but the success-marker write fails will retry. Idempotency key protects against duplicate external effects. This is the at-least-once semantics the external-service-calling world lives with.

### 4.6 Failure isolation

- Handlers of different subscriptions for the same event run independently. One throws, others continue.
- A subscription's retry exhaustion (dead) doesn't affect other subscriptions on the same event.
- A subscription's dead-letter is operational — admin intervention required (manual retry or dismiss); see §7.

### 4.7 Retry policy

Three configurable fields per subscription:
- `max` (default 3) — maximum attempt count.
- `backoff` (default "exponential") — one of: `"exponential"` (2^attempt × initial_delay_ms), `"linear"` (attempt × initial_delay_ms), `"fixed"` (always initial_delay_ms).
- `initial_delay_ms` (default 1000) — first retry delay.

Synthesis-time ceiling on `max` (recommend 10) so a misconfigured subscription can't burn the cron loop.

### 4.8 Dead-letter handling

When `attempt > max`, `status='dead'` + `lastError` retained. Admin sees this in `/blocks/subscriptions` (see §7) with buttons:
- **Retry now** — resets attempt to 1, sets `nextAttemptAt=now()`, `status='pending'`.
- **Dismiss** — logical delete; archived for 30 days, then hard-deleted.

No automatic dead-letter discard — operator intervention is the feature, not a bug.

---

## 5. Idempotency

### 5.1 Key semantics

Every subscription declares an `idempotency_key` template. At delivery time, the runtime:

1. Parses the template for `{{...}}` interpolations.
2. Resolves each interpolation against the event envelope (`{{id}}` = event log row id; `{{data.field}}` = event payload field; `{{type}}` = event type).
3. The resolved string is the delivery key.

### 5.2 Uniqueness enforcement

DB uniqueness constraint on `(subscriptionId, idempotencyKey)`:
- First delivery for a new key → INSERT succeeds → delivery proceeds.
- Subsequent delivery for same key → INSERT fails with unique-violation → treated as "already delivered or in flight" → no-op.

### 5.3 Recommendation: required, not optional

**Recommendation: idempotency key is REQUIRED on every subscription.** Default when authors omit: `{{id}}` (one delivery per unique event_log row).

Rationale:
- At-least-once delivery is the model; without a key, retries cause duplicate external effects.
- Requiring the author to state the key forces thought about "what makes this delivery unique".
- Default `{{id}}` is safe and matches the expectation of "don't retry this specific event twice".

Author-provided keys are richer — e.g., `{{data.contactId}}:{{data.bookingId}}` ensures one delivery per (contact, booking) pair even across multiple emit events (useful when the same business-level action fires the event type more than once).

### 5.4 Alternative considered (rejected): handler-owned dedup tables

Handlers could manage their own dedup tables inside their own schema. Rejected because:
- Every handler author reimplements the same pattern, inconsistently.
- Subscription-level dedup is a platform concern; handler-level dedup mixes platform and business responsibilities.
- The platform already has the event log id + subscription id; computing a composite key is trivial.

---

## 6. Cross-block dependency implications

### 6.1 Versioning when event shape changes

Scenario: block A subscribes to `booking.created`. block B (booking) changes the event's `data.appointmentTypeId` field to `data.serviceTypeId`. Block A's handler reads `.appointmentTypeId`; now reads undefined.

Today the `SeldonEvent` union is the source of truth for event shape. A rename there is a breaking change that TypeScript surfaces at compile time in any handler that narrows on the event's type parameter (`EventEnvelope<"booking.created">`). The event registry codegen + `pnpm emit:event-registry:check` catches drift at CI time.

**Recommendation:** subscription handlers use the typed envelope shape. Unused fields in `data` are tolerated; accessing renamed fields fails at compile time. No runtime compatibility layer needed.

### 6.2 Install-time failure mode

Scenario: block A's subscriptions.ts declares a handler for `block-b.some.event`. Block B isn't installed in the workspace (not in `seedInitialBlocks`).

Options:
- **Reject installation of block A** — too rigid; A may subscribe to events from many blocks, not all installed.
- **Silently ignore the subscription** — bad UX; operator has no idea the subscription is inert.
- **Install subscription as `active: false`** — registered, but runtime skips it. When block B installs, a migration flips A's subscription to `active: true`.

**Recommendation:** option 3. Subscription installs as `active: false` when its event type isn't in the SeldonEvent registry OR no installed block currently produces that event. An "inactive subscriptions" section in `/blocks/subscriptions` shows why (missing event type, missing producer block). When the producing block installs, a migration flips active. Gate G-4 formalizes.

### 6.3 How v2 composition contract helps

The v2 `produces` + `consumes` typed declarations give us:
- **Build-time producer check:** for every subscription's `event`, at least one installed block's `produces` must declare that event. Otherwise `active: false` + inactive surface.
- **Documented cross-block edges:** `subscribes_to` + `consumes` populate a dependency graph queryable by `/blocks/subscriptions` + future tooling.

v2 does NOT give us payload shape declaration separate from `SeldonEvent` — that lives in the TS union. That's fine for v1; if builder-authored blocks want custom events, they'd need to extend `SeldonEvent` (runtime codegen from block declarations is a post-v1 candidate, not this slice).

---

## 7. Observability

### 7.1 Admin surfaces

**Primary: new `/blocks/subscriptions` page.**

- List view: one row per subscription (grouped by block). Columns:
  - Block + handler name.
  - Event type.
  - Active/paused/inactive (with reason).
  - Recent delivery stats (last 24h: success, failed, dead).
  - Last delivery attempt timestamp.
- Row-click → subscription detail drawer:
  - Full config (idempotency template, filter predicate, retry policy).
  - Deliveries table: event id, attempt, status, timestamp, last error.
  - Actions: "Pause subscription", "Retry all dead deliveries", "Dismiss all dead deliveries".
- Dead-letter filter: only rows with dead deliveries in last 7 days.

**Secondary: extend `/agents/runs` or a combined `/operations` hub.** Not scope for this slice.

### 7.2 Logging per delivery

Structured log line per delivery attempt:

```
{
  event: "subscription_delivery_attempt",
  subscriptionId,
  deliveryId,
  eventLogId,
  eventType,
  handlerName,
  attempt,
  outcome: "delivered" | "failed" | "dead",
  durationMs,
  errorMessage?: string,
}
```

Vercel logs capture these by default; structured form makes them greppable.

### 7.3 Debug: "why isn't my handler firing?"

Common failure modes and how the admin surface exposes them:
- **Subscription inactive** — "Inactive subscriptions" filter, reason displayed.
- **Event emitted without orgId** — subscription_deliveries row won't exist; log line from bus.ts at warn level ("event emitted without orgId; durable path skipped").
- **Predicate filter rejected event** — delivery row with `status='filtered'` (additional status value; see gate).
- **Idempotency key collision** — delivery row exists for prior event with same key; visible in drawer.
- **Handler throws** — delivery row shows `status='failed'` with last error; retry schedule visible.

### 7.4 Out of v1 scope

- Real-time push updates (polling refresh at 2s like `/agents/runs`).
- Subscription dependency graph visualization.
- Per-handler performance charts (count, latency over time).
- Alert rules ("notify me when a subscription has > N dead deliveries in 24h").

---

## 8. Open decisions — gate items

Six gate items. Each with a recommendation; all six need explicit approval before PR 1 starts.

### G-1 — Declaration shape: new `## Subscriptions` section vs extended `consumes`

**Recommendation: new `## Subscriptions` section** (§3.1 rationale).

**Alternative:** extend `TypedConsumesEntrySchema` with a `kind: "subscription"` variant. Keeps the contract surface unified. Rejected because subscription metadata (handler name, idempotency key, retry policy, filter) bloats the already-discriminated union, and authors benefit from the dedicated section.

### G-2 — Sync vs async delivery

**Recommendation: async — defer to cron tick** (§4.3 rationale).

**Alternative:** sync within emit-caller's request (like 2c G-2 for await_event). Rejected because handlers may take seconds (external calls) and blocking the emit path is unacceptable.

### G-3 — Idempotency key: required vs optional

**Recommendation: required; default to `{{id}}` when omitted** (§5.3 rationale).

**Alternative:** optional (no default). Rejected because at-least-once delivery requires dedup; silent "no key" means silent duplicate effects.

### G-4 — Cross-block dependency: install-time failure

**Recommendation: subscription installs as `active: false` when producer block isn't present; auto-flips to active when producer installs** (§6.2 rationale).

**Alternative 1:** reject installation. Too rigid.
**Alternative 2:** silent install + inactive. Bad UX.

### G-5 — Dead-letter retention

**Recommendation: no automatic discard; operator dismisses or retries manually** (§4.8 rationale). Dismissed deliveries hard-delete after 30 days.

**Alternative:** auto-discard after 7 days. Rejected because operators may not notice in 7 days; data loss is worse than storage cost.

### G-6 — Filter semantics: skipped deliveries as a distinct status

**Recommendation: `status='filtered'` as a distinct terminal status** — not `delivered`, not `failed`. Observability benefits from clarity: "the predicate excluded this event" is different from "the handler ran successfully".

**Alternative:** don't create a delivery row at all when the filter rejects. Rejected because admins then can't see "events A, B, C were evaluated but filtered out" — which is load-bearing for debugging "why didn't my handler fire?".

---

## 9. Proposed PR split

Two PRs, each shipping to main with a green bar before the next starts.

### PR 1 — BLOCK.md parser extension + schema + handler registration + validator

Scope:
- `lib/blocks/block-md.ts` — new parser for `## Subscriptions` section. Populates `subscriptions: SubscriptionEntry[]` on the parsed contract.
- `lib/blocks/contract-v2.ts` — `SubscriptionEntrySchema` + `RetryPolicySchema` + reuse of `PredicateSchema`.
- `lib/subscriptions/types.ts` — `SubscriptionContext` interface.
- `lib/subscriptions/registry.ts` — load subscriptions from `packages/crm/src/blocks/*/subscriptions.ts` at startup; resolve to handler function refs.
- `db/schema/subscription-registry.ts` + `subscription-deliveries.ts` + migration `0021_subscriptions.sql`.
- New validator: `validateSubscriptions` with tests for event-in-registry, handler-exists, predicate-parses, idempotency-key-template-parses.

**Green bar:**
- pnpm test:unit — baseline + ~15 new tests (schema, validator, registry loading).
- pnpm emit:blocks:check — clean (no BLOCK.md changes in this PR).
- tsc — 4 pre-existing errors, zero new.

### PR 2 — Runtime delivery + cron integration + observability

Scope:
- `lib/subscriptions/runtime.ts` — `dispatchSubscription(delivery, context)` + retry scheduler + status transitions.
- `lib/events/bus.ts` — extension: after workflow_waits scan, scan subscription_registry, enqueue subscription_deliveries rows.
- `app/api/cron/workflow-tick/route.ts` — adds subscription-deliveries sweep to existing cron.
- `app/(dashboard)/blocks/subscriptions/page.tsx` + client component with drawer + pause/retry/dismiss actions.
- `app/api/v1/subscriptions/[id]/(pause|unpause|retry-dead|dismiss-dead)/route.ts` — admin endpoints.
- `InMemorySubscriptionStorage` for tests; production uses Drizzle impl.
- Tests: delivery happy path, predicate-filtered, retry exhaustion, dead-letter, CAS race, idempotency collision.

**Green bar:**
- pnpm test:unit — baseline + ~20 new tests.
- pnpm emit:blocks:check — clean.
- 9-probe archetype regression — hash preservation (subscription-level side effects don't affect archetype synthesis).
- Integration test equivalent to PR 2 of 2c: fire an event, observe delivery landing in handler.

---

## 10. LOC estimate per L-17 calibration

**PR 1 estimate:** 600-900 LOC
- Parser extension + contract-v2 schema: ~200 LOC
- Registry loader (with test-mode injection): ~150 LOC
- `SubscriptionContext` type + helpers: ~50 LOC
- 2 Drizzle schemas + migration: ~180 LOC
- Validator + tests: ~200-400 LOC (per L-17, validator code runs high)

**PR 2 estimate:** 1,200-1,600 LOC
- Runtime dispatcher + retry scheduler: ~300 LOC
- Bus.ts extension + cron-tick extension: ~150 LOC
- Drizzle + in-memory storage impls: ~250 LOC
- Admin page (server + client) + endpoints: ~400 LOC
- Tests (dispatcher, bus extension, integration): ~300-500 LOC

**Slice total:** 1,800-2,500 LOC.

**Stop-and-reassess trigger:** 30% over high end = **3,250 LOC**. Per L-17 addendum, if the trigger fires, distinguish architectural overrun (Option A accept + calibrate) from horizontal-infrastructure overrun (Option B scope-cut to follow-up). No new horizontal infra expected in this slice — Playwright already deferred, no new test framework — so Option A is the likely resolution.

**Containment expectation:** zero changes to `lib/agents/types.ts`, `SeldonEvent` union, or the 7 core block schemas. All subscription machinery under `lib/subscriptions/`. Same pattern 2b.2 + 2c proved 11 times.

---

## 11. Out of scope

- **State-change-based subscriptions** — "when field X on the Soul changes, run handler Y." Change-data-capture is a post-v1 concern.
- **Cross-workspace subscriptions** — a block in workspace A listening to events from workspace B. Violates isolation model; not a v1 need.
- **Manual subscription triggering from admin** — "run this handler with this synthetic event." Useful for debugging but adds complexity; file as follow-up if it surfaces in usage.
- **Subscription dependency graphs with auto-ordering** — "handler X must run before handler Y for the same event." Not in v1; deliveries fire independently.
- **Filter predicates referencing external state** — 2e's `external_state` variant may extend filter semantics later; this slice uses only the in-payload `Predicate` primitive.
- **Custom builder-authored event types** — the `SeldonEvent` union remains source of truth; builder blocks subscribe to existing event types only.
- **Playwright e2e for admin surface** — deferred to the multi-consumer follow-up slice per L-17 addendum.

---

## 12. Reference

### 12.1 Builds on 2c

- `workflow_event_log` durable event source → subscription deliveries read from here.
- `/api/cron/workflow-tick` + CAS patterns → same cron, second scan; same CAS idioms.
- `DrizzleRuntimeStorage` pattern → `DrizzleSubscriptionStorage` with identical interface shape.
- G-2 instrumentation (console.warn at > 50ms) → applied to cron-tick subscription sweep if per-invocation duration grows.

### 12.2 Distinct from AgentSpec event triggers

- AgentSpec trigger starts a run (stateful, multi-step, cost). Subscription fires a handler (stateless, one-shot, cheap).
- Runs have specSnapshot + captureScope + variableScope. Deliveries have only deliveryId + eventLogId + idempotencyKey.
- Admin surface lives at `/blocks/subscriptions` (this slice) vs `/agents/runs` (2c).

### 12.3 Informs SLICE 2 (block scaffolding from NL)

Block scaffolding (SLICE 2) generates `packages/crm/src/blocks/<name>/subscriptions.ts` as one of the files. This slice establishes the convention; SLICE 2 operationalizes it. Direct dependency: SLICE 2 depends on SLICE 1 shipped.

### 12.4 Informs SLICE 4 (UI composition)

The admin surface for subscriptions (`/blocks/subscriptions`) is built from the same shadcn-backed components SLICE 4 formalizes. This slice ships a hand-crafted admin page; SLICE 4's `BlockListPage` + detail drawer pattern can retrofit it opportunistically later. Not a dependency — just a future refactor candidate.

### 12.5 L-17 calibration inputs carried forward

From 2b.2 + 2c, validator/runtime class code runs ~25-30 LOC per primitive unit, with ~100+ LOC of inline documentation on non-obvious invariants. This slice's estimates apply those baselines.

From the L-17 addendum (this sprint's capture): if the trigger fires on infrastructure work, scope-cut. None of PR 1 or PR 2's scope is horizontal infrastructure — all of it is capability work for the subscription primitive.

---

## 13. Stop-gate — audit pending review

Six gate items pending resolution:

| Item | Status | Recommendation |
|---|---|---|
| G-1 — declaration shape (`## Subscriptions` vs extended `consumes`) | 🟡 Pending | new `## Subscriptions` section |
| G-2 — delivery mode (sync vs async) | 🟡 Pending | async (cron tick) |
| G-3 — idempotency key required vs optional | 🟡 Pending | required (default `{{id}}`) |
| G-4 — install-time cross-block failure mode | 🟡 Pending | `active: false`, auto-flip on producer install |
| G-5 — dead-letter retention | 🟡 Pending | operator-managed, 30-day archive after dismiss |
| G-6 — filter-skipped deliveries as distinct status | 🟡 Pending | `status='filtered'` (not collapsed into delivered/failed) |

All gates resolve in the same approval pass. PR 1 kicks off only after every gate is approved or overridden AND this audit commits to main.

Expected review rounds per the rescope discipline: 1-2. The audit ships to `claude/fervent-hermann-84055b` first; Max reviews, responds with gate decisions; audit revises if needed; audit commits to main; PR 1 starts.

---

## 14. Self-review changelog (2026-04-22, post-draft)

- **L-16 / L-20 source spot-checks performed against HEAD before locking claims:**
  - `consumes:{kind:"event"}` usage confirmed on payments.block.md:102 and formbricks-intake.block.md:151. Other 5 core blocks use only `soul_field` kind.
  - `## Listens` prose sections present in all 7 core BLOCK.md files — documentation only, no parser reads them.
  - `packages/crm/src/lib/events/listeners.ts` exists at 201 LOC with hand-wired in-memory handlers. Registered via `registerCrmEventListeners()` at `app/(dashboard)/layout.tsx:32`.
  - `TypedConsumesEntrySchema` at `contract-v2.ts:101` is a 3-variant discriminated union, extendable. Comment at line 28 explicitly reserves room for "2c's await_event work may add more variants" — design was extensible.
  - `workflow_event_log` + `workflow_waits` shipped in 2c PR 1 via migration 0019. Referenced as substrate for subscriptions.
  - `Predicate` primitive at `lib/agents/types.ts:30` is reused (not extended) for subscription filters per the containment principle. Zero shared-type changes expected in this slice.

- **Containment checked against 2b.2 precedent (proven 6 times) + 2c (proven 3 times):** all subscription machinery lives under `lib/subscriptions/`. No changes to `lib/agents/types.ts`, `SeldonEvent`, or block schemas.

- **Gate items mapped to both audit-design choices AND L-17-addendum-style overrun handling:** if PR 1 or PR 2 overruns are capability-work (Option A), accept + calibrate; if any horizontal infrastructure surfaces (e.g., a new test harness), scope-cut to a follow-up.

- **Admin surface scoped modest:** `/blocks/subscriptions` ships in PR 2 with hand-crafted page (same pattern as `/agents/runs`). SLICE 4 will later formalize the admin-composition primitives this page could use.

- **Existing listeners.ts NOT retired in this slice.** The in-memory handlers continue to fire for their current use cases; migrating them to declarative subscriptions is a post-slice opportunistic cleanup. The two paths coexist until someone volunteers the migration. Flagged in §12 as a follow-up but out of this slice's scope.

---

*Audit drafted: Claude Opus 4.7 (1M context). Awaiting Max's review — no code until gates resolve.*
