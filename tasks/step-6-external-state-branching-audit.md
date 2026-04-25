# SLICE 6 Audit — external-state branching

**Date:** 2026-04-24
**Predecessor:** SLICE 5 (scheduled triggers), closed in commit `ea923eea`.
**Drafted by:** Claude Opus 4.7 against HEAD (branch `claude/fervent-hermann-84055b`).

---

## §1 Problem statement + strategic context

SLICE 6 adds the ability for agents to BRANCH workflow execution based on EXTERNAL STATE fetched from HTTP APIs. Concrete examples:

- **Weather-aware booking:** agent about to confirm an outdoor photoshoot → branch on `GET api.weather.com/{location}` → if rain probability >60%, offer reschedule; else confirm.
- **Inventory-aware recommendations:** agent composing an abandoned-cart email → branch on `GET shopify.com/products/{id}` → if out-of-stock, skip that product.
- **VIP routing:** agent handling an intake form submission → branch on `GET crm.api/contacts/{id}?fields=tier` → if `tier == "VIP"`, route to priority onboarding; else standard flow.

**Relationship to existing primitives:**
- `trigger.type` (SLICE 5): when does the workflow START?
- `step.type: "await_event"` (shipped): pause until something HAPPENS.
- `step.type: "read_state"` (SLICE 3): read from workspace Soul.
- `step.type: "branch"` **(NEW — SLICE 6)**: fork on a condition.
- `branch.condition.type: "external_state"` **(NEW — SLICE 6)**: condition fetched from external HTTP.

**Strategic boundary:** SLICE 6 closes the "reactive to external reality" gap. Until now, agents react to Seldon-internal state (events, Soul, captured tool outputs). After SLICE 6, agents can factor in the outside world — weather, inventory, prices, third-party status — without requiring a block to pre-materialize that data as a SeldonEvent.

**Ground-truth critical finding (see §2.1):** the audit's original §1 framing implied "just add an `external_state` variant to the branch predicate." Ground-truth reveals the **branch step itself does not exist yet** — types.ts line 25 reserves it for "2e scope." SLICE 6 must ship the branch primitive AS WELL as the external_state variant. This materially changes scope; Max's 1,400-1,700 LOC projection is based on the original framing and needs audit-time recalibration (§6).

---

## §2 Ground-truth findings at HEAD

Verified by direct inspection at commit `ea923eea`. Six dimensions covered.

### §2.1 Current branch.condition schema — **SURPRISE: branch step not shipped**

**The audit's key unexpected finding.** Multiple source-code comments explicitly reserve branch for SLICE 6:

- [`packages/crm/src/lib/agents/validator.ts:25-26`](packages/crm/src/lib/agents/validator.ts:25):
  ```
  // Out of scope:
  //   - Branch step validation (2e scope)
  ```
- [`packages/crm/src/lib/agents/validator.ts:511-516`](packages/crm/src/lib/agents/validator.ts:511) — unsupported_step_type message:
  ```
  "... wait / mcp_tool_call / conversation / await_event /
   read_state / write_state / emit_event are the seven known types;
   branch ships with 2e"
  ```
- [`packages/crm/src/lib/agents/types.ts:20-27`](packages/crm/src/lib/agents/types.ts:20):
  ```
  "2e will add `external_state` when it ships. Keeping this as
   Predicate (not ExitPredicate) matches audit §9.3..."
  ```

**Seven shipped step types** (`validator.ts:284-292`): `wait`, `mcp_tool_call`, `conversation`, `await_event`, `read_state`, `write_state`, `emit_event`. Branch is the **eighth**.

**Runtime flow graph is strictly linear** today: every step has `next: string | null`. Branch introduces **multi-successor conditional forward pointers** — the first non-linear edge in the workflow runtime. This requires:

1. A new step-type Zod schema with `on_match_next` / `on_no_match_next` (shape TBD per G-6-8 below).
2. Extended graph-reference validator (currently validates `next` singular; must extend to multiple successor fields).
3. New `NextAction` variant in the runtime (`{ kind: "branch_taken", next: string }` + `{ kind: "branch_not_taken", next: string }`).
4. New dispatcher in `packages/crm/src/lib/workflow/step-dispatchers/` following the mcp_tool_call pattern.

### §2.2 Existing Predicate primitive — ready to extend

[`packages/crm/src/lib/agents/types.ts:30-73`](packages/crm/src/lib/agents/types.ts:30) defines `PredicateSchema` as a recursive Zod discriminated union with 5 shipped variants: `field_equals`, `field_contains`, `field_exists`, `event_emitted`, `all`/`any`. Adding `external_state` as a 6th variant is purely additive.

[`packages/crm/src/lib/workflow/predicate-eval.ts:45-76`](packages/crm/src/lib/workflow/predicate-eval.ts:45) implements the evaluator. Extending for external_state adds one branch to the switch.

**Good news for scope:** Predicate infrastructure reduces SLICE 6's net work vs a greenfield predicate system.

