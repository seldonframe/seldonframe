# 2b.2 Intake block regression report — 9 live probes

**Date:** 2026-04-22
**Block migrated:** `formbricks-intake` (block 5 of 6 in 2b.2, after Booking + Email + SMS + Payments)
**Probe model:** `claude-opus-4-7`
**Runs captured:** `speed-to-lead.run{1,2,3}.json` / `win-back.run{1,2,3}.json` / `review-requester.run{1,2,3}.json`

---

## Verdict: **9/9 PASS**

| Archetype | Run 1 | Run 2 | Run 3 | Avg cost | Post-Payments baseline | Δ vs post-Payments | Determinism | Validator issues |
|---|---|---|---|---|---|---|---|---|
| **speed-to-lead** 🎯 | PASS $0.0787 | PASS $0.0757 | PASS $0.0762 | **$0.0769** | $0.0766 | **+0.4%** | 3/3 identical `735f9299ff111080` (same as post-Payments) | 0 / 0 / 0 |
| **win-back** | PASS $0.0841 | PASS $0.0848 | PASS $0.0846 | **$0.0845** | $0.0843 | **+0.2%** | 3/3 identical `72ea1438d6c4a691` (same as post-Payments) | 0 / 0 / 0 |
| **review-requester** | PASS $0.0703 | PASS $0.0700 | PASS $0.0705 | **$0.0703** | $0.0700 | **+0.4%** | 3/3 identical `4464ec782dfd7bad` (same as post-Payments) | 0 / 0 / 0 |

