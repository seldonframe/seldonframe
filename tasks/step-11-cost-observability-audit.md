# SLICE 11 Audit — cost observability gaps

**Date:** 2026-04-25
**Predecessor:** SLICE 10 closed at main HEAD `0122710f` (PR #2 merged
+ Vercel-verified per L-27); 30-streak holds.
**Drafted by:** Claude Opus 4.7 against worktree branch
`claude/slice-11-cost-observability` at `0122710f`.

**Shape note:** SLICE 11 was originally drafted (pre-SLICE-9-fold) as
"three gate items: per-step tracking + aggregate dashboard + multi-provider."
Ground-truth research at HEAD reveals a more fundamental gap that
reframes the entire scope (see §2.1). The audit treats the original
gates as candidates but recommends a different priority ordering
based on launch impact.

---

## §1 Problem statement + strategic context

### 1.1 The cost-observability story SeldonFrame tells

SeldonFrame's economics pitch to SMB agency operators is:

> "BYO LLM keys. You see exactly what each workflow costs. No
> markup, no surprise bills. The dashboard shows you `$0.05` for the
> daily digest run, `$0.32` for the heat-advisory cohort send."

This is a category-differentiating claim. LangChain / CrewAI / n8n
operators have to instrument their own cost capture; SeldonFrame
ships it built-in. **For agency operators billing clients, this
visibility isn't optional — it's the operating model.**

SLICE 9 PR 2 shipped the foundational infrastructure (schema columns
+ pricing table + recorder helper + admin surfacing). The /agents/runs
admin view shows a "Cost" column today — but, per §2 below, it shows
em-dash for every row because nothing writes to those columns.

### 1.2 Why this matters for launch

A launch demo or evaluation that surfaces "$0" across every workflow
makes the cost-observability claim look hollow. The infrastructure
is correct; the wiring is missing. SLICE 11's mission is to **make
the cost numbers real** before launch.

### 1.3 SLICE 10's contribution to the cost story

SLICE 10 (request_approval) verified the **cost-attribution invariant**
across pause/resume boundaries — i.e., when a workflow pauses for
human approval (potentially for hours or days), cost recording
continues correctly when it resumes. This was an essential precondition
for any longer-running cost-bearing workflow. The invariant holds.

### 1.4 Relationship to the marketing economics section

Per Max's prompt, the marketing page apparently shows specific cost
numbers ($0.05 daily digest, $0.32 heat advisory). **Ground-truth
finding (§2.4):** these numbers are NOT in the running codebase —
they appear only in spec/marketing docs. They were either derived
manually from one-off probes OR are aspirational targets, not
empirically-measured running costs. SLICE 11 must close that gap:
once the recorder is wired, the dashboard can show real numbers
that match the marketing claim (or expose the marketing claim as
needing revision).

---

## §2 Ground-truth findings at HEAD

Verified by direct inspection at main HEAD `0122710f`. Seventeen
dimensions covered.

### §2.1 ⚠️ HEADLINE FINDING — recorder is shipped but uninstrumented

**`recordLlmUsage()` is defined and tested but NEVER called** from any
LLM invocation site in the codebase.

`grep -r "recordLlmUsage(" packages/crm/src` returns:
1. The definition in `lib/ai/workflow-cost-recorder.ts:34`
2. A reference in a comment in `db/schema/workflow-runs.ts:67`
3. The import in the test spec

**Zero call sites in production code.** Every LLM invocation in the
codebase (23 call sites across `lib/ai/`, `lib/brain*.ts`,
`lib/soul-*/`, `lib/conversation/`, `lib/openclaw/`,
`lib/puck/`, `lib/frameworks/`) calls `client.messages.create()`
without ever invoking the recorder.

**Implication:** the /agents/runs admin view's "Cost" column shows
em-dash for every row. The infrastructure works; the wiring is
absent.

### §2.2 LLM call site inventory (23 sites)

The 23 sites split into two categories:

**Workflow-context calls (0 sites):** None. No workflow step
dispatcher invokes an LLM today. SLICE 9 archetypes use only
`wait` / `mcp_tool_call` (to send SMS/email — non-LLM tools) /
`request_approval` / `await_event` / etc. **There is no
`llm_call` step type and no LLM-invoking `mcp_tool_call` tool.**

