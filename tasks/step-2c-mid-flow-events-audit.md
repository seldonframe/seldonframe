# Step 2c — Mid-flow event subscriptions (`await_event`): substrate audit

**Draft:** 2026-04-22
**Sprint:** Scope 3, Step 2c (master plan §0.5, phase label 7.j)
**Status:** AUDIT ONLY. No code until every gate item in §7 is resolved.
**Inputs:** `tasks/v1-master-plan.md` §0.5, `tasks/step-2b2-completion-summary.md`, `tasks/step-2b-1-contract-v2-audit.md` (structure reference), `tasks/lessons.md` L-15 through L-20.

---

## 1. Problem statement

### 1.1 What 2c exists to ship

Per `tasks/v1-master-plan.md` §0.5 (2026-04-21 amendment):

> **2c — Mid-flow event subscriptions (~1–2 weeks) · 7.j**
> AgentSpec gets new step type `await_event` that pauses execution until a specified event fires. Runtime needs durable pause-and-resume that survives deploys + restarts. Timeout handling: configurable; default 30 days with explicit timeout-event emission. Live-probe against synthesis before declaring shipped.

Two things ship together:
1. **A new AgentSpec step type** — `await_event` — that synthesis can place into archetype templates.
2. **A durable runtime** that actually executes it: pause an in-progress workflow, persist its state, resume when the predicate is satisfied (or timeout fires), survive Vercel deploy cycles and Node process restarts.

### 1.2 The archetype that 2c unblocks

From the §0.5 Scope 3 amendment:

> **Client Onboarding**: would need mid-flow event subscription (welcome → await `form.submitted` → schedule kickoff) that AgentSpec doesn't support.

Verified at HEAD (`packages/crm/src/lib/agents/archetypes/README.md:25`, `:52`): `client-onboarding.ts` is listed as "(coming)" / "⏳ Client Onboarding". The file is not shipped; its full flow requires `await_event`.

A representative Client Onboarding flow (not the final design — concrete only to ground the audit):

```
trigger: { type: "event", event: "contact.created" }
steps:
  - id: welcome_email       type: mcp_tool_call  tool: send_email
  - id: share_form_link     type: mcp_tool_call  tool: send_email
  - id: await_form          type: await_event
                            event: "form.submitted"
                            filter: { contactId: "{{contactId}}", formId: "onboarding_intake" }
                            timeout: "P7D"
                            on_timeout: { next: "nudge_email" }
                            on_resume:  { capture: "onboarding", next: "book_kickoff" }
  - id: book_kickoff        type: mcp_tool_call  tool: create_booking
  - id: kickoff_confirm     type: mcp_tool_call  tool: send_email
  - id: nudge_email         type: mcp_tool_call  tool: send_email   (timeout path)
```

Any archetype that has to WAIT for an external state change (form filled, payment completed, booking rescheduled) in the MIDDLE of a flow needs this. 2c unlocks that pattern for Client Onboarding in v1; future archetypes inherit it.

### 1.3 What "durable" means in this context

The work that gets persisted is **the in-flight workflow run**, not the event stream itself. Specifically:

| Must survive | Definition |
|---|---|
| **Process restart** | A Vercel serverless Node process ends between every request. A paused workflow at 11:59 and the resume at 13:02 are guaranteed to be different processes. |
| **Deploy** | A preview or production deploy replaces the running container. Any in-memory state at deploy time is lost. Paused workflows must resume in the new container as if nothing happened. |
| **At-least-once event delivery** | If the same event fires twice (retry, duplicate webhook, manual re-trigger), the workflow must be idempotent at the step level — resuming twice shouldn't book two kickoffs. |
| **Clock drift during long pauses** | A 30-day timeout has to fire no earlier than the target timestamp, regardless of when the cron tick runs. Timestamps are authoritative, not counters. |
| **Partial failures mid-resume** | If the workflow wakes, runs one tool call successfully, and crashes before persisting the cursor, the retry must pick up from a safe boundary — not re-run the tool. |

### 1.4 What's NOT in 2c's scope

- **Scheduled triggers** — owned by 2d (`trigger.type: "schedule"` with cron). 2c is `await_event` only; the trigger surface already supports `type: "event"` and that continues unchanged.
- **External-state branching** — owned by 2e (`branch.condition.type: "external_state"`). 2c only adds `await_event` as a step type; `branch` evolution happens separately.
- **Runtime for the OTHER step types** (`wait`, `mcp_tool_call`, `conversation`). 2c is the FIRST slice that ships a workflow runtime — the choice of substrate in 2c therefore also decides the runtime model those existing step types execute under. This is called out explicitly in §4 because it's the single biggest scope lever in the audit.
- **Archetype ships that consume `await_event`** — owned by Step 3 (3b ships Client Onboarding on the upgraded runtime).

### 1.5 Grounded state of the system at 2c start

Verified at HEAD, 2026-04-22 (per L-16 / L-20 discipline):

- **Validator already parses `await_event` as UnknownStep** (`packages/crm/src/lib/agents/validator.ts:135` + `:300`). The fall-through surfaces `unsupported_step_type` today; 2c replaces that with a known-step schema + dispatcher.
- **`Predicate` primitive already exists** (`packages/crm/src/lib/agents/types.ts:30`) with an `event_emitted` kind. 2c can reuse the exact variant for "what event am I waiting for"; zero shared-type changes needed.
- **`Duration` primitive already exists** (`types.ts:110`) as an ISO 8601 subset (`PT30M`, `P7D`, etc.). 2c's `timeout` reuses it.
- **Event bus is in-memory only** (`packages/core/src/events/index.ts:72` — `InMemorySeldonEventBus`). **This is the load-bearing current-state fact for the entire audit.** Events today fire in-process, dispatch to any listeners, and disappear. There is no event log in Postgres today.
- **No runtime engine exists** for any step type. Validator runs at synthesis time; no code today actually executes an AgentSpec against live data. The comment at `types.ts:11` says "runtime validation once 7.e ships" — 7.e has not shipped.
- **Vercel cron is already active** in `packages/crm/vercel.json`: three crons ship in production (`/api/cron/automations` every 6 h, `/api/cron/brain-compile` daily 03:00 UTC, `/api/cron/orphan-workspace-ttl` daily 04:00 UTC), all authenticated via `CRON_SECRET`, all `runtime = "nodejs"`. Adding a 4th for workflow ticks is mechanical.
- **Neon Postgres is the committed DB** (`@neondatabase/serverless` in `packages/crm/package.json`). Schema lives under `packages/crm/src/db/schema/`.
- **Zero workflow-state tables exist today.** No `workflow_runs`, no `agent_runs`, no `await_events`.

