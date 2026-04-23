# SLICE 3 — State-access step types in AgentSpec: audit

**Draft:** 2026-04-23
**Sprint:** Scope 3 rescope, SLICE 3 of 9 (primitive-completion)
**Status:** AUDIT ONLY. No code until every gate in §8 resolves.
**Inputs:** Scope 3 rescope message (2026-04-22), `tasks/step-2c-mid-flow-events-audit.md`, SLICE 1 + SLICE 2 audits + close-outs, `tasks/lessons.md` L-15 through L-22 + L-17 addenda.

---

## 1. Problem statement

### 1.1 Current state

All state access in shipped AgentSpec archetypes routes through `mcp_tool_call`. Verified 2026-04-23 at HEAD (see §7): 11 mcp_tool_call steps across the three shipped archetypes. Tools called:
- `send_email`, `send_sms`, `create_booking`, `create_coupon` — unambiguously "act in world" (outbound IO, external-service writes).
- `create_activity` (4 occurrences across the 3 archetypes) — ambiguous: writes a row to `activities`, which is CRM state. The step semantically is "update internal state" but it's modeled as a tool call because that's the only step type available.

No existing steps read state mid-flow (reads happen once at trigger via `variables`). No existing steps emit an event without a tool wrapper (events fire as tool side effects).

### 1.2 Why this matters — three distinct problems

**Semantic flattening.** AgentSpec JSON doesn't distinguish "act in world" from "update internal state" from "notify other handlers." Every state operation is dressed up as a tool call. A reader of the spec can't tell at a glance whether a step sends an email, stamps a row in `activities`, or signals the subscription primitive — they all look like `{type: "mcp_tool_call", tool: "something", args: {...}}`.

**Synthesis pressure to invent tools.** When Claude needs to write state mid-flow and no tool exists, it invents one. The tool-catalog validator catches the unknown-tool case at synthesis time, but the underlying issue is that the spec model forces state writes through a tool abstraction. If a workflow needs to flip `workspace.soul.onboarding_stage` from "qualified" to "scheduled," the only spec-level vocabulary is "call a tool." That tool has to exist OR be added — both costly when the actual operation is a one-line Soul write.

**Readability + audit gap.** Archetype authors + admins debugging runs can't scan a spec and identify pure state operations. Every state transition hides behind a `tool` string. Step trace at `/agents/runs/[id]` shows "tool call succeeded" without distinguishing a side-effect-heavy world action from a trivial state flip.

### 1.3 What this slice exists to ship

Three first-class step types that align AgentSpec with the atomic agent model:

- **`read_state`** — query Soul (and, per G-3-1, possibly event-log / block data), bind the result to capture or variable scope.
- **`write_state`** — write to a workspace-scoped path (Soul or theme) atomically.
- **`emit_event`** — fire a SeldonEvent without wrapping in a tool call.

Plus the three runtime dispatchers that execute them, plus a synthesis comparison test proving the new types produce more readable and equally correct specs vs the mcp_tool_call-only baseline.

### 1.4 Why NOT just add more tools

Every tool we add expands the synthesis context, increases prompt tokens, and introduces a synthesis target the validator has to keep in sync. State writes are a PLATFORM concept (every workspace has a Soul), not a block concept. Modeling them through the block tool surface couples platform-level operations to block-scoped catalogs — a categorical smell the three new step types fix by design.

---

## 2. Atomic decomposition

### 2.1 The 6-atom agent model

An agent, at any moment, is doing exactly one of six things:

| Atom | Meaning | Current step type(s) |
|---|---|---|
| **read** | Load state before deciding | (none — seeded at trigger only) |
| **decide** | Branch on predicate | `conversation.exit_when` (partial; full branch is 2e scope) |
| **execute** | Act in world (IO, external effect) | `mcp_tool_call` (send_email, create_booking) |
| **commit (write)** | Update internal state | `mcp_tool_call` (create_activity, etc. — misfit) |
| **wait** | Pause for time / event | `wait`, `await_event` |
| **next-action** | Advance to next step | implicit via `next` on every step |

Three of six atoms involve state directly: `read`, `commit`, and (less commonly) `execute` (when the external action also produces state visible within the run).

### 2.2 What this slice covers

Of the six: **read** and **commit** (write) get first-class step types. Plus **emit_event** which doesn't map cleanly to any atom — it's "publish" — but it sits alongside the state-access primitives because it's the other common "no tool call, just platform-level effect" operation.