**Non-workflow calls (23 sites):**
- `lib/ai/engine.ts` (2) — customization tool orchestration
- `lib/ai/generate-block.ts` (6) — block generation (synthesis-time)
- `lib/ai/seldon-actions.ts` (1) — Seldon Session actions (chat-time)
- `lib/ai/soul-conversation.ts` (1) — Soul conversation (chat-time)
- `lib/brain-compiler.ts` (2) — Brain dream cycle (background)
- `lib/brain.ts` (1) — Brain reasoning (chat-time)
- `lib/conversation/runtime.ts` (1) — conversation dispatch
- `lib/frameworks/actions.ts` (1) — frameworks
- `lib/openclaw/vertical-packs.ts` (1) — pack generation
- `lib/puck/generate-with-claude.ts` (1) — Puck generation
- `lib/soul/generate.ts` (1) — Soul generation
- `lib/soul-compiler/anthropic.ts` (2) — Soul compiler
- `lib/soul-wiki/compile.ts` (2) — Soul wiki compilation
- `lib/soul-wiki/query.ts` (1) — Soul wiki query

These are **operator-incurred costs that are currently invisible** —
they don't have a `runId` (they're not workflow executions), so
the per-run aggregate model from SLICE 9 PR 2 doesn't naturally
apply. They need a per-org / per-feature attribution model.

### §2.3 workflow_runs schema (per-run aggregates) — ✅ SHIPPED

`packages/crm/src/db/schema/workflow-runs.ts` lines 65-77:

```typescript
totalTokensInput: integer("total_tokens_input").notNull().default(0),
totalTokensOutput: integer("total_tokens_output").notNull().default(0),
totalCostUsdEstimate: decimal("total_cost_usd_estimate", { precision: 10, scale: 4 })
  .notNull()
  .default("0"),
```

- **Granularity:** per-run aggregates only (no per-step columns)
- **Precision:** decimal(10, 4) = $0.0001 resolution
- **Defaults:** all 0 (existing rows + non-LLM runs read clean)
- **Migration:** `0026_workflow_runs_cost_observability.sql` (additive
  ALTER TABLE)

### §2.4 Pricing table — ✅ SHIPPED, ❌ Claude-only

`packages/crm/src/lib/ai/pricing.ts`:

```typescript
export const PRICING: Record<string, LlmPricing> = {
  "claude-opus-4-7":  { inputPerMTok: 15, outputPerMTok: 75 },
  "claude-opus-4-6":  { inputPerMTok: 15, outputPerMTok: 75 },
  "claude-sonnet-4-6": { inputPerMTok: 3,  outputPerMTok: 15 },
  "claude-haiku-4-5-20251001": { inputPerMTok: 1, outputPerMTok: 5 },
  "claude-haiku-4-5": { inputPerMTok: 1, outputPerMTok: 5 },
};
const FALLBACK_PRICING: LlmPricing = { inputPerMTok: 15, outputPerMTok: 75 };
```

- 5 Anthropic models covered
- Rates current as of 2026-04-25 per Anthropic published pricing
- **No multi-provider support** — pricing keys are Anthropic-only
- **Fallback is Opus** (most expensive) — conservative over-estimate
- **Update mechanism:** PR + deploy (no env var, no DB override, no
  runtime config)

### §2.5 recordLlmUsage helper — ✅ SHIPPED, no call sites

`packages/crm/src/lib/ai/workflow-cost-recorder.ts`:

```typescript
export async function recordLlmUsage(input: RecordLlmUsageInput): Promise<void> {
  // Early return on 0/NaN tokens
  // SQL `+= ` increment on workflow_runs cost columns
  // Log + swallow on DB error (L-22 pattern)
}
```

- Per-run aggregate write only (no per-step write target)
- SQL `+= ` increment — concurrent multi-step is acknowledged-
  as-acceptable for v1 (race-prone but bounded)
- Failure mode: NEVER throws. Missing usage data → no-op early
  return. DB errors → console.warn + swallow.

### §2.6 /agents/runs admin UI — ✅ SHIPPED, displays $0

Server: `app/(dashboard)/agents/runs/page.tsx` selects all
workflow_runs cost columns. Client: `runs-client.tsx` renders
"Cost" column in the table + "LLM cost" / "Tokens" rows in the
drawer. JSON endpoint: `app/api/v1/workflow-runs/route.ts` includes
the same fields.

Cost formatters: `lib/utils/format-llm-cost.ts`:
- `formatLlmCost(0)` → `"—"` (em-dash)
- `formatLlmCost(0.0001)` → `"$0.0001"`
- `formatLlmCost(1.23)` → `"$1.23"`