---

## 2. Substrate evaluation

Four options + one hybrid. Evaluated on the axes Max set: failure recovery, retry behavior, observability, cost scaling, vendor footprint, debuggability, fit with Neon + Vercel + no-new-deps discipline.

### 2.a — Pure Postgres + Vercel cron polling

**Shape.** A new `workflow_runs` table (run id, spec, current step id, status, created/updated). A `workflow_waits` table (run id, predicate JSON, waiting-since, timeout-at). A new `/api/cron/workflow-tick` handler that runs every 60 s on Vercel cron: selects waits whose `timeout_at <= now()` OR whose predicate matches a persisted event record, and advances those runs one step. Event emissions from the existing bus get persisted to a `workflow_event_log` table (append-only) alongside the in-memory dispatch.

**Failure recovery.** At-least-once: the cron tick is idempotent by design — it selects due waits, advances them, and marks them advanced in the same transaction. If the tick crashes mid-batch, the remaining waits stay `advanced = false` and get picked up on the next tick. Deploys don't affect paused state because all state is in Postgres.

**Retry.** Per-step retry lives in the step dispatcher (2c owns the `await_event` dispatcher; MCP tool calls already have their own retry in the MCP client). Retry budget is configurable per step type. Poison-pill handling: a `failure_count` column per run; after N failures, mark `status = failed` and emit a `workflow.run_failed` event.

**Observability.** Plain SQL queries on `workflow_runs` / `workflow_waits`. An admin dashboard page at `/agents/[id]/runs` (builder mode) reads directly. Agencies need this — see §6 — and SQL beats a vendor dashboard they don't own.

**Cost scaling.** One cron invocation per minute = 1,440/day, comfortably inside Vercel Hobby cron quota. Neon compute scales with actual read/write volume. For 1,000 active workspaces running 3 onboardings with 7-day awaits = 3,000 paused runs; a tick that checks them is one SELECT with a `timeout_at <= now()` filter — index-hit, milliseconds. Scales on Neon's curve, not on per-step pricing.

**Vendor footprint.** Zero new vendors. Zero new dependencies. Uses Neon + Vercel cron, both already in production.

**Debuggability.** Highest of all four options. Every paused run is a row. Every event is an append-only log row. Support can answer "why did this agent not advance?" with `SELECT ... FROM workflow_waits WHERE run_id = ?` and point at the predicate.

**Fit with Neon + Vercel + no-new-deps.** Native fit. Extends three existing patterns (Vercel cron, Drizzle schema, `@neondatabase/serverless`) with zero new moving parts.

**Cost to build.** ~800–1,200 LOC (see §8.2 line-item). Step dispatcher for `await_event` + state persistence + cron tick + predicate evaluator against persisted event log + admin surface.

**Critique / risks.**
- Polling latency: event fires → up to 60 s delay until the resumed step runs. For Client Onboarding this is fine (the form-submit → kickoff gap is already minutes-scale in the business flow). For any future archetype that needs sub-second latency, this would be a problem — but no such archetype exists in scope, and "sub-second" isn't a stated requirement.
- We maintain the workflow engine ourselves. Engine bugs are on us.
- Observability UI is our scope to build.

### 2.b — Inngest

**Shape.** A Vercel marketplace integration. AgentSpec steps translate at runtime into Inngest `step.run()` / `step.waitForEvent()` / `step.sleep()` calls inside an Inngest function. Inngest stores workflow state in their cloud; their webhook receives events emitted by SeldonFrame; their replay dashboard shows every paused run.

**Failure recovery.** First-class. Inngest guarantees at-least-once execution, handles process crashes, retries, and deploys natively. Their SDK uses "step memoization" — re-invoking the function with the same state deterministically returns the same results for already-completed steps.

**Retry.** Built in. Configurable per step (`step.run({ retries: 3 }, ...)`). Exponential backoff. Dead-letter handling included.

**Observability.** Their dashboard. Per-run trace, every step call logged, event-arrival waterfall. Rich, but hosted on Inngest's infra — SMB users can't see it, agencies have to be granted Inngest admin access if they want it.

**Cost scaling.** Inngest Hobby: 50k function steps/month free, then $20/mo for 100k. For the Client Onboarding flow (~6 steps per run) × 1,000 active workspaces × 3 runs/month = 18k steps — inside free tier. At 10× that volume we pay ~$20/mo. At 100× that volume, $200/mo. Scales linearly with flow activity, NOT with workspace count.

**Vendor footprint.** ONE new vendor. They go down, our workflows stop. They raise prices, our unit economics change. Their Vercel integration is deep (preview branches supported) but still depends on their availability.

**Debuggability.** Good for OUR team (Inngest dashboard). Bad for agency builders — they can't see Inngest's dashboard without being granted access. This breaks the "agencies need to debug paused flows" requirement unless we build a passthrough view. That extra work partially negates Inngest's "observability for free" pitch.

**Fit with Neon + Vercel + no-new-deps.** Partial. Vercel-native via marketplace; Neon is untouched. But "no-new-deps" fails outright — Inngest is a new runtime dependency. Failure mode: their service outage becomes a SeldonFrame outage.

**Cost to build.** ~400–600 LOC — adapter layer from AgentSpec to Inngest function shape + event-bus bridge (Inngest needs events HTTP-delivered to their ingest endpoint) + admin-UI passthrough. Substantially smaller than 2.a because durability + retry + observability come from Inngest.

**Critique / risks.**
- Vendor lock. Switching away later means rewriting the runtime.
- Rich AgentSpec features (captures, on_exit.extract, cross-step interpolation) need explicit mapping to Inngest's state model — some mismatch is likely.
- SMB-user visibility into paused flows requires us to build a passthrough against their API anyway; we pay "build observability UI" cost either way.
- §0 vision commits to "owned Brain v2". A hosted workflow engine is the opposite direction — it's an **unowned** critical path.

### 2.c — Trigger.dev

**Shape.** Similar primitive to Inngest: `wait.forEvent()` / `wait.for()` / task invocation. OSS-licensed with a self-host path (Docker Compose, Postgres-backed) alongside their hosted tier.

**Failure recovery.** First-class, comparable to Inngest. Self-host means we own the substrate entirely on our Postgres — which matches our infra preference more than Inngest's hosted-only model.

**Retry.** Built in. Per-step configuration similar to Inngest.

**Observability.** Their dashboard on hosted; self-deployed dashboard on self-host. Self-host gives us the option to customize or expose the view to agencies.