### 2.3 What this slice does NOT cover

- **decide** → branch steps. Out-of-slice (2e scope per existing plan).
- **next-action** → implicit today; fine as-is.
- Cross-workspace reads / writes — out of v1.
- Streaming state subscriptions (reactive reads that fire on change). Out of scope per §11.

---

## 3. Three new step types

### 3.1 `read_state` step

**Purpose:** Load a value from workspace-scoped state and bind it into the run's scope. One-shot (not a subscription; streaming is out of scope §11).

**Minimal shape (Soul-only, G-3-1 Option A):**
```ts
type ReadStateStep = {
  id: string;
  type: "read_state";
  /** Dotted path starting with workspace.soul.* or workspace.theme.*. */
  source: string;
  /** Where to bind the result — mirrors mcp_tool_call's capture shape. */
  capture: string;
  next: string | null;
};
```

**Richer shape (multi-source, G-3-1 Option B):**
```ts
type ReadStateStep = {
  id: string;
  type: "read_state";
  source:
    | { kind: "soul"; path: string }
    | { kind: "event_log"; eventType: string; query: EventLogQuery }
    | { kind: "block_data"; block: string; entity: string; id: string };
  capture: string;
  next: string | null;
};
```

**Gate:** G-3-1.

### 3.2 `write_state` step

**Purpose:** Write a value to a workspace-scoped path. Atomic; failure rolls back at the DB level.

**Minimal shape:**
```ts
type WriteStateStep = {
  id: string;
  type: "write_state";
  /** Target path. Must be workspace.soul.* or workspace.theme.*. */
  path: string;
  /**
   * Value to write. Interpolation-capable: "{{capture.couponCode}}",
   * literals, numbers, booleans, small JSON objects.
   */
  value: unknown;
  next: string | null;
};
```

**Safety — open-by-default (G-3-3 Option A):** any `workspace.soul.*` / `workspace.theme.*` path is writable. Audit happens in step-trace.

**Safety — explicit agent-writable declaration (G-3-3 Option B):** Soul schema declares which paths are `agent_writable: true`. `write_state` refuses paths not on that list. Requires a schema-level change + migration path for existing Souls.

**Gate:** G-3-3.

### 3.3 `emit_event` step

**Purpose:** Fire a SeldonEvent without wrapping it in a tool call. Makes archetype intent ("signal other handlers") explicit; leverages SLICE 1's subscription primitive.

**Shape (full-interpolation, G-3-2 Option A):**
```ts
type EmitEventStep = {
  id: string;
  type: "emit_event";
  /** SeldonEvent type name (must be in registry). */
  event: string;
  /** Payload — each value may carry {{interpolation}}. */
  data: Record<string, unknown>;
  next: string | null;
};
```

**Shape (restricted-payload, G-3-2 Option B):** `data` fields must match the event's declared SeldonEvent data shape verbatim. Synthesis-time validator cross-checks against the event registry.

**Gate:** G-3-2.

---

## 4. Runtime implementation

### 4.1 Dispatcher pattern

Three new files in `packages/crm/src/lib/workflow/step-dispatchers/`:
- `read-state.ts` — `dispatchReadState(run, step, context) → NextAction`
- `write-state.ts` — `dispatchWriteState(run, step, context) → NextAction`
- `emit-event.ts` — `dispatchEmitEvent(run, step, context) → NextAction`

Mirror the existing pattern (`wait.ts`, `mcp-tool-call.ts`, `conversation.ts`, `await-event.ts`). Pure (run, step, context) → NextAction. No direct DB writes — dispatchers return advancement intent; the engine applies it.

### 4.2 Shape of NextAction returns

- **`read_state` success** → `{kind: "advance", next, capture: { name: step.capture, value: <resolved> }}`. Same shape as mcp_tool_call.
- **`write_state` success** → `{kind: "advance", next}` (no capture; state write has no return-to-bind).
- **`emit_event` success** → `{kind: "advance", next}`.
- Any dispatcher failure → `{kind: "fail", reason: "..."}`.

No new NextAction variants needed. State operations ride on existing `advance`.

### 4.3 Soul read/write transport

The runtime needs a `SoulStore` abstraction:
```ts
interface SoulStore {
  readPath(orgId: string, path: string): Promise<unknown>;
  writePath(orgId: string, path: string, value: unknown): Promise<void>;
}
```

