# SLICE 7 PR 1 — 15-probe regression + PR 1 close-out

**Date:** 2026-04-24
**Scope:** SLICE 7 PR 1 (message-trigger schema + tables + dispatcher + Twilio webhook integration).
**Commits this PR:** C0 `7af9fa43` (L-23) → audit `b764a4b7` → C1 `7410f5b9` → C2 `883538db` → C3 `10a127f7` → C4 `d9ef6cb1` → C5 `0bb4b49d` → C6 `69b503ec` → C7 `[this commit]`.
**Probe model:** `claude-opus-4-7`

---

## Verdict: **15/15 PASS · 25-in-a-row streak holds**

5 archetypes × 3 runs = 15 structural-hash verifications.

| Archetype | Baseline | Result | Notes |
|---|---|---|---|
| speed-to-lead         | `735f9299ff111080` | ✅ 3/3 match | Preserved |
| win-back              | `72ea1438d6c4a691` | ✅ 3/3 match | Preserved |
| review-requester      | `4464ec782dfd7bad` | ✅ 3/3 match | Preserved |
| daily-digest          | `6e2e04637b8e0e49` | ✅ 3/3 match | Preserved |
| weather-aware-booking | `f330b46ca684ac2b` | ✅ 3/3 match | Preserved (3-datapoint stable since SLICE 6 PR 2) |

Expected outcome — SLICE 7 PR 1 is purely additive: a new `message` branch in TriggerSchema + new tables + a dispatcher + a stub-only webhook insertion. Zero changes to:
- Existing archetype files (`packages/crm/src/lib/agents/archetypes/`)
- Existing TriggerSchema branches (event + schedule)
- Synthesis prompt or probe pipeline
- Tool catalog or block contracts

The synthesis context Claude sees at probe time is byte-identical to SLICE 6 PR 2 close. Hashes preserve as expected.

---

### Methodology fix surfaced this PR (process-only, not blocking)

The first PR 1 regression invocation used a **full-spec stableHash** (sha256 of canonicalized full filled.json) — see `scripts/phase-7-spike/run-regression-3x.mjs` v1. That hash is *expected* to vary run-to-run because Claude's NL prose isn't temperature-zero. The 15 raw "fail" hashes recorded in `run.log` are honest variance on prose, NOT structural drift.

The canonical streak hash function is **`scripts/phase-7-spike/structural-hash.mjs`** — strips `initial_message`, `body`, `subject`, `exit_when`, free-form `args` values; keeps trigger event + step ids/types/tool/captures/extract_keys/next pointers. Re-verifying the saved `slice-7-pr1-regression/<archetype>.runN.json` files via this canonical function produces the 15/15 PASS table above.

**Mitigation shipped in this PR:**
- `scripts/phase-7-spike/run-regression-3x.mjs` updated to use the structural canonicalizer (matches `structural-hash.mjs` convention)
- `scripts/phase-7-spike/verify-regression-from-saved.mjs` added — re-verifies any regression dir's saved files against documented baselines without re-probing (useful for cheap audit confirmation)

**Why this matters going forward:** future regression runs use the corrected runner; the documented streak is independently verifiable from saved artifacts via `verify-regression-from-saved.mjs <dir>`.

**Streak framing:** the 25-in-a-row streak claim applies to the 5 archetypes' structural-hash baselines (preserved exactly across SLICE 1-a → SLICE 6 PR 2 → SLICE 7 PR 1). No structural drift since the baselines were established.

---

## PR 1 summary

| # | Commit | Scope | Prod | Tests | Ratio |
|---|---|---|---|---|---|
| C0 | `7af9fa43` | L-23 (3-run baseline durability rule, doc-only) | 0 | 0 | doc 44 |
| audit | `b764a4b7` | SLICE 7 audit (12 sections + 8 gates) | 0 | 0 | doc 724 |
| C1 | `7410f5b9` | L-17 4th-datapoint expectation note (doc-only) | 0 | 0 | doc 29 |
| C2 | `883538db` | MessageTriggerSchema + 6 cross-ref edges + 34 tests | 98 | 477 | **4.87x** |
| C3 | `10a127f7` | messageTriggers + messageTriggerFires tables + storage + 17 tests | 398 | 274 | 0.69x |
| C4 | `d9ef6cb1` | Pattern + binding evaluators + 26 tests | 59 | 252 | **4.27x** |
| C5 | `0bb4b49d` | Dispatcher + idempotency + 15 tests | 191 | 334 | 1.75x |
| C6 | `69b503ec` | Twilio webhook integration + 4 wiring tests | 103 | 62 | 0.60x |
| C7 | `[this commit]` | 15-probe regression + PR 1 close-out | 0 | 0 | artifact |
| **PR 1 total** | | | **~849 prod** | **~1,399 tests + 797 doc + artifacts** | **1.65x aggregate** |