**Cost scaling.** Hosted: $20/mo for ~10k runs, scales up. Self-host: just our Postgres + a container to run the orchestrator. Self-host is cheaper at scale but costs infra complexity upfront.

**Vendor footprint.** Lower than Inngest (because of the self-host option). Still introduces Trigger.dev as a runtime concept + a codebase dependency.

**Debuggability.** Comparable to Inngest on hosted; better on self-host because we own the data model.

**Fit with Neon + Vercel + no-new-deps.** Mixed. Self-host fits Neon (their state lives in Postgres — potentially the SAME Postgres as SeldonFrame, though deploying their schema alongside ours adds complexity). Hosted mode has the same vendor-footprint issue as Inngest.

**Cost to build.** Hosted path: similar to Inngest (~400–600 LOC adapter). Self-host path: higher (~700–900 LOC adapter + ops work to run the orchestrator + migrations for their schema + monitoring).

**Critique / risks.**
- Smaller ecosystem than Inngest. Less mature Vercel integration.
- Self-host is appealing in principle but introduces ops scope we don't have today (run a container, monitor it, upgrade it).
- Hosted mode has the same "unowned critical path" problem as Inngest but with less polish.

### 2.d — Vercel-native durable primitives

**Survey of what Vercel ships (verified 2026-04-22):**

- **Vercel Cron** — already in use. Scheduled HTTP GET to a route handler. Fits a polling model (substrate 2.a) but is NOT a workflow orchestrator on its own.
- **Vercel Queues** — listed as beta in their docs. Queue + worker pattern. Good for async job dispatch, NOT a durable workflow (no pause/resume primitive; each queued message is a one-shot).
- **Vercel Functions** — serverless execution. Bounded by `maxDuration`. Not a workflow substrate on their own.
- **Vercel Marketplace integrations** — Inngest and Trigger.dev both ship as marketplace items. This is how Vercel recommends durable workflows today; Vercel does NOT offer a first-party competitor.

**Verdict.** There is no Vercel-native option that replaces Inngest / Trigger.dev / custom-Postgres for durable workflow execution. Vercel's native primitives (cron + queues + functions) are **building blocks** for option 2.a but don't themselves constitute an alternative.

This option collapses: it's either "use Vercel cron as polling substrate in 2.a" or "use a marketplace integration (2.b / 2.c)". No standalone row.

### 2.e — Hybrid: Postgres state + external executor

**Shape.** Workflow state (`workflow_runs`, `workflow_waits`, `workflow_event_log`) lives in our Neon Postgres. Durability of the resumption mechanism is delegated to Inngest or Trigger.dev — their scheduler owns "when to wake up"; our Postgres owns "what's waiting and what came in".