**Currently every row reads em-dash because cost columns are 0.**
Per-step breakdown: not surfaced anywhere.

### §2.7 workflow_event_log cost data — N/A by design

No cost columns. Event log is event-correctness infrastructure, not
cost tracking. ✅ Correct separation.

### §2.8 workflow_step_results cost data — ❌ none

`packages/crm/src/db/schema/workflow-step-results.ts`:

```typescript
{ id, runId, stepId, stepType, outcome, captureValue,
  errorMessage, durationMs, createdAt }
```

No per-step cost columns. The natural place to add them if per-step
granularity is in scope (G-11-1).

### §2.9 Brain cost integration — N/A by design ✅

Brain v2 doesn't read or expose cost data. Brain reasoning is
schema/state-driven, not cost-driven. Separation is correct.

### §2.10 HVAC "empirical" cost data — ❌ marketing only

The "$0.05 daily digest, $0.32 heat advisory" numbers from marketing
are **not in the running codebase**. Search for those numbers
returns nothing. They appear in spec/marketing docs as targets;
they were not measured from running workflows.

A few `tasks/phase-7-archetype-probes/*.report.md` files DO show
cost figures ($0.0507 daily-digest, $0.0585 appointment-confirm-sms)
— but these are **archetype-synthesis costs** (running Claude to
generate the archetype JSON during phase-7 probes), NOT workflow
execution costs. Different concern.

### §2.11 SLICE 10 approval pause/resume cost interaction — ✅ verified

The cost-attribution invariant test in
`tests/unit/slice-10-integration.spec.ts` documents the contract:
recorder is status-agnostic + time-agnostic; pause_approval action
carries no cost-related field; cost capture continues correctly
across pause/resume boundary.

**Verified by inspection:** runtime.ts `applyAction.pause_approval`
does not touch cost columns; resume path doesn't touch cost
columns; recorder operates purely on `runId` + `model` + `tokens`.

### §2.12 Multi-provider readiness — 🟡 partial

`recordLlmUsage` accepts `model: string` (provider-agnostic at the
function signature level). `getPricingForModel` looks up by string
key. **Bottleneck:** the PRICING table is Claude-only.

To support multi-provider:
- Extend PRICING with OpenAI / Gemini / etc. model IDs
- Optionally tag the model with a provider field for cleaner ops
  reporting
- No code changes needed in recorder or formatters

`lib/ai/client.ts` apparently supports `provider: "anthropic" |
"openai" | "platform"` resolution but I haven't verified this end-
to-end.

### §2.13 Migration numbering

Latest: `0027_workflow_approvals.sql` (SLICE 10 PR 1 C2).
Next available for SLICE 11: **`0028`**.

### §2.14 Test coverage

- `ai-pricing.spec.ts` — pricing table + fallback + cost computation
  (comprehensive)
- `format-llm-cost.spec.ts` — formatters (comprehensive)
- `ai-workflow-cost-recorder.spec.ts` — recorder contract +
  failure-swallow (adequate)
- `slice-10-integration.spec.ts` — cost-attribution invariant
  (validated)

**Gaps:**
- No per-step cost tests (no per-step infrastructure exists)
- No multi-provider tests (no multi-provider pricing exists)
- **No instrumentation tests** — no test verifies that any LLM
  call site actually calls `recordLlmUsage`. This is consistent
  with the headline finding: there's nothing to test instrumentation
  against because no instrumentation exists.

### §2.15 Cost data API access

- `GET /api/v1/workflow-runs` includes per-run cost in the snapshot
- No per-workspace aggregate endpoint
- No per-archetype rollup endpoint
- No cost export / CSV / API consumer surface

### §2.16 Pricing table staleness

Hardcoded source. PR + deploy required for rate changes. No env
var override, no DB cache. **High operational friction** if
Anthropic adjusts rates between releases.

### §2.17 Cost-related TODOs

`grep -ri "TODO\|FIXME" packages/crm/src --include="*.ts" | grep -i "cost\|token\|pricing\|llm"` → zero hits. Gaps documented in
inline comments (e.g., recorder concurrency note) but no
forgotten-work markers.

---

## §3 Gap analysis

Re-prioritized based on §2 ground-truth findings.