### §2.3 HTTP client infrastructure — **GAP: no timeout utility**

Twilio + Resend providers use global `fetch()` (Node 24.9+). Neither uses `AbortController` — requests can hang indefinitely. [`packages/crm/src/lib/sms/providers/twilio.ts:72-80`](packages/crm/src/lib/sms/providers/twilio.ts:72), [`packages/crm/src/lib/emails/providers/resend.ts:52-66`](packages/crm/src/lib/emails/providers/resend.ts:52).

**No shared HTTP utility** for timeout/retry/logging. SLICE 6 must build one (`fetchWithTimeout`, ~100 prod + ~150 tests = ~250 LOC per L-17 inline-budget rule).

### §2.4 Authentication / secrets — proven pattern, reusable

Two storage paths:
- [`workspace_secrets` table](packages/crm/src/db/schema/workspace-secrets.ts:6) — encrypted-at-rest, versioned, unique on `(workspaceId, scope, serviceName)`.
- [`organizations.integrations` JSONB](packages/crm/src/db/schema/organizations.ts:7) — Twilio/Resend/Stripe creds live here, encrypted with `v1.` prefix + `decryptValue()` helper.

[Twilio resolution pattern](packages/crm/src/lib/sms/providers/twilio.ts:19-43) is directly reusable: query org.integrations → decrypt → use. SLICE 6 reuses unchanged.

### §2.5 Rate limiting — shipped for API routes; NOT wired to workflow runtime

[`packages/crm/src/lib/utils/rate-limit.ts:54-100`](packages/crm/src/lib/utils/rate-limit.ts:54) ships `checkRateLimit(key, limit, windowMs)`:
- Upstash Redis-backed when `UPSTASH_REDIS_REST_URL` configured.
- In-memory fallback (under-counts on serverless per line 5).
- Used on API routes via [`lib/api/guard.ts:18`](packages/crm/src/lib/api/guard.ts:18).

**Not applied to workflow steps today.** SLICE 6 could extend it with a per-(orgId, externalEndpoint) limit, but v1 recommendation is "rely on external API's own limits" (documented risk; see §11).

### §2.6 Observability for external calls — **GAP: no dedicated table**

No `external_api_calls` / `workflow_http_requests` table. External HTTP calls are invisible to the DB unless explicitly captured via a step's `capture` binding.

Error surfacing: step dispatchers try/catch; failures land in `workflow_runs.result` JSONB. Admin surface at `/agents/runs` (pre-SLICE-5 + SLICE 5 C4 schedules section).

SLICE 6 G-6-6 choice: dedicated table vs log through `workflow_event_log`. Recommend the latter (minimize new schema).

---

## §3 Schema extension

### §3.1 New step type — BranchStepSchema

```typescript
const BranchStepSchema = z.object({
  id: z.string().min(1),
  type: z.literal("branch"),
  condition: ConditionSchema,              // discriminated union; see §3.2
  on_match_next: z.string().nullable(),    // which step to run if condition === true
  on_no_match_next: z.string().nullable(), // which step to run if condition === false
});
```

Two next-pointers enable a 2-way branch. Both can be `null` (terminal branches); either can reference the same step (no-op branch, useful for conditional side effects). The validator extends graph-reference-checking to both fields.

**Design alternative considered + rejected:** N-way switch (`match: Record<string, stepId>`). V1 ships 2-way only — builders needing N-way use chained branches. Avoids complicating the predicate-to-outcome mapping.

### §3.2 ConditionSchema — discriminated union

```typescript
const InternalPredicateConditionSchema = z.object({
  type: z.literal("predicate"),
  predicate: PredicateSchema,          // existing — 5 variants
});

const ExternalStateConditionSchema = z.object({
  type: z.literal("external_state"),
  http: HttpRequestConfigSchema,       // see §3.3
  response_path: z.string().min(1),    // dotted JSON path, e.g., "data.status"
  operator: z.enum(["equals", "not_equals", "contains", "gt", "lt", "gte", "lte", "exists", "truthy"]),
  expected: z.unknown().optional(),    // required for all ops except "exists" / "truthy"
});

const ConditionSchema = z.discriminatedUnion("type", [
  InternalPredicateConditionSchema,
  ExternalStateConditionSchema,
]);
```

The `type: "predicate"` branch keeps internal-state conditions available — SLICE 6 should NOT force every branch to hit external APIs. Graph validation: when `operator` requires a value (all except `exists`/`truthy`), `expected` must be present. SuperRefine cross-check.

### §3.3 HttpRequestConfigSchema

```typescript
const HttpRequestConfigSchema = z.object({
  url: z.string().url(),
  method: z.enum(["GET", "POST"]).default("GET"),
  headers: z.record(z.string(), z.string()).optional(),
  query: z.record(z.string(), z.string()).optional(),
  body: z.string().optional(),             // only for POST
  auth: AuthConfigSchema.optional(),       // see §3.4
  timeout_ms: z.number().int().min(1000).max(30000).default(5000),
})
  .refine((c) => c.method !== "POST" || c.body === undefined || c.body.length > 0, {
    message: "POST with empty body is likely a mistake",
  });
```