Production wraps `organizations.settings.soul` in Drizzle. Tests pass an in-memory impl.

Added to `RuntimeContext` as `soulStore`. Existing dispatchers ignore it; new ones consume it.

### 4.4 Emit-event transport

Already have `emitSeldonEvent` in `lib/events/bus.ts`. The `emit_event` dispatcher calls it directly (same as shipped cron + webhook handlers do today). No new abstraction needed.

### 4.5 Interpolation resolution

Reuse the resolver from `mcp-tool-call.ts:24` (`resolveInterpolations`). All three new dispatchers interpolate:
- `read_state.source` — resolves `{{contactId}}` etc. in the path.
- `write_state.path` — resolves the target path.
- `write_state.value` — walks + resolves nested objects.
- `emit_event.data` — walks + resolves.

Extract the resolver into a shared helper (`lib/workflow/step-dispatchers/_interpolate.ts`) so three dispatchers + the existing mcp-tool-call share one implementation. Zero behavioral change; file-level dedup.

---

## 5. Backward compatibility

- Every current `mcp_tool_call` with a state-writing tool (e.g., `create_activity`) keeps working byte-for-byte. The new step types are additive; Claude can adopt them when synthesis sees fit.
- No forced migration of existing archetypes. The Archetype Orchestrator test set (speed-to-lead, win-back, review-requester) continues to use `mcp_tool_call` for activities — validated by the §7 probe regression.
- Hash-preservation streak stays intact because archetypes on disk are unchanged.

**Opt-in adoption pattern:** when a new archetype or scaffolded block is authored post-SLICE-3, it may use the new step types freely. Retrofitting existing archetypes is a polish follow-up, not a SLICE 3 requirement.

---

## 6. Synthesis implications

### 6.1 Readability comparison test (mandatory)

PR 1 ships a comparison test that:
1. Takes 10 varied archetype descriptions (inputs chosen to exercise read + write + emit use cases).
2. Synthesizes each twice: once with the original mcp_tool_call-only surface, once with the new step types available.
3. Compares:
   - **Correctness** — both outputs validate via AgentSpecSchema.
   - **Readability** — step-type distribution (what % of steps are `mcp_tool_call` vs the three new types).
   - **Token cost** — input + output tokens for each run.
   - **Structural hash diff** — how much the skeleton changed.

Expected outcome:
- Correctness: both paths produce valid specs.
- Readability: 30-60% of state-touching steps switch from `mcp_tool_call` to the new types.
- Token cost: small delta either way (new step types add prompt surface but shorten output per state op).
- Structural hash: archetypes with heavy state touches have DIFFERENT hashes under the new types — that's expected and fine. The 14-in-a-row hash streak applies to the 3 ESTABLISHED archetypes whose skeletons don't change; SLICE 3's net-new synthesis benefits from the richer type set without disturbing the baseline probe.

### 6.2 Archetype Orchestrator probe impact

- 9-probe regression (speed-to-lead / win-back / review-requester × 3 runs each) must still pass with hash preservation. The archetype source files don't use the new step types, so their synthesis is unchanged. **Target: 15-in-a-row streak.**
- The 10-case synthesis comparison runs IN ADDITION to the probe regression. Different test, different purpose: the comparison measures whether the new types improve output on NEW workflows; the probe measures whether we broke existing ones.

---

## 7. Ground-truth verification at HEAD (L-16 / L-20)

Verified 2026-04-23 against `claude/fervent-hermann-84055b`:

### 7.1 Step dispatchers present today

`packages/crm/src/lib/workflow/step-dispatchers/`:
- `wait.ts` (22 LOC)
- `mcp-tool-call.ts` (90 LOC) — contains the interpolation resolver the new dispatchers will share
- `conversation.ts` (40 LOC) — stub
- `await-event.ts` (107 LOC) — the richest existing dispatcher; reference for how new ones structure `pause_*` / `fail` returns

Total existing dispatcher LOC: 259. The three new dispatchers should land in a similar range (90-120 LOC each) per the §9 estimate.

### 7.2 mcp_tool_call usage in shipped archetypes

Counted via `grep -nE "mcp_tool_call" packages/crm/src/lib/agents/archetypes/*.ts`:

