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

### 7.6 Soul storage pattern (G-3-3 conditional resolution)

`packages/crm/src/db/schema/organizations.ts:67`:
```ts
soul: jsonb("soul").$type<OrgSoul | null>().default(null),
```

**CONFIRMED JSONB.** G-3-3 Option B is viable with **zero DB migration.** The `OrgSoul` interface (`packages/crm/src/lib/soul/types.ts:66`) is the TypeScript type of the JSONB blob; extending it with an additional metadata shape (an allowlist of agent-writable paths, or per-field `agent_writable` flags) is a type-level change only.

**Implementation note for C2:** the agent-writable declaration can live in one of two places:
- **Option B-1 — embedded in OrgSoul:** each top-level field carries an optional `agent_writable?: boolean`. Introspection at runtime via the existing JSONB read.
- **Option B-2 — separate allowlist config:** a static `const AGENT_WRITABLE_SOUL_PATHS = new Set<string>([...])` somewhere in `lib/workflow/state-access/` that the `write_state` dispatcher consults. No Soul mutation; new paths added via code change + PR review.

**Audit sub-recommendation for C2:** Option B-2 (static allowlist). Simpler to reason about, no runtime Soul inspection required on every write, easier to audit via grep. If a future slice wants dynamic per-workspace allowlists, the allowlist can move into OrgSoul at that point.

### 7.7 Current interpolation resolver capabilities (baseline for C4 extraction)

Verified by reading `packages/crm/src/lib/workflow/step-dispatchers/mcp-tool-call.ts:22-61`:

| Capability | Behavior | Notes |
|---|---|---|
| Syntax | `{{VAR}}` or `{{VAR.path.segments}}` — trimmed | Regex: `/\{\{\s*([^}]+?)\s*\}\}/g` |
| Variables (string aliases) | Resolved by name only | Sub-path access unsupported — `{{v.field}}` leaves raw token |
| Captures (object bindings) | Dotted-path walk via own-property check | Missing segment → raw token preserved (not an error) |
| Reserved namespaces (`trigger`, `contact`, `agent`, `workspace`) | Pass through as literal | Tool handler resolves; validator whitelists at synthesis time |
| `{{now}}` / date helpers | **NOT supported** | Would pass through via reserved-namespace fallback |
| Array indexing (`{{capture.items[0]}}`) | **NOT supported** | `"items[0]"` treated as literal segment name; misses |
| Type coercion | Result always `String(current)` | Numbers / booleans stringified |
| Object / array recursion | Yes — deep walk through objects + arrays | Strings resolved in place |

**C4 extraction invariant:** preserve exact current behavior, no new capabilities, no regressions. "Leaves unresolved on miss" semantics are load-bearing — downstream consumers (mcp-tool-call handlers, validator error messages) rely on the raw token passing through for debuggability.

**Implication for C1-C3 dispatchers:** the three new step types use the SAME resolver. `read_state.source`, `write_state.path`, `write_state.value`, `emit_event.data` all go through `resolveInterpolations(value, run)`. Same semantics, no surprises.

### 7.8 Zod validator surface

`packages/crm/src/lib/agents/validator.ts` has:
- `KnownStepSchema` (discriminated union on `type`) — where the three new schemas slot in
- `isWaitStep`, `isMcpToolCallStep`, `isConversationStep`, `isAwaitEventStep` guards — three new guards needed
- Per-step-type validators invoked from `validateStep()` — three new validators

Integration point is clean: each new step type adds one schema + one guard + one validator + one dispatcher.

---

## 8. Gate items — all APPROVED 2026-04-23

### G-3-1 — APPROVED: Soul-only MVP, `source` as Zod enum

**Resolution:** `read_state.source` is a Zod **enum** (not a free-form string) with a single allowed value `"soul"` for v1. Future sources (event_log, block_data) added as **new enum variants**, not by loosening the validation.

**Schema shape:**
```ts
const ReadStateSourceKind = z.enum(["soul"]); // v1 — extensible
type ReadStateStep = z.infer<...>; // source: "soul"; path: string; capture: string; next: string | null
```

**Why enum over string:** a free-form string would accept `source: "event_log"` even when event_log reads aren't implemented — the validator would pass, the dispatcher would fail at runtime with a confusing error. An enum rejects unknown sources at parse time (L-22 structural enforcement).