**Failure recovery.** Split-brain risk. If the external executor and our Postgres disagree (e.g., executor thinks a run is advanced; Postgres thinks it's still waiting), we have a bug class that doesn't exist in either pure option.

**Retry.** Split between vendor-handled (at the step-invocation level) and ours (at the predicate-evaluation level). Harder to reason about.

**Observability.** Partial on vendor dashboard, partial on our admin surface. Split attention.

**Vendor footprint.** Same as 2.b or 2.c depending on which executor we pick. No savings.

**Cost to build.** Higher than either pure option because we build BOTH the Postgres schema AND the adapter.

**Verdict.** Dominated. No axis on which hybrid beats one of the pure options. Listed for completeness; rejected.

### 2.f — Evaluation matrix

| Axis | 2.a Postgres + cron | 2.b Inngest | 2.c Trigger.dev (hosted) | 2.c Trigger.dev (self-host) | 2.e Hybrid |
|---|---|---|---|---|---|
| **Failure recovery** | Good (our code; Postgres ACID) | Excellent (vendor) | Excellent (vendor) | Good (self-managed) | Split-brain risk |
| **Retry** | We build it (configurable) | First-class | First-class | First-class | Split across two layers |
| **Observability (builders)** | SQL-backed admin UI we build | Pass-through UI we still build | Same | Customizable | Fragmented |
| **Observability (SMB users)** | Same admin UI | Needs build-out | Needs build-out | Needs build-out | Needs build-out |
| **Cost at 1k workspaces** | ~0 marginal | $0 (free tier) | $0 (free tier) | Postgres + container | Vendor + DB |
| **Cost at 10k workspaces** | ~0 marginal | ~$200/mo | ~$200/mo | Postgres + container | Same as vendor |
| **Vendor footprint** | None (Neon + Vercel already) | +1 hosted vendor | +1 hosted vendor | +1 OSS dep + ops | +1 vendor |
| **Debuggability** | Highest (SQL) | Dashboard (not ours) | Dashboard (not ours) | Self-managed | Split |
| **Fit with "thin harness + owned Brain"** | Native | Against vision | Against vision | Partial | Partial |
| **No-new-deps discipline** | Holds | Breaks | Breaks | Breaks (OSS dep) | Breaks |
| **Build cost (approx LOC)** | 800–1,200 | 400–600 | 400–600 | 700–900 | 1,000+ |
| **Polling latency tolerated?** | Required (≤60 s) | None (push) | None (push) | None (push) | Depends |

### 2.g — Recommendation

**Recommend 2.a — Pure Postgres + Vercel cron polling.**

The decision pivots on four points:

1. **The §0 vision says "thin harness + owned Brain v2".** A hosted workflow engine is an unowned critical path. Every minute of Inngest downtime becomes a SeldonFrame outage; every pricing change is a unit-economics change we don't control. For the v1 ship where differentiation is "you own your business OS", we should not accept a mandatory-vendor on the execution layer.

2. **The build-cost gap is smaller than it looks.** 2.a's 800–1,200 LOC vs 2.b's 400–600 LOC is ~600 LOC of delta. 2b.1 shipped 1,400+ LOC in one PR. 2b.2 shipped 1,655 LOC across six migrations. The SeldonFrame team can absorb 600 LOC of workflow engine in the same patterns already validated.

3. **Observability wins on 2.a for the actual user.** Agencies debug flows via the admin surface WE build. On 2.b/2.c that's a passthrough against a vendor API — still 200–300 LOC of work for us — plus the vendor dashboard they can't use directly. On 2.a the admin surface reads Postgres directly, so the same effort gives them a first-class view.

4. **Polling latency ≤ 60 s is inside the business-level SLA.** Client Onboarding's "form-submit → kickoff booking" gap is already minutes-scale in the human flow. No v1 archetype needs sub-second resume latency. If a future archetype needs it, we can add an in-memory fast-path for recently-emitted events without changing the substrate.

**Counter-argument considered:** Inngest's "step memoization" saves us from reasoning about idempotent resume. That's real. But Postgres gives us the same property via "advance step in the same transaction that marks the wait resumed" — a single SQL pattern that's easier to reason about than a vendor's memoization model.

**§7 Gate Item G-1 locks this decision.** If Max overrides, the §3–§6 sections below partially apply (the AgentSpec surface design is substrate-agnostic) but §4 and §8 change materially.

---

## 3. AgentSpec surface design — `await_event` step type

This section is substrate-agnostic: the step shape described below is what synthesis emits regardless of whether the runtime lives in Postgres, Inngest, or Trigger.dev.

### 3.1 Step shape

```jsonc
{
  "id": "await_form",
  "type": "await_event",

  // Required: which event type unblocks the wait.
  "event": "form.submitted",

  // Optional: predicate that must hold for a matching event to count.
  // REUSES the existing Predicate primitive (types.ts:30). The event
  // payload is the scope the predicate evaluates against — fields are
  // addressed as "data.<field>" matching the persisted event log shape.
  // 2c does NOT add a new predicate variant; it composes the existing
  // field_equals / field_contains / field_exists / all / any primitives.
  "match": {
    "kind": "all",
    "of": [
      { "kind": "field_equals",   "field": "data.contactId", "value": "{{contactId}}" },
      { "kind": "field_equals",   "field": "data.formId",    "value": "onboarding_intake" }
    ]
  },

  // Required: timeout as an ISO 8601 Duration (reuses DurationSchema at
  // types.ts:110). Default if omitted: "P30D" per §0.5 master plan.
  // Absence of explicit timeout MUST still compile to an explicit
  // persisted timeout — no "wait forever" semantics allowed.
  "timeout": "P7D",

  // Required: what happens on each exit path. Both halves MUST declare
  // an explicit `next`; runtime refuses to execute a spec with null
  // branches here. Capture is optional on resume only.
  "on_resume":  { "capture": "submission", "next": "book_kickoff" },
  "on_timeout": { "next": "nudge_email" }
}
```

Design choices and why each is chosen:

1. **`event` is required (not optional)**. A wait without a target event is a wait-without-resume — that's a different primitive (a `wait` step with a duration). If the author wants "just wait 7 days", they use `type: "wait"`. Separation keeps the validator error surface sharp: `await_event` without `event` is a `spec_malformed`.

2. **`match` reuses `Predicate`**. Per L-20: verified against audit at HEAD (`types.ts:30`) — the existing primitive has `event_emitted` / `field_equals` / `field_contains` / `field_exists` / `all` / `any`. 2c's `match` field is a Predicate evaluated against the event envelope's `data` — no new primitives invented. The only extension is a runtime convention: `field` paths starting with `data.` address event payload fields; other paths address the workflow's capture scope (same convention the existing `validator.ts` interpolation resolver uses).

3. **`timeout` is required at runtime even when omitted in the spec**. The compiler (2c step validator) fills a default of `"P30D"` per master plan §0.5. Default value MUST be visible in the persisted `workflow_waits.timeout_at` column — there is no implicit "wait forever" path.

4. **Both `on_resume` and `on_timeout` must declare `next`**. Branchless step is a validator error. `next: null` is a valid terminator (ends the flow), but both halves must explicitly state it.

5. **Capture is optional on resume only**. On timeout there's no event payload to capture. If the author writes `on_timeout.capture`, that's a validator error.

6. **Interpolation is allowed in `match.*.value`**. `"{{contactId}}"` resolves against the workflow's variable / capture scope at the moment the wait is registered (NOT at the moment the event fires). This is the only path that shadows synthesis-time interpolation into runtime evaluation — needs a gate item (§7 G-4).

### 3.2 What goes on the wire

At synthesis time, the generated AgentSpec JSON is what Claude produces and the validator accepts. The runtime persists a DIFFERENT, resolved shape at the moment the workflow hits the step:

| Field | AgentSpec JSON (synthesis) | `workflow_waits` row (runtime) |
|---|---|---|
| `event` | literal string | copied |
| `match` | predicate with `{{interpolation}}` | predicate with interpolations RESOLVED at wait-registration time |
| `timeout` | ISO 8601 duration | `timeout_at = now() + duration`, stored as absolute timestamp |
| `on_resume`, `on_timeout` | step-id refs | copied |

This distinction matters because it fixes the semantics of "what counts as matching": an event that fires at t+5 with `contactId = X` is compared against the predicate that was resolved at t=0 — not against a fresh interpolation resolved at t+5. If the workflow's `contactId` changed between t=0 and t+5 (it shouldn't, but suppose), the wait still matches the ORIGINAL contactId. Gate item G-4.

### 3.3 Predicate evaluation semantics

The runtime evaluates the predicate against a structured scope:
- `data.*` — fields inside the event's `data` payload (verified shape in `packages/core/src/events/index.ts:1–46`; every `SeldonEvent` variant carries a `data` object).
- `meta.createdAt` — the event envelope's `createdAt` timestamp, for time-window predicates if needed (future extension; not in 2c scope).

Everything else is out of scope. The predicate is NOT allowed to run arbitrary SQL or read workspace state — that's 2e's `external_state` condition on branch steps, and it's deliberately separate.

### 3.4 Validator changes

New schema `AwaitEventStepSchema` in `packages/crm/src/lib/agents/validator.ts`:
- `id`, `type: "await_event"` literal, `event` (string matching event name regex), `match` (optional `PredicateSchema`), `timeout` (optional `DurationSchema`, defaults to `"P30D"` in the dispatcher), `on_resume` (object with `capture?` + `next`), `on_timeout` (object with `next`).
- Added to `KnownStepSchema` discriminated union.
- A new step-dispatcher function `validateAwaitEventStep` that:
  1. Confirms `event` is in the `SeldonEvent` registry (same pattern as trigger-event resolution today).
  2. Evaluates `match` against an expected event payload shape (uses the same registry lookup to pull the `data.*` field types).
  3. Confirms both `on_resume.next` and `on_timeout.next` resolve to real step ids.
  4. Confirms `on_resume.capture` (if present) is a valid identifier and doesn't shadow a prior capture.

Expected LOC per L-17 calibration: schema ~60 LOC, dispatcher ~120 LOC, tests ~180 LOC. Total PR-1 validator work ~360 LOC.

---

## 4. Runtime design (assuming recommendation 2.a is approved)

### 4.1 Data model (new Drizzle schemas)

Three new tables under `packages/crm/src/db/schema/`:

