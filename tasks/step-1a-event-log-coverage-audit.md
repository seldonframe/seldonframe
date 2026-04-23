# SLICE 1-a — workflow_event_log coverage: `orgId` threading audit

**Draft:** 2026-04-22
**Sprint:** Scope 3 rescope, SLICE 1-a (prerequisite to SLICE 1)
**Status:** AUDIT ONLY. No code until every gate item in §7 resolves.
**Inputs:** `tasks/step-subscription-audit.md` §15 + §15.4 (the coverage finding that surfaced this slice), `tasks/lessons.md` L-20 / L-22, 2c close-out summary.

---

## 1. Problem statement

### 1.1 What this slice exists to fix

2c PR 1 M4 extended `emitSeldonEvent(type, data, options?)` to write a `workflow_event_log` row when the caller passes `options.orgId`. The commit message documented call-site migration as carryover:

> "Call-site migration to pass orgId happens in PR 2 as the runtime
> needs each event persisted for wake-up scans to work. For PR 1
> M4, new code passes orgId; legacy code remains on the in-memory-
> only path."

2c PR 2 built the wake-up-scan in `bus.ts` (shipped in `5c26952f`) but did NOT migrate the 68 production `emitSeldonEvent(...)` sites. The migration was silently carried forward until SLICE 1's ground-truth audit surfaced it (L-22 pattern).

**Goal:** thread `orgId` through every production `emitSeldonEvent` call site so `workflow_event_log` receives 100% of emissions. This unblocks SLICE 1 subscriptions (which read from the log) AND promotes 2c's synchronous wake-up scan from effectively-dead code to live operation.

### 1.2 Current zero-write state (verified 2026-04-22)

From §15.4 of the SLICE 1 audit:

| Metric | Count |
|---|---|
| Total `emitSeldonEvent(...)` call sites (production code, excludes bus.ts + tests) | **68** |
| Sites passing `orgId` | **0** |
| Sites NOT passing `orgId` | **68** |
| Files affected | **23** |

The production `workflow_event_log` table has received zero writes since 2c shipped. The synchronous wake-up scan path in `bus.ts` (lines 80-99 after PR 2 M3) short-circuits on `if (!options?.orgId) return;` — it has never executed against a real event. The cron-tick timeout path remains live because `workflow_waits` rows are written directly by the runtime's `dispatchAwaitEvent` flow, independent of the bus.

### 1.3 Why this blocks SLICE 1

The subscription primitive reads from `workflow_event_log`. Subscriber discovery in the emit path requires the log write to land first. Without `orgId` threaded:

- Subscriptions wouldn't observe any emission in production.
- Every subscription handler would appear inert.
- The primitive would ship and fail silently — worse UX than today's listeners.ts because builders would have no way to debug "my handler didn't fire" without the coverage gap being visible.

SLICE 1's §15.4 added gate G-7 to resolve before PR 1 starts. G-7 approved 2026-04-22 on Option A (preparatory sub-slice) = this slice.

### 1.4 Side benefit: 2c's synchronous wake-up scan becomes live