| Gap | Launch impact | Fix scope | Recommendation |
|---|---|---|---|
| **3.1 Recorder uninstrumented (HEADLINE)** | 🔴 launch-blocking — claim is "see your costs" but UI shows $0 everywhere | Medium — add an LLM step type + instrument all 23 existing call sites | **Ship in SLICE 11** |
| **3.2 Per-step cost tracking (G-11-1)** | 🟡 nice-to-have — useful for archetype debugging but per-run is the operator's primary lens | Small — add columns to workflow_step_results + recorder per-step variant | Defer unless §3.1 is small |
| **3.3 Aggregate cost dashboard (G-11-2)** | 🟡 nice-to-have — operator can sum the per-run numbers manually for v1 | Medium — new admin page + aggregation queries | Defer to v1.1 |
| **3.4 Multi-provider pricing (G-11-3)** | 🟢 launch-nice — Claude-only is fine for v1 (BYO defaults to Anthropic) | Small — extend PRICING table + provider tagging | Defer to v1.1 unless an OpenAI integration ships in SLICE 11 |
| **3.5 Pricing rate-update mechanism** | 🟡 operational — high friction if rates change between deploys | Medium — env override OR DB cache + sync job | Defer to v1.1 |
| **3.6 Per-org / non-workflow cost attribution** | 🟡 important — block generation + brain compilation + soul wiki are real spend operators can't see | Medium — separate per-org cost ledger; reuse pricing + recorder primitives | Defer; document as known-gap |
| **3.7 Cost alerts / budget caps (G-11-4)** | 🟢 post-launch | Large | Out of scope per Max's prompt |
| **3.8 Cost export / API (G-11-5)** | 🟢 post-launch | Small | Out of scope per Max's prompt |

**Reframe:** The original three gates (per-step / dashboard / multi-
provider) all assume the recorder is producing data. **Ground truth
is that nothing is producing data.** §3.1 is the launch-blocker;
the rest are extensions on top.

---

## §4 Schema extension (if needed)

### 4.1 Per-step cost (if §3.2 in scope)

Add to `workflow_step_results`:
```typescript
inputTokens: integer("input_tokens").notNull().default(0),
outputTokens: integer("output_tokens").notNull().default(0),
costUsdEstimate: decimal("cost_usd_estimate", { precision: 10, scale: 4 })
  .notNull().default("0"),
model: text("model"),  // e.g., "claude-sonnet-4-6"; null when step doesn't invoke LLM
```

Migration `0028_workflow_step_results_cost.sql` — additive ALTER
TABLE. Step results today rarely include captureValue for
non-LLM steps; cost columns default to 0 cleanly.

### 4.2 Multi-provider pricing (if §3.4 in scope)

Pricing table extension only — pure code change to
`packages/crm/src/lib/ai/pricing.ts`:

```typescript
export const PRICING: Record<string, LlmPricing> = {
  // ... existing Anthropic models
  // OpenAI (post-launch BYO support):
  "gpt-4o": { inputPerMTok: 2.5, outputPerMTok: 10 },
  "gpt-4o-mini": { inputPerMTok: 0.15, outputPerMTok: 0.6 },
  // etc.
};
```

Optional: provider tag on the row for ops reporting:
```typescript
export type LlmPricing = {
  inputPerMTok: number;
  outputPerMTok: number;
  provider: "anthropic" | "openai" | "google" | "...";  // new
};
```

No DB schema changes. No new tests beyond extending the pricing
spec.

### 4.3 Per-org cost ledger (if §3.6 in scope — recommended OUT)