**`workflow_runs.ts`** — one row per in-flight archetype execution.
```ts
{
  id: uuid (pk),
  orgId: uuid (fk -> organizations),
  archetypeId: text,              // e.g., "client-onboarding"
  specSnapshot: jsonb,            // the full AgentSpec JSON at run start
  triggerEventId: uuid (nullable),// fk -> workflow_event_log if event-triggered
  triggerPayload: jsonb,          // snapshot of what kicked this run off
  status: enum("running"|"waiting"|"completed"|"failed"|"cancelled"),
  currentStepId: text,            // null when completed/failed
  captureScope: jsonb,            // accumulated {{capture}} values so far
  variableScope: jsonb,           // resolved spec.variables at run start
  createdAt: timestamp,
  updatedAt: timestamp,
}
```

**`workflow_waits.ts`** — one row per active `await_event` wait. Cleared on resume or timeout.
```ts
{
  id: uuid (pk),
  runId: uuid (fk -> workflow_runs),
  stepId: text,                   // the step's id within spec
  eventType: text,                // the "form.submitted" string
  matchPredicate: jsonb,          // the resolved Predicate (NOT with raw interpolations)
  timeoutAt: timestamp,           // absolute — set at wait-registration
  resumedAt: timestamp (nullable),
  resumedBy: uuid (nullable),     // fk -> workflow_event_log when resumed by event
  resumedReason: enum("event_match"|"timeout"|"manual"|"cancelled"),
  createdAt: timestamp,
}
```
- Indexes: `(eventType, resumedAt IS NULL)` for event-arrival scans; `(timeoutAt)` for timeout tick; `(runId)` for run-level queries.

**`workflow_event_log.ts`** — append-only log of every emitted `SeldonEvent`. This is the substrate change that makes durable `await_event` possible: today's `InMemorySeldonEventBus` dispatches and forgets; 2c adds persistence.
```ts
{
  id: uuid (pk),
  orgId: uuid (fk -> organizations),
  eventType: text,                // e.g., "form.submitted"
  payload: jsonb,                 // the `data` object
  emittedAt: timestamp,
  consumedByWaits: uuid[],        // nullable — filled when waits match this event
}
```
- Index: `(orgId, eventType, emittedAt DESC)` for wait-resolution scans.
- Retention: 90 days rolling (a separate cleanup cron at daily-03:05 UTC). Events older than 90 days don't wake waits — this is a bounded-storage guarantee and also limits the max-usable `timeout` to ~90 days in practice. Gate item G-3 decides whether 30-day (master plan default) or 90-day is the runtime-enforced ceiling.

### 4.2 Where paused state lives

**Postgres, exclusively.** Every piece of workflow-critical state — current step, capture scope, pending waits, absolute timeouts — is persisted before the request handler returns. The in-memory `InMemorySeldonEventBus` continues to function for the non-durable "live" dispatch (tests, dev-only consumers) but 2c's runtime reads from the event log, not the in-memory bus.

### 4.3 Event-arrival wake-up path

1. `emitSeldonEvent("form.submitted", { contactId, formId, ... })` still dispatches to in-memory listeners (backward-compatible).
2. In addition, a side-effect writes a `workflow_event_log` row synchronously.
3. In the same transaction, a lightweight "wake candidates" query finds any `workflow_waits` rows with `eventType = "form.submitted"` and `resumedAt IS NULL` for this org.
4. For each candidate, the predicate is evaluated against the event payload. If it matches, the wait is marked `resumedAt = now(), resumedReason = "event_match"` and the run is enqueued for advancement.
5. Advancement itself happens either (a) synchronously in the emit-caller's request (cheap, sub-ms tick) or (b) deferred to the cron tick if the caller is cost-sensitive. G-2 gate decides sync-vs-deferred.

### 4.4 Timeout path

`/api/cron/workflow-tick` runs every 60 seconds:

1. `SELECT * FROM workflow_waits WHERE resumedAt IS NULL AND timeoutAt <= now() LIMIT 100`.
2. For each row: mark `resumedAt = now(), resumedReason = "timeout"`, emit a synthetic `workflow.wait_timed_out` event for observability, and advance the run to `on_timeout.next`.
3. Batch limit of 100 per tick keeps the cron invocation bounded; if there's a backlog, next tick picks up the rest.

### 4.5 Deploy survival

No special handling needed. Workflow state is entirely in Postgres; when a deploy replaces the Vercel container, the next cron tick and the next event emission both pick up exactly where they left off. There is no "in-flight step" that can be lost — a step either committed its advance to Postgres (done) or didn't (next tick retries).

### 4.6 Failure modes

| Mode | Detection | Response |
|---|---|---|
| Step dispatcher throws | `try/catch` around `advanceRun()` in the tick | Increment `failure_count`; emit `workflow.step_failed`; retry next tick up to budget (default 3); after budget, mark run `failed` |
| Wait registered but `timeoutAt` in past | Insert-time guard in `registerWait()` | 400-level error surfaced to synthesis-time; shouldn't happen in production because synthesis enforces Duration validity |
| Event log row written but wake-candidates query fails | `try/catch` around side-effect; writes success-path log | Cron tick's timeout sweep also re-scans recent events — belt and suspenders |
| Cron tick itself doesn't run (Vercel region outage) | Self-healing once cron resumes: `timeoutAt <= now()` picks up all overdue waits | No data loss; latency spike on the specific waits that were due during the outage |
| Spec changes between wait-registration and resume (agent updated) | `spec_snapshot` column on `workflow_runs` is the source of truth for resume; spec updates don't affect in-flight runs | G-5 gate decides whether live runs adopt new spec or complete on old |

### 4.7 At-most-once advancement

The resumption path uses `UPDATE workflow_waits SET resumedAt = now() WHERE id = ? AND resumedAt IS NULL RETURNING id`. The conditional `WHERE resumedAt IS NULL` turns this into a compare-and-swap: only one tick or one event-arrival can claim the wait. Any parallel attempt sees the row already resumed and is a no-op.

Same pattern for step advancement: `UPDATE workflow_runs SET currentStepId = ? WHERE id = ? AND currentStepId = ?` prevents double-advance.

---

## 5. Composition contract integration

Per L-20, verified against current audit at HEAD (not memory):

