# Scope 3 Step 2b.2 — Completion Summary

**Closed:** 2026-04-22
**Sprint branch:** `claude/fervent-hermann-84055b`
**Pattern:** Composition Contract v2 migration across all 7 core blocks

---

## The milestone

**All 7 core blocks migrated to the v2 Composition Contract shape.**
Seven consecutive migrations (CRM in 2b.1 PR 3 + six blocks in 2b.2)
with zero red flags. v2 is empirically proven Pareto-neutral for
Claude synthesis of the 3 shipped archetypes.

| Block | 2b.2 slot | Commit | Tools | tools.ts LOC | Δ cost avg | Hash shift |
|---|---|---|---|---|---|---|
| crm | (2b.1 PR 3) | `212166e8` | 13 | 344 | — | — (baseline) |
| caldiy-booking | 1/6 | `6100ebaa` | 9 | 281 | ±0.4% | none |
| email | 2/6 | `eac0444b` | 7 | 232 | ±1.0% | none |
| sms | 3/6 | `d88596d5` | 6 | 198 | ±0.9% | none |
| payments | 4/6 | `b30bfee7` | 12 | 424 | ±1.2% | none |
| formbricks-intake | 5/6 | `508d899c` | 7 | 263 | ±0.4% | none |
| landing-pages | 6/6 | `8a0a0c8e` | 8 | 257 | ±0.6% | none |

**Total core-block tools.ts: 1,655 LOC across 7 files, 62 tools.**

## 2b.2 commit range

- First: `6100ebaa` (Booking, 2026-04-22)
- Last: `8a0a0c8e` (Landing, 2026-04-22)
- Intervening infrastructure: drift-detector fixes (`046ea09f`,
  `880b3982`), L-19 `.gitattributes` for LF stability, L-18 fix for
  the puck server-client boundary (`fix/puck-server-client-boundary`
  branch, merged to main)

## Regression probes

**63 total live probes across 2b.2** (9 per migration × 7 checkpoints
including PR 3):

- PR 3 baseline: 9/9 PASS
- Booking: 9/9 PASS
- Email: 9/9 PASS
- SMS: 9/9 PASS
- Payments: 9/9 PASS
- Intake: 9/9 PASS
- Landing: 9/9 PASS

Every probe hash-preserved against the PR 3 baseline. Three archetype
hashes (`735f9299ff111080` / `72ea1438d6c4a691` / `4464ec782dfd7bad`)
stayed fixed through seven consecutive v2 migrations.

Cost deltas maxed at +1.2% (Payments — the largest migration). Every
archetype stayed comfortably under the $0.10 synthesis-cost ship bar.

## Structural-hash utility (elevated to standard verification)

`scripts/phase-7-spike/structural-hash.mjs` shipped in the Payments
migration and was elevated to standard verification for Intake +
Landing per Max's directive. The utility:

1. Strips NL-generated copy (initial_message, body, subject,
   exit_when, arg values that interpolate runtime data).
2. Hashes the structural skeleton (step ids + types + tool names +
   captures + extract keys + next pointers + trigger shape + variable
   keys + conversation channel + on_exit.next + wait seconds).
3. Produces a 16-char sha256 prefix.

Running it against every regression directory (pr3-regression,
booking-regression, email-regression, sms-regression,
payments-regression, intake-regression, landing-regression) produces
identical hashes per archetype — direct empirical evidence that
archetype synthesis output is bit-for-bit structurally stable across
v2 migrations.

## Lessons captured

### L-17 — Zod LOC baseline ~25-30 LOC/tool (refined across 2b.2)

Originally captured after PR 1 with a ~25 LOC/tool baseline. 2b.2
data refined the calibration:

- Simple tools (list/get/delete): 15-25 LOC
- Standard tools (create/update with shared records): 25-35 LOC
- Complex tools (with discriminated unions, deep nested shapes):
  35-50 LOC
- Heavy-containment-comment blocks (Payments, Intake, Landing):
  add ~50-100 LOC for inline documentation of block-specific rules

