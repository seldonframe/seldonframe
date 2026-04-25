# SLICE 5 Audit — scheduled triggers for AgentSpec

**Date:** 2026-04-24
**Predecessor:** SLICE 4b (customer composition layer), closed in commit `d56c9090`.
**Drafted by:** Claude Opus 4.7 against HEAD (branch `claude/fervent-hermann-84055b`).

---

## §1 Problem statement + strategic context

SLICE 2c shipped durable workflow runtime + state-access step types. SLICE 4a + 4b shipped the UI composition layer. Agents today can run only when a `trigger.type: "event"` fires — i.e. a block's tool or subscription emits a SeldonEvent that matches the agent's trigger filter.

SLICE 5 adds `trigger.type: "schedule"` so agents can run on cron schedules. Examples:

- **Daily summary emails** — every morning at 9am, send the workspace owner a brain-generated daily digest.
- **Weekly reports** — every Monday 8am, render a report and email it.
- **Appointment reminders** — 24 hours before each booked appointment, send a reminder SMS. (*Note:* this is borderline — "24h before X" is a per-entity scheduled operation, not a cron. SLICE 5 scope = cron-style recurring triggers. Entity-relative scheduling is a follow-up; see §9.)
- **Reconciliation sweeps** — every 6 hours, reconcile external state with workspace Soul.

**Strategic boundary:** SLICE 5 is the penultimate architectural slice before launch readiness. It unlocks the "autonomous" half of the autonomous-agent story: until now, agents only react to events they depend on. After SLICE 5, agents can initiate work on a schedule.

**Relationship to existing triggers:**
- `trigger.type: "event"` (shipped): "run when event X fires matching filter"
- `trigger.type: "schedule"` (this slice): "run on cron expression, with catchup + concurrency policies"
- `trigger.type: "manual"` / `trigger.type: "message"` (future slices): out of scope.

The TriggerSchema changes from a single literal to a discriminated union. That's the critical schema change.

---

## §2 Ground-truth findings at HEAD

Verified by direct inspection at commit `d56c9090`. 8 dimensions covered.

### §2.1 Cron infrastructure — SIGNIFICANT FOUNDATION ALREADY SHIPPED

**Surprise flag:** cron is not greenfield. SeldonFrame already runs 6 Vercel cron endpoints in production.

- [`packages/crm/vercel.json`](packages/crm/vercel.json:5-22) declares 6 crons:
  - `/api/cron/automations` — every 6 hours
  - `/api/cron/brain-compile` — daily 3am UTC
  - `/api/cron/orphan-workspace-ttl` — daily 4am UTC
  - `/api/cron/workflow-tick` — **every minute**
  - `/api/cron/usage-reset` — reset counters
  - `/api/cron/metrics-snapshot` — aggregation
- All authenticated with `CRON_SECRET` env var (L-13 lesson applies).
- No job-queue library (BullMQ, pg-boss, agenda, Upstash) — pure Vercel-cron + Postgres polling.
- Already-running minute-level tick ([`/api/cron/workflow-tick`](packages/crm/src/app/api/cron/workflow-tick/route.ts)) is the natural extension point for schedule dispatch.

**Implication:** SLICE 5 does NOT need to introduce cron infrastructure. It extends an existing minute-ticking dispatcher.

### §2.2 AgentSpec trigger — single literal type, needs discriminated union

[`packages/crm/src/lib/agents/validator.ts:102-106`](packages/crm/src/lib/agents/validator.ts:102):

```typescript
const TriggerSchema = z.object({
  type: z.literal("event"),
  event: z.string().min(1),
  filter: z.record(z.string(), z.unknown()).optional(),
});
```

All three archetypes (review-requester / speed-to-lead / win-back) use `trigger: { type: "event", ... }`. Adding a second trigger type requires the discriminated-union refactor. Not a breaking change for consumers — discriminated unions with the same discriminant key work transparently when callers narrow via `if (trigger.type === "event") {...}`.

### §2.3 Synthesis pathway — archetypes are source-code only; no agents table

- Archetypes live in [`packages/crm/src/lib/agents/archetypes/`](packages/crm/src/lib/agents/archetypes/) as `.ts` files, not in DB.
- No `agents` table exists; checked all 46 schema files.
- Probe machinery ([`scripts/phase-7-spike/`](scripts/phase-7-spike/)) hashes event-trigger specs only. Adding a schedule archetype means: (a) new archetype template, (b) probe coverage, (c) hash baseline for the new archetype's structural shape.
- `structural-hash.mjs` canonicalizes by trigger type + step graph — it will naturally capture schedule triggers without code change.