**Extensibility note:** adding `"event_log"` later is a one-line Zod change + one-line dispatcher branch. The enum keeps the shape honest without blocking future expansion.

### G-3-2 — APPROVED: Restricted-shape payload with registry cross-check

**Resolution:** `emit_event.data` fields validated against the declared SeldonEvent payload shape **at parse time**. Interpolation tokens allowed in values (they pass validation as strings), but the VALIDATOR confirms:
1. The event name exists in the registry.
2. Every `data.*` key the spec declares is a known field of that event.
3. Non-interpolated literal values type-match the field declaration (e.g., `rating: "5"` is rejected when the event declares `rating: number`; `rating: 5` passes).
4. Interpolated values (`{{capture.rating}}`) pass parse-time shape check (string slot); runtime type-checks at emit time against resolved value.

**Why restricted + registry:** consistency with the subscription primitive (SLICE 1 PR 1 M3 validator already cross-checks `filter` against event payload shape). Early error detection — catching "emit an event with field names that don't exist" at synthesis time beats debugging at runtime.

**Cost:** the event registry JSON must be loadable at validation time. Already is — `emit:event-registry` writes `packages/core/src/events/event-registry.json` (47 events as of SLICE 2 PR 2).

### G-3-3 — APPROVED (conditional resolved): Option B-2, static allowlist config

**Conditional resolution:** §7.6 verified Soul is JSONB-stored (`organizations.soul: jsonb("soul").$type<OrgSoul | null>`). Option B is feasible with **zero DB migration**. Proceeding with Option B.

**Sub-recommendation adopted:** Option B-2 — static allowlist config in `lib/workflow/state-access/allowlist.ts`:
```ts
export const AGENT_WRITABLE_SOUL_PATHS: ReadonlySet<string> = new Set([
  // v1 initial allowlist — every path below is a documented
  // agent-managed state field. New additions require PR review.
  "workspace.soul.onboarding_stage",
  "workspace.soul.last_contact_at",
  // ... more as the runtime-writable surface grows
]);
```

**`write_state` dispatcher behavior:**
- At parse time, the validator refuses paths not in the allowlist (`spec_malformed` error with a clear message).
- At runtime, the dispatcher double-checks (defense-in-depth) and fails loud if the validator path was somehow bypassed.

**Why static allowlist over OrgSoul-embedded flag:** simpler to reason about, no runtime Soul inspection on every write, easier to audit via grep. Dynamic per-workspace allowlists (OrgSoul-embedded) are a later-slice concern.

**v1 initial allowlist:** start EMPTY. Every path added in C2's allowlist requires explicit review. Current archetypes don't need `write_state` — retrofitting is out of slice per §11. The first real additions will come from future archetypes or NL-scaffolded workflows.

---

## 9. LOC estimate with L-17 citation

**Runtime-path count:** 3 independent dispatchers (read_state, write_state, emit_event). They don't interact at runtime — each receives its own step, executes, returns. No CAS-race surface, no pair-combination semantics. Classification: **single-path category**.

**Multiplier applied:** 1.3x (L-17 original) on production + dispatcher / validator test LOC. Sequential-pipeline (1.6x) and concurrent-multipath (2.0x) don't apply.

**Validation-harness LOC (new L-17 category anchored post-approval):** the 10-scenario synthesis comparison harness is **not** multiplied — it's an artifact category per the L-17 validation-harness addendum (2026-04-23). Each scenario artifact ~20 LOC; harness runner + metrics ~80 LOC.

### PR 1 table (production + tests + harness artifact)

| Component | Production | Test LOC (1.3x) | Artifact LOC |
|---|---|---|---|
| Three Zod schemas in validator.ts + guards | 120 | 60 | — |
| Three dispatchers (read / write / emit) | 240 | 220 | — |
| Shared interpolation helper (extract from mcp-tool-call) | 60 | 30 | — |
| SoulStore interface + in-memory impl + Drizzle impl | 150 | 80 | — |
| `write_state` allowlist config + loader | 40 | 30 | — |
| RuntimeContext extension + per-run dispatch wiring | 40 | 0 | — |
| Synthesis comparison runner + metrics aggregation | — | — | 80 |
| 10 scenario artifacts (~20 LOC each) | — | — | 200 |
| **Subtotal** | **650** | **420** | **280** |
| **PR 1 total** | | | **~1,350** |