`resumePendingWaitsForEventInContext` in `bus.ts` was tested against `InMemoryRuntimeStorage` (PR 2 M3's sync-resume tests pass 5/5 + PR 2 M4 Client Onboarding integration uses the same in-memory path). Neither test path exercises the production emit → log-write → wake-up-scan chain because all test contexts bypass the log-write entirely.

After SLICE 1-a closes:
- Events emitted via production call sites will persist.
- Pending `workflow_waits` rows whose events match will be claimed and resumed synchronously for the first time.
- Client Onboarding (3b scope — archetype retrofit) will advance through event-match paths in production, not just in tests.

Not a ship-criterion for this slice (no shipped archetype depends on it yet), but worth tracking as intended side effect.

---

## 2. Ground-truth findings at HEAD

Verified 2026-04-22 via AST-aware extractor that:
- Enumerates every `emitSeldonEvent(...)` call site (balanced-paren walk).
- Splits arguments at top-level commas.
- Checks whether a third argument references `orgId`.

Full enumeration committed in `tasks/step-subscription-audit.md` §15.4.

### 2.1 Category distribution

Per the extractor output + per-file orgId-availability scan:

| Category | Files | Site count | Definition |
|---|---|---|---|
| **A — orgId trivially in local scope** | 23 | 68 | `getOrgId()` call present OR orgId field on a record/param/input already used nearby |
| **B — requires threading through one boundary** | 0 | 0 | Helper function called from an orgId-carrying caller but signature doesn't currently accept orgId |
| **C — deeper threading or unavailable** | 0 | 0 | orgId not reachable without architectural change (e.g., emitted from a cron job with no per-workspace scope) |

**Empirical finding: 100% of sites are Category A.** Every file already loads or threads orgId near the emit site because the surrounding code mutates org-scoped state. Spot-checked 5 diverse call sites:
- `app/api/webhooks/resend/route.ts:123` — `emailRow.orgId` in scope (loaded at line ~90 for the DB update immediately above).
- `lib/conversation/runtime.ts:281` — `input.orgId` in scope (function parameter).
- `lib/bookings/api.ts:144` — `input.orgId` in scope (used 5 lines below in `dispatchWebhook`).
- `lib/crm/custom-objects.ts:1669` — `params.orgId` in scope (used one line above in `updateOrganizationSettings`).
- `lib/portal/auth.ts:165` — `org.id` in scope (loaded for the access-code lookup).

**Migration is uniformly mechanical.** No signature threading. No architectural changes. Adding a third argument `{ orgId }` to each call.

### 2.2 File-level enumeration

All 23 affected files:

| File | Emit site count | orgId source at each site |
|---|---|---|
| `app/api/v1/forms/submit/route.ts` | 2 | `getOrgId()` via auth helpers |
| `app/api/v1/landing/track-visit/route.ts` | 1 | `page.orgId` (DB lookup above emit) |
| `app/api/webhooks/resend/route.ts` | 4 | `emailRow.orgId` (DB lookup above emit) |
| `app/api/webhooks/stripe/connect/route.ts` | 9 | `paymentRow.orgId` / `invoiceRow.orgId` / `subscriptionRow.orgId` (per event's target record) |
| `app/api/webhooks/twilio/sms/route.ts` | 4 | `smsRow.orgId` / `suppression.orgId` |
| `lib/bookings/actions.ts` | 6 | `getOrgId()` |
| `lib/bookings/api.ts` | 3 | `input.orgId` |
| `lib/contacts/actions.ts` | 2 | `getOrgId()` + `orgId` parameter |
| `lib/conversation/runtime.ts` | 2 | `input.orgId` / `conversation.orgId` |
| `lib/crm/custom-objects.ts` | 2 | `params.orgId` |
| `lib/deals/actions.ts` | 1 | `getOrgId()` |
| `lib/emails/actions.ts` | 5 | `params.orgId` / `getOrgId()` |
| `lib/emails/api.ts` | 2 | `params.orgId` |
| `lib/forms/actions.ts` | 2 | `form.orgId` (DB lookup above emit) |
| `lib/landing/actions.ts` | 5 | `page.orgId` / `getOrgId()` / `org.id` |
| `lib/landing/api.ts` | 4 | `input.orgId` / `params.orgId` |
| `lib/payments/actions.ts` | 2 | `getOrgId()` |
| `lib/payments/api.ts` | 5 | `orgId` parameter on helpers |
| `lib/portal/actions.ts` | 2 | `contact.orgId` (via session) |
| `lib/portal/auth.ts` | 2 | `org.id` (from access-code row) |
| `lib/sms/api.ts` | 3 | `params.orgId` |
| **Total** | **68** | — |

(Note: individual counts tallied from the line-number output in §15.4; file-to-total matches.)

### 2.3 Verification of current behavior

- **In-memory dispatch works.** `bus.emit(type, data)` (the inner `InMemorySeldonEventBus.emit` call) fires for every emission regardless of `orgId` presence. `listeners.ts` handlers continue to fire from dashboard-rendered request paths as they have pre-2c.
- **Durable log never writes.** `workflow_event_log` row count is zero in every non-test environment since 2c shipped (inferred from 0/68 coverage; spot-check against production would confirm, not scoped to this audit).
- **Sync wake-up scan never fires.** `resumePendingWaitsForEventInContext` in `bus.ts` called only when `options.orgId` is truthy. Short-circuits on every production emission.
- **Cron timeout path is unaffected.** `workflow_waits` rows are inserted by `dispatchAwaitEvent` in the runtime; cron tick sweeps them on `timeoutAt <= now()` without needing event-log presence.

---

## 3. Migration strategy options

Three shapes considered. Recommendation at the end.

### 3.1 Option 1 — `orgId` as required parameter everywhere

Change `emitSeldonEvent(type, data, options?)` to `emitSeldonEvent(type, data, { orgId })`. Make `orgId` required. Every call site must pass it or fails TypeScript.

**Pros:**
- Compile-time guarantee: no site can skip orgId silently. L-22 pattern structurally prevented going forward.
- Cleanest invariant: every emission writes to the log.
- TypeScript does the migration audit for free — build fails until all 68 sites migrate.

**Cons:**
- Breaking change to the bus.ts API surface. Tests need updating.
- Harder to add "fire-and-forget system events" later (e.g., internal telemetry that doesn't belong in `workflow_event_log`). Would require a separate signature or escape hatch.

### 3.2 Option 2 — Optional with runtime assertion

Keep `options?: { orgId?: string }` as optional. Add a runtime assertion (or startup validation) that enumerates expected emitter paths and warns when any fire without `orgId`.

**Pros:**
- No breaking change. Existing tests keep working.
- Flexibility for future "non-durable" emitters.

**Cons:**
- Does not prevent regression. A new PR could add an emit site without orgId and land quietly. L-22 pattern recurs.
- Runtime assertion only fires when the code path executes — won't catch untested call sites until production.
- Observability debt: need a dashboard metric tracking "emissions without orgId" to notice coverage regressions.

### 3.3 Option 3 — Async-local context

Use Node's `AsyncLocalStorage` to carry an "ambient orgId" through request lifecycles. `emitSeldonEvent` reads `orgId` from the context if not explicitly passed.

**Pros:**
- Zero signature changes at call sites. Migration = add middleware that sets the context, done.
- Automatically handles transitively-emitted events (e.g., an emit triggered by a listener).

**Cons:**
- Async-local context is a hidden data dependency. Debugging "why is orgId missing here?" becomes harder than "what's the third argument to emit?".
- Adds a framework-level concern (middleware) where the 2c design deliberately stayed at the function-argument level.
- Webhook handlers (Stripe/Twilio/Resend) don't have a builder-mode auth context — they'd need to construct and enter a context explicitly anyway.
- Introduces a runtime dependency on Node's `AsyncLocalStorage` that the core events package (`@seldonframe/core`) doesn't have today. Architectural precedent break.

### 3.4 Recommendation: Option 1 — required parameter

**Recommended.** Rationale:
- L-22 was captured specifically because deferred work was invisible to the green bar. Option 1's compile-time check is the simplest structural prevention: the TypeScript compiler IS the green bar for "did you thread orgId?". No runtime assertion, no async-local context, no drift.
- All 68 sites are Category A — mechanical migration. Option 1's "breaking change" is a single-PR refactor, not a long migration horizon.
- Future non-durable emitters (if they materialize — speculative today) can use an explicit escape hatch: `emitSeldonEvent(type, data, { durable: false })`. Gate G-1a-1 locks the shape.
- Precedent: 2b.1 PR 1 made `ToolDefinition.description` required. Compile-time invariants scale better than runtime assertions.

Alternatives (2 + 3) remain viable if Max prefers softer enforcement; documented for lineage.

---

## 4. Per-site migration plan

All 68 sites are Category A. Migration is uniformly:

```diff
- await emitSeldonEvent("booking.created", { appointmentId, contactId });
+ await emitSeldonEvent("booking.created", { appointmentId, contactId }, { orgId });
```

Where `orgId` is already in local scope (§2.2 table lists the source per file).

### 4.1 Risk per category

- **23 files, 68 sites.** Per L-17 baseline: a three-arg call → three-arg call refactor is ~5-10 LOC per site (the call itself + unit-test updates per touched function). Estimate: 340-680 LOC of diff, mostly mechanical.
- **Typical per-site pattern:**
  1. Locate orgId in scope (grep per §2.2 column 3).
  2. Add third argument.
  3. Find any unit test that mocks `emitSeldonEvent` — update mock signature if needed.
- **Edge-case risk — webhook handlers:** Stripe/Twilio/Resend webhooks run unauthenticated (verified by signature). `orgId` comes from the record being updated. Sites that emit multiple events per handler invocation MUST thread the same orgId (can't re-derive). Spot-checked: `stripe/connect/route.ts` uses `paymentRow.orgId` / `invoiceRow.orgId` consistently per event; no mixed-orgId hazard.
- **Edge-case risk — runtime helpers (conversation, custom-objects):** `input.orgId` / `params.orgId` already named; callers supply it. Trivial.
- **Edge-case risk — `getOrgId()`-based sites:** called in dashboard requests. `getOrgId()` can return `null` if unauthenticated. Emission sites should already be gated by auth (e.g., `if (!orgId) redirect("/login")`); verify per site during implementation, not pre-emptively.

### 4.2 No untouched emit sites expected

Node-compiled greps cover `emitSeldonEvent` explicitly. Other entry points:
- Direct `bus.emit(...)` calls on the core event bus. Checked: `grep -rn "bus\.emit(" packages/` outside the core package and test fixtures returns zero results in production code. `listeners.ts` uses `bus.on`, not `bus.emit`. `cross-block-smoke.ts` uses test-only `bus.on`. Safe.
- `getSeldonEventBus().emit(...)` pattern. Checked: zero production call sites. Only `bus.ts` itself invokes `bus.emit` through the wrapper.

No hidden emit sites bypass the `emitSeldonEvent` wrapper. The enumeration is complete.

---

## 5. Test strategy

### 5.1 Unit tests per site

Each call site gets a focused unit test that:
- Invokes the surrounding function.
- Asserts `emitSeldonEvent` was called with the expected third argument `{ orgId: <expected> }`.

**Scope: 68 unit tests.** Per L-17, ~10-20 LOC per test. Estimate: 680-1,360 LOC of new tests.

To keep test LOC bounded, a helper `assertEmissionOrgId(module, functionName, expectedOrgId)` can factor the repetitive boilerplate. Recommend a per-file test spec rather than 68 individual spec files (one spec per file covers all its emit sites).

### 5.2 Integration end-to-end

Ship one integration test covering the full chain:
1. Trigger a real emit path (e.g., call `createBookingFromApi({ orgId })` with a minimal test fixture).
2. Verify a `workflow_event_log` row lands with `orgId` populated.
3. Simulate a pre-existing `workflow_waits` row matching that event.
4. Invoke `resumePendingWaitsForEventInContext` (the production code path) and verify the wait resumes.

**Covers:** the first time 2c's sync wake-up scan executes against a production-shaped emission. This test doesn't exist today.

### 5.3 Regression: no silent loss

Green bar additions:
- After all call sites migrated: a single smoke test that emits a representative event per event type and verifies each writes a `workflow_event_log` row. Catches any site accidentally dropped during review.
- Typecheck passes with `orgId` required (Option 1 enforces at compile time).

### 5.4 9-archetype regression probes

Per the rescope discipline, hash preservation must hold. Subscription work doesn't touch synthesis so no drift expected; this slice's work (purely runtime-side) should also preserve.

Trigger: 9 probes at slice close. Streak extends to **10-in-a-row** on approval.

---

## 6. Rollout plan

### 6.1 Single PR vs multi-PR options

**Option α — Single PR, all 23 files in one diff.**

- Pros: atomic; TypeScript enforces no orphan sites; single rollback unit; single green bar; single reviewer pass.
- Cons: ~680-1,360 LOC of test additions + ~340-680 LOC of site diffs = ~1,000-2,000 LOC total. Large but bounded.

**Option β — Multi-PR split by file category.**

Possible seams:
- By block (bookings / emails / sms / payments / etc.).
- By surface type (webhooks / server-actions / API routes).
- By rate-of-change (high-traffic files first).

- Pros: smaller individual PRs; easier per-PR review.
- Cons: TypeScript enforcement at Option 1 means the FIRST PR can't compile if `orgId` becomes required — every site must migrate atomically. Multi-PR only works if Option 2 (runtime assertion) is chosen AND a transitional phase allows partial coverage. Complicates the design. Recommend against.

### 6.2 Recommendation: Option α (single PR)

Single PR matches Option 1's compile-time enforcement pattern cleanly. Estimated size sits under L-17 stop-and-reassess threshold (1,040 LOC at 30% over 800). Mini-commits within the PR (one per file or per block) give bisect points.

Mini-commit seam: **per block (6 blocks, roughly even-sized diffs) + 1 infra mini-commit for the bus.ts signature change.** Seven mini-commits total inside the single PR. Each green-bar-verified before the next.

---

## 7. Gate items

Four gates. All need explicit approval before PR 1 of SLICE 1-a starts.

### G-1a-1 — Migration strategy

**Recommendation:** Option 1 (required parameter; TypeScript-enforced).

**Alternatives:**
- Option 2 (optional + runtime assertion)
- Option 3 (async-local context)

### G-1a-2 — Test coverage bar

**Recommendation:** unit test per call site + 1 end-to-end integration.

**Alternative:** sample-based (one test per file, not per site). Reduces test LOC by ~60% but loses per-site coverage invariants. Rejected unless Max prefers tighter test LOC budget.

### G-1a-3 — PR split

**Recommendation:** Option α (single PR with 7 mini-commits).

**Alternative:** multi-PR (rejected per §6.1 without softer enforcement).

### G-1a-4 — Observability scope

**Recommendation:** DEFER. Ship this slice without new metrics. Existing bus.ts `console.warn` at >50ms latency + `workflow_event_log` table-scan queries are sufficient for v1. A "writes per minute" metric or structured log entry ships in SLICE 1 PR 2 (subscription delivery observability) since that slice adds the admin surface where metrics would live.

**Alternative:** add a structured log entry per successful log write in this slice. Increases LOC by ~30 and adds log volume. Rejected unless Max prefers eager observability.

---

## 8. LOC estimate per L-17 calibration

| Component | Estimate |
|---|---|
| `emitSeldonEvent` signature change in `bus.ts` | ~15 LOC (type + implementation + existing test fix) |
| 68 call-site diffs across 23 files | ~340-680 LOC (5-10 LOC per site per L-17) |
| Unit tests (68 sites) | ~680-1,360 LOC (10-20 LOC per test) |
| 1 integration test (emit → log → wake-up) | ~100 LOC |
| Regression smoke (1 emit per event type) | ~60 LOC |
| **Total** | **~1,195-2,215 LOC** |

Recommendation at the midpoint: **~1,600 LOC**.

**Stop-and-reassess trigger:** 30% over upper bound = **~2,880 LOC**.

Per L-17 addendum, if the trigger fires: distinguish architectural vs horizontal-infrastructure overrun. Expected overrun profile is mechanical-work-scale (Option A, accept + calibrate) since no new test framework or infra is introduced.

---

## 9. Containment

- **Changes in `lib/events/bus.ts`:** signature change on `emitSeldonEvent` (Option 1) — breaking.
- **Changes in 23 call-site files:** third-argument addition at 68 locations.
- **Zero changes to** `lib/agents/types.ts`, `SeldonEvent` union, the 7 core block schemas, workflow runtime (`lib/workflow/*`), or validator (`lib/agents/validator.ts`). The primitive-containment principle proven 11 times across 2b.2 + 2c holds.
- **Zero changes to** BLOCK.md files (no schema changes, no `## Subscriptions` yet — that's SLICE 1 proper).

---

## 10. Green bar expectations

- `pnpm build` — passes.
- `pnpm typecheck` — 4 pre-existing junction errors allowed, zero new. Option 1's compile-time enforcement means if any call site is missed, typecheck fails — which is the feature.
- `pnpm test:unit` — baseline (317) + 68 new site-level tests + ~3 new integration/smoke tests = ~390 pass at slice close.
- `pnpm emit:blocks:check` — clean (no BLOCK.md changes).
- `pnpm emit:event-registry:check` — clean (no SeldonEvent changes).
- **Manual verification:** start the app locally, emit a test event (e.g., trigger a form submission), query `workflow_event_log` for the row. First time this works.
- **Vercel preview** — green. Drizzle migrations already on `0020`; this slice introduces no new migration.
- **9-archetype regression probes** — PASS. Hash preservation holds (subscription work doesn't touch synthesis).

---

## 11. Dependencies

- **Blocks SLICE 1.** Subscription primitive requires `workflow_event_log` to receive writes. Without SLICE 1-a, subscriptions ship into a no-op.
- **Unblocks 2c synchronous wake-up scan.** After this slice, event-match resumption fires in production for the first time.
- **Independent of SLICE 2** (block scaffolding — NL-driven block generation doesn't touch emissions).
- **Independent of SLICE 3** (state-access step types — runtime additions to AgentSpec).
- **Independent of SLICE 4** (UI composition — shadcn-based layer).
- **Independent of SLICE 5-7** (scheduled triggers / external-state branching / message triggers) — those add trigger variants, not emit sites.
- **Independent of SLICE 8** (workspace test mode — orthogonal concern).
- **Not required for SLICE 9** (worked example / composability validation), but the worked example's emit paths will benefit.

No ordering dependency with follow-ups (`tasks/follow-up-workflow-runs-e2e.md`, `tasks/follow-up-puck-config-consolidation.md` already closed).

---

## 12. Out of scope

- **Subscription declaration / delivery / admin surface** — SLICE 1 proper.
- **New dashboards for log-write metrics** — defer to SLICE 4 or on-demand post-launch.
- **Retroactive backfill** of `workflow_event_log` with historical events. There is no historical event source to backfill from; in-memory emissions pre-SLICE-1-a are not persisted anywhere. Going-forward coverage only.
- **Migration of `listeners.ts` to declarative subscriptions** — SLICE 1's opportunistic follow-up (not committed; flagged in SLICE 1 §12 of that audit as out of scope).
- **MCP tool server emissions.** The MCP server is a separate Node process (`skills/mcp-server/`). Its HTTP-to-CRM calls hit API routes that are already in the 23-file migration list. The MCP server itself does not emit events directly — verified: `grep -rn "emitSeldonEvent" skills/` returns zero matches.
- **Cross-workspace event visibility** — orgId-scoping is the point; no changes to isolation model.
- **A deferred-items registry format** (the L-22 mechanism's "deferred from prior slice" list). That's a tooling concern; this slice is the practical backfill, not the tooling for preventing recurrence. Recommend tackling in a separate process-tooling slice.

---

## 13. Stop-gate — audit pending review

Four gate items pending resolution:

| Item | Status | Recommendation |
|---|---|---|
| G-1a-1 — migration strategy | 🟡 Pending | Option 1 (required parameter) |
| G-1a-2 — test coverage bar | 🟡 Pending | per-site unit + 1 integration |
| G-1a-3 — PR split | 🟡 Pending | single PR, 7 mini-commits |
| G-1a-4 — observability scope in this slice | 🟡 Pending | defer metrics to SLICE 1 PR 2 |

All gates resolve in the same approval pass. PR 1 of SLICE 1-a kicks off only after every gate is approved or overridden AND this audit commits to main.

Expected review rounds per rescope discipline: 1-2. The audit ships to `claude/fervent-hermann-84055b` first; Max reviews, responds with gate decisions; audit revises if needed; audit commits; PR 1 starts.

---

## 14. Self-review changelog (2026-04-22)

- **L-16 / L-20 spot-checks performed against HEAD before locking claims:**
  - 68 emission sites verified via AST-aware extractor (§15 of SLICE 1 audit); re-enumerated here.
  - 5 diverse sites spot-checked for orgId-in-scope: resend webhook, conversation runtime, bookings api, custom-objects, portal auth. All Category A.
  - `grep -rn "bus\.emit(" packages/` returns zero production sites outside `bus.ts` wrapper — no hidden emit path.
  - `grep -rn "emitSeldonEvent" skills/` returns zero matches — MCP server doesn't emit directly; only hits API routes in the migration list.
  - 2c PR 1 M4 commit message (`543b3ceb`) quoted verbatim for the deferred-work claim.

- **Ambiguity flagged at §7 G-1a-1:** three migration strategies with recommendation. If Max prefers Option 2 (optional + runtime assertion), scope expands by ~150 LOC for the assertion machinery + observability surface. Option 3 (async-local context) adds a framework-level concern this audit discourages.

- **No scope creep.** Ambient-context alternatives and new dashboards deferred explicitly in §12.

- **L-22 applied by design.** This audit captures the specific deferred item from 2c PR 1 M4 and ships it as its own slice with its own definition of done. The pattern L-22 predicts — silent green bar at close when deferred work skips — structurally prevented going forward by Option 1's compile-time enforcement.

---

*Audit drafted: Claude Opus 4.7 (1M context). Awaiting Max's review — no code until G-1a-1 through G-1a-4 resolve.*
