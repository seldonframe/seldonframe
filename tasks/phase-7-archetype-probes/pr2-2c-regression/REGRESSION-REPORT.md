# 2c PR 2 regression report — 9 live probes + runtime integration

**Date:** 2026-04-22
**Scope:** 2c PR 2 (runtime engine + cron tick + sync resume + integration test).
**Commits:** M1 `37b0e67f` → M4 `5c7d37bd` (this report closes PR 2 at M5).
**Probe model:** `claude-opus-4-7`

---

## Verdict: **9/9 PASS** + Client Onboarding integration **PASS**

### Synthesis regression — 9/9 PASS, hashes preserved

| Archetype | Run 1 | Run 2 | Run 3 | Avg cost | Post-PR1 baseline | Δ | Hash |
|---|---|---|---|---|---|---|---|
| speed-to-lead | PASS $0.0763 | PASS $0.0762 | PASS $0.0762 | $0.0762 | $0.0767 | −0.6% | `735f9299ff111080` |
| win-back | PASS $0.0841 | PASS $0.0847 | PASS $0.0844 | $0.0844 | $0.0845 | −0.1% | `72ea1438d6c4a691` |
| review-requester | PASS $0.0707 | PASS $0.0705 | PASS $0.0709 | $0.0707 | $0.0703 | +0.6% | `4464ec782dfd7bad` |

### Hash-preservation streak: 8 consecutive checkpoints

PR 3 → Booking → Email → SMS → Payments → Intake → Landing → 2c PR 1 → **2c PR 2**.

Expected — PR 2 ships runtime code only. Zero BLOCK.md changes, zero synthesis-prompt changes, zero archetype-template changes. Claude's synthesis context at probe time is byte-identical to PR 1 close.

### Runtime integration — PASS

Inlined Client Onboarding spec drove the full lifecycle 3× deterministically (see `tests/unit/workflow/client-onboarding-integration.spec.ts`):

- **Event-match path:** welcome_email → share_form_link → pause on await_form → sync resume on form.submitted → book_kickoff (captured submission payload, used resolved contactId) → kickoff_confirm → complete. Structural trace hash identical across 3 runs.
- **Timeout path:** paused → 7-day clock advance → claim wait (reason=timeout) → advance to nudge_email → complete. Capture scope empty (no payload bound on timeout — correct).
- **Non-matching event isolation:** form.submitted with wrong contactId → scan finds candidate by type → predicate evaluates false → 0 resumes. Run stays waiting.

## G-2 latency instrumentation — watchful, no regression signal

Per the PR 2 kickoff directive: "if the emit-caller's request latency grows more than ~50ms on average, that's signal worth flagging".

- `emitSeldonEvent` now logs a `console.warn` when elapsed > 50 ms.
- In-memory integration tests: every `emitSeldonEvent` call completes in sub-ms range (InMemoryRuntimeStorage has O(1) map lookups).
- Production latency will surface in Vercel function logs once live traffic reaches the sync-resume path.
- **Action item for post-launch:** review Vercel logs for the warn line frequency. If >1% of emits exceed 50 ms, G-2 needs revisiting (defer resume to cron tick).

## Red flags — all clear

| Red flag | Status |
|---|---|
| Hash shift on any archetype | No — 3/3 identical per archetype |
| Cost regression >20% | No — max delta +0.6% |
| Determinism drop below 3/3 | No |
| `lib/agents/types.ts` changes | **None** — runtime types live entirely in `lib/workflow/types.ts` |
| `SeldonEvent` union changes | **None** — synthetic events (`workflow.run_failed`, `workflow.wait_timed_out`) are log-only per G-6 |
| Race conditions in compare-and-swap | No — `claimWait` tests verify double-claim returns false on the second call; real Postgres CAS via `WHERE ... AND resumed_at IS NULL` provides the same semantics |
| Synchronous resume latency regression | No measurable impact in unit tests; production monitoring enabled via `console.warn` instrumentation |
| Ambiguity resolutions introduce drift | No — 3 inline-documented defaults (timer sentinel, conversation stub, DI ToolInvoker) each map to a specific test assertion; review can flag individual choices without unwinding the whole PR |