**PR 1 LOC envelope:**
- Code: ~2,248 (prod + tests)
- + Docs: 797 (audit + lessons updates)
- **Combined: ~3,045**

Audit projection: 1,800-2,000 (code only).
Stop-and-reassess trigger: 2,600 (30% over 2,000).
**Code total ~2,248 — 12% over high-end projection, 13% under stop trigger.** Within the comfortable band; no scope tightening required.

### LOC ratio analysis (L-17 calibration)

The 1.65x aggregate test/prod ratio is **below the typical 2-3x band**. Drivers:

- **C2 ran hot (4.87x):** Small denominator (98 prod LOC) inflates the per-test ratio. Tests are exhaustive across 6 cross-ref edges × G-7-1/G-7-2/G-7-3/G-7-1b coverage. Detailed in C2 commit message; this is a known L-17 small-schema inflation.
- **C3 ran cold (0.69x):** Storage + adapter + migration is mostly Drizzle boilerplate (398 prod LOC) with a focused 17-test contract suite. Adapter typechecks are verified at integration time (PR 2), not unit-tested here.
- **C5 ran cold (1.75x):** Dispatcher had MULTI-PATH coverage (no_match × loop_guard × idempotency × dispatch_failed × cross-org × disabled), but the matrix is narrower than projected. 15 tests cover the full algorithm cleanly.
- **C6 ran cold (0.60x):** PR 1 wiring is intentionally stubbed (loadSpec throws, startRun returns synthetic id). The 4 stub-pinning tests are sufficient — full integration testing lives in PR 2 with the real archetype.

**L-17 dispatcher multiplicative scaling check:** projected 3.5-4.0x; actual 1.75x. **Datapoint suggests the multiplicative scaling rule may not generalize as strongly as SLICE 5 PR 1 (which had 3.5x).** The SLICE 7 dispatcher's policy matrix is conceptually 4-axis (channel × pattern × loop × dedup) but the test coverage exploits the orthogonality of the axes — each test exercises one path through the matrix, not the full Cartesian product. SLICE 5's schedule dispatcher had more interleaved policy interactions (catchup × concurrency × cron-edge timing) that required combinatoric testing.

**Recommendation for the L-17 dispatcher rule:** reword to say the multiplier scales with **interleaved policy interactions**, not raw policy axis count. SLICE 5 = high interleaving (catchup affects concurrency decision); SLICE 7 = low interleaving (each policy is an independent gate). Document at SLICE 7 close (PR 2 close-out, not this PR — needs PR 2 dispatcher LOC for a 2-datapoint update).

### Cross-ref Zod 4th-datapoint result (L-17 from C1)

C2 schema landed at **6 cross-ref edges** (vs. 5-7 projected). Test ratio 4.87x — **far above** the projected 2.8-3.0x band.

| Slice | Validator | Edges | Multiplier |
|---|---|---|---|
| SLICE 4b | `customer_surfaces` | 4 | 2.94x |
| SLICE 5 PR 1 | `ScheduleTriggerSchema` | 5 | 2.63x |
| SLICE 7 PR 1 | `MessageTriggerSchema` | 6 | **4.87x** |
| SLICE 6 PR 1 | `BranchStepSchema + ExternalStateConditionSchema` | 10 | 3.30x |

**4.87x at 6 edges is an outlier.** Two possible interpretations:

1. **Small-denominator inflation:** the schema came in lean (98 prod LOC). 34 well-distributed tests against a small schema produce a high per-test ratio. The same 34 tests against a 200-LOC schema would yield ~2.4x.
2. **G-7 coverage matrix breadth:** 4 distinct gate decisions encoded in the schema (G-7-1 modes × G-7-1b foot-gun × G-7-2 channel × G-7-3 binding) drove per-decision exhaustive happy/sad coverage that wouldn't appear in a single-gate cross-ref schema.

**Methodology update for L-17:** the cross-ref edge count is a *necessary* predictor but not *sufficient*. **Schema test ratio is also a function of the gate-decision breadth encoded in the schema.** A 6-edge schema encoding 1 gate = ~2.5x; a 6-edge schema encoding 4 gates = ~4-5x.

This is a 4th datapoint but it **confounds two variables** (edge count + gate breadth). To genuinely settle the 7-9 edge band, we need a 7-9 edge schema with single-gate breadth. Defer band recalibration until that datapoint exists.

Documented in this close-out for SLICE 7 PR 2 to reference; if PR 2 ships a smaller-edge schema (e.g., loop-guard config), it can serve as a confounding-variable control.

---

## What ships in PR 1