Would add a new table:
```typescript
orgLlmUsageLog: pgTable("org_llm_usage_log", {
  id: uuid("id").primaryKey(),
  orgId: uuid("org_id").references(() => organizations.id),
  feature: text("feature").notNull(),  // "block_generation" | "brain_compile" | etc.
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull(),
  outputTokens: integer("output_tokens").notNull(),
  costUsdEstimate: decimal("cost_usd_estimate", { precision: 10, scale: 4 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

This is a much larger surface (new table + storage adapter + 23
instrumentation points). **Recommend OUT of SLICE 11** — document as
SLICE 12 candidate.

---

## §5 Runtime extension

### 5.1 New step type: `llm_call` — REQUIRED for §3.1

To activate the recorder, workflows need a step that invokes an LLM
with a `runId` in scope. New step type:

```typescript
const LlmCallStepSchema = z.strictObject({
  id: z.string().min(1),
  type: z.literal("llm_call"),
  model: z.string().min(1),  // e.g., "claude-sonnet-4-6"
  systemPrompt: z.string().min(1).optional(),
  userPrompt: z.string().min(1),  // supports {{interpolation}}
  maxTokens: z.number().int().positive().max(8192).default(4096),
  capture: z.string().min(1).optional(),  // captures response.content[0].text
  next: z.string().nullable(),
});
```

This is the **10th step type** (current count after SLICE 10: 9 —
wait / mcp_tool_call / conversation / await_event / read_state /
write_state / emit_event / branch / request_approval).

Dispatcher: `dispatchLlmCall(run, step, ctx)`:
1. Resolve interpolations in `userPrompt` + `systemPrompt`
2. Invoke `client.messages.create(...)`
3. Call `recordLlmUsage(runId, model, response.usage)`
4. Optionally bind capture
5. Return `advance` to `step.next`

### 5.2 Instrument existing LLM call sites — RECOMMENDED for §3.1

The 23 non-workflow LLM call sites also incur operator cost. Even
without per-org attribution (§3.6 deferred), at minimum we should:
1. Centralize the call pattern via a single `invokeClaudeWithLogging`
   wrapper that logs `{ feature, model, inputTokens, outputTokens, cost }`
   to a structured logger
2. Optional: surface per-feature aggregates in a basic admin diagnostic

This is **scope creep** for SLICE 11 and would push the projection
above the stop trigger. Recommend OUT of SLICE 11; document as
post-launch.

---

## §6 Admin UI extension

### 6.1 Per-step cost in run drawer (if §3.2 in scope)

The existing `runs-client.tsx` step trace section iterates step
results. Add cost info per step:

```tsx
<li>
  <Badge>{r.outcome}</Badge>
  <span className="font-mono">{r.stepId}</span>
  <span> · {r.stepType} · {r.durationMs}ms</span>
  {r.costUsdEstimate && Number(r.costUsdEstimate) > 0 ? (
    <span className="text-muted-foreground">
      · {formatLlmCost(r.costUsdEstimate)} ({r.model})
    </span>
  ) : null}
  ...