| Archetype | mcp_tool_call steps | Tools used |
|---|---|---|
| `review-requester.ts` | 3 | send_email, send_sms, create_activity |
| `speed-to-lead.ts` | 3 | create_booking, create_activity, send_email |
| `win-back.ts` | 5 | create_coupon, create_activity, send_email, send_sms, create_activity |
| **Total** | **11** | |

`create_activity` accounts for **4 of 11** (~36%) — the clear candidate for `write_state` or a Soul-level activity append. A prospective `emit_event` fits when downstream subscriptions replace tool-coupled notifications; not yet applicable in existing archetypes (no subscriptions reference these event types in shipped code).

### 7.3 Runtime scopes and storage shape

- `StoredRun.captureScope: Record<string, unknown>` — dotted-path walkable. The bindable target for `read_state.capture`.
- `StoredRun.variableScope: Record<string, unknown>` — string aliases. Not path-walkable. Less suitable as a read-state target.
- `workflow_event_log` is append-only; every `emitSeldonEvent` call writes there. The `emit_event` step dispatcher calls the same path.
- No existing runtime path writes to `organizations.settings.soul.*`. `write_state` is the first.

### 7.4 NextAction surface

`packages/crm/src/lib/workflow/types.ts:31`:
```ts
type NextAction =
  | { kind: "advance"; next: string | null; capture?: {...} }
  | { kind: "pause_event"; ... }
  | { kind: "pause_timer"; ... }
  | { kind: "fail"; reason: string };
```

All three new dispatchers use `advance` on success and `fail` on error. **No new NextAction variants needed.**

### 7.5 RuntimeContext extension

Current:
```ts
type RuntimeContext = {
  storage: RuntimeStorage;
  invokeTool: ToolInvoker;
  now: () => Date;
};
```

SLICE 3 adds a `soulStore: SoulStore` field. Existing dispatchers ignore it. Backward compatible — tests that construct a context with a dummy SoulStore can do so without touching existing suites.

### 7.6 Zod validator surface

`packages/crm/src/lib/agents/validator.ts` has:
- `KnownStepSchema` (discriminated union on `type`) — where the three new schemas slot in
- `isWaitStep`, `isMcpToolCallStep`, `isConversationStep`, `isAwaitEventStep` guards — three new guards needed
- Per-step-type validators invoked from `validateStep()` — three new validators

Integration point is clean: each new step type adds one schema + one guard + one validator + one dispatcher.

---

## 8. Gate items — OPEN

### G-3-1 — Multiple source types for `read_state`

**Option A (narrow, ship faster):** Soul-only. `source` is a string `workspace.soul.<key>` or `workspace.theme.<key>`. The 1-sprint MVP; event-log reads and block-data reads are follow-ups.

**Option B (richer, more scope):** Discriminated union over Soul / event_log / block_data from day one. Bigger schema, bigger synthesis prompt surface, but more use cases handled in one pass.

**Audit recommendation: Option A.** Soul reads cover the immediate gap ("read `workspace.soul.customer_fields` at step N and branch on it"). Event-log reads open a can of worms — "which events, over what window, aggregated how" is its own design problem. Scope-discipline + YAGNI argue for Soul-only.

**Decision needed:** A or B.

### G-3-2 — `emit_event` payload shape

**Option A (full-interpolation):** `data: Record<string, unknown>` with free-form values. Synthesis-time validator checks that referenced events exist in the registry; doesn't enforce payload shape match. Runtime interpolates + fires.

**Option B (restricted-payload):** `data` must match the event's declared SeldonEvent data shape field-for-field. Synthesis-time validator cross-checks against the event registry; any mismatch is a spec_malformed error.

**Audit recommendation: Option B.** Consistency with the subscription primitive (SLICE 1 already validates `filter` against event payload shape) + early error detection. Cost: the registry must be accessible at synthesis time (already is — `emit:event-registry` produces the JSON).

**Decision needed:** A or B.

### G-3-3 — `write_state` safety

**Option A (open-by-default):** any `workspace.soul.*` / `workspace.theme.*` path writable. Audit trail via step-trace + admin surface flags "unusual" writes post-hoc.

**Option B (explicit agent-writable declaration):** Soul schema adds `agent_writable: boolean` flag per top-level key. `write_state` refuses non-allowlisted paths at synthesis time. Requires Soul schema update + migration for existing workspaces.

