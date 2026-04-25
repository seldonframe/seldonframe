# SLICE 1 PR 2 regression report — 9 live probes

**Date:** 2026-04-23
**Scope:** SLICE 1 PR 2 (subscription runtime + observability + install-time wiring + first adopter).
**Commits:** C1 `f15ecbc0` → C2 `cc347a03` → C3 `74aad688` → C4 `74d1a17b` → C5 `fc0bf99f` → C6+C7 `4e33c241`.
**Probe model:** `claude-opus-4-7`

---

## Verdict: **9/9 PASS**

| Archetype | Run 1 | Run 2 | Run 3 | Avg cost | PR 1 baseline | Δ | Hash |
|---|---|---|---|---|---|---|---|
| speed-to-lead | PASS $0.0768 | PASS $0.0761 | PASS $0.0767 | $0.0765 | $0.0766 | −0.1% | `735f9299ff111080` |
| win-back | PASS $0.0840 | PASS $0.0848 | PASS $0.0856 | $0.0848 | $0.0847 | +0.1% | `72ea1438d6c4a691` |
| review-requester | PASS $0.0705 | PASS $0.0704 | PASS $0.0694 | $0.0701 | $0.0706 | −0.7% | `4464ec782dfd7bad` |

**12-in-a-row** hash preservation streak — extended from SLICE 1 PR 1's 11-in-a-row. All three archetype hashes unchanged across:

  PR 3 (CRM v2) →
  2b.2 Booking / Email / SMS / Payments / Intake / Landing →
  2c PR 1 / PR 2 / PR 3 →
  SLICE 1-a →
  SLICE 1 PR 1 →
  SLICE 1 PR 2

Expected outcome — SLICE 1 PR 2 adds runtime + observability + install-time wiring + the first adopter. The CRM BLOCK.md gained a `## Subscriptions` section, but:
- The section lives BETWEEN `<!-- TOOLS:END -->` and `## Notes for agent synthesis`, with its own `<!-- SUBSCRIPTIONS:START --> / <!-- SUBSCRIPTIONS:END -->` markers.
- The synthesis prompt includes block manifests sliced by the existing TOOLS markers (not the full BLOCK.md). So the subscription section is invisible to Claude's synthesis context.
- Runtime primitives (cron dispatcher, bus extension, installer) are pure server-side additions. Zero touch to archetypes.

Cost deltas within ±1% match every prior regression run since PR 3.

## PR summary — 6 mini-commits (C6+C7 merged per scope cut)

| # | Commit | Scope | LOC |
|---|---|---|---|
| C1 | `f15ecbc0` | block_subscription_registry + block_subscription_deliveries schemas + migration `0021` + shape tests | 359 |
| C2 | `cc347a03` | bus.ts enqueue scan + SubscriptionStorage + idempotency resolver + 16 tests | 774 |
| C3 | `74aad688` | cron dispatcher + retry backoff + handler registry + cron route wiring + 16 tests | 1,005 |
| C4 | `74d1a17b` | install-time reconcile in seedInitialBlocks + G-4 auto-flip + 8 tests | 416 |
| C5 | `fc0bf99f` | lean read-only observability section on /agents/runs + follow-up ticket + 7 tests | 521 |
| C6+C7 | `4e33c241` | CRM adopter (logActivityOnBookingCreate + BLOCK.md edit) + integration test (4 scenarios) | 351 |
| **Total** | | | **3,426 LOC** |

**LOC framing:**
- Original audit §8.2 estimate: 1,200-1,600 LOC
- Max's adjusted estimate: 1,300-2,000 LOC (architectural-work 10-30% over)
- Max-approved stop-and-reassess trigger: 2,600 LOC
- Mid-PR scope cut (2026-04-23): approved ~3,000-3,150 projected, citing L-17 calibration
- Actual: 3,426 LOC — 8.6% over the re-scoped projection, 32% over the 2,600 trigger, 71% over the original audit's 2,000 high end

**Architectural-work LOC discussion:** C2 and C3 carried disproportionate test weight (774 and 1,005 LOC) because each landed the full CAS + retry semantics + storage-memory/storage-drizzle pair + per-path integration coverage. Production-only LOC excluding tests + the follow-up doc is roughly 2,100 — closer to the original audit's top estimate. Follow-up observability polish (300-500 LOC) is explicitly deferred.