</li>
```

Minimal LOC — extends the existing list item. Apply 0.94x UI
composition multiplier.

### 6.2 Workspace-aggregate dashboard (if §3.3 in scope — recommend OUT)

A new `/agents/spend` page that aggregates workflow_runs cost over
time windows (today / this week / this month) + by archetype +
by user. **Larger surface (new page + new server queries +
visualization).** Recommend OUT of SLICE 11.

---

## §7 Gate items

Five gates, with recommendations + reasoning. Per Max's "ship now
vs defer" framing.

### G-11-1: Per-step token tracking

**Recommendation: SHIP** (as part of the §3.1 instrumentation path).

**Reasoning:** if we're adding an `llm_call` step type, attaching
cost to the per-step record is a small marginal cost (~30 LOC of
schema migration + ~15 LOC of dispatcher write + ~20 LOC of UI).
The infrastructure parallels per-run aggregates cleanly. Builders
debugging "why is this archetype expensive" need per-step
attribution, not just per-run totals.

**Tradeoff:** the SLICE 9 PR 2 design intentionally chose per-run
aggregates as v1. Adding per-step now bumps SLICE 11 LOC ~70-80
combined. Acceptable given the launch-blocking nature of §3.1
(if we're activating the recorder, do it well).

### G-11-2: Aggregate cost dashboard

**Recommendation: DEFER to v1.1.**

**Reasoning:** an operator can today open `/agents/runs`, see the
per-run cost column, and mentally sum it. With ~50 runs visible at
once, that's tractable. A dedicated dashboard becomes valuable when
operators have hundreds of runs to aggregate — i.e., after weeks of
production usage. Pre-launch, the per-run view is sufficient.

**Tradeoff:** evaluators on the marketing site might want to see a
"$X.XX spent across N workflows this week" dashboard at launch.
Mitigation: marketing copy can emphasize per-run transparency
without claiming aggregate views; v1.1 ships the dashboard once
real-world usage data justifies the design choices.

### G-11-3: Multi-LLM-provider pricing

**Recommendation: SHIP a minimal extension** (OpenAI gpt-4o family +
Gemini 2.5 family pricing entries).

**Reasoning:** SeldonFrame's BYO posture defaults to Anthropic, but
operators may bring OpenAI keys (some do as a matter of
preference). If they do, the recorder falls back to Opus rates
(over-estimate) — confusing in the dashboard. Adding 4-6 entries
to the PRICING table is ~25 LOC + a few tests. Trivial scope; closes
the most surprising operator-confusion edge case.

**Tradeoff:** rate accuracy depends on us tracking provider rate
changes. The PR + deploy update mechanism (§2.16) is already known
to be high-friction. Acceptable for v1 — an env-var override could
ship in v1.1 if it's a real problem.

### G-11-4: Cost alerts / budget limits

**Recommendation: OUT OF SCOPE per Max's prompt.**

### G-11-5: Cost data export / API

**Recommendation: OUT OF SCOPE per Max's prompt.**

### G-11-6: NEW — recorder instrumentation strategy

**Recommendation: SHIP via new `llm_call` step type only (workflow
context); document non-workflow LLM cost as known gap.**

**Reasoning:** instrumenting the 23 existing non-workflow call sites
requires either:
- (a) Threading orgId through 23 call sites + a new per-org cost
  ledger (large scope, see §3.6 OUT recommendation)
- (b) Centralizing all calls through a single wrapper (refactor risk
  + tests for each call site behavior)

Either path is too big for SLICE 11. The new `llm_call` step type
gives us a clean, instrumented path forward — future archetypes
that use LLM steps will produce real cost data automatically. The
non-workflow call sites remain unmeasured, and we document this as
a SLICE 12 candidate ("BYO LLM operator dashboard — non-workflow
spend visibility").

---

## §8 LOC projection (calibration applied)

Applying L-17 + addendum (combined-code) + addendum 2 (per-file
test estimation) + addendum 3 (test-LOC tier sub-categorization).

### 8.1 Per-file production estimates

| File | Est. prod LOC | Notes |
|---|---|---|
| `lib/agents/validator.ts` (extension) | ~80 | New `LlmCallStepSchema` + cross-ref validator + type guards + unsupported-type message update (10 known step types) |
| `lib/workflow/step-dispatchers/llm-call.ts` | ~120 | New dispatcher: interpolation + Claude SDK call + recordLlmUsage + capture + advance |
| `lib/workflow/runtime.ts` (extension) | ~25 | Dispatch switch entry + isLlmCallStep guard |
| `lib/workflow/types.ts` (extension) | ~5 | RuntimeContext field for `invokeClaude` (test injection) |
| `lib/ai/pricing.ts` (extension) | ~15 | OpenAI gpt-4o + Gemini 2.5 entries; provider-tag refinement |
| `db/schema/workflow-step-results.ts` (extension) | ~10 | 4 new columns: inputTokens, outputTokens, costUsdEstimate, model |
| `drizzle/0028_workflow_step_results_cost.sql` | ~15 | Additive ALTER TABLE |
| `lib/workflow/storage-drizzle.ts` (extension) | ~10 | Pass cost through appendStepResult |
| `lib/workflow/types.ts` StepResultInput (extension) | ~5 | Cost fields on StepResultInput |
| `app/(dashboard)/agents/runs/runs-client.tsx` (extension) | ~20 | Per-step cost display in step trace |
| `app/(dashboard)/agents/runs/page.tsx` + `app/api/v1/workflow-runs/route.ts` (extensions) | ~15 | Step result serializer extension |
| **Subtotal — production** | **~320 LOC** | |

### 8.2 Per-file test estimates (L-17 addendum 2 + 3)

Tier defaults:
- Unit-thin: ~10-12 LOC/test
- Unit-rich (SLICE 10 style): ~15-18 LOC/test
- Integration: ~22-28 LOC/test
- Edge-case: ~25-30 LOC/test

| Test file | Tier | Est. tests | Est. LOC |
|---|---|---|---|
| `llm-call-step-schema.spec.ts` | unit-rich | 15-20 | 240-340 |
| `dispatch-llm-call.spec.ts` | unit-rich | 10-14 | 160-240 |
| `ai-pricing.spec.ts` (extension) | unit-thin | 4-6 | 40-72 |
| `workflow-step-results-cost.spec.ts` | unit-rich | 6-8 | 95-140 |
| `slice-11-integration.spec.ts` | integration | 4-6 | 90-170 |
| **Subtotal — tests** | | **39-54** | **~625-960** |

### 8.3 Combined projection

| Path | Combined LOC |
|---|---|
| **Production:** ~320 | |
| **Tests (low):** ~625 | **~945 combined** |
| **Tests (mid):** ~790 | **~1,110 combined** |
| **Tests (high):** ~960 | **~1,280 combined** |

**Per Max's PR budget:**
- Expected: 400-800 combined code
- Stop-and-reassess trigger: ~1,040 (30% over upper)
- **Audit-time flag:** projection 945-1,280 likely exceeds 800
  upper bound, brushes or exceeds the 1,040 stop trigger.

**Decision options:**

1. **Ship full scope (instrument llm_call step + per-step costs +
   multi-provider pricing).** Projected 945-1,280 combined. ~14-23%
   over upper, ~9-23% over stop trigger.
2. **Drop G-11-1 (per-step costs).** Saves ~95-140 test + ~50 prod
   ~= 145-190 LOC. New range: ~755-1,090 combined. Brushes the
   stop trigger.
3. **Ship llm_call step + recorder integration only; defer G-11-1
   AND G-11-3 to v1.1.** Saves ~140 prod + ~280 test = ~420 LOC.
   New range: ~525-860 combined. Comfortably mid-band.

**Recommended: Option 3 (minimal viable instrumentation).**

Reasoning: the headline launch-blocker is "recorder shows $0 because
nothing calls it." Option 3 fixes that with the smallest possible
surface: ship the `llm_call` step type, wire it to call the
existing recorder, and confirm via integration test that running an
archetype with an `llm_call` step produces non-zero cost in the
admin view. **Per-step cost tracking (G-11-1) and multi-provider
pricing (G-11-3) become incremental wins in v1.1.**

This brings the audit recommendation to a clean v1 launch posture
without overrunning budget.

---

## §9 Proposed PR structure

**Single PR.** Projected 525-860 combined code (Option 3) sits well
within the 400-800 expected band. No need for a 2-PR split.

Mini-commit structure:

| # | Mini-commit | Est. combined |
|---|---|---|
| C0 | L-17 addendum 3 codification + PR baseline | doc only |
| C1 | LlmCallStepSchema + cross-ref validator + 10th step type | ~280 (80 prod + 200 test) |
| C2 | dispatchLlmCall + runtime wiring + recordLlmUsage integration | ~340 (155 prod + 185 test) |
| C3 | Integration test: running an llm_call step produces non-zero cost | ~120 (test only) |
| C4 | 18-probe regression + close-out | doc only |
| **Total** | | **~740 combined** |

Within the 400-800 expected band, comfortably under the 1,040 stop
trigger.

---

## §10 Dependencies

- Depends on SLICE 9 PR 2 cost observability shipping points (in main)
- Depends on SLICE 10 cost-attribution invariant verification (in main)
- Depends on `lib/ai/client.ts` for Claude SDK access (existing,
  pre-SLICE-9)
- Independent of SLICE 10 UI surfaces (approval drawer doesn't
  touch cost)
- Workspace test mode (SLICE 8): the new `llm_call` dispatcher can
  honor a "skip in test mode" config OR always invoke real Claude
  even in test mode (operator iterating on a workflow probably
  WANTS the real cost data — defer the decision to a runtime flag
  in v1.1)

---

## §11 Out of scope (explicit)

Per Max's prompt + audit recommendations:
- **Cost forecasting** ("at current rate, monthly cost will be $X")
- **Cost budgeting + alerts** ("alert me when monthly cost exceeds $Y")
- **Per-customer cost attribution** (cost charged back to workspace
  clients)
- **Cost optimization recommendations** ("use Haiku instead of Sonnet
  for this step to save 80%")
- **Cost data in customer-facing surfaces** (cost is operator-facing
  only)
- **Per-org / non-workflow cost ledger** (covers the 23 existing
  LLM call sites in `/lib/ai/`, `/lib/brain*`, `/lib/soul-*/`,
  etc. — out of scope; documented as SLICE 12 candidate)
- **Aggregate cost dashboard** (G-11-2; defer to v1.1 once usage
  data justifies design)
- **Per-step cost tracking** (G-11-1; defer per Option 3
  recommendation; revisit in v1.1)
- **Cost API export** (G-11-5)
- **DB-backed pricing table with rate-update job** (defer until
  Anthropic publishes a rate-change frequency we'd actually want
  to react to)

---

## §12 Vercel preview verification (per L-27)

Standard discipline applies. PR 1 close requires Vercel preview
observed green at HEAD by Max via direct external observation.

---

## §13 Test fixtures (per L-28 + retroactive addendum)

L-28 discipline applies:
- Magic-link tokens, API keys, etc. in test fixtures use
  `FAKE_TEST_*` / `_NOT_REAL_*` patterns
- The `llm_call` dispatcher tests use mock Claude responses
  (no real API calls); fixture model strings are real Anthropic
  IDs (debugging value > L-28 risk for non-credential strings)

L-28 addendum: format-pattern grep across the diff AND across the
codebase at PR boundary self-review.

---

## §14 Risk register

| Risk | Mitigation |
|---|---|
| **Pricing table staleness** — Anthropic adjusts rates; our hardcoded values become wrong | (a) Header comment notes the as-of date; (b) PR + deploy refresh; (c) v1.1 candidate: env-var override OR DB cache |
| **Token count accuracy** — Anthropic SDK returns `usage: {input_tokens, output_tokens}`; rely on this | Recorder defaults missing tokens to 0 (no false cost); test coverage already exists |
| **Cost display precision** — sub-penny costs round to display; aggregate may lose pennies | Cost stored at decimal(10,4) precision; sum-of-rounded vs round-of-sum is a UI concern; documented as v1 acceptable |
| **Concurrent multi-step LLM calls against same runId** — SQL `+= ` semantics race | Acknowledged in recorder comments as v1 acceptable; only one step is in-flight per workflow_run by current design |
| **Test mode + LLM call** — should LLM steps run in test mode? | Defer to v1.1 with a runtime flag; v1 default = always invoke real Claude (operator wants real cost data when iterating) |
| **Non-workflow LLM cost remains invisible** — operator doesn't see brain-compile / generate-block / etc. spend | Document as known gap + SLICE 12 candidate; v1 launch can disclose this transparently in marketing |
| **Marketing claim of "$0.05 daily digest, $0.32 heat advisory" is unverified** | Once recorder is wired, run the archetypes empirically + verify; if real numbers diverge from marketing, update marketing copy before launch |

---

## §15 Calibration framework status

Applied throughout this audit:

- **L-17 multipliers** — combined-code framing (addendum 1); per-file
  test estimation (addendum 2); test-LOC tier sub-categorization
  (addendum 3, codified in this audit's §8 + ready for SLICE 11 C0
  formalization in lessons.md)
- **L-22 structural enforcement** — N/A for SLICE 11 (no permissions
  or auth; LLM step is operator-authored, not customer-facing)
- **L-23** — N/A; no new global archetypes
- **L-26** — canonical structural-hash for any regression (will run
  at SLICE 11 close with the same 6-archetype baseline)
- **L-27** — Vercel preview verification mandatory
- **L-28 + retroactive addendum** — format-breaking test fixtures
  throughout

---

## §16 Stopping point

This audit is the C0 commit. Per L-21:
- No code commits until Max resolves G-11-1 through G-11-6
- Expect 1 revision round (smaller scope = fewer gates)
- Audit lives at `tasks/step-11-cost-observability-audit.md`

After Max's gate resolutions land, the audit is updated with the
chosen options + the implementation begins at C1 (schema). PR close
triggers L-27 verification + 18-probe regression to confirm the
30-streak still holds.

---

## §17 Headline summary for Max's gate-resolution decision

**The launch-blocking finding:** the cost recorder shipped in SLICE 9
PR 2 has zero call sites in production code. Every workflow run's
cost displays as `$0`. The marketing claim of "see your costs" is
currently unsupported by the running system.

**The recommended fix (Option 3 in §8.3):**
1. Ship the `llm_call` step type as the 10th step type
2. Dispatcher invokes Claude + calls `recordLlmUsage` with the
   response usage
3. Integration test verifies running an `llm_call`-containing
   archetype produces non-zero cost data in /agents/runs

**Estimated scope:** ~525-860 combined code (mid-band of the 400-800
budget). Single PR.

**Recommended deferrals (v1.1):**
- Per-step cost tracking (G-11-1) — adds ~145-190 LOC; nice but not
  launch-critical
- Multi-provider pricing (G-11-3) — adds ~50-75 LOC; useful for OpenAI
  BYO operators but Anthropic-default works for v1
- Per-org / non-workflow cost ledger — large scope; documented as
  SLICE 12 candidate

**Expected gates needing your call:**
- **G-11-1** (per-step) — recommend DEFER; ship if budget permits
- **G-11-2** (dashboard) — recommend DEFER to v1.1
- **G-11-3** (multi-provider) — recommend DEFER unless OpenAI BYO
  ships in SLICE 11
- **G-11-6 NEW** (recorder instrumentation strategy) — recommend
  ship `llm_call` step type as the minimal viable instrumentation
  path; document non-workflow LLM cost as SLICE 12 candidate

**One open question for your call:**
Does the marketing claim of "$0.05 daily digest, $0.32 heat advisory"
represent a hard constraint? If yes, SLICE 11 close should include
running the actual archetypes empirically + reconciling the numbers.
If no, marketing copy can be updated to reflect whatever the wired
recorder produces.