**Timeout bounds:** min 1s (sub-second has no point given minute-granularity workflow ticks); max 30s (Vercel serverless upper cap). Default 5s.

### §3.4 AuthConfigSchema — cross-ref to workspace_secrets

```typescript
const AuthConfigSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("none"),
  }),
  z.object({
    type: z.literal("bearer"),
    secret_name: z.string().min(1),   // cross-ref to workspace_secrets.serviceName
  }),
  z.object({
    type: z.literal("header"),
    header_name: z.string().min(1),
    secret_name: z.string().min(1),
  }),
]);
```

SuperRefine (cross-table cross-ref): at synthesis time, confirm `secret_name` exists in this workspace's `workspace_secrets`. Runtime fails the branch (not silently) if the secret is missing at dispatch time.

**Per G-6-5 recommendation:** no inline credentials. All auth goes through `workspace_secrets`.

### §3.5 Cross-ref count (for L-17 multiplier calibration)

| Cross-ref edge | Count | Test fan-out |
|---|---|---|
| `ConditionSchema` discriminator | 1 | ~4 tests (accept predicate / accept external_state / reject unknown / reject missing type) |
| `type: "predicate"` + existing PredicateSchema | 1 | ~3 tests (accept existing variants, reject malformed) |
| `url` .url() validator | 1 | ~3 tests (valid / invalid scheme / malformed) |
| `operator` enum | 1 | ~3 tests (all valid / reject unknown) |
| `expected` required when operator needs value (superRefine) | 1 | ~4 tests (required ops with/without expected + exists/truthy with/without) |
| `timeout_ms` bounds | 1 | ~3 tests (in-range / below min / above max) |
| `AuthConfigSchema` discriminator | 1 | ~3 tests |
| `secret_name` cross-ref to workspace_secrets | 1 | ~3 tests (resolvable / missing / wrong scope) |
| `HttpRequestConfig` POST-with-empty-body superRefine | 1 | ~2 tests |
| `on_match_next` / `on_no_match_next` graph validator | 1 | ~4 tests (resolvable / null / unknown id / circular guard) |

**10 cross-ref edges × ~3 tests avg = ~30 test cases minimum.** Per L-17 cross-ref Zod validator 2-datapoint rule, expect **2.5-3.0x multiplier** on prod LOC. Schema prod ~85 LOC × 2.75x = ~235 test LOC. §6 projection uses this.

---

## §4 Runtime implementation

### §4.1 `fetchWithTimeout` utility

```typescript
// packages/crm/src/lib/workflow/http.ts
export async function fetchWithTimeout(
  url: string,
  options: { method, headers, body },
  timeoutMs: number,
): Promise<{ ok: boolean; status: number; body: unknown; elapsedMs: number }>
```

AbortController-based. Returns structured result — never throws on HTTP errors (caller inspects `ok` + `status`); throws only on network/abort failures. JSON body parsing is caller's responsibility (response path lives in `ExternalStateConditionSchema.response_path`).

### §4.2 dispatchBranch

```typescript
// packages/crm/src/lib/workflow/step-dispatchers/branch.ts
export async function dispatchBranch(
  ctx: RuntimeContext,
  step: BranchStep,
  run: WorkflowRun,
): Promise<NextAction>
```

Flow:
1. Resolve interpolations in condition (URL, headers, query, body) using the run's scope (same `interpolate` helper used by other dispatchers).
2. Evaluate condition:
   - `type: "predicate"` → call existing `evaluatePredicate(predicate, data)`
   - `type: "external_state"` → `evaluateExternalState(config, runScope)`
3. Return `{ kind: "advance", next: result ? step.on_match_next : step.on_no_match_next }`.

On external-state fetch failure: per G-6-2 recommendation, default is **fail the branch** (`{ kind: "fail", reason: "external_state fetch failed: …" }`); `timeout_behavior: "false_on_timeout"` config converts timeout specifically into `result = false`.

### §4.3 evaluateExternalState

```typescript
// packages/crm/src/lib/workflow/external-state-evaluator.ts
export async function evaluateExternalState(
  config: ExternalStateCondition,
  scope: RunScope,
  opts: { db, now },
): Promise<{ matched: boolean; error?: string; responseStatus?: number; elapsedMs: number }>
```

Flow:
1. Resolve auth (lookup workspace_secrets by `secret_name` + scope = orgId + decrypt).
2. Build HTTP request (interpolate URL, headers, query, body).
3. Call `fetchWithTimeout(url, options, timeout_ms)`.
4. Parse response body (JSON.parse; fallback to string if not JSON).
5. Extract value at `response_path` (dotted descent).
6. Apply operator against `expected`.
7. Return match result + metadata.