Accept-with-trace (Option A) was used on Payments (+1.8% over ceiling)
and Intake (+18% over nominal). Landing (+17% over nominal) follows
the same precedent — comment density is intentional for blocks where
containment rules carry non-obvious invariants.

### L-18 — Server-side imports of client-only modules fail at build

Originally captured after the `fix/puck-server-client-boundary` fix
(pre-PR 2). Validated again during Landing migration: `landing.tools.ts`
deliberately imports only `zod` and `contract-v2` types. No
transitive path to `config.impl.tsx`. Server routes that import
`landing.tools.ts` are safe to build on Vercel.

### L-19 — `.gitattributes eol=lf` for emitted artifacts

Originally captured after Windows CRLF drift on `event-registry.json`.
Carried forward through all 2b.2 migrations — every emit artifact
round-trips cleanly between Windows worktree checkout and CI build
on Vercel's Linux containers.

### L-20 — Audit LOC at HEAD is authoritative over session memory

Captured after a calibration discrepancy between Max's recollection
(PR 2 ~200 LOC) and the audit at HEAD (300-400 LOC). Applied
throughout 2b.2: every LOC estimate grounded in the current audit
document, not in session recall.

### Conversation Primitive convention (Email ⇄ SMS)

First tested in Email migration (block 2/6): `send_conversation_turn`
is channel-agnostic, shared between Email and SMS. Runtime at
`lib/conversation/runtime.ts` routes via a `channel: "email"|"sms"`
arg. In the v2 tool registry, tool names are globally unique, so the
Zod schema lives on ONE block (Email, which migrated first). SMS's
tools.ts deliberately does NOT re-declare it — both blocks still
list `conversation.turn.received` / `conversation.turn.sent` in
`produces` because both channels produce conversation events at
runtime.

**The convention generalized cleanly to SMS.** 9/9 SMS probes passed
with unchanged structural hashes, confirming Claude synthesis
doesn't conflate "which block authors the Zod tool schema" with
"which block produces the event at runtime".

### Block-specific containment principle (Stripe / Formbricks / Puck)

Established through three consecutive tests:

1. **Payments (Stripe):** 12 tools, 6 Stripe-specific enums, 4
   record shapes, dual-identifier objects (paymentIntent+charge,
   subscription+price, coupon+promotion code). ALL local to
   `payments.tools.ts`. `lib/agents/types.ts` unchanged.

2. **Intake (Formbricks):** 15 question types, conditional logic
   operators, webhooks, ActionClasses, display options. Documented
   in `formbricks-intake.block.md` for agent-synthesis reference.
   MCP tool surface exposes only the simple SMB-facing form
   primitive (name / slug / fields / is_active). Rich Formbricks
   authoring stays a UI concern.

3. **Landing (Puck):** 32 Puck components across 5 categories. MCP
   tool schemas surface Puck payloads as `z.record(z.string(),
   z.unknown())` at the boundary. Full typed validation lives in
   `lib/puck/validator.ts` + `lib/puck/config-fields.ts`. Agents
   authoring Puck payloads go through `generate_landing_page`
   (Claude-drafted + pre-validated) or a template's payload — not
   by hand-authoring raw JSON.

**Principle:** block-specific complexity lives inside the block's
tool schema + BLOCK.md. The shared abstractions (ConversationExit,
Predicate, ExtractField, Step) absorbed zero block-specific
concerns through 6 consecutive migrations. Validates that the
composition-contract design is correctly placed.

### Structural-hash utility elevation

From "one-off diagnostic in Payments migration" to "standard
verification for all 2b.2 blocks going forward (Intake, Landing)."
Inspection discipline: before each probe batch, compute hash against
the prior baseline directory; after each batch, compute hash of the
new outputs. 6-in-a-row preservation across Booking → Landing is the
strongest empirical signal the v2 shape is synthesis-neutral.

## State of the composition-contract system at 2b.2 close

### What's shipped

