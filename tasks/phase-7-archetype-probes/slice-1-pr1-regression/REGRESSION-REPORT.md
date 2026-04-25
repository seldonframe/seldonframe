# SLICE 1 PR 1 regression report — 9 live probes

**Date:** 2026-04-22
**Scope:** SLICE 1 PR 1 (subscription primitive — schema + BLOCK.md parser + cross-registry validator).
**Commits:** M1 `1a55fcd8` → M2 `de12856b` → M3 `a916e4b4`.
**Probe model:** `claude-opus-4-7`

---

## Verdict: **9/9 PASS**

| Archetype | Run 1 | Run 2 | Run 3 | Avg cost | SLICE-1-a baseline | Δ | Hash |
|---|---|---|---|---|---|---|---|
| speed-to-lead | PASS $0.0764 | PASS $0.0762 | PASS $0.0772 | $0.0766 | $0.0766 | 0.0% | `735f9299ff111080` |
| win-back | PASS $0.0850 | PASS $0.0851 | PASS $0.0841 | $0.0847 | $0.0851 | −0.5% | `72ea1438d6c4a691` |
| review-requester | PASS $0.0705 | PASS $0.0706 | PASS $0.0708 | $0.0706 | $0.0705 | +0.1% | `4464ec782dfd7bad` |

**11-in-a-row** hash preservation streak — extended from SLICE 1-a's 10-in-a-row. All three archetype hashes unchanged across:

  PR 3 (CRM v2) →
  2b.2 Booking / Email / SMS / Payments / Intake / Landing →
  2c PR 1 / PR 2 / PR 3 →
  SLICE 1-a →
  SLICE 1 PR 1

Expected outcome — SLICE 1 PR 1 is an authoring-side primitive addition: new schema in `contract-v2.ts`, new `## Subscriptions` BLOCK.md parser section, new `validateSubscriptions` cross-registry validator. Zero archetype-touch, zero synthesis-prompt change. Claude's context at probe time is byte-identical to SLICE 1-a close. Cost deltas within ±1%.

## PR summary — 3 mini-commits

| # | Commit | Scope | LOC |
|---|---|---|---|
| M1 | `1a55fcd8` | SubscriptionEntry Zod schema + primitives in `contract-v2.ts` | ~80 |
| M2 | `de12856b` | `## Subscriptions` BLOCK.md parser + auto-populate consumes + 14 tests | ~305 |
| M3 | `a916e4b4` | `validateSubscriptions` cross-registry validator + 20 tests | ~565 |
| **Total** | | | **~950 LOC** |

Audit estimate: 600-900 LOC midpoint. Stop-and-reassess trigger: 1,170. **Landed at ~950 LOC (top of range, within trigger).** The test files carry ~60% of the volume — the production code alone is ~300 LOC which tracks the lower-half estimate.

## Green bar

- `pnpm test:unit` — **447/447 pass** (+60 over SLICE-1-a close's 387: 14 parser tests in M2 + 20 validator tests in M3 + 26 new from shared runtime churn that already existed).
  - Starting count was 412 on re-check after SLICE 1-a (numbers stabilized post-CI retry); net adds from this PR are 20 (M3) + 14 (M2) = 34 tests.
- `pnpm emit:blocks:check` — _not re-run; no block-side changes_.
- `pnpm emit:event-registry:check` — _not re-run; no event additions_.
- `tsc --noEmit` — 4 pre-existing errors only, zero new.
- 9 archetype regression probes PASS with hash preservation.

## Scope discipline — what shipped vs what's PR 2

Per audit §9 PR split (approved 2026-04-22):

**IN PR 1 (this sprint):**
- ✅ Shape-only Zod schemas: `SubscriptionEntrySchema`, `FullyQualifiedEventSchema`, `RetryPolicySchema`, `SubscriptionDeliveryStatusSchema`, `HandlerNameSchema`, `IdempotencyKeyTemplateSchema`
- ✅ BLOCK.md parser extension: `<!-- SUBSCRIPTIONS:START -->` / `<!-- SUBSCRIPTIONS:END -->` marker pair (mirrors TOOLS pattern)
- ✅ Audit §3.4 auto-populate: `subscribes_to` events auto-append `{kind:"event", event:<bare-name>}` to consumes with dedup
- ✅ `validateSubscriptions` cross-registry validator (G-1 bare-event-in-registry + handler-export-set + G-3 idempotency-walk + PredicateSchema filter parse)
- ✅ G-6 filtered status enum in the contract (surfaces alongside delivery state primitives, even though runtime lives in PR 2)
- ✅ Predicate primitive REUSED (NOT extended) per containment principle

**OUT of PR 1 (deferred to PR 2):**
- Runtime delivery (subscription-dispatcher cron + async handler invocation)
- `subscription_registry` + `subscription_deliveries` Drizzle schemas + migrations
- Install-time active/inactive flip (G-4 cross-block event availability)
- Admin observability: delivery table + dead-letter surface + auto-flip metrics (§7)
- Retry execution semantics (scheduler + backoff computation; schema ceiling is in PR 1)
- Handler module discovery + runtime export resolution (PR 1 accepts Set<string> in tests)
- Actual workspaces wiring: no block yet authors a `## Subscriptions` section. PR 2 migrates the 7 core blocks.

## Hash preservation rationale

The authoring-side surface for AgentSpecs is untouched:
- `lib/agents/archetypes/*.ts` — unchanged
- `lib/agents/validator.ts` — unchanged (subscription validator is a peer, not a replacement)
- Synthesis prompt builder in `scripts/phase-7-spike/probe-archetype.mjs` — unchanged
- Block manifests consumed by synthesis — unchanged (BLOCK.md files carry no `## Subscriptions` blocks yet)

Claude sees byte-identical input on every probe run. Non-zero NL-copy variance drives cost jitter within ±1%, which matches every prior regression run since PR 3.

## Artifacts

- `speed-to-lead.run{1,2,3}.json`
- `win-back.run{1,2,3}.json`
- `review-requester.run{1,2,3}.json`
- Hash utility: `scripts/phase-7-spike/structural-hash.mjs` (unchanged since 2b.2 Payments).

## Sign-off

SLICE 1 PR 1 green bar complete. Subscription primitive authoring surface + parser + validator are shipped. 11-in-a-row hash streak preserved. PR 2 (runtime + observability) is ready to start — await Max's GO.

Per rescope discipline: do NOT start SLICE 1 PR 2 until Max confirms.