**Audit recommendation: Option B if the Soul schema can take the additive field without migrations.** Check at PR kickoff — if Soul is stored as JSONB in `organizations.settings.soul`, no migration needed (just document new field). If Soul is typed via drizzle schemas with hard columns, Option B costs a migration and becomes scope-heavy. Default to Option A when in doubt; capture a follow-up for Option B's safety tightening.

**Decision needed:** A or B, with the Soul-storage-check as a clarifier.

---

## 9. LOC estimate with L-17 citation

**Runtime-path count:** 3 independent dispatchers (read_state, write_state, emit_event). They don't interact at runtime — each receives its own step, executes, returns. No CAS-race surface, no pair-combination semantics. Classification: **single-path category**.

**Multiplier applied:** 1.3x (L-17 original) on both production + test LOC. Sequential-pipeline (1.6x) and concurrent-multipath (2.0x) don't apply — these three dispatchers share an interpolation helper and a SoulStore abstraction, but runtime-wise they're parallel peers, not chained paths.

### PR 1 table (production + tests + scaffolded output + doc)

| Component | Production LOC | Test LOC (1.3x) |
|---|---|---|
| Three Zod schemas in validator.ts + guards | 120 | 60 |
| Three dispatchers (read / write / emit) | 240 | 220 |
| Shared interpolation helper (extract from mcp-tool-call) | 60 | 30 |
| SoulStore interface + in-memory impl + Drizzle impl | 150 | 80 |
| RuntimeContext extension + per-run dispatch wiring | 40 | 0 |
| Synthesis comparison test harness | 0 | 280 (10 cases × ~28 LOC/case) |
| **Subtotal** | **610** | **670** |
| **PR 1 total** | | **~1,280** |

L-17 artifact-category line items (separate per post-SLICE-2 refinement):
- SKILL.md changes: none (no new user-facing skill).
- Example artifacts: none for PR 1.
- Builder-facing doc: none for PR 1 (runtime concern; no new authoring surface that needs SKILL documentation).

**Slice total:** ~1,280 LOC.
**Max-stated target:** 700-980 LOC.
**Max-stated trigger:** 1,275 LOC.

**GAP.** The production estimate hits the 500-700 production Max stated (610), but tests project higher (670 vs 200-280). The delta is the 10-case synthesis comparison harness (~280 LOC) — not a per-dispatcher test, a stand-alone comparison rig. Two paths to reconcile:

**Path 1:** The comparison harness is a test-category artifact closer to a smoke-test artifact (per L-17 addendum). Estimate it as artifact-category (50-400 LOC), not raw test-LOC × 1.3x. With harness at ~200 LOC (the lower end of the artifact range), test-LOC drops to ~470, PR total ~1,080 — inside the 1,275 trigger.

**Path 2:** The 10-case comparison is scope-cut to 5 cases (half the diversity), harness lands ~140 LOC, test-LOC ~410, PR total ~1,020 — inside both Max's target AND trigger.

**Audit recommendation:** proceed with Path 1 — full 10-case comparison with the harness counted as an artifact (~200 LOC) rather than unit-test-multiplier-inflated (~280). PR projected at ~1,080 LOC. Cite this at audit approval so the multiplier-vs-artifact split is explicit pre-implementation.

**Stop-and-reassess trigger:** 1,275 LOC per Max. Above 1,275, stop + re-flag.

---

## 10. Dependencies

- **2c runtime (step dispatcher pattern)** — hard dependency. The three new dispatchers slot into the existing pattern (`dispatch<X>(run, step, context) → NextAction`).
- **Composition contract v2 (Soul field types)** — soft dependency. G-3-3 Option B leans on Soul-field typing to know which paths are agent-writable. Option A has no dependency.
- **Event registry codegen (`pnpm emit:event-registry`)** — soft dependency. G-3-2 Option B needs the registry at synthesis time to cross-check payload shapes. Already exists (SLICE 1 relied on it).
- **Independent of SLICE 1 subscription primitive.** Subscriptions CONSUME events; emit_event produces them. The two compose naturally but neither blocks the other.
- **Independent of SLICE 2 scaffolding.** Scaffolded blocks don't gain new step types from SLICE 3 (step types live in archetypes / AgentSpec, not block-tools).

---

## 11. Out of scope