| Primitive | File | Does 2c need to change it? |
|---|---|---|
| `Predicate` | `packages/crm/src/lib/agents/types.ts:30` | **No.** `event_emitted` kind + `field_equals` / `field_contains` / `field_exists` / `all` / `any` are sufficient for every match expression the Client Onboarding flow or anything like it will need. The path convention (`data.<field>` for event payloads) is a runtime concern, not a type-shape concern. |
| `ConversationExit` | `types.ts:129` | **No.** `await_event` is NOT a conversation step; conversation exits stay as they are. |
| `Duration` | `types.ts:110` | **No.** ISO 8601 subset already covers the Client Onboarding 7-day timeout and the master plan's 30-day default. |
| `ExtractField` | `types.ts:82` | **No.** `on_resume.capture` is a simple string (the capture name), not a typed extraction — the captured value IS the event payload, typed by the `SeldonEvent` registry rather than by an explicit extract shape. |
| `validateAgentSpec` | `packages/crm/src/lib/agents/validator.ts:186` | **Extend.** Add `AwaitEventStepSchema` to `KnownStepSchema` union; add `validateAwaitEventStep` dispatcher. Mechanical extension following the pattern of the 3 existing step dispatchers. |
| `UnknownStepSchema` | `validator.ts:135` | **No change, but behavior changes.** Once `await_event` is a known step, UnknownStep stops being the fallthrough for it. `branch` (owned by 2e) remains the only future step type to arrive via UnknownStep. |
| Composition contract parser (`block-md.ts`) | `packages/crm/src/lib/blocks/block-md.ts` | **No.** `await_event` is an AgentSpec construct, not a BLOCK.md construct. Blocks declare `produces` events; 2c is what consumes them at runtime. BLOCK.md shape is unchanged. |
| `SeldonEvent` registry | `packages/core/src/events/index.ts:1` | **No changes for 2c shipping.** The new synthetic events 2c may emit (`workflow.wait_timed_out`, `workflow.run_failed`, `workflow.step_failed`) are runtime-internal and do NOT need to be added to `SeldonEvent` — they're observability-only and live in the event log for dashboard queries. Gate item G-6 decides whether they become first-class `SeldonEvent` members (doing so lets archetypes await-on-them, which is a powerful pattern but a scope expansion). |

**Summary:** Zero shared-type changes. 2c's surface is (a) one new Zod schema in `validator.ts`, (b) one new dispatcher function, (c) three new Drizzle tables, (d) a runtime module. Exactly the containment pattern 2b.2 validated six times.

---

## 6. Observability requirements

From Max's directive: "agencies need to see paused flows, trigger manual resumption, debug failures."

### 6.1 Dashboard surfaces required for v1

A new top-level admin route: `/agents/runs` (builder mode) listing every workflow run in the workspace.

Per-row columns:
- Archetype name
- Trigger event (+ payload link)
- Status badge (running / waiting / completed / failed / cancelled)
- Current step id + step description
- Started-at / updated-at
- If `waiting`: which event it's waiting for, how long until timeout, the resolved predicate (pretty-printed)

Row-click opens a detail drawer showing the full step trace:
- Each step that executed, its result or capture value (one-line per step)
- For the current `await_event` step (if waiting): the event type, match predicate JSON, timeout date, "Resume manually" / "Cancel run" buttons
- For failed runs: the failure message, retry count, "Retry now" button

### 6.2 Manual resumption

A `POST /api/v1/workflow-runs/[runId]/resume` endpoint that:
- Marks the waiting row `resumedAt = now(), resumedReason = "manual"`.
- Emits a synthetic `workflow.manually_resumed` event (log-only, not a `SeldonEvent`).
- Enqueues the run for advancement.
- 403s if the caller isn't a builder admin for the workspace.

Manual cancel: `POST /api/v1/workflow-runs/[runId]/cancel` — sets run status to `cancelled`, clears waits.

### 6.3 Debug failures

Per-run view shows the structured error log:
- Which step failed
- Validator issues (if any were added post-start)
- The args passed to the failing MCP call (with workspace-secret redaction)
- The response that caused the failure

Agencies can point at this in a Loom when something broke for a client. This is the critical UX affordance that makes `await_event` actually usable by non-technical end users.

### 6.4 Scale considerations

For workspaces with ≥1,000 active runs, the `/agents/runs` page needs pagination + filters (status, archetype, date-range). Not in 2c scope unless usage forces it; ship with a simple 50-row-newest-first default.

### 6.5 Out of scope for 2c

- Real-time push updates on the dashboard (polling refresh is fine at 2s).
- Analytics dashboards over workflow runs (conversion funnels, etc.) — that's Brain v2's concern, not the workflow engine's.
- Public-facing "paused flows" status beyond the admin surface — end-user visibility for SMB customers of agencies is NOT required for v1.

---

## 7. Open decisions to gate before any code ships

Five substantive decisions need explicit Max approval before PR 1 starts. Same pattern as 2b.1's §7.

### G-1 — Substrate choice

**Recommendation:** 2.a Pure Postgres + Vercel cron polling (§2.g rationale).

**Alternatives:** 2.b Inngest, 2.c Trigger.dev (hosted), 2.c Trigger.dev (self-host). 2.d collapses into 2.a. 2.e hybrid is dominated.

**Approval shape required from Max:** pick one of {2.a, 2.b, 2.c-hosted, 2.c-self-host}. Rest of the audit (§3, §4, §8) is written assuming 2.a; approving anything else triggers an audit revision before code.

### G-2 — Event-arrival resume: synchronous vs deferred to cron tick

If a `form.submitted` event fires and there's a wait pending on it, does the wait resume **during the emit-caller's request** (synchronous; sub-ms extra latency on the form-submit endpoint) or **deferred to the next cron tick** (up to 60 s resume latency, zero added request latency)?

**Recommendation:** synchronous for v1. The emit-caller's request is already doing a DB write for the event log; doing one more advancement write in the same transaction is cheaper than adding cron-tick scan cost. Deferred is a fallback if synchronous resume introduces request-latency regressions (surface via probe at PR-3 gate).

**Alternative:** deferred with a "dirty flag" on the run so the cron tick only scans dirty runs. Lower per-request cost but higher cron-tick complexity.

### G-3 — Max timeout ceiling

Master plan §0.5 says "default 30 days". Runtime needs a ceiling — an explicit ceiling is safer than an unbounded check.

**Options:**
- **30 days as ceiling AND default.** Matches master plan. Anything longer is a synthesis-time error. Simple.
- **90 days ceiling, 30 days default.** Allows "wait for annual renewal" patterns later without changing the substrate. Matches the event-log retention window in §4.1.
- **No ceiling.** Synthesis can declare P1Y. Event log retention (90 days) silently breaks waits older than 90 days. Worst of both.

**Recommendation:** 90 days ceiling, 30 days default. Events older than 90 days can't wake a wait, so the ceiling and the retention window are aligned.