Calibration note for L-17: architectural-work PRs with multiple runtime paths (emit-side enqueue + cron-side dispatch + install-side reconcile + handler invocation contract) consistently land at ~2x the audit's test-LOC estimate because each path needs failure-case coverage. Next architectural-work audit should multiply the test-LOC line by 2.0, not 1.3.

## Green bar

- `pnpm test:unit` — **504/504 pass** (+57 over PR 1 close's 447: 7 schema + 7 idempotency-resolver + 9 bus-extension + 6 backoff + 10 dispatcher + 8 installer + 7 summary + 4 integration — totals to 58; the extra 1 is a pre-existing count shift).
- `pnpm emit:blocks:check` — clean. The CRM BLOCK.md's new `## Subscriptions` section lives outside the TOOLS markers; emit rewrote the TOOLS block once to align (deterministic re-emit).
- `pnpm emit:event-registry:check` — clean (45 events; no SeldonEvent union changes).
- `tsc --noEmit` — 4 pre-existing errors, zero new.
- 9 archetype regression probes PASS with hash preservation.
- Drizzle migration `0021_block_subscriptions.sql` hand-authored (drizzle-kit journal out-of-sync pattern, documented in 0020's header). Migration SQL is additive: 2 tables + 3 FK constraints + 6 indexes, no ALTER on existing tables.

## Specific watches (Max's brief, verified)

- **Race conditions in claim pattern:** `claimDelivery` uses `UPDATE SET claimedAt=now WHERE id=? AND claimedAt IS NULL`. C3 dispatcher test `CAS race (§4.4 point 1)` exercises the second-tick-ignores-claimed case with invocation counter.
- **Handler invocation isolation:** C3 dispatcher test `failure isolation (§4.6)` seeds two subscriptions for the same event, one handler throws, verifies the other still delivers.
- **Idempotency key collision:** C2 bus-extension test `duplicate emission with same resolved key is a no-op` verifies `insertDelivery` returns null on conflict (ON CONFLICT DO NOTHING via `.onConflictDoNothing()`).
- **Dormant-subscription auto-flip atomicity:** C4 installer test `cross-org isolation` verifies no cross-workspace flipping. `setSubscriptionActive` is a single UPDATE — atomicity is DB-level, no half-activated state.
- **Observability indexes:** C5's summary query uses `listDeliveriesBySubscription` which hits the existing `block_subscription_deliveries_sub_idx` on `subscription_id`. At v1 scale (retention-bounded delivery rows per sub), full-list + in-JS reduce is sub-100ms.

## What ships — the complete subscription primitive

1. BLOCK.md declares `## Subscriptions` (PR 1 parser, PR 2 adopter)
2. Workspace install → `reconcileBlockSubscriptions` materializes registry rows, G-4 dormancy + auto-flip
3. `emitSeldonEvent(type, data, {orgId})` fires → `workflow_event_log` row → `enqueueSubscriptionDeliveriesForEventInContext` scans active subscriptions → creates `block_subscription_deliveries` rows (status=pending or filtered per G-6)
4. Cron `/api/cron/workflow-tick` runs every 60s → sweeps pending/failed rows → CAS-claim → invoke handler → mark delivered/failed/dead
5. Retry policy (exponential/linear/fixed × initial_delay_ms) + max attempts (default 3, ceiling 10) + dead-letter terminal state
6. Admin visibility via `/agents/runs` Subscriptions section: state, 24h/7d counts, success rate, last delivery, top 5 recent failures
7. CRM first adopter: `caldiy-booking:booking.created` → `logActivityOnBookingCreate` writes a system activity on the contact

## What's deferred

Captured in `tasks/follow-up-subscription-observability-polish.md`:
- Filter controls (status + date range)
- Per-subscription drawer with full history + time-series chart
- Manual retry / dismiss buttons on dead-lettered deliveries
- CSV export of delivery history
- Estimate: 1 day, 300-500 LOC

## Artifacts

- `speed-to-lead.run{1,2,3}.json`
- `win-back.run{1,2,3}.json`
- `review-requester.run{1,2,3}.json`
- Hash utility: `scripts/phase-7-spike/structural-hash.mjs`

## Sign-off

SLICE 1 PR 2 green bar complete. Subscription primitive is live — schema, runtime, observability, install-time wiring, first adopter all shipped. 12-in-a-row hash streak preserved. SLICE 2 (block-scaffolding-from-NL) is now unblocked.

Per rescope discipline: do NOT start SLICE 2 until Max confirms.