### §2.4 Workspace timezone — NOT WIRED today

- [`packages/crm/src/db/schema/organizations.ts:58-82`](packages/crm/src/db/schema/organizations.ts) has `settings: jsonb` but no typed `timezone` column.
- Client-side code uses `Intl.DateTimeFormat().resolvedOptions().timeZone` for UX (booking form timezone display) — not server-side.
- No `date-fns-tz` / `luxon` / `croner` installed.
- **SLICE 5 needs a timezone mechanism.** Two options:
  - **A**: Add a `timezone: text` column to `organizations` (migration).
  - **B**: Store in existing `organizations.settings` JSONB.
  - See G-5-1 below.

### §2.5 Queue / job — durable workflow runtime + Postgres polling

[`packages/crm/src/db/schema/workflow-waits.ts:33-84`](packages/crm/src/db/schema/workflow-waits.ts):

- `timeoutAt: timestamp(..., { withTimezone: true })` — polled by the minute-tick dispatcher
- `resumedAt: timestamp(...)` — CAS cursor for at-most-once advancement
- Indexed on `(timeoutAt, resumedAt IS NULL)` for efficient batch polling
- `findDueWaits(now, BATCH_LIMIT)` selects `resumedAt IS NULL AND timeoutAt <= now()`; advances up to 100 per tick

**Implication:** scheduled triggers naturally map to `timeoutAt`-style polling. A new `scheduled_triggers` table with `next_fire_at` column uses the identical polling pattern. `workflow-tick` route extends with one more `findDueSchedules` call per minute.

### §2.6 Scheduled-ish patterns — idempotency mature, no scheduler yet

- Idempotency: [`block-subscription-deliveries.ts:90-91`](packages/crm/src/db/schema/block-subscription-deliveries.ts:90) has UNIQUE `(subscriptionId, idempotencyKey)`. SLICE 5 reuses this pattern: `(scheduledTriggerId, fireTime)` UNIQUE index prevents double-fire on restart.
- [`validator.ts:108-113`](packages/crm/src/lib/agents/validator.ts:108) has `WaitStepSchema { type: "wait", seconds: number }` — pure delay. Different from scheduled trigger (which is absolute-time-based, not relative-delay).
- No "fire at time T" in email/SMS today. Messages send immediately on step execution.

### §2.7 Observability — log + admin runs page exist

- [`lib/observability/log.ts`](packages/crm/src/lib/observability/log.ts) exports `logEvent()` emitting JSON lines
- [`/agents/runs` admin page](packages/crm/src/app/(dashboard)/agents/runs/page.tsx) lists runs per org with waits + step traces
- Extending for scheduled triggers: add a "Next fire" column + a sidebar list of active schedules. No dedicated route required (see G-5-6).

### §2.8 BlockSpec ↔ agents — connection is implicit via event names

- BlockSpec has no `agents` field. Blocks and agents connect by event-name matching: block's `produces[].name` matches agent's `trigger.event`.
- For SLICE 5 schedule triggers: **no BlockSpec change required** — scheduled agents don't consume block events; they fire on cron. A separate AgentSpec persistence decision (G-5-7 below) governs how scheduled triggers are stored.

---

## §3 Schema extension

### §3.1 TriggerSchema as discriminated union

Replace the current single-literal TriggerSchema in [`validator.ts:102-106`](packages/crm/src/lib/agents/validator.ts:102) with:

```typescript
const EventTriggerSchema = z.object({
  type: z.literal("event"),
  event: z.string().min(1),
  filter: z.record(z.string(), z.unknown()).optional(),
});

const ScheduleTriggerSchema = z.object({
  type: z.literal("schedule"),
  cron: z.string().regex(CRON_EXPR_PATTERN, { message: "..." }),
  timezone: z.string().optional(),       // per-trigger override; see G-5-1
  catchup: z.enum(["skip", "fire_latest", "fire_all"]).default("skip"),
  concurrency: z.enum(["skip", "queue", "parallel"]).default("skip"),
});

const TriggerSchema = z.discriminatedUnion("type", [
  EventTriggerSchema,
  ScheduleTriggerSchema,
]);
```

**Cron expression validation:** the Zod regex checks 5-field POSIX cron syntax coarsely; full parse + "next fire at" computation happens in the dispatcher via an external library (see §3.3). Runtime validation layered on top of schema ensures the regex doesn't ship an invalid expression to the dispatcher.