### G-4 — Interpolation resolution time for `match.*.value`

When an author writes `"value": "{{contactId}}"` inside a `match` predicate, when does `{{contactId}}` resolve?

**Options:**
- **At wait-registration time (recommended).** The resolved value is stored in `workflow_waits.matchPredicate`. Events arriving later are compared against the frozen value. Deterministic, debuggable, matches the "persist a resolved predicate" design.
- **At event-arrival time.** The predicate stays symbolic; each event check re-resolves against the current capture scope. Supports "match events against whatever the workflow's latest state is". More flexible, but harder to reason about and has race semantics.

**Recommendation:** wait-registration time. A workflow capture changing between wait-registration and event-arrival is unusual and surprising; freezing the predicate matches author intent most of the time.

### G-5 — Spec updates for in-flight runs

If a builder edits an archetype's AgentSpec while runs are paused on that spec's `await_event` step, do the in-flight runs adopt the new spec or complete on the original?

**Options:**
- **Complete on original (recommended).** `workflow_runs.specSnapshot` captures the spec at run-start; resumes read from it. Spec edits apply to new runs only.
- **Adopt new spec at next step.** Risky: step-ids might not match; capture shape might change; feels surprising to users who didn't intend to break running flows.
- **User choice per-edit.** Modal on save: "Apply to 27 running flows? [Yes / No]". Nice UX, larger scope.

**Recommendation:** complete on original. Adopt new spec at next TRIGGER firing.

### G-6 — Synthetic workflow events — first-class `SeldonEvent` or log-only?

The runtime emits `workflow.wait_timed_out`, `workflow.step_failed`, `workflow.run_failed`, `workflow.manually_resumed` for observability.

**Options:**
- **Log-only (recommended for v1).** They live in the event log table but aren't in the `SeldonEvent` TypeScript union. Dashboard queries read them from the log directly. Future archetypes can't await them.
- **First-class `SeldonEvent` members.** Added to the union in `packages/core/src/events/index.ts`. Future archetypes COULD await them (e.g., "await another workflow's completion"), which is a compelling composition pattern — but scope expansion beyond 2c's charter.

**Recommendation:** log-only for v1. Revisit in Scope 3 Step 2d (scheduled triggers) or later if "workflow-chains-another-workflow" becomes a real pattern users ask for.

---

## 8. Implementation sequencing — proposed 3-PR split

Follows the 2b.1 pattern: schema first, runtime second, archetype retrofit third. Each PR ships to main with a green bar + live probe before the next starts.

### 8.1 PR 1 — Validator extension + Drizzle schema + event-log persistence