🎯 = archetype that triggers on `form.submitted` (intake's produces).

All 9 validator checks run via `pnpm test:unit` under the
`2b.2 Intake regression — 9 live-probe outputs validate clean`
describe block in `packages/crm/tests/unit/validator.spec.ts`. Zero
audit-critical issues across the full set.

Hashes computed by `scripts/phase-7-spike/structural-hash.mjs`
(shipped with Payments migration). **Five consecutive v2 migrations
with zero structural shift** — PR 3 → Booking → Email → SMS →
Payments → Intake, same hash per archetype every time.

## Archetype coverage — expected vs actual

Per Max's 2b.2 Intake directive:

> "Determine which archetypes actually reference Intake in their
> current compose_with and run 9-probe regression if any do."

Survey of the 3 shipped archetypes (as of 2026-04-22):

| Archetype | Direct intake tool call | Intake-emitted trigger | Intake in compose_with (template) |
|---|---|---|---|
| speed-to-lead | ❌ none | ✅ `form.submitted` w/ filter.formId | ✅ yes (via archetype UI `valuesFromTool: "list_forms"`) |
| win-back | ❌ none | ❌ triggers on `subscription.cancelled` | ❌ no |
| review-requester | ❌ none | ❌ triggers on `booking.completed` | ❌ no |

**Verdict:** Only Speed-to-Lead has any intake coupling, and it's
trigger-level only (event + filter), not tool-call. This means:

- 9-probe regression IS still valuable → catches any shift in how
  the v2 contract's `produces` / `consumes` parsing affects
  trigger-event resolution.
- Win-Back + Review-Requester hashes = pure negative-control: if
  they ever shift on a block migration they don't reference, the
  v2 parser has leaked state.
- Hash preservation across all 3 confirms the intake v2 shape
  doesn't perturb unrelated archetype synthesis.

## Red flags per 2b.2 directive + Intake-specific — all clear

| Red flag | Status |
|---|---|
| Cost regression >20% on any archetype | No — worst delta is +0.4% (speed-to-lead & review-requester). |
| Determinism drops below 3/3 structurally identical | No — 3/3 identical within each archetype. |
| **Structural hash shifts vs post-Payments baseline** | **No — all 3 hashes match post-Payments exactly. Five-in-a-row v2 migrations with zero shift.** |
| **Hash shift on Speed-to-Lead** (archetype that triggers on intake's event) | **No — `735f9299ff111080` preserved.** Trigger-resolution on `form.submitted` is stable across v2 migration. |
| Validator false positive on known-good archetype output | No — 0 critical issues across 9 runs. |
| Tool signature changes required | No — runtime `skills/mcp-server/src/tools.js` unchanged; `intake.tools.ts` is new Zod authoring of the 7 Intake tools. |
| **Formbricks types require lib/agents/types.ts extension** | **No.** ConversationExit, Predicate, ExtractField, Step — all unchanged through 5 migrations. Formbricks-specific complexity (15 question types, logic operators, webhooks, ActionClasses, display options) lives in `formbricks-intake.block.md` and in the runtime API — not in shared types, not in the MCP tool surface. |
| **Return-shape mismatch** (intake returns `{ok: true, ...}` not `{data: {...}}`) | **Handled correctly.** Validator's capture-unwrap heuristic (types.ts:35) binds `{{capture}}` to `data` when present and to the full returns otherwise. `intake.tools.ts` preserves the `{ok: true, forms|form|submissions|deleted: ...}` shape exactly as it appears at runtime. No silent wrapping in `{data: {...}}` to match sibling blocks. |

## Gate-by-gate analysis

### Gate 1: deterministic output across 3 runs each
**PASS.** Structural hashes match across runs per archetype AND match post-Payments, post-SMS, post-Email, post-Booking, PR 3 baselines.

### Gate 2: total cost per synthesis <$0.10 average
**PASS.** All three archetypes under $0.10, within ±0.4% of post-Payments baseline. Intake migration adds ~2 KB to the BLOCK.md context (7 tool JSON Schemas) but this doesn't register as a cost delta above noise.

### Gate 3: PR 2 validator flags zero false positives
**PASS.** All 9 filled specs pass validation with zero audit-critical issues.

### Gate 4: validator catches injected errors (sanity)
**PASS.** Inherited from PR 3 — 2 broken fixtures still surface expected issue codes.

### Gate 5: `pnpm emit:blocks:check` shows no drift
**PASS.** After Intake migration, all six v2 blocks (CRM, Booking, Email, SMS, Payments, Intake) round-trip cleanly.

### Gate-ReturnShape (Intake-specific)

The validator's capture-unwrap convention is a potential landmine
for any block that DOESN'T use the `{data: {...}}` envelope. Intake
is the first such block. The check:

- `list_forms` returns `{ok: true, forms: FormRecord[]}` (no `data` key).
- If an archetype ever writes `capture: "forms"`, subsequent refs
  resolve to `{{forms.forms}}` (bound to full returns) — NOT to
  `{{forms.data.forms}}`.
- `intake.tools.ts` schemas match runtime `skills/mcp-server/src/tools.js:1124`
  exactly.

Current state: no shipped archetype captures from an intake tool,
so this gate is latent — but the containment was verified at
migration time to prevent a silent break when intake-composed
archetypes arrive.

### Containment (Formbricks-specific)

Per Max's Intake directive: "Formbricks-specific metadata leaking
into shared types" is a red flag. Status: **held**.

- `lib/agents/types.ts` — UNCHANGED through 5 migrations.
- The 15 question types, conditional logic operators, webhooks,
  ActionClasses, display options, variables, endings — all
  documented in `formbricks-intake.block.md` for agent-synthesis
  reference; none of them surface in `intake.tools.ts` or in shared
  types. MCP tools expose only the simple SMB-facing form primitive
  (`name`, `slug`, `fields[]`, `is_active`) — which is the runtime
  API surface agents can reach via MCP.
- `FormField` uses a small enum (`text|email|tel|textarea|select`)
  rather than the full 15-type Formbricks enum. Intentional: the
  MCP-tool `create_form`/`update_form` paths only speak the simple
  SMB form primitive. Rich Formbricks surveys are configured via
  the admin UI or through `seldon_it` mutations, not via these MCP
  tools.

Proves the abstraction is correctly placed: the complexity of
Formbricks is a BLOCK.md concern, not a shared-type concern, and
not a tool-schema concern either.

## Pattern confirmed for final 2b.2 block

Five consecutive v2 migrations with zero regression signals:

- **Booking (block 1/6):** cost ±0.4%, hashes unchanged
- **Email (block 2/6):** cost ±1.0%, hashes unchanged
- **SMS (block 3/6):** cost ±0.9%, hashes unchanged
- **Payments (block 4/6):** cost ±1.2%, hashes unchanged
- **Intake (block 5/6):** cost ±0.4%, hashes unchanged

Landing (block 6/6) is the last remaining migration. Landing
references (verbatim from its v1 BLOCK.md) a modest tool surface
and the same v2 pattern should apply mechanically.

## Artifacts

- `speed-to-lead.run{1,2,3}.json`
- `win-back.run{1,2,3}.json`
- `review-requester.run{1,2,3}.json`
- Hash utility: `scripts/phase-7-spike/structural-hash.mjs` (shipped in Payments migration; now standard verification per Max's directive)