**Schema:**
- `MessageTriggerSchema` (3rd branch of `TriggerSchema` discriminated union)
- 6 cross-ref edges enforced at parse time
- Type exports: `Trigger`, `EventTrigger`, `ScheduleTrigger`, `MessageTrigger`, `MessagePattern`, `ChannelBinding`

**Tables:**
- `message_triggers` — materialized lookup index (org × archetype UNIQUE; org × channel × enabled hot-path index)
- `message_trigger_fires` — idempotency + observability (UNIQUE on triggerId × messageId; skipped_reason text)
- Drizzle migration `0024_message_triggers.sql` (additive, no backfill)

**Storage layer:**
- `MessageTriggerStore` interface + `makeInMemoryMessageTriggerStore` for tests
- `DrizzleMessageTriggerStore` for production
- `buildMessageTrigger` helper

**Pure evaluators:**
- `matchesMessagePattern(pattern, text)` — 5 modes per G-7-1
- `channelBindingMatches(binding, inbound)` — 2 binding kinds per G-7-3 v1

**Dispatcher:**
- `dispatchMessageTriggers(ctx, inbound)` — full pipeline per audit §5.3
- Cross-org isolation (verified by test)
- Per-trigger error isolation (one failure doesn't block others)
- `loopGuardCheck` callback hook (PR 2 wires real check)

**Webhook integration:**
- `dispatchTwilioInboundForMessageTriggers` wrapper
- Insertion into `/api/webhooks/twilio/sms/route.ts` between `persistInboundSms` and `emitSeldonEvent`
- Best-effort: errors logged + swallowed (no Twilio retry storm risk)
- PR 1 `loadSpec` + `startRun` stubbed (no message-typed archetype yet)

**Tooling:**
- `scripts/phase-7-spike/run-regression-3x.mjs` — automation for 3-run regression
- `scripts/phase-7-spike/verify-regression-from-saved.mjs` — re-verifies saved artifacts cheaply
- Both use the canonical structural-hash convention

---

## What does NOT ship in PR 1 (PR 2 scope)

- **Loop guard implementation** (G-7-7 Option B per audit): per-trigger 5-fires-in-60s + workspace 100/min counter. PR 1 wires the hook with always-allow stub.
- **`appointment-confirm-sms` archetype** with 3-run baseline durability check (L-23). The first message-typed archetype.
- **Production runtime startRun wiring**: PR 1 ships a synthetic-id stub + log event. PR 2 swaps to real `runtime.startRun` once the first archetype + installer flow exists.
- **End-to-end integration test**: real webhook → real dispatcher → real archetype → real reply.
- **Shallow-plus integration harness** (mirroring SLICE 6 PR 2 C6 pattern).
- **18-probe regression** (6 archetypes × 3 runs once `appointment-confirm-sms` joins the registry).

---

## Green bar PR 1

| Check | Result |
|---|---|
| `pnpm test:unit` | ✅ 1378/1383 (5 todo, 0 fail; +96 new tests) |
| `pnpm emit:blocks:check` | ✅ no drift |
| `pnpm emit:event-registry:check` | ✅ no drift (47 events) |
| 15-probe regression | ✅ 15/15 PASS, 25-streak holds |
| Existing inbound SMS behavior | ✅ STOP / conversation routing / sms.replied unchanged |
| Cross-ref Zod calibration | 🟡 4.87x outlier — methodology note added |
| Dispatcher multiplicative-scaling check | 🟡 1.75x cold — methodology note added |

---

## Containment verification (per Max's PR 1 spec)

| Surface | PR 1 changes? | Notes |
|---|---|---|
| TriggerSchema discriminated union | ✅ additive | New `message` branch; event + schedule unchanged |
| Twilio inbound webhook handler | ✅ additive | One insertion; STOP / conversation / sms.replied preserved |
| `lib/agents/types.ts` | ✅ none | All new types live in `validator.ts` (which exports them) |
| SeldonEvent union | ✅ none | `workflow.message_trigger.*` events go to `workflow_event_log`, not registry |
| Subscription primitive | ✅ none | |
| Scaffolding core | ✅ none | |
| SLICE 4 composition patterns | ✅ none | |
| SLICE 5 scheduled-trigger dispatcher | ✅ none | |
| SLICE 6 branch primitive | ✅ none | |

---

## SLICE 7 progress (PR 1 of 2)

| PR | Status | LOC | Highlights |
|---|---|---|---|
| PR 1 | ✅ this PR | ~2,248 code + 797 doc | Schema + tables + dispatcher + Twilio integration (stub-wired) |
| PR 2 | ⏳ pending approval | ~1,000-1,100 projected | Loop guard + archetype + 3-run baseline + E2E + close-out |

---

## Per L-21: STOP

PR 1 green bar + push. **Awaiting Max approval before SLICE 7 PR 2.**