- `packages/crm/src/lib/blocks/block-md.ts` — parser with v1/v2
  coexistence, mixed-shape rejection, TOOLS block parsing (from
  2b.1 PR 1)
- `packages/crm/src/lib/blocks/contract-v2.ts` — v2 types
  (ProducesEntry, ConsumesEntry, ToolDefinition) (from 2b.1 PR 1)
- `packages/crm/src/lib/blocks/emit-tools.ts` + `scripts/emit-block-tools.impl.ts`
  — Zod → JSON Schema emit + drift-detector CI gate
- `packages/crm/src/lib/agents/validator.ts` — agent-spec validator
  with typed-narrowing step dispatchers, capture/extract/variable
  resolver, capture field type-check (from 2b.1 PR 2)
- 7 core blocks with v2 BLOCK.md contracts + Zod-authored
  tool schemas under `packages/crm/src/blocks/*.tools.ts`
- 11 non-core recipe blocks with §7.5 "intentionally invisible to
  agent" markers (from 2b.1 decisions; untouched through 2b.2)
- `scripts/phase-7-spike/structural-hash.mjs` — regression
  determinism verification utility

### What's validated

- 242 unit tests in `pnpm test:unit` after Payments, 251 after
  Intake, 260 after Landing (each block adds 9 regression tests)
- All unit + integration gates green on every 2b.2 migration
- Vercel preview builds green on every 2b.2 migration commit
- CI drift-detector green for both BLOCK.md and event-registry
  emits on every push

### What remains OUT of 2b.2 scope (handed to 2c or later)

- `tasks/follow-up-puck-config-consolidation.md` — making
  `lib/puck/config-fields.ts` the single source of truth, removing
  duplication with `config.impl.tsx`. Flagged as post-2b.2 cleanup
  in the Landing migration; NOT touched during the migration itself
  per Max's directive to keep scope clean.
- Brain v2's consumption of the v2 contract (reading
  `producesByBlock` / tool metadata to inform next-best-action
  scoring) — still wired against the pre-v2 shape in places. Scoped
  to a post-2b.2 slice.
- `compose_with` becoming type-checked (currently string-array
  preserved from v1). Audit §7.1 flagged this as a v1.1 candidate.
- `verbs` field evolution (currently human-authored hints). Same
  v1.1 candidate status.

### What 2c will tackle (per earlier plan amendments)

2c is the hardest remaining design work — per Max's directive, it
gets its own focused audit session after 2b.2 closes. This summary
will be cited as input.

Key 2c questions raised through 2b.2 but not resolved:

- How does the Phase 7 synthesis loop consume `tool.emits` for
  downstream-agent composition graph construction?
- Does Brain v2's salience + proposeBlockRewrite path need schema-
  aware inputs (currently reads BLOCK.md prose)?
- Cross-block capture threading (e.g., `{{coupon.code}}` from
  Payments consumed by an Email tool call): validator handles this
  today via capture-unwrap heuristic, but the composition graph
  doesn't formalize the data-flow edges. 2c candidate.

## Metrics summary

- **6 feature commits** (Booking, Email, SMS, Payments, Intake,
  Landing) landing 2b.2
- **1,655 LOC** of tool schemas shipped across 6 migrations
  (tools.ts files)
- **~350 LOC** of BLOCK.md v2 migration content across 6 blocks
- **~250 LOC** of test wiring + integration fixtures in
  `validator.spec.ts`
- **63 live probes** run (9 × 7 checkpoints), 100% PASS
- **3 archetype hashes** preserved across 7 migrations (PR 3 +
  6 × 2b.2 blocks)
- **0 changes** to `lib/agents/types.ts` across 2b.2
- **0 shared-type regressions**
- **0 tool-signature changes** to `skills/mcp-server/src/tools.js`
  runtime

## Sign-off

2b.2 COMPLETE. Composition Contract v2 is the committed shape for
all 7 core blocks. All archetype synthesis output is structurally
stable at pre-2b.1 quality. The system is ready for 2c.

---

*Co-authored: Max (directive + approvals) × Claude Opus 4.7 (implementation).*