- **Persistent / streaming queries (reactive reads).** "Call me when `workspace.soul.business_type` changes." Future slice if demanded.
- **Optimistic state writes** (write-then-verify). Every write is synchronous + blocking in SLICE 3.
- **Batched state operations.** One path per step.
- **Cross-workspace reads / writes.** Violates workspace isolation model.
- **Retrofitting shipped archetypes.** Speed-to-lead / win-back / review-requester keep using `mcp_tool_call` for activity writes. A follow-up slice may migrate them.
- **Branch step (`decide` atom).** 2e scope.
- **`read_state` from event_log / block_data** — if G-3-1 lands Option A, these become follow-up scope.

---

## 12. Reference

### 12.1 Builds on 2c

- Step dispatcher pattern (every dispatcher returns a `NextAction`).
- `captureScope` + `variableScope` shapes.
- `workflow_event_log` append-only surface (consumed by `emit_event`).

### 12.2 Builds on SLICE 1

- `emitSeldonEvent` + the workflow_event_log write path. `emit_event` reuses this verbatim.
- `emit:event-registry` codegen output — referenced by G-3-2 Option B.

### 12.3 Informs SLICE 2 (block scaffolding)

Scaffolded blocks can declare tools that read/write state, but the generated workflow archetypes (if SLICE 2 ever ships an archetype scaffold, which it doesn't today) would use the new step types. Awareness note; no blocking dependency.

### 12.4 Informs future 2e (branch step)

`decide` atom / branch step will likely read state → predicate → branch. The `read_state` step shipped here is the precursor: once branch lands, workflows will commonly be "read_state → branch → write_state → next." Designing `read_state` + `write_state` to compose naturally with a future branch step is baked into the gate resolutions (both return `advance` so they chain cleanly into any successor step type).

---

## 13. PR structure

### Single PR (per Max's §12 directive)

Mini-commits (suggested):

| # | Scope | Est. LOC |
|---|---|---|
| C1 | `read_state` schema + guard + dispatcher + SoulStore interface + in-memory impl + tests | ~320 |
| C2 | `write_state` schema + guard + dispatcher + SoulStore write + tests | ~220 |
| C3 | `emit_event` schema + guard + dispatcher + tests | ~180 |
| C4 | Shared interpolation helper extraction + mcp-tool-call refactor to use it + tests | ~100 |
| C5 | Synthesis comparison harness + 10 varied descriptions + expected output analysis | ~200 |
| C6 | 9-probe regression + close-out report + push | ~80 |
| **Total** | | **~1,100** |

### Commit order rationale

- C1 lands `read_state` first because it exercises the SoulStore abstraction end-to-end. C2 and C3 ride on the abstraction once it exists.
- C4 (shared interpolation) lands AFTER C1-C3 to avoid premature refactor. Three consumers in hand → the shared helper's interface is informed.
- C5 (synthesis comparison) runs last before close-out because it needs all three step types available to exercise.

---

## 14. Stop-gate

**AUDIT ONLY.** No code until:
- G-3-1, G-3-2, G-3-3 all resolve (§8).
- Max confirms LOC projection + L-17 multiplier choice (§9).
- Soul-storage-shape clarification on G-3-3 (JSONB column = Option B feasible; typed columns = Option A default).
- Ground-truth §7 acknowledged.

Expected revision rounds: 1-2. Highest-leverage decision is G-3-3 (safety posture).

---

## 15. Self-review changelog (2026-04-23, pre-approval)

- §7 verifies every audit claim (step dispatcher files + LOC; mcp_tool_call count by archetype + tool breakdown; runtime scope types; NextAction surface) by direct HEAD read. L-20 compliance logged.
- §9 surfaces a projected LOC overrun vs Max's stated 700-980 target. Two reconciliation paths offered: (1) count the 10-case comparison harness as an artifact per the post-SLICE-2 L-17 refinement (~1,080 total), or (2) scope-cut to 5 cases (~1,020 total). Audit recommends Path 1 — documented so the split is explicit before implementation.
- L-17 multiplier choice: 1.3x on both production + test LOC. Three dispatchers are parallel peers with no runtime interaction (no CAS, no pipeline). Classified under the "single/two-path" category per the three-level spectrum validated across SLICE 2. Explicitly called out so the next audit's calibration feedback has a clear reference.
- §3 keeps shape definitions narrow; richer discriminated-union alternatives for `read_state` surfaced as G-3-1 Option B rather than baked in. Same pattern SLICE 1 + SLICE 2 used.
- §11 excludes branch + streaming reads + cross-workspace + batching. Each exclusion has a rationale; the branch exclusion points at 2e as the next natural follow-up.
