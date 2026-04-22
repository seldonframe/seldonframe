# 2b.2 Email block regression report — 9 live probes

**Date:** 2026-04-22
**Block migrated:** `email` (block 2 of 6 in 2b.2, after Booking)
**Probe model:** `claude-opus-4-7`
**Runs captured:** `speed-to-lead.run{1,2,3}.json` / `win-back.run{1,2,3}.json` / `review-requester.run{1,2,3}.json`

---

## Verdict: **9/9 PASS**

| Archetype | Run 1 | Run 2 | Run 3 | Avg cost | PR 3 baseline | Δ vs PR 3 | Determinism | Validator issues |
|---|---|---|---|---|---|---|---|---|
| **speed-to-lead** | PASS $0.0751 | PASS $0.0751 | PASS $0.0746 | **$0.0749** | $0.0754 | **−0.7%** | 3/3 identical `91d983f11180d68d` (same as PR 3 + Booking) | 0 / 0 / 0 |
| **win-back** | PASS $0.0848 | PASS $0.0844 | PASS $0.0837 | **$0.0843** | $0.0835 | **+1.0%** | 3/3 identical `afdf6da22817c737` (same as PR 3 + Booking) | 0 / 0 / 0 |
| **review-requester** | PASS $0.0689 | PASS $0.0697 | PASS $0.0696 | **$0.0694** | $0.0688 | **+0.9%** | 3/3 identical `c82f2db816a85c81` (same as PR 3 + Booking) | 0 / 0 / 0 |

All 9 validator checks run via `pnpm test:unit` under the
`2b.2 Email regression — 9 live-probe outputs validate clean` describe
block in `packages/crm/tests/unit/validator.spec.ts`. Zero audit-critical
issues across the full set.

## Red flags per 2b.2 directive — all clear

| Red flag | Status |
|---|---|
| Cost regression >20% on any archetype | No — worst delta is +1.0% (win-back) |
| Determinism drops below 3/3 structurally identical | No — 3/3 identical within each archetype |
| **Structural hash shifts vs PR 3 baseline** | **No — all 3 hashes match PR 3 exactly, AND match the post-Booking hashes.** Two consecutive v2 migrations (Booking, Email) with zero shift in archetype synthesis output. Strong signal v2 is pure-Pareto vs v1 for the shipped archetypes. |
| Validator false positive on known-good archetype output | No — 0 critical issues across 9 runs |
| Tool signature changes required | No — runtime tools.js unchanged; email.tools.ts is new Zod authoring |
| Conversation Primitive type changes | **No.** `send_conversation_turn` Zod schema lives in email.tools.ts with the documented "SMS will reference, not re-declare" convention. `ConversationExit` / `Predicate` / `ExtractField` primitives in `lib/agents/types.ts` remain unchanged from PR 1 C2. |

## Gate-by-gate analysis

### Gate 1: deterministic output across 3 runs each
**PASS.** Structural hashes match across runs per archetype AND match both PR 3 and post-Booking baselines.

### Gate 2: total cost per synthesis <$0.10 average
**PASS.** All three archetypes under $0.10, within ±1% of PR 3 baseline. The slight cost-down on speed-to-lead (−0.7%) likely reflects slightly tighter JSON-schema payloads in Claude's output; not a signal. Win-back +1.0% and review-requester +0.9% are noise-level.

### Gate 3: PR 2 validator flags zero false positives
**PASS.** All 9 filled specs pass validation with zero audit-critical issues.

### Gate 4: validator catches injected errors (sanity)
**PASS.** Inherited from PR 3 — 2 broken fixtures still surface expected issue codes.

### Gate 5: `pnpm emit:blocks:check` shows no drift
**PASS.** After Email migration, all three v2 blocks (CRM, Booking, Email) round-trip cleanly.

### Conversation Primitive gate (Email-specific)

Max's Email-migration directive flagged one special gate:

> "If Email's contract v2 shape requires changes to the Conversation Primitive types, that's a signal to stop and flag."

**No Conversation Primitive type changes.** The Zod schema for
`send_conversation_turn` lives in `email.tools.ts` — a new tool-schema
declaration, not a modification of the shared primitive types in
`packages/crm/src/lib/agents/types.ts`. `ConversationExit`, `Predicate`,
and `ExtractField` (the shared primitives) are untouched since PR 1 C2.
SMS's upcoming migration will:

1. NOT re-declare `send_conversation_turn` in `sms.tools.ts` (would duplicate tool name in the global registry).
2. Still list `conversation.turn.received` / `conversation.turn.sent` in SMS's `produces` — both channels produce these events even though only Email ships the tool declaration.
3. Reference the existing Zod schema from `email.tools.ts` for any SMS-channel conversation flow in archetype composition.

This convention is documented in the header comment of `email.tools.ts`
and in the "Conversation Primitive note" paragraph added to
`email.block.md`'s Composition Contract section, so SMS migration has
explicit guidance.

## Pattern confirmed for remaining 2b.2 blocks

Two consecutive v2 migrations with zero regression signals:

- **Booking (block 1/6):** cost ±0.4%, hashes unchanged
- **Email (block 2/6):** cost ±1.0%, hashes unchanged

The v2 shape is genuinely Pareto-neutral for Claude synthesis of the
3 shipped archetypes. Remaining 4 blocks (SMS, Payments, Intake,
Landing) can proceed as mechanical application.

## Artifacts

- `speed-to-lead.run{1,2,3}.json`
- `win-back.run{1,2,3}.json`
- `review-requester.run{1,2,3}.json`