Emits a `workflow.external_state.evaluated` event to `workflow_event_log` per G-6-6 recommendation (observability via existing table, not dedicated schema).

### §4.4 Error matrix (applies dispatcher-policy-matrix methodology)

Per L-17 refined addendum, the external-state-evaluator has a policy matrix:

| Dimension | Values |
|---|---|
| Error type | `network`, `timeout`, `http_4xx`, `http_5xx`, `parse_error`, `path_not_found`, `operator_type_mismatch` |
| Timeout behavior (§G-6-2) | `fail_branch` (default), `treat_as_false` |

**7 error types × 2 timeout behaviors × (success + failure) = 28 test cases.** Per L-17 dispatcher-policy-matrix rule: budget 200-300 LOC for the error matrix tests alone.

### §4.5 Multi-successor graph validation

Validator extension: for each BranchStep, verify `on_match_next` and `on_no_match_next` each either are `null` or reference a step `id` that exists in the spec. Reuses the existing step-reference walker; adds the multi-pointer edge-case (both pointers, not just `next`).

---

## §5 Gates (6 decisions)

### G-6-1 — Response parsing strategy

**Question:** how does the builder extract a value from the HTTP response?

- **A:** Dotted JSON path only (e.g., `"data.status"`, `"items[0].id"`).
- **B:** Full JSONPath or JMESPath syntax.
- **C:** Arbitrary JS expression (vm-sandboxed).

**Recommendation: A (dotted JSON path).** Three reasons:

1. **Covers ~95% of real use cases.** Weather: `"current.weather[0].main"`. Inventory: `"stock.available"`. VIP: `"tier"` or `"user.tier"`.
2. **No new dependency.** JSONPath/JMESPath requires a library (`jmespath` ~30KB; `jsonpath-plus` ~20KB). Dotted path is ~30 LOC inline. Arbitrary JS needs a VM sandbox (large dep + security surface).
3. **Future-proof.** If usage data demands JMESPath later, add a new `response_path_syntax` field that discriminates between "dotted" (default) and "jmespath" without breaking existing configs.

### G-6-2 — Timeout behavior

**Question:** what happens when the HTTP request times out?

- **A:** Fail the branch (run status → `failed`).
- **B:** Treat as condition false (branch proceeds to `on_no_match_next`).
- **C:** Configurable per branch (`timeout_behavior: "fail" | "false"`).

**Recommendation: C with default A.** Reasons:

1. Weather-check branches naturally want `"false" on timeout` ("assume no rain → proceed to confirm"). Stock-check branches naturally want `"fail"` on timeout ("don't fulfill unknown-inventory orders"). Single hard default is wrong for at least one common pattern.
2. Default `"fail"` is the safer fail-closed posture — builders opt into `"false"` explicitly for surfaces where "assume not" is cheaper than an incident.

Schema: add `timeout_behavior: z.enum(["fail", "false_on_timeout"]).default("fail")` to `ExternalStateConditionSchema`.

### G-6-3 — Caching strategy

**Question:** if the same external URL is hit multiple times in a run (or across concurrent runs), cache?

- **A:** No caching.
- **B:** Per-run cache (same URL → same response within one run).
- **C:** Time-windowed cache across runs (e.g., 5min TTL on URL hash).

**Recommendation: A (no caching in v1).** Three reasons:

1. External state is specifically "current state" — caching defeats the purpose for VIP tier changes, inventory flux, price updates.
2. Cache invalidation is hard. Time-windowed caches require deciding: 1 min? 5 min? 15 min? Per URL? Per org? These decisions are use-case-specific.
3. Scope-cut win. Caching adds ~160 LOC (per Max's §6 breakdown); deferral to a follow-up if usage data justifies is cheap.

**Risk:** high-volume agents hammering the same endpoint could exhaust external rate limits. Mitigation: document in §11; builders should chunk or debounce at the archetype level, not via dispatcher caching.

### G-6-4 — Retry policy

**Question:** on transient HTTP failure (5xx, 429, network), retry?

- **A:** No retry.
- **B:** Exponential backoff (default 3 retries with jitter).
- **C:** Configurable per branch.

**Recommendation: B with fixed defaults (3 retries, 200ms base, 2x backoff, ±50ms jitter).** Reasons:

1. Transient 5xx and 429 are the norm for production APIs. Single-attempt failure rate would frustrate real use.
2. Fixed defaults avoid a builder-configuration burden. Most builders don't know the right retry cadence for an arbitrary external API.
3. Adds ~120 LOC (under Max's §6 breakdown of ~150). Minimal scope cost for big reliability win.

**v2 deferral:** per-branch retry override (`retry_policy: "default" | "none" | "custom"`). Not in v1.

### G-6-5 — Authentication resolution

**Question:** how do secrets flow into external API calls?

- **A:** `workspace_secrets` table lookup by `secret_name` (builder registers secrets out-of-band).
- **B:** Per-trigger inline credential (stored with the branch config).
- **C:** Both.

**Recommendation: A only.** Reasons:

1. Inline credentials in AgentSpec = credentials in Git (or at least in the synthesis pipeline's memory), a security smell.
2. `workspace_secrets` infrastructure is shipped ([`workspace-secrets.ts`](packages/crm/src/db/schema/workspace-secrets.ts)). Reuse is free.
3. Forces a deliberate credential-registration step. Builders think about scope + rotation when registering.

Builder UX: workspace-secrets management UI is out of SLICE 6 scope (post-launch admin tooling). For v1, secrets are set via CLI or direct DB access — acceptable for the early-access audience.

### G-6-6 — Observability surface

**Question:** where do external-state HTTP calls surface for debugging?

- **A:** Inline via `workflow_event_log` (existing table).
- **B:** Dedicated `external_api_calls` table.
- **C:** Both.

**Recommendation: A.** Reasons:

1. `workflow_event_log` is the existing per-run trace surface. External-state calls ARE workflow events (cause a step to advance / fail). Fits the model.
2. Dedicated table adds migration + schema + indexes + admin query extension — ~200 LOC for deferred value. If usage data proves dedicated indexing useful, add later.
3. Structural consistency: `workflow.external_state.evaluated` event fits the existing `workflow.*` namespace (joins `workflow.wait_timed_out`, `workflow.scheduled_trigger.fired`).

Event payload: `{ runId, stepId, url, method, responseStatus, elapsedMs, matched, error? }`. Admin UI (`/agents/runs`) already renders event log per run.

---

## §6 LOC projection applying new methodology

**Ground-truth finding materially changes the scope vs Max's original projection.** The branch step doesn't exist yet — SLICE 6 ships both the primitive AND the external_state variant.

### §6.1 Component LOC estimates (applying L-17 refined addenda)

| Component | Prod | Tests | Multiplier | Category |
|---|---|---|---|---|
| BranchStepSchema + graph-ref validator | 55 | 130 | 2.36x | cross-ref Zod (10 edges — see §3.5) |
| ConditionSchema discriminated union | 40 | 110 | 2.75x | cross-ref Zod |
| ExternalStateConditionSchema + refine guards | 70 | 180 | 2.57x | cross-ref Zod (response_path validator + operator/expected superRefine) |
| HttpRequestConfigSchema + AuthConfigSchema | 50 | 130 | 2.60x | cross-ref Zod |
| `fetchWithTimeout` utility | 90 | 160 | 1.78x | architectural (sequential pipeline + error classification) — inline dep budget |
| `evaluateExternalState` runtime | 100 | 170 | 1.70x | sequential pipeline |
| Response path extractor (dotted) | 40 | 80 | 2.0x | parser — each path shape is a test |
| Predicate evaluator extension (existing file) | 20 | 40 | 2.0x | branch addition |
| Auth resolver (reuse secrets pattern) | 60 | 100 | 1.67x | adapter |
| dispatchBranch — the step dispatcher | 80 | 140 | 1.75x | sequential pipeline + 2 condition-type branches |
| Error matrix tests (7 errors × 2 timeout-behaviors × matched/not) | 0 | 240 | artifact | policy matrix per L-17 |
| Multi-successor graph validation extension | 30 | 80 | 2.67x | graph-walker + edge cases |
| **Subtotals — schema + runtime** | **635** | **1,560** | **2.46x** (aggregate) | |

### §6.2 Retry policy (G-6-4 B)

| Component | Prod | Tests |
|---|---|---|
| `retryWithBackoff` utility + integration into fetchWithTimeout | 60 | 100 |

### §6.3 Observability (G-6-6 A — workflow_event_log)

| Component | Prod | Tests |
|---|---|---|
| Emit `workflow.external_state.evaluated` from dispatcher | 25 | 50 |

### §6.4 Artifacts (not multiplier-inflated)

| Artifact | LOC |
|---|---|
| Archetype template (weather-aware booking or VIP-routing) + probe baseline | 200 |
| End-to-end integration test | 220 |
| Shallow-plus integration harness (+ workflow_event_log assertions) | 150 |
| SLICE 6 close-out report | 400 |
| **Subtotal — artifacts** | **970** |

### §6.5 SLICE 6 total projection

| Bucket | Prod | Tests |
|---|---|---|
| Schema + runtime (§6.1) | 635 | 1,560 |
| Retry (§6.2) | 60 | 100 |
| Observability (§6.3) | 25 | 50 |
| **Subtotals** | **720** | **1,710** |
| Artifacts | — | 970 |
| **Grand total** | | **~3,400 LOC** |

### §6.6 LOC verdict — **AUDIT-TIME FLAG REQUIRED**

Max's projection: 1,400-1,700 LOC. Stop-and-reassess trigger: ~2,210 (30% over 1,700 upper).

**My projection: ~3,400 LOC — 54% over the trigger, 100% over the upper projection.**

**Root cause:** Max's projection was based on the original framing ("add an `external_state` variant to branch.condition"). Ground-truth shows the branch step itself doesn't exist — so SLICE 6 ships:

1. The entire branch primitive (step schema + validator + runtime dispatcher + multi-successor graph — ~520 LOC) — NOT in Max's projection.
2. Full cross-ref Zod validator set with 10 edges at 2.5-3.0x multiplier — projected correctly in Max's §6 but scaled up by branch-primitive addition.
3. HTTP timeout utility (inline-dep-budget 200-400 LOC for the fetchWithTimeout + retry combo — ~350 LOC total).
4. Error matrix tests (7 error types × 2 timeout behaviors × 2 outcomes = ~240 test LOC per dispatcher-policy-matrix rule).

### §6.7 Three framings

**Option A: Accept 3,400 LOC.** Every line defensible against §3/§4/§5. Per L-17 audit-time overshoot addendum (§L-17 audit-time trigger overshoot): scope-cutting would defeat the slice's purpose (branch primitive + external_state + HTTP timeout + observability are all load-bearing for the shipped capability).

**Option B: Scope-cut to fit ≤2,200 LOC.** Most plausible cut: defer retry policy (-160 LOC), defer workflow_event_log emission (-75 LOC), simplify to one operator only (e.g., "equals") (-80 LOC), skip the error matrix exhaustive coverage (-120 LOC). Total savings: ~435 LOC. Lands ~2,965 — still above trigger. Further cuts (skip auth entirely; external_state calls only hit public unauthenticated APIs) would require dropping real capability. Not recommended.

**Option C: Split into 2 PRs.** Natural split:
- **PR 1 (~2,100 LOC):** Branch primitive + internal predicate condition + external_state core (schema + dispatcher + fetchWithTimeout + response path + auth resolver + error matrix minus retry).
- **PR 2 (~1,300 LOC):** Retry policy + workflow_event_log observability + archetype template + integration harness + SLICE 6 close-out.

**Recommendation: C (split).** Three reasons:

1. **PR 1 alone delivers a shipped capability.** With A's "timeout = fail, no retry" defaults, builders can author external_state branches that work; they just don't get retry resilience or pretty observability until PR 2. A 2-week-user-testing window between PRs would surface whether retry is actually load-bearing.

2. **PR 2 is mostly artifacts + polish.** Archetype + harness + close-out are ~770 artifact LOC; retry + observability are ~235 prod+test LOC. This is a close-out PR shape, matching SLICE 4a PR 3 and SLICE 5 PR 2.

3. **Calibration discipline.** PR 1's actual LOC becomes the third datapoint for the cross-ref Zod validator rule (after SLICE 4b 2.94x + SLICE 5 2.63x). If PR 1's schema commit lands in the 2.5-3.0x window, the rule moves from 2-datapoint to 3-datapoint settled. Testing the methodology works better across a 2-PR split than one big PR.

**Stop-trigger:** 30% over the recalibrated projection per PR:
- PR 1: 2,100 × 1.3 = ~2,730
- PR 2: 1,300 × 1.3 = ~1,690

---

## §7 Proposed PR split (recommendation: Option C)

### §7.1 PR 1 — Branch primitive + external_state core (~2,100 LOC)

Mini-commit structure:

- **C1:** BranchStepSchema + ConditionSchema discriminated union + graph-ref validator extension + tests (~265 LOC)
- **C2:** ExternalStateConditionSchema + HttpRequestConfigSchema + AuthConfigSchema + cross-ref validators + tests (~430 LOC — the cross-ref-heavy commit)
- **C3:** `fetchWithTimeout` utility + response path extractor + tests (~370 LOC)
- **C4:** `evaluateExternalState` + auth resolver + predicate evaluator extension + tests (~390 LOC)
- **C5:** `dispatchBranch` step dispatcher + error matrix tests (~460 LOC — the error-matrix-heavy commit)
- **C6:** 9-probe regression + PR 1 close summary (~150 LOC artifact)

### §7.2 PR 2 — Retry + observability + archetype + close-out (~1,300 LOC)

- **C1:** `retryWithBackoff` utility + integration into `fetchWithTimeout` + tests (~160 LOC)
- **C2:** `workflow.external_state.evaluated` event emission + admin surface tweaks (~75 LOC)
- **C3:** Archetype template (weather-aware booking) + probe baseline (~200 LOC + ~50 probe artifacts)
- **C4:** Shallow-plus integration harness (~150 LOC artifact)
- **C5:** End-to-end integration test (~220 LOC artifact)
- **C6:** 9-probe regression (4 archetypes × 3 runs = 12 probes) + SLICE 6 close-out (~400 LOC artifact)

---

## §8 Gates — summary of recommendations

| Gate | Recommendation | LOC impact |
|---|---|---|
| G-6-1 response parsing | **A** (dotted JSON path; JMESPath deferred) | -200 LOC vs JMESPath |
| G-6-2 timeout behavior | **C** with default A (fail) | +30 LOC for the enum |
| G-6-3 caching | **A** (none in v1) | -160 LOC |
| G-6-4 retry | **B** (exp backoff, fixed defaults) | +160 LOC (PR 2) |
| G-6-5 auth | **A only** (workspace_secrets; no inline creds) | -80 LOC + security win |
| G-6-6 observability | **A** (workflow_event_log inline) | -200 LOC vs dedicated table |

Additional design gate surfaced by ground-truth:

### G-6-7 — Multi-successor graph shape

**Question:** how does BranchStep encode its successors?

- **A:** Two fixed fields: `on_match_next: string | null`, `on_no_match_next: string | null` (2-way only)
- **B:** `successors: Record<outcome, stepId>` (N-way)

**Recommendation: A.** 2-way ships this slice; N-way is a future extension. Builders needing 3-way chain two branches.

### G-6-8 — Graph termination validation

**Question:** must every branch path eventually terminate (reach a `next: null` step)?

- **A:** Yes — validator walks all paths from root, requires each to reach `null` or form a `await_event` wait.
- **B:** No — accept cycles; runtime will detect at dispatch time if a run is in an infinite loop.

**Recommendation: A (static validation).** Same mental model as the existing step-reference walker; extension is straightforward.

---

## §9 Out of scope (explicit deferrals)

1. **UI for authoring external-state branches.** Builders declare in AgentSpec (source code or synthesis). Admin UI for branch editing is post-launch.
2. **WebSocket / SSE long-lived connections.** HTTP request-response only.
3. **GraphQL.** REST/JSON only for v1.
4. **Complex response transformations.** Dotted path only (G-6-1 A).
5. **Streaming responses.** Single request-response only.
6. **External_state as a step type (not condition).** e.g., `type: "fetch_external"` that writes to captureScope. Would duplicate `mcp_tool_call` semantics with an HTTP target; the right pattern is a block with an HTTP-calling tool (outside SLICE 6 scope).
7. **Per-branch retry override (G-6-4 C).** Ship fixed defaults only in v1.
8. **Response caching (G-6-3 B or C).** Post-launch when usage data demands.
9. **Dedicated `external_api_calls` observability table (G-6-6 B).** Post-launch.
10. **Rate limiting for external calls in the workflow runtime.** Relies on external API's own limits + the existing API-route rate limiter unchanged.
11. **N-way branch / switch statement (G-6-7 B).** 2-way only in v1.

---

## §10 Dependencies + containment

### §10.1 Dependencies

**Depends on (shipped):**
- AgentSpec validator + step-dispatch pattern (pre-SLICE-5)
- Predicate primitive + evaluator (pre-SLICE-5)
- `workspace_secrets` table + `decryptValue()` utility
- Node 20+ `fetch` + `AbortController` (no new npm deps required)
- TriggerSchema discriminated union (SLICE 5 — not load-bearing, but provides the pattern for ConditionSchema)

**Independent of:**
- SLICE 1 subscription primitive
- SLICE 3 state-access step types
- SLICE 4 UI layer
- SLICE 5 scheduled triggers (event/schedule triggers fire the workflow; SLICE 6 is mid-flow)

### §10.2 Containment

**Zero changes to:**
- `lib/agents/types.ts` Predicate union (external_state lands on ConditionSchema, not inside Predicate — see §3.2 rationale)
- `SeldonEvent` union (new event name `workflow.external_state.evaluated` goes into `workflow_event_log` internally, NOT into the SeldonEvent public registry)
- Subscription primitive (SLICE 1)
- Scaffolding core (SLICE 2)
- SLICE 4 composition patterns

**Extended (not modified):**
- `validateStep` in `validator.ts` — adds the 8th known step type
- Step dispatcher registry — adds `dispatchBranch`
- `PredicateSchema` — unchanged (external_state lives on ConditionSchema)
- Admin `/agents/runs` — no schema change; reads new `workflow.external_state.evaluated` events from existing log

**New files:**
- `lib/agents/branch.ts` (or integrated into validator.ts)
- `lib/workflow/http.ts` (fetchWithTimeout + retry)
- `lib/workflow/external-state-evaluator.ts`
- `lib/workflow/step-dispatchers/branch.ts`
- Migration for any schema work (none expected if we use `workspace_secrets` as-is)

### §10.3 New runtime dependency

**None.** Node 20+ `fetch` + `AbortController` cover all HTTP needs. `retryWithBackoff` is ~50 LOC inline. Response-path extraction is ~30 LOC inline. No library adds.

**Per L-17 blocked-external-dep rule:** zero external deps required → zero inline-budget penalty. Budget stays in the HTTP utility + retry lines accounted above.

---

## §11 End-to-end flow continuity

### §11.1 Archetype integration

Proof archetype (PR 2 C3): **weather-aware booking**. Shape:
```
trigger: event on booking.requested
  → branch: GET api.weather.com/... > 0.6 chance of rain
      on_match: send_sms "reschedule?"
      on_no_match: create_booking
  → send_email confirmation
```

Establishes a 5th archetype baseline hash (after daily-digest). SLICE 6 regression must preserve all 5 hashes.

### §11.2 Observability flow

Each external_state branch evaluation emits `workflow.external_state.evaluated` with payload `{ runId, stepId, url, method, responseStatus, matched, elapsedMs, error? }`. Events land in `workflow_event_log`; the `/agents/runs` page's existing event-log panel surfaces them inline with no new UI component.

### §11.3 Scaffolded block integration

**Not in v1 scope.** Scaffolded blocks' AgentSpecs could declare external_state branches (the scaffold bridge could emit the shape), but this requires (a) a BlockSpec field naming external APIs the block depends on, (b) auth/secret registration flow. Both are post-launch.

---

## §12 Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| External API outage blocks workflow progression | High | Medium | G-6-2 C allows `timeout_behavior: "false_on_timeout"`; retry policy (G-6-4 B) mitigates transient failures |
| Workspace secret rotation breaks cached auth | Low | High | No caching in v1 (G-6-3 A); each evaluation re-fetches the secret |
| External rate limits throttle workflow runs | Medium | Medium | Document in docs; builders chunk at archetype level. Per-endpoint rate limiting is post-launch. |
| Privacy: what data leaks via external calls? | Medium | High | Headers + body are builder-authored; responsibility is on the archetype-authoring guidance. Document in §9 out-of-scope as "data classification for outbound calls is post-launch compliance work." |
| Infinite-loop branches due to cyclic `next` refs | Low | High | G-6-8 A validator catches at synthesis time |
| Malicious response payloads (e.g., huge JSON) | Low | Medium | Add 1MB response-body cap in `fetchWithTimeout`; reject beyond |
| Serverless cold-start + 5s timeout collision | Medium | Low | `timeout_ms` min 1s / max 30s. Default 5s fits most real APIs + typical cold-start budget of 500-1000ms |
| Dotted path extraction mis-handles arrays | Medium | Low | Test exhaustively for `items[0].id` / `a.b[2].c`-style access; document limitations |

---

## §13 Calibration checkpoint

Applying three L-17 refined addenda from SLICE 5 close:

### Addendum 1 — Cross-ref Zod validator 2.5-3.0x (2-datapoint rule)

Schema section (§3) has 10 cross-ref edges (§3.5). Projected multiplier: 2.46x aggregate (between 2.36x and 2.75x per-component). **Inside the 2.5-3.0x window** at the high end, below at the low end — consistent with prior data (SLICE 4b 2.94x, SLICE 5 2.63x). This is the **3rd datapoint** — if PR 1 ships near 2.46x, the rule moves to 3-datapoint settled; if materially different, recalibrate.

### Addendum 2 — Dispatcher with policy matrix scales multiplicatively

`evaluateExternalState` + `dispatchBranch` have a policy matrix: error type (7) × timeout behavior (2) × outcome (2) = 28 combinations. Per the refined rule:

```
base (100 prod + 170 tests) × (error_types + timeout_behaviors + 1)
  = 270 × (7 + 2 + 1)
  = 2,700 LOC ceiling
```

Actual projection (from §6.1): 100 prod + 170 evaluator tests + 80 prod + 140 dispatcher tests + 240 error matrix tests = ~730 LOC. Well inside the ceiling.

### Addendum 3 — Blocked external deps → inline budget

**Not triggered.** Node 20+ `fetch` + `AbortController` cover the HTTP surface natively. No external dep required. Zero inline-budget penalty.

---

## §14 Stopping point

Audit drafted. Stopping per instructions; no code until Max resolves:
- Six gates G-6-1 through G-6-6 (+ two additional gates G-6-7, G-6-8 surfaced by ground-truth)
- The LOC question: Option A (accept 3,400) vs Option B (scope-cut to ~2,965) vs **Option C (split 2,100 + 1,300 — recommended)**
- Branch-primitive scope confirmation: does Max agree SLICE 6 ships the branch step primitive, not just the external_state variant? Ground-truth flags this as a surprise; confirmation is load-bearing.

**Expected discussion points:**
1. LOC overshoot reframing — Max's 1,400-1,700 projection was based on the original framing. Ground-truth materially expands scope. Ask: accept the recalibration?
2. G-6-4 retry: is exponential backoff with fixed defaults the right starting point, or should retries be per-branch configurable?
3. G-6-6 observability: confirm workflow_event_log is acceptable over a dedicated external_api_calls table. If dedicated table preferred, add ~200 LOC to PR 2.
4. PR split boundary: is "PR 1 = works with timeout=fail + no retry, PR 2 = retry + observability" a coherent first-ship?

Awaiting gate resolution + scope/split decision. No implementation until approved.