## Ambiguity resolutions — record for review

Per the PR 2 kickoff brief, three audit ambiguities needed resolution before code. The defaults applied:

1. **Wait step persistence:** reused `workflow_waits` with sentinel `eventType = "__timer__"`. Single cron scan covers both timer + await_event paths. See `lib/workflow/types.ts::TIMER_EVENT_TYPE`.
2. **Conversation dispatcher:** PR 2 ships a stub that advances straight to `on_exit.next`. NL-judged `exit_when` + multi-turn wait registration are a follow-up slice. Client Onboarding integration test doesn't exercise conversation steps so the stub is sufficient for PR 2 closure.
3. **MCP tool invocation:** dependency-injected `ToolInvoker` on `RuntimeContext`. Production cron handler passes `notImplementedToolInvoker`; tests pass mocks. Real HTTP/local transport is a follow-up slice. No shipped archetype uses `mcp_tool_call` in production today (Client Onboarding is 3b scope), so prod cron runs safely no-op.

All three are documented inline in the relevant files. If review pushes back on any one, the change is localized.

## PR 2 green bar

- `pnpm test:unit` — **305/305 pass** (+23 new tests over PR 1's 282 baseline: 16 runtime + 3 cron + 5 sync-resume + 3 integration; event-bus tests unchanged but re-run clean).
- `pnpm emit:blocks:check` — clean on all 7 v2 blocks.
- `pnpm emit:event-registry:check` — clean (45 events).
- `tsc --noEmit` — 4 pre-existing errors (junction-artifact from main worktree branch), zero new.
- Vercel cron config updated: `{path: "/api/cron/workflow-tick", schedule: "* * * * *"}` added to `packages/crm/vercel.json`. **Pro+ plan required** for per-minute schedule; Hobby caps at daily.
- 9 archetype regression probes PASS with hash preservation.

## PR 2 LOC — actuals vs audit

| Mini-commit | Scope | LOC |
|---|---|---|
| M1 | Runtime types + storage + 4 dispatchers + 16 tests | 1,000 |
| M2 | Cron handler + vercel.json + 3 tests | 205 |
| M3 | Sync resume in bus.ts + 5 tests | 220 |
| M4 | Client Onboarding integration (3 tests) | 250 |
| **Total** | | **~1,675 LOC** |

Audit §8.2 estimate: 1,000-1,400 LOC. Stop-and-reassess: 1,820.

**Landed 8% below the trigger, 20% over the high end.** Accept-with-trace (Option A) per L-17. Breakdown:
- Runtime (M1) was the lion's share at 1,000 LOC — storage interface + Drizzle impl + in-memory impl + 4 dispatchers + 16 tests. Test coverage is substantial (~47% of M1 LOC).
- Integration test (M4) adds 250 LOC of scenario setup — load-bearing for shipping the runtime with confidence, but dense.
- Core engine code (runtime.ts) is ~290 LOC — within the audit's ~400 LOC estimate for the engine.

## What PR 3 picks up

Per audit §8.3, PR 3 is the observability surface:
- `/agents/runs` admin page listing in-flight runs with status + current-step trace.
- Drawer view: step trace + capture scope + manual-resume / cancel endpoints.
- `/api/v1/workflow-runs/[runId]/{resume,cancel}` endpoints.

## Artifacts

- `speed-to-lead.run{1,2,3}.json`
- `win-back.run{1,2,3}.json`
- `review-requester.run{1,2,3}.json`
- Hash utility: `scripts/phase-7-spike/structural-hash.mjs` (unchanged since 2b.2).
- Client Onboarding integration spec: inlined in `tests/unit/workflow/client-onboarding-integration.spec.ts` — will migrate to `lib/agents/archetypes/client-onboarding.ts` in 3b.