Hmm — 1,350 after moving the harness out of test-LOC-times-1.3x. Let me re-check: the old math put harness at 280 (10×28 counted as test), artifact-recategorized drops it to 200 + 80 = **280 artifact**. Same total LOC. The re-categorization doesn't shrink the PR — it just labels the line accurately so the next audit's calibration feedback is correct.

**Revised reconciliation (correct math):** moving the harness to artifact-category is a LABELING change, not a LOC reduction. The PR lands at **~1,350 LOC regardless**. Two options remain:

**Path 1 — Accept the ~1,350 LOC projection:** 6% over the 1,275 trigger. Max's trigger was stated as "stop-and-reassess," not a hard ceiling. Surfacing the overrun at audit time (now) rather than mid-PR follows L-21 discipline. Flag explicitly to Max: "projected total is 1,350 — 6% over the stated trigger. Approve this overage up-front, or scope-cut."

**Path 2 — Scope-cut to 5 scenarios:** halves the scenario artifacts (200 → 100), saves 100 LOC. New total ~1,250 — inside the trigger. Cost: less diversity in the synthesis comparison; weaker evidence of the new step types' impact across varied inputs.

**Audit recommendation: Path 1.** The trigger is 6% off; scope-cutting the harness undercuts the synthesis-evaluation bar. The L-17 validation-harness addendum documented that these artifacts are load-bearing for future audits' calibration — trimming them is a false economy. Surfacing the overage at gate-resolution time is the discipline-correct path.

**Decision needed:** accept ~1,350 LOC projection (Path 1) or scope-cut to 5 scenarios (Path 2). The audit marked approval requires a call here before C1 starts.

### 9.1 Synthesis comparison harness — methodology spec

**Input set (10 scenarios):** diversified along three axes:

| Axis | Values exercised |
|---|---|
| State-access pattern | read-only / write-only / read-then-write / emit-without-state |
| Step count | small (3-step) / medium (6-step) / large (12-step) |
| Event emission count | zero / one / multi (3+) |

The 10 scenarios cover the Cartesian corners + middle:
1. read-only, small, zero
2. write-only, small, one
3. read-then-write, medium, zero
4. emit-without-state, small, one
5. read-only, medium, one
6. write-only, medium, multi
7. read-then-write, large, one
8. emit-without-state, medium, multi
9. read-then-write, small, multi
10. combined (read + write + emit), large, multi

**Each scenario ships as a fixture:**
```ts
// tests/harness/scenarios/<NN>-<shortname>.ts
export const scenario: ComparisonScenario = {
  id: "07-read-then-write-large",
  description: "...",
  nlIntent: "...",
  stateAccessPatternExpected: "read-then-write",
  stepCountExpected: { min: 10, max: 14 },
};
```

**Correctness measurement (rigorous, gate-worthy):**
1. Both synthesis paths (baseline: mcp_tool_call-only; candidate: with new step types) produce specs that validate via `AgentSpecSchema.safeParse`.
2. Generated step types match the expected pattern:
   - baseline: 100% mcp_tool_call
   - candidate: scenario-expected distribution (e.g., "read-then-write, large" expects ≥1 `read_state` and ≥1 `write_state`)
3. Agent runs to completion in the test harness without dispatcher errors (uses in-memory SoulStore + mock ToolInvoker for baseline path).

**Readability measurement (structural, diagnostic):**
- Total step count per path.
- Number of semantically distinct step types used per path.
- Depth of nested conditions (count of `conversation.on_exit` branches + `await_event` chains).

**Output format:** per-scenario comparison (10 rows) + aggregate summary (avg step count Δ, type-distribution shift, correctness pass rate).

**Subjective readability:** noted in the close-out report but NOT a primary gate. The structural metrics are the gate-worthy signal.