**Superrefine cross-check:** when `timezone` is set, validate it's an IANA zone name (e.g., `"America/New_York"`). Use the library's `getTimezones()` or `Intl.supportedValuesOf("timeZone")` for the whitelist.

### §3.2 scheduled_triggers persistence table

New Drizzle schema file at `packages/crm/src/db/schema/scheduled-triggers.ts`:

```typescript
export const scheduledTriggers = pgTable("scheduled_triggers", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  archetypeId: text("archetype_id").notNull(),    // e.g., "daily-digest"
  cronExpr: text("cron_expr").notNull(),
  timezone: text("timezone").notNull(),            // resolved at insert time (workspace or per-trigger)
  catchupPolicy: text("catchup_policy").notNull().default("skip"),
  concurrencyPolicy: text("concurrency_policy").notNull().default("skip"),
  nextFireAt: timestamp("next_fire_at", { withTimezone: true }).notNull(),
  lastFiredAt: timestamp("last_fired_at", { withTimezone: true }),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("scheduled_triggers_due_idx").on(t.nextFireAt).where(sql`${t.enabled} = true`),
  uniqueIndex("scheduled_triggers_org_archetype_idx").on(t.orgId, t.archetypeId),
]);
```

Fire-idempotency: a sibling `scheduled_trigger_fires` table with UNIQUE `(scheduledTriggerId, fireTimeUtc)` prevents double-fire across cron-tick races (reusing the block-subscription-deliveries pattern).

### §3.3 Dependency addition