**Scope:**
- `packages/crm/src/lib/agents/validator.ts` — add `AwaitEventStepSchema` to the known-step union; add `validateAwaitEventStep` dispatcher; add predicate-path resolution against the `SeldonEvent` registry (so `data.contactId` type-checks against the event's declared shape).
- `packages/crm/src/db/schema/workflow-runs.ts`, `workflow-waits.ts`, `workflow-event-log.ts` — three new tables. Drizzle migration shipped in this PR.
- `packages/crm/src/lib/events/bus.ts` — extend `emitSeldonEvent` with a persistent-side-effect write to `workflow_event_log` (additive to the existing in-memory dispatch; backward-compatible).
- Unit tests: `AwaitEventStepSchema` parse / validate / error surface; event-log append on emit.

**Green bar:**
- `pnpm test:unit` — existing 260 tests pass; new tests for await_event validator + event-log append push total to ~280.
- `pnpm emit:blocks:check` + `pnpm emit:event-registry:check` — clean (no block or event-registry changes).
- Typecheck baseline holds at 4 pre-existing errors.
- Vercel preview deploy green — the three new tables cause a migration on Neon preview; verify it completes.

**Live probe:** re-run all 3 archetypes 3× each — hash-stable (event-log append is additive, no synthesis changes).

**Expected LOC per L-17:** ~600–900 LOC (validator schema + dispatcher + tests ~360; migrations + bus extension ~150; tests for bus behavior ~200).

### 8.2 PR 2 — Runtime engine + cron tick + basic resume path

**Scope:**
- `packages/crm/src/lib/workflow/runtime.ts` — the engine. Functions: `startRun(spec, triggerPayload)`, `advanceRun(run)`, `registerWait(run, step)`, `resumeWait(waitId, reason)`.
- `packages/crm/src/lib/workflow/step-dispatchers/` — one file per step type: `wait.ts`, `mcp-tool-call.ts`, `conversation.ts`, `await-event.ts`. Each dispatcher is a pure function: `(run, step) => NextAction`. Matches the validator's dispatcher pattern.
- `packages/crm/src/app/api/cron/workflow-tick/route.ts` — the polling handler. 60 s cron configured in `packages/crm/vercel.json`.
- `packages/crm/src/lib/events/bus.ts` — extension: after event-log write, synchronously scan `workflow_waits` for matches and resume them (G-2 default).
- Unit tests for each dispatcher + integration test that drives a Client Onboarding-shaped spec end-to-end against a test Postgres.

**Green bar:**
- Existing tests green; new unit + integration tests push total to ~340.
- `/api/cron/workflow-tick` is callable with `CRON_SECRET`; returns advancement stats.
- Manual end-to-end test: start a run, emit the matching event, watch the run advance to completion.

**Live probe:** synthesize a Client Onboarding archetype (stub file not yet shipped; inline the spec for probe purposes) and run it 3× against test Postgres. Assert: started, paused on `await_form`, resumed on simulated `form.submitted`, completed at `kickoff_confirm`. Deterministic across runs.

**Expected LOC per L-17:** ~1,000–1,400 LOC (runtime module ~400; four dispatchers ~120/each ~480; cron handler ~150; bus extension ~100; tests ~300).

**Stop-and-reassess trigger:** 30% over 1,400 = 1,820. If we hit that, audit the audit.

### 8.3 PR 3 — Observability admin surface + manual resume/cancel endpoints

**Scope:**
- `packages/crm/src/app/(dashboard)/agents/runs/page.tsx` + detail drawer — list + detail views per §6.1.
- `/api/v1/workflow-runs/[runId]/resume` + `/cancel` endpoints per §6.2.
- Per-run step-trace view (reads `workflow_runs.captureScope` + step results from a new `workflow_step_results` table, or inlines results into `workflow_runs` — decide at PR-3 start).
- Builder-mode scope guard via existing OpenClaw pattern.

**Green bar:**
- Tests for the endpoints + an e2e Playwright spec that walks through "start run → see it waiting → manually resume → see it completed."
- Typecheck baseline holds.

**Live probe:** run Client Onboarding archetype 3× via the dashboard — start, observe waiting state, resume, observe completion. Cost delta vs PR 2 bar: ±5% (admin-surface work doesn't touch synthesis).

**Expected LOC per L-17:** ~500–700 LOC (admin page ~200; drawer ~150; endpoints ~100; tests ~150).

### 8.4 Totals

| PR | Scope | LOC (est) |
|---|---|---|
| PR 1 | Validator + Drizzle + event-log | 600–900 |
| PR 2 | Runtime engine + cron + resume | 1,000–1,400 |
| PR 3 | Observability + manual controls | 500–700 |
| **Total 2c** | | **2,100–3,000 LOC** |

Larger than 2b.1 (which was 1,484 + 600 + ~400 ≈ 2,500 LOC at actuals) and larger than any single 2b.2 block. That's consistent with 2c introducing the runtime from scratch — it's the biggest slice in Scope 3 by design.

### 8.5 Timeline estimate

- PR 1: 2–3 days.
- PR 2: 4–6 days (runtime is the big-ticket item).
- PR 3: 2–3 days.
- Total: 8–12 days. Master plan said "~1–2 weeks" — aligns.

### 8.6 Sequencing dependencies

- **PR 2 depends on PR 1 shipping to main** (needs the event-log table + validator's known-step schema).
- **PR 3 depends on PR 2 shipping to main** (needs the runtime to have runs to display).
- **Step 3 (archetype retrofit) depends on the full 2c trio shipping.** Client Onboarding's synthesis-time build-out is 3b's concern, but 3b can't even start until `await_event` is a known step.

---

## 9. Open questions for Max — summary

| # | Decision | Recommendation |
|---|---|---|
| G-1 | Substrate choice | 2.a — Pure Postgres + Vercel cron |
| G-2 | Event-arrival resume: sync vs deferred | Synchronous (in emit-caller's request) |
| G-3 | Max timeout ceiling | 90 days ceiling, 30 days default (aligns with event-log retention) |
| G-4 | Interpolation resolution time for predicate values | At wait-registration (freeze predicate) |
| G-5 | Spec updates for in-flight runs | Complete on original; new spec applies to new runs only |
| G-6 | Synthetic workflow events as first-class `SeldonEvent` | Log-only for v1 |

Default resolution for any unchecked gate item follows the recommendation. Per the 2b.1 precedent, Max explicitly approves or overrides each; unapproved gates block PR 1.

---

## 10. Self-review changelog (2026-04-22, post-draft)

- **L-16 / L-20 spot-checks performed against HEAD before locking claims:**
  - `Predicate` at `types.ts:30` — has `event_emitted` / `field_equals` / `field_contains` / `field_exists` / `all` / `any`. Confirmed.
  - `Duration` at `types.ts:110` — ISO 8601 subset regex verified.
  - `AgentSpec` / `Step` shapes at `validator.ts:150`–`166` — three known step types + `UnknownStepSchema` fallthrough. Verified line numbers.
  - `validator.ts:300` error message explicitly names `await_event` as 2c scope. Verified the stub text.
  - `InMemorySeldonEventBus` at `packages/core/src/events/index.ts:72` — confirmed. No external broker, no persistence. This is the load-bearing finding.
  - `packages/crm/vercel.json` — three crons active, all `CRON_SECRET`-authenticated, all `runtime = "nodejs"`. A 4th slot is trivial.
  - `client-onboarding.ts` NOT shipped — verified via directory listing of `packages/crm/src/lib/agents/archetypes/` and grep of `archetypes/index.ts`.

- **Section 2.d explicitly collapses into 2.a** after researching Vercel's native durable primitives — the audit no longer pretends there's a 4th independent option.

- **Section 2.e hybrid is explicitly dominated** — kept in the audit for decision-lineage completeness but not a live candidate.

- **LOC estimate carries the L-17 caveat** — 2c is larger than any 2b.2 block because it introduces the runtime from scratch. If PR 2 hits 1,820 LOC (30% over high end), stop-and-reassess trigger fires.

- **Scope containment documented** — per the 2b.2 containment principle, the workflow runtime lives entirely in `packages/crm/src/lib/workflow/` and `packages/crm/src/db/schema/workflow-*.ts`. `packages/crm/src/lib/agents/types.ts` is not touched. Zero changes to `SeldonEvent` union. Same pattern Stripe / Formbricks / Puck proved six times.

- **Boundary with 2d / 2e explicitly called out** — 2c is `await_event` only; trigger schedules are 2d's; branch conditions are 2e's. These three slices compose but each is independently validatable.

---

## 11. Stop-gate — audit APPROVED 2026-04-22

All six gate items approved on the recommendations as drafted. PR 1 is unblocked.

| Item | Status | Resolution |
|---|---|---|
| G-1 — substrate choice | ✅ APPROVED 2026-04-22 | 2.a Pure Postgres + Vercel cron polling. 3 alternatives (Inngest, Trigger.dev hosted, Trigger.dev self-host) archived as decision lineage in §2. |
| G-2 — sync vs deferred resume | ✅ APPROVED 2026-04-22 | Synchronous in the emit-caller's request. Deferred-to-cron remains the fallback if synchronous resume introduces request-latency regressions — surface via probe at PR-3 gate. |
| G-3 — timeout ceiling | ✅ APPROVED 2026-04-22 | 90-day ceiling, 30-day default. Aligns with the 90-day rolling retention on `workflow_event_log` so the ceiling and the retention window match. |
| G-4 — interpolation resolution time | ✅ APPROVED 2026-04-22 | At wait-registration. The resolved predicate is persisted to `workflow_waits.matchPredicate`; events arriving later compare against the frozen value. |
| G-5 — in-flight spec updates | ✅ APPROVED 2026-04-22 | Complete on original. `workflow_runs.specSnapshot` is the source of truth for resume. Spec edits apply only to new runs triggered after the edit. |
| G-6 — synthetic events as `SeldonEvent` | ✅ APPROVED 2026-04-22 | Log-only for v1. `workflow.wait_timed_out` / `workflow.step_failed` / `workflow.run_failed` / `workflow.manually_resumed` live in the event log but are NOT added to the `SeldonEvent` union. Revisit post-v1 if archetypes-await-workflows becomes a real pattern. |

No open gate items remain. Proceeding with the 3-PR sequence in §8.

---

*Audit drafted: Claude Opus 4.7 (1M context). Awaiting Max's review — no code until gates resolve.*
