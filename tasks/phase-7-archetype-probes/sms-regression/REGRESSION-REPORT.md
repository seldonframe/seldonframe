# 2b.2 SMS block regression report — 9 live probes

**Date:** 2026-04-22
**Block migrated:** `sms` (block 3 of 6 in 2b.2, after Booking + Email)
**Probe model:** `claude-opus-4-7`
**Runs captured:** `speed-to-lead.run{1,2,3}.json` / `win-back.run{1,2,3}.json` / `review-requester.run{1,2,3}.json`

---

## Verdict: **9/9 PASS**

| Archetype | Run 1 | Run 2 | Run 3 | Avg cost | PR 3 baseline | Δ vs PR 3 | Determinism | Validator issues |
|---|---|---|---|---|---|---|---|---|
| **speed-to-lead** | PASS $0.0759 | PASS $0.0756 | PASS $0.0756 | **$0.0757** | $0.0754 | **+0.4%** | 3/3 identical `91d983f11180d68d` (same as PR 3 + Booking + Email) | 0 / 0 / 0 |
| **win-back** | PASS $0.0838 | PASS $0.0833 | PASS $0.0836 | **$0.0836** | $0.0835 | **+0.1%** | 3/3 identical `afdf6da22817c737` (same as PR 3 + Booking + Email) | 0 / 0 / 0 |
| **review-requester** | PASS $0.0693 | PASS $0.0697 | PASS $0.0693 | **$0.0694** | $0.0688 | **+0.9%** | 3/3 identical `c82f2db816a85c81` (same as PR 3 + Booking + Email) | 0 / 0 / 0 |

All 9 validator checks run via `pnpm test:unit` under the
`2b.2 SMS regression — 9 live-probe outputs validate clean` describe
block in `packages/crm/tests/unit/validator.spec.ts`. Zero audit-critical
issues across the full set.

## Red flags per 2b.2 directive — all clear

| Red flag | Status |
|---|---|
| Cost regression >20% on any archetype | No — worst delta is +0.9% (review-requester). |
| Determinism drops below 3/3 structurally identical | No — 3/3 identical within each archetype. |
| **Structural hash shifts vs PR 3 baseline** | **No — all 3 hashes match PR 3 exactly, AND match the post-Booking and post-Email hashes.** Three consecutive v2 migrations (Booking, Email, SMS) with zero shift in archetype synthesis output. The v2 shape is pure-Pareto vs v1 for the shipped archetypes. |
| Validator false positive on known-good archetype output | No — 0 critical issues across 9 runs. |
| Tool signature changes required | No — runtime tools.js unchanged; sms.tools.ts is new Zod authoring of the 6 SMS-native tools. |
| **Conversation Primitive convention generalizes from Email → SMS** | **Yes.** `sms.tools.ts` does NOT re-declare `send_conversation_turn`; the Zod schema stays in `email.tools.ts` per the documented SMS-will-reference-not-re-declare rule. SMS's BLOCK.md still lists `conversation.turn.received` / `conversation.turn.sent` in `produces` because both channels emit these events at runtime. Zero changes to `ConversationExit` / `Predicate` / `ExtractField` in `lib/agents/types.ts`. |

## Gate-by-gate analysis

### Gate 1: deterministic output across 3 runs each
**PASS.** Structural hashes match across runs per archetype AND match both PR 3, post-Booking, and post-Email baselines.

### Gate 2: total cost per synthesis <$0.10 average
**PASS.** All three archetypes under $0.10, within ±1% of PR 3 baseline. Review-requester's +0.9% is within run-to-run noise (email saw +0.9% on the same archetype too).

### Gate 3: PR 2 validator flags zero false positives
**PASS.** All 9 filled specs pass validation with zero audit-critical issues.

### Gate 4: validator catches injected errors (sanity)
**PASS.** Inherited from PR 3 — 2 broken fixtures still surface expected issue codes.

### Gate 5: `pnpm emit:blocks:check` shows no drift
**PASS.** After SMS migration, all four v2 blocks (CRM, Booking, Email, SMS) round-trip cleanly.

### Conversation Primitive convention gate (SMS-specific)

Max's SMS-migration directive set the cross-block test for the primitive:

> "SMS is the test of whether the Conversation Primitive cross-block convention generalizes. If lib/agents/types.ts would need changes, STOP and flag."

**It generalizes cleanly. No type changes needed.**

Actions taken in SMS migration that confirm the rule:

1. `sms.tools.ts` header comment documents the convention: the global ToolRegistry is keyed by tool name, so re-declaring `send_conversation_turn` would duplicate; instead SMS defers to the declaration in `email.tools.ts`.
2. `sms.block.md` `produces` still lists `conversation.turn.received` / `conversation.turn.sent` — per-channel event production is a runtime fact independent of where the tool schema is authored.
3. `lib/agents/types.ts` is unchanged from PR 1 C2. `ConversationExit`, `Predicate`, and `ExtractField` primitives remain stable through three migrations.
4. 9/9 probes pass with unchanged structural hashes — Claude synthesis does not conflate "which block authors the Zod tool schema" with "which block produces the event at runtime".

The convention is now documented in both `email.tools.ts` (primary author) and `sms.tools.ts` (consumer reference), so remaining 2b.2 blocks inherit the pattern mechanically if they ever need a shared tool.

## Pattern confirmed for remaining 2b.2 blocks

Three consecutive v2 migrations with zero regression signals:

- **Booking (block 1/6):** cost ±0.4%, hashes unchanged
- **Email (block 2/6):** cost ±1.0%, hashes unchanged
- **SMS (block 3/6):** cost ±0.9%, hashes unchanged

Per the 2b.2 sequencing directive: remaining 3 blocks (Payments, Intake, Landing) can proceed as mechanical application. None of them implicate the Conversation Primitive — the primitive's cross-block test has already passed.

## Artifacts

- `speed-to-lead.run{1,2,3}.json`
- `win-back.run{1,2,3}.json`
- `review-requester.run{1,2,3}.json`