SLICE 5 adds **one new dep**: [`croner`](https://github.com/Hexagon/croner) (MIT, ~8KB, zero sub-deps, IANA timezone support, ESM + CJS). Alternative: `cron-parser` + `luxon` (two deps, larger). Recommend `croner` for dependency minimalism.

**Use sites:**
- Cron expression syntax validation at schema time (`Cron(expr).getPattern()` throws on malformed)
- `nextFireAt` computation given `cron + timezone + lastFiredAt` (deterministic, serverless-safe)

### §3.4 Workspace timezone on organizations

Recommend adding a typed column (Option A in §2.4):

```typescript
// db/schema/organizations.ts — add:
timezone: text("timezone").notNull().default("UTC"),
```

- Default `"UTC"` means existing workspaces don't break.
- Queryable from SQL (vs JSONB lookup per row).
- Settable via an admin UI later; v1 scope is backend + seed from workspace creation wizard.

---

## §4 Runtime implementation

### §4.1 Dispatcher — extend workflow-tick

The existing `/api/cron/workflow-tick` already runs every minute. Extend its body:

```typescript
// current (SLICE 2c):
const dueWaits = await storage.findDueWaits(new Date(), BATCH_LIMIT);
for (const wait of dueWaits) { /* resume */ }

// new (SLICE 5):
const dueSchedules = await storage.findDueSchedules(new Date(), BATCH_LIMIT);
for (const sched of dueSchedules) { await dispatchScheduleFire(sched, now); }
```

`dispatchScheduleFire`:
1. Insert `scheduled_trigger_fires` row with UNIQUE-protected `(schedId, fireTimeUtc)` — if conflict, skip (concurrency/catchup race already handled).
2. Compute next `nextFireAt` via `croner`.
3. Apply catchup policy (§4.3) before advancing `nextFireAt`.
4. Apply concurrency policy (§4.4) before starting a run.
5. If dispatching a run: insert workflow_runs row; enqueue the archetype's first step.
6. Emit observability event via `logEvent("scheduled_trigger.fired", {...})`.

Batch limit stays at 100. With minute-granularity, even 10,000 active schedules could fire over ~100 minutes in worst-case lag — acceptable for v1.

### §4.2 Firing mechanism

Schedule triggers **don't consume events**; they originate runs. The dispatch path is analogous to event-trigger synthesis but with trigger.type="schedule" baked into the archetype filled spec.

**No new endpoint.** Schedule fires happen in the existing cron-tick context.

### §4.3 Catchup logic (wired to G-5-2)

Three policies, default `"skip"`:

- `"skip"`: if tick detects `nextFireAt <= now` AND `lastFiredAt < nextFireAt - 1min`, ignore the missed windows; advance `nextFireAt` to `next(now, cron, tz)`. Used for: daily digest emails. Default because mass post-deploy catchup = notification storms.
- `"fire_latest"`: fire exactly once (one run), even if multiple fire windows were missed. Then advance `nextFireAt` to next-after-now. Used for: reconciliation sweeps.
- `"fire_all"`: iterate each missed window, dispatch a run per window. Used for: debit-card daily-fee charge (rare; must opt in explicitly).

Catchup is per-trigger, not global. Implementation uses `croner`'s `previous()` to enumerate missed windows.

### §4.4 Concurrency control (wired to G-5-4)

Three policies, default `"skip"`:

- `"skip"` (default): if an active run exists for this schedule (i.e., workflow_run with `status='running'` for this archetypeId+orgId), drop the new fire. Used for: long-running daily reports that occasionally overlap.
- `"queue"`: enqueue the fire; the in-flight run's completion triggers the next. Adds a `queued_schedule_fires` mini-queue per trigger. More complex; defer to follow-up unless strong need.
- `"parallel"`: dispatch regardless; let the archetype handle its own idempotency. Used for: stateless schedules where duplicate runs are harmless.

**v1 scope recommendation:** ship `"skip"` and `"parallel"`. Defer `"queue"` to a post-launch slice — requires a new mini-queue table + drain logic.

### §4.5 Observability

- `logEvent("scheduled_trigger.fired", { schedId, archetypeId, orgId, fireTimeUtc, catchupApplied })` on every dispatch
- `logEvent("scheduled_trigger.skipped", { reason: "concurrency"|"catchup" })` on drop
- Extend `/agents/runs` admin page: add a sidebar "Active schedules" section listing `scheduledTriggers` with `nextFireAt` rendered in user locale. Add a "Fired via schedule" pill on run rows whose trigger was schedule-based.

---

## §5 Gates (6 decisions — range is intentional per Max's spec)

### G-5-1 — Timezone granularity

**Question:** workspace-level default, per-trigger override, or both?

- **A:** workspace-level default only (`organizations.timezone`). Every trigger inherits it.
- **B:** per-trigger only (`trigger.timezone`). No workspace default.
- **C:** both — workspace default + optional per-trigger override.

**Recommendation: C (both).** Workspaces have a primary timezone (the builder's); most triggers want that. But some use cases legitimately differ: a global agency running triggers for multiple clients wants per-trigger tz. Schema: `trigger.timezone` optional; if unset, dispatcher falls back to `organizations.timezone`. If both unset, dispatcher defaults to `"UTC"` + emits a `scheduled_trigger.missing_timezone_fallback` warning log.

### G-5-2 — Catchup semantics

**Question:** what happens when schedule fires were missed during a deploy window / outage?

- **A:** always fire all missed windows (`"fire_all"` hard default).
- **B:** always skip missed, fire only next `nextFireAt` (`"skip"` hard default).
- **C:** configurable per trigger; `catchup: "skip" | "fire_latest" | "fire_all"`, default `"skip"`.

**Recommendation: C with "skip" default.** Strong reason: post-deploy storms. If a workspace has 50 daily-digest schedules + deploys for 3 days (rare but possible), `"fire_all"` fires 150 emails on resume. `"skip"` is the safe default; operators who genuinely want catchup explicitly opt in.

### G-5-3 — Scheduling granularity

**Question:** what's the minimum fire interval?

- **A:** 1 minute (matches existing workflow-tick cadence).
- **B:** 1 hour (operationally cleaner, but blocks minute-level use cases like "every 5 minutes reconcile").
- **C:** 1 second (requires external scheduler; Vercel cron can't do it).

**Recommendation: A (1 minute).** Matches the existing tick. No new infrastructure required. Document that sub-minute granularity is intentionally not supported in v1. The Zod regex can enforce this by rejecting sub-minute patterns at schema time.

### G-5-4 — Concurrency policy

**Question:** trigger fires while previous invocation is still running — what?

- **A:** always skip.
- **B:** always run concurrently (parallel).
- **C:** configurable; `concurrency: "skip" | "queue" | "parallel"`.

**Recommendation: C but only ship `"skip"` + `"parallel"` in v1.** Defer `"queue"` to a follow-up (needs a mini-queue table + drain logic — adds ~100 LOC and extra testing). `"skip"` is the safe default; `"parallel"` is the opt-in for stateless schedules.

### G-5-5 — Cron expression format

**Question:** standard POSIX 5-field cron OR SeldonFrame schedule primitives ("daily 9am", "every 5 minutes")?

- **A:** standard cron only.
- **B:** SeldonFrame schedule primitives only (builder-friendly).
- **C:** both — accept cron OR primitives; primitives expand to cron internally.

**Recommendation: A (standard cron only in v1).** Reasons:
1. `croner` library handles validation + next-fire computation out of the box.
2. Existing SeldonFrame infrastructure (Vercel vercel.json cron syntax) already uses POSIX cron. Consistency.
3. Builder-friendly primitives are UX polish, not architecture. Can be added as a syntactic sugar layer in a follow-up that expands `"daily 9am"` → `"0 9 * * *"` before storage. No schema change needed to add later.

### G-5-6 — Observability surface

**Question:** new dedicated admin view for schedules vs extending existing `/agents/runs`?

- **A:** dedicated `/agents/schedules` view.
- **B:** extend existing `/agents/runs` with sidebar + schedule-triggered pill on runs.
- **C:** both (sidebar on /runs + dedicated schedules page).

**Recommendation: B.** Minimizes UI sprawl; schedules are in the same mental model as runs (an active schedule = "a run that will start at T"). Dedicated page becomes worthwhile when schedule volume grows beyond 10-20 per workspace; not a v1 concern.

---

## §6 LOC projection with L-17 calibration

Applying the refined L-17 addenda from SLICE 4 close:

### §6.1 Component LOC estimates

| Component | Prod | Tests | Multiplier | Category |
|---|---|---|---|---|
| TriggerSchema discriminated union + ScheduleTriggerSchema | 40 | 120 | 3.0x | cross-ref Zod (1-datapoint calibration: 2.5-3.0x) |
| Organizations timezone column + migration | 25 | 20 | 0.8x | schema/drizzle |
| scheduled_triggers table + schema | 55 | 40 | 0.7x | schema/drizzle |
| scheduled_trigger_fires table + UNIQUE idx | 30 | 20 | 0.7x | schema/drizzle |
| Cron dispatcher extension (findDueSchedules + dispatchScheduleFire) | 140 | 200 | 1.4x | sequential pipeline (L-17 1.3-1.6x) |
| Catchup logic (3 policies × miss-window enumeration) | 90 | 160 | 1.8x | state-machine render-integrated (L-17 refined) |
| Concurrency logic (skip + parallel; queue deferred) | 60 | 90 | 1.5x | sequential pipeline |
| croner library wrapper + IANA tz validator | 40 | 60 | 1.5x | adapter |
| Observability hooks (logEvent calls + /agents/runs extension) | 80 | 100 | 1.25x | composition (admin UI addendum = 0.94x; logEvent = adapter) |
| Schedule archetype template (e.g., daily-digest for probe coverage) | 80 | 80 | 1.0x | archetype composition |
| **Subtotals** | **640** | **890** | | |

### §6.2 Artifacts (not multiplier-inflated)

| Artifact | LOC |
|---|---|
| Integration smoke test: schedule-fire → run dispatch end-to-end | 180 |
| Probe update (schedule archetype hash baseline) | 50 |
| Close-out report | 300 |
| **Subtotal — artifacts** | **530** |

### §6.3 SLICE 5 total projection

| Bucket | LOC |
|---|---|
| Prod | 640 |
| Tests | 890 |
| Artifacts | 530 |
| **Total** | **~2,060** |

### §6.4 LOC verdict — **AUDIT-TIME FLAG REQUIRED**

Max's spec: "~1,000-1,400 LOC target; audit-time flag required if projection exceeds 1,800 LOC."

Projection: **~2,060 LOC — 15% over the 1,800 flag threshold, 47% over the 1,400 upper target.**

**Analysis of overshoot:**

1. **Cross-ref validator +3.0x multiplier.** The customer_surfaces single-datapoint observation lands here as the second datapoint. TriggerSchema cross-ref tests (discrimination × timezone validation × cron validation × catchup enum × concurrency enum) fan out similarly. Either confirms the 2.5-3.0x rule OR recalibrates if observed lower.

2. **Catchup logic is state-machine-heavy.** Three policies × per-miss-window enumeration × idempotency = 160 test LOC. Could reducer-extract to drop into 1.0-1.3x band (cut ~50 LOC), but at the cost of splitting the catchup logic across a pure-fn + dispatch-wrapper.

3. **Artifacts running ~25% of total** — higher than typical SLICE (15-20%) because of the schedule archetype template + probe baseline + close-out. The probe baseline work is unavoidable; the archetype template is optional for v1 but increases proof quality.

**Options for the LOC conversation:**

- **A: Accept 2,060 LOC.** Every component defensible against a specific purpose (per L-17 audit-time decision-framework rule 3). No padding visible. Landing with strong calibration discipline.
- **B: Scope-cut to fit ≤1,800.**
  - Drop the schedule archetype template (saves ~160 LOC, costs probe coverage + demo story)
  - Or drop `concurrency: "parallel"` and ship only `"skip"` in v1 (saves ~80 LOC)
  - Or defer IANA tz validator whitelisting; accept any string at schema time, validate at dispatch (saves ~60 LOC but risks ship-broken schedules)
- **C: Split into 2 PRs.**
  - PR 1: schema + dispatcher + catchup/concurrency "skip"-only (~1,100 LOC)
  - PR 2: parallel concurrency + observability extension + archetype template + close-out (~950 LOC)

**Recommendation: A (accept 2,060).** Rationale:
1. Every line maps to a specific §3/§4 capability; no scope creep detected.
2. The cross-ref validator multiplier is a known calibration event — shipping it validates the 2.5-3.0x rule across a second datapoint (moves from 1-datapoint to 2-datapoint support).
3. SLICE 5 is self-contained: splitting it over 2 PRs adds close-out + regression overhead (~200 LOC) that exceeds the scope-cut savings.
4. Stop-trigger at 30% over the upper projection (1,820) is ~12% above our projection — we'd hit it mid-implementation only if unexpected complexity surfaces. Natural stop-and-reassess point.

**If Max prefers split (Option C):** PR 1 / PR 2 split points above are natural boundaries.

---

## §7 Proposed PR split

**Default: single PR** unless Max selects Option C from §6.4.

### §7.1 Single-PR mini-commit structure (~2,060 LOC)

- **C1:** croner dep + TriggerSchema discriminated union + ScheduleTriggerSchema + IANA tz validator + tests (~320 LOC)
- **C2:** `organizations.timezone` column + `scheduled_triggers` + `scheduled_trigger_fires` tables + migration + storage helpers (~235 LOC)
- **C3:** Dispatcher extension (findDueSchedules + dispatchScheduleFire) + observability hooks (~520 LOC — the largest commit; catchup + concurrency + logEvent + /agents/runs extension)
- **C4:** Daily-digest archetype template (proof) + probe hash baseline update (~210 LOC)
- **C5:** End-to-end integration smoke test (scaffolded schedule → cron tick → run dispatched → observability logged) + regression probes (~230 LOC)
- **C6:** L-17 refinement addendum (cross-ref validator multiplier, 2-datapoint support) + SLICE 5 close-out report (~300 LOC artifact)

Stop-and-reassess trigger fires at **~2,680 LOC** (30% over 2,060 actual projection). If any mid-PR LOC check exceeds that, stop + reassess per L-21.

### §7.2 If Max chooses Option C split (reference)

**PR 1 (~1,100 LOC):** C1 + C2 + partial C3 (schema, tables, dispatcher with skip-only + catchup).
**PR 2 (~950 LOC):** remainder of C3 (parallel concurrency + observability) + C4 + C5 + C6.

---

## §8 Gates — summary of recommendations

| Gate | Recommendation | Scope impact |
|---|---|---|
| G-5-1 timezone granularity | **C** (both: workspace default + per-trigger override) | +25 LOC prod for fallback chain |
| G-5-2 catchup semantics | **C** with "skip" default; ship all 3 policies | as projected |
| G-5-3 scheduling granularity | **A** (1 minute minimum) | zero infra change |
| G-5-4 concurrency policy | **C** but only "skip" + "parallel" in v1; defer "queue" | -100 LOC vs full policy set |
| G-5-5 cron format | **A** (standard POSIX only) | simpler validator |
| G-5-6 observability surface | **B** (extend /agents/runs; no dedicated page) | -200 LOC vs dedicated page |

All six gates accepted as-recommended fit the 2,060 LOC projection. No individual gate forces significant reshape.

---

## §9 Out of scope

Explicitly deferred to future slices or post-launch tickets:

1. **Entity-relative scheduling** ("24h before each appointment") — requires per-entity wait registration, not cron. Post-launch follow-up; leverages workflow_waits.timeoutAt.
2. **UI for creating/editing scheduled triggers** — builders declare in AgentSpec. Admin UI for visualizing `scheduledTriggers` lands in a follow-up UI slice (probably part of a "schedules editor" post-launch slice).
3. **Complex schedule patterns** — "every business day", "excluding holidays", timezone-aware date math beyond cron. Post-launch.
4. **Multi-timezone triggers** — single timezone per trigger; multi-tz dispatching requires fan-out logic.
5. **Scheduled trigger testing in customer workspaces** — SLICE 8 workspace test mode.
6. **SeldonFrame schedule primitives** ("daily 9am" → cron sugar) — G-5-5 deferred.
7. **`concurrency: "queue"` policy** — G-5-4 deferred.
8. **Schedule history / audit trail** — `scheduled_trigger_fires` table logs fires but no "why did X fire at time T but not Y" debugger.
9. **Alerting on failed scheduled runs** — observability lands logs only; alert channels are post-launch.
10. **Cross-workspace schedule aggregation** — platform-admin view of all schedules across all orgs. Post-launch ops tooling.

---

## §10 Dependencies + containment

### §10.1 Dependencies

- **Depends on (shipped):**
  - SLICE 2c durable workflow runtime (workflow_runs, workflow_waits, workflow-tick)
  - AgentSpec / TriggerSchema (current event-only) — this slice extends the schema
  - CRON_SECRET env var + Vercel cron auth pattern
  - Logging infrastructure (logEvent)
- **Independent of:**
  - SLICE 1 subscription primitive — no interaction
  - SLICE 3 state-access step types — schedule triggers don't read/write state
  - SLICE 4 UI layer — no customer-facing surface in v1 (observability lands on existing /agents/runs admin page)

### §10.2 Containment

- **Zero changes to** `lib/agents/types.ts` (if types live elsewhere) — TriggerSchema extension is additive via discriminated union; existing consumers narrowing with `if (trigger.type === "event")` still work
- **Zero changes to** `SeldonEvent` union
- **Zero changes to** subscription primitive
- **Zero changes to** scaffolding core (no BlockSpec field for agents; scheduled triggers live in AgentSpec, not BlockSpec)
- **Zero changes to** SLICE 4 composition patterns
- **Extended (not modified):**
  - `TriggerSchema` → discriminated union
  - `organizations` table → +timezone column
  - `workflow-tick` route handler → +scheduled dispatch
  - `/agents/runs` admin page → +schedule visibility

### §10.3 New runtime dependency

- `croner` (MIT, ~8KB, zero sub-deps, IANA tz support). Single dep addition. Alternative (`cron-parser` + `luxon`) has more surface area; recommend `croner`.

---

## §11 End-to-end flow continuity

### §11.1 Scaffolding integration

Scheduled triggers declared in AgentSpec don't currently route through BlockSpec. A scaffolded block doesn't produce schedule declarations. **Decision:** scheduled triggers remain an AgentSpec concept, not a BlockSpec concept, for v1. Builders who want a scheduled trigger:
1. Scaffold their block with the scaffolder (SLICE 2) for tools + events
2. Separately author an AgentSpec (or select an archetype) with `trigger.type: "schedule"`
3. The agent runs as a sibling to the block

If SLICE 6+ introduces a BlockSpec.agents field (for blocks that BUNDLE their agents), scheduled triggers follow naturally — they're just another trigger type in the already-persisted AgentSpec.

### §11.2 Test-mode integration (SLICE 8)

Workspace test mode (SLICE 8) will need to handle scheduled triggers:
- Option A: test-mode scheduled triggers fire normally but land in test-mode event log
- Option B: test-mode pauses all scheduled triggers
- Option C: test-mode accelerates time (fires "tomorrow's 9am" on demand)

SLICE 5 leaves this to SLICE 8's audit. Minor change needed: the dispatcher reads `organizations.test_mode_enabled` (shipped separately) + branches if present.

### §11.3 Observability integration

`/agents/runs` extension scope per G-5-6:
- Sidebar "Active schedules" — lists `scheduledTriggers` where `enabled = true`, sorted by `nextFireAt` ascending
- Each row shows: archetypeId, cron expr, timezone, next fire (rendered in admin user locale via client-side `Intl.DateTimeFormat`)
- Run rows that were schedule-triggered display a "fired via schedule" pill next to the timestamp
- No new route; no new DB query beyond the existing runs page + one extra fetch

### §11.4 Hash-preservation expectation

SLICE 5 adds one new archetype (daily-digest, for proof). This archetype has a NEW structural hash. The existing 3 archetypes (speed-to-lead / win-back / review-requester) are unchanged — their hashes preserve across SLICE 5 (confirming 21-in-a-row streak).

The new schedule archetype establishes a fourth baseline hash. Future slices that touch scheduling-adjacent code must preserve BOTH the 3 existing hashes AND the new 4th.

---

## §12 Risk register + mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Vercel cron cold-start adds 1-2s jitter to fire times | High | Low | Document; 1-2s jitter is acceptable at minute granularity |
| IANA timezone whitelist drifts from Node's `Intl` list | Low | Medium | Use `Intl.supportedValuesOf("timeZone")` at validation time, not a static list |
| Existing workflow-tick starts missing timeouts when schedule dispatch adds latency | Medium | Medium | Measure tick duration; if >30s, move schedule dispatch to a sibling cron (e.g., `/api/cron/schedule-tick`) |
| Catchup "fire_all" in production causes notification storm after a multi-day outage | Low | High | Default to "skip" (G-5-2); "fire_all" requires explicit opt-in per trigger; document operator warning |
| Cron expression ambiguity across tools (Vercel cron vs croner) | Low | Medium | Pin exact 5-field POSIX syntax; reject non-standard shorthands at schema time |
| `scheduled_trigger_fires` UNIQUE conflict on clock skew | Low | Low | Use `fireTimeUtc` rounded to minute; clock-skew tolerance is baked in |
| `croner` dependency introduces dark-mode-like surprise | Low | Low | Review the dep at adoption; ~8KB + zero transitive deps keeps risk minimal |

No critical risks. All medium risks have concrete mitigations.

---

## §13 Calibration checkpoint + L-17 summary

**Multiplier classification for SLICE 5:**

| Bucket | Multiplier | Rationale |
|---|---|---|
| Pure composition (admin observability extension) | 0.94x | L-17 composition addendum |
| Sequential pipeline (dispatcher, concurrency) | 1.3-1.6x | L-17 original |
| State-machine render-integrated (catchup logic) | 1.7-2.0x | L-17 refined addendum; could reducer-extract to 1.0-1.3x but costs architectural clarity for the ~50 LOC win |
| Cross-ref Zod validator (TriggerSchema discriminated union + tz + cron) | 2.5-3.0x | L-17 1-datapoint observation from SLICE 4b; this is the 2nd datapoint |
| Schema / drizzle tables | 0.7-0.8x | near-boilerplate; low branching surface |
| Adapter (croner wrapper) | 1.5x | thin abstraction |
| Artifacts (harness + close-out) | not inflated | per L-17 artifact category |

**At SLICE 5 close, the cross-ref Zod validator rule moves from 1-datapoint to 2-datapoint support.** If the TriggerSchema cross-ref lands at 2.5-3.0x, the rule is empirically settled. If it lands materially lower, the rule recalibrates downward.

---

## §14 Recommended decisions summary

| Gate | Rec | Scope | Why |
|---|---|---|---|
| G-5-1 | C | +25 LOC | Both defaults + overrides handle single-workspace-tz and multi-tenant-agency cases |
| G-5-2 | C / default "skip" | as projected | Post-deploy safety; opt-in for catchup |
| G-5-3 | A | 0 | Matches existing tick cadence |
| G-5-4 | C / v1 ships skip+parallel | -100 | Queue policy deferred |
| G-5-5 | A | simpler | POSIX cron only; sugar deferred |
| G-5-6 | B | -200 | Extend existing admin page |
| **LOC** | **Accept 2,060** | **+260 over flag** | Every line defensible; cross-ref validator calibration payoff |

**Alternative if Max wants tighter:** Option B1 (drop daily-digest archetype template): saves ~160 LOC → lands at ~1,900, still over 1,800 flag but inside 30% buffer on 1,400 target.

---

## §15 Stopping point

Audit committed. Stopping per instructions; no code until Max resolves:
- The six gates G-5-1 through G-5-6
- The LOC question (accept 2,060 OR scope-cut OR split to 2 PRs)

**Expected discussion points:**
1. LOC overshoot — flag genuinely breached; §6.4's three-option framing is the decision.
2. `croner` dependency — small, tight, ESM+CJS; unlikely to be contentious but flag for explicit OK.
3. G-5-4 `"queue"` deferral — Max may want it in v1 if queue-based reliability is load-bearing.
4. G-5-7 (implicit) — no agents-table introduced; scheduled_triggers is the SLICE 5 persistence surface. Future slices decide if full agents-table warranted.

Awaiting gate + LOC resolution. No implementation until approved.