**Gate-worthy outcomes (PR close criteria):**
- All 10 scenarios pass correctness on both paths.
- Candidate path's step-type distribution matches the expected pattern for ≥8 of 10 scenarios (allows 2 cases where Claude chooses to stick with mcp_tool_call for reasons the synthesis prompt can't anticipate).
- If <8 pass the distribution match, flag as "feature needs prompt-engineering iteration" but do NOT block PR — the readability evidence is enough even when adoption is uneven.

### 9.2 Containment

- Zero changes to `lib/agents/types.ts`.
- RuntimeContext gains one field (`soulStore`) — additive; existing dispatchers ignore it.
- Zero changes to SeldonEvent union (emit_event cross-checks against the existing registry).
- Zero changes to 7 core blocks.
- Zero changes to subscription primitive, scaffolding primitive, or any SLICE 1 / SLICE 2 code.
- Only additions to `lib/workflow/step-dispatchers/` + new `lib/workflow/state-access/` for the SoulStore abstraction + allowlist.

### 9.3 Stop-and-reassess trigger

**1,275 LOC per Max's original statement. With Path 1 accepted, the projection is 1,350 (~6% over). The trigger is formally exceeded at audit time rather than mid-PR — Max's approval of Path 1 is the audit-time reassessment.** Mid-PR, if actuals trend past ~1,400, stop and re-flag.

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

**APPROVED 2026-04-23.** All three gates resolved (§8) with refinements. Conditional on G-3-3 (Soul JSONB) confirmed in §7.6.

**Outstanding decision:** Path 1 (accept ~1,350 LOC projection, 6% over trigger) vs Path 2 (scope-cut comparison to 5 scenarios, ~1,250 LOC). Audit recommends Path 1; Max's sign-off on the path needed before C1 starts.

**PR 1 begins immediately after Path 1 / Path 2 call.** 6 mini-commits per §13.

**Stop after PR 1 green bar + push. Await Max approval for SLICE 4.**

---

## 15. Self-review changelog

**2026-04-23, pre-approval draft:**
- §7 verifies every audit claim (step dispatcher files + LOC; mcp_tool_call count by archetype + tool breakdown; runtime scope types; NextAction surface) by direct HEAD read.
- §9 surfaces a projected LOC overrun vs Max's stated 700-980 target. Two reconciliation paths offered. Audit recommends Path 1 — documented so the split is explicit before implementation.
- L-17 multiplier choice: 1.3x on both production + test LOC. Three dispatchers are parallel peers (single-path category per the three-level spectrum validated across SLICE 2).
- §3 keeps shape definitions narrow; richer discriminated-union alternatives surfaced as gate items rather than baked in.
- §11 excludes branch + streaming reads + cross-workspace + batching.

**2026-04-23, post-gate-resolution revision:**
- §7.6 added — Soul storage confirmed JSONB (`organizations.soul: jsonb(...).$type<OrgSoul|null>()`). G-3-3 Option B is viable without migration. Sub-recommendation for Option B-2 (static allowlist config) over B-1 (OrgSoul-embedded flag) — simpler to audit via grep.
- §7.7 added — current interpolation resolver behavior catalogued as baseline for C4 extraction. Preserves exact current behavior: variables no-path, captures dotted-walk, reserved-namespaces pass-through, no `{{now}}`, no array indexing, always-stringified. C1-C3 dispatchers use the same resolver semantics.
- §8 resolves all three gates with Max's refinements:
  - G-3-1: Zod enum (not string) with single allowed value `"soul"` for v1
  - G-3-2: registry cross-check at parse time; interpolated values type-checked at runtime against resolved values
  - G-3-3: Option B-2 (static allowlist config), empty v1 allowlist — archetypes added explicitly as they need write access
- §9 revised: moved the 10-case harness to artifact category per the new L-17 addendum (2026-04-23). Math corrected — re-categorization doesn't shrink LOC, just labels accurately. New projection: ~1,350 LOC (6% over the 1,275 trigger). Two paths: accept the overage at audit time (Path 1, recommended) or scope-cut (Path 2).
- §9.1 added — comparison harness methodology spec. 10 scenarios diversified across state-access pattern × step count × event count. Correctness metrics (gate-worthy) + readability metrics (structural, diagnostic).
- §13 PR structure updated to include the new allowlist config line item in C2's LOC.
- §14 stop-gate set to APPROVED; remaining decision is Path 1 vs Path 2 only.
