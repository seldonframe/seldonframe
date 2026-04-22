# 2b.2 Landing block regression report — 9 live probes (FINAL 2b.2 block)

**Date:** 2026-04-22
**Block migrated:** `landing-pages` (block 6 of 6 in 2b.2 — **final block; 2b.2 COMPLETE after this ships**)
**Probe model:** `claude-opus-4-7`
**Runs captured:** `speed-to-lead.run{1,2,3}.json` / `win-back.run{1,2,3}.json` / `review-requester.run{1,2,3}.json`

---

## Verdict: **9/9 PASS**

| Archetype | Run 1 | Run 2 | Run 3 | Avg cost | Post-Intake baseline | Δ vs post-Intake | Determinism | Validator issues |
|---|---|---|---|---|---|---|---|---|
| **speed-to-lead** | PASS $0.0762 | PASS $0.0768 | PASS $0.0763 | **$0.0764** | $0.0769 | **−0.6%** | 3/3 identical `735f9299ff111080` (same as post-Intake) | 0 / 0 / 0 |
| **win-back** | PASS $0.0850 | PASS $0.0851 | PASS $0.0848 | **$0.0850** | $0.0845 | **+0.6%** | 3/3 identical `72ea1438d6c4a691` (same as post-Intake) | 0 / 0 / 0 |
| **review-requester** | PASS $0.0706 | PASS $0.0707 | PASS $0.0703 | **$0.0705** | $0.0703 | **+0.3%** | 3/3 identical `4464ec782dfd7bad` (same as post-Intake) | 0 / 0 / 0 |

All 9 validator checks run via `pnpm test:unit` under the
`2b.2 Landing regression — 9 live-probe outputs validate clean`
describe block in `packages/crm/tests/unit/validator.spec.ts`. Zero
audit-critical issues across the full set.

**SIX consecutive v2 migrations with zero structural shift.** Hash
stability chain: PR 3 → Booking → Email → SMS → Payments → Intake →
Landing. Same three hashes every time.

## Archetype coverage — expected and confirmed

Per Max's Landing directive:

> "Landing is likely referenced by Speed-to-Lead for lead-capture
> landing pages. Determine archetype coverage from compose_with
> fields."

Survey of the 3 shipped archetypes + grep of all filled probe JSON:

| Archetype | Direct landing tool call | Landing-emitted trigger | Landing in `compose_with` (template or synthesized output) |
|---|---|---|---|
| speed-to-lead | ❌ none | ❌ triggers on `form.submitted` (intake) | ❌ not in current compose_with |
| win-back | ❌ none | ❌ triggers on `subscription.cancelled` | ❌ no |
| review-requester | ❌ none | ❌ triggers on `booking.completed` | ❌ no |

**Verdict:** ZERO archetype coupling. All 9 probe outputs are pure
negative-control. Landing is a publishing surface for cold traffic —
agents drive through `create_landing_page` / `generate_landing_page`
at onboarding time, not inside archetype workflows.

**Why the regression still ran:** hash preservation on unrelated
archetypes is a strong signal that the v2 parser state isn't
bleeding between blocks. If Landing's v2 migration had perturbed the
BLOCK.md ordering, changed the `compose_with` graph Claude sees for
other blocks, or leaked Puck metadata into shared types, we'd
expect some archetype to shift. None did.

## Red flags per 2b.2 directive + Landing-specific — all clear

| Red flag | Status |
|---|---|
| Cost regression >20% on any archetype | No — worst delta is +0.6% (win-back). Speed-to-lead was actually slightly cheaper (−0.6%). |
| Determinism drops below 3/3 structurally identical | No — 3/3 identical within each archetype. |
| **Structural hash shifts vs post-Intake baseline** | **No — all 3 hashes match post-Intake (and every earlier baseline) exactly. Six-in-a-row v2 migrations with zero shift. This is the final 2b.2 migration; the streak closes at 6/6.** |
| Validator false positive on known-good archetype output | No — 0 critical issues across 9 runs. |
| Tool signature changes required | No — runtime `skills/mcp-server/src/tools.js` unchanged; `landing.tools.ts` is new Zod authoring of the 8 Landing tools. |
| **Puck component metadata leaking into lib/agents/types.ts** | **No.** ConversationExit, Predicate, ExtractField, Step — all unchanged through 6 migrations. 32 Puck components across 5 categories documented in `landing-pages.block.md`; none in shared types. |
| **L-18 server-client boundary violation** | **No.** `landing.tools.ts` imports only `zod` and `../lib/blocks/contract-v2`. Zero imports from `lib/puck/config.impl` (client-only), `lib/puck/validator` (pulls the full Puck graph), or anything under `components/` or `app/`. Server routes that transitively pull `landing.tools.ts` are safe to build on Vercel. |
| Accidental re-introduction of pre-L-18 import chain | No — L-18 discipline baked into the file header + BLOCK.md. |

## Gate-by-gate analysis

### Gate 1: deterministic output across 3 runs each
**PASS.** Structural hashes match across runs per archetype AND match every post-migration baseline since PR 3.

### Gate 2: total cost per synthesis <$0.10 average
**PASS.** All three archetypes comfortably under $0.10, within ±1% of post-Intake. Speed-to-lead's slight cost-down is within run-to-run noise.

### Gate 3: PR 2 validator flags zero false positives
**PASS.** All 9 filled specs pass validation with zero audit-critical issues.

### Gate 4: validator catches injected errors (sanity)
**PASS.** Inherited from PR 3 — 2 broken fixtures still surface expected issue codes.

### Gate 5: `pnpm emit:blocks:check` shows no drift
**PASS.** After Landing migration, all 7 v2 blocks (CRM, Booking, Email, SMS, Payments, Intake, Landing) round-trip cleanly. **2b.2 COMPLETE.**

### Gate-L18 (Landing-specific)

L-18 ("Server-side imports of client-only modules fail at build
time, not dev time") was the load-bearing lesson for this block.
Pre-migration check:

- `landing.tools.ts` import list: `zod`, `../lib/blocks/contract-v2`
  (type-only). Nothing else.
- No transitive path to `config.impl.tsx` (the client-only React
  component file that triggered the original 15+ Vercel build
  failures).
- Puck payloads surfaced as `z.record(z.string(), z.unknown())` at
  the MCP boundary — the typed validation lives in
  `lib/puck/validator.ts` + `lib/puck/config-fields.ts`, which is
  a separate import graph unaffected by this migration.

**Zero L-18 risk introduced.** The pattern used by intake.tools.ts
(previous migration) is carried forward: comment-documented
containment discipline at the top of the tool file.

### Containment (Puck-specific)

Per Max's Landing directive: "Puck component metadata leaking into
shared types" is a red flag. Status: **held**.

- `lib/agents/types.ts` — UNCHANGED through 6 consecutive migrations.
  Stripe (Payments), Formbricks (Intake), and Puck (Landing) all
  proved their complexity fits inside their own block without
  needing shared-type extensions.
- The 32 Puck components documented in `landing-pages.block.md` for
  agent-synthesis reference; none leak into `landing.tools.ts` or
  into shared types.
- Rich Puck authoring is a UI concern (via `config.impl.tsx`) or a
  Claude-generation concern (via `generate_landing_page`) — NOT an
  MCP-tool-schema concern.

## Meta: 2b.2 closes here

Six consecutive v2 migrations with zero regression signals:

- **Booking (1/6):** cost ±0.4%, hashes unchanged
- **Email (2/6):** cost ±1.0%, hashes unchanged
- **SMS (3/6):** cost ±0.9%, hashes unchanged
- **Payments (4/6):** cost ±1.2%, hashes unchanged — despite being
  the largest + most complex block
- **Intake (5/6):** cost ±0.4%, hashes unchanged
- **Landing (6/6):** cost ±0.6%, hashes unchanged — **final**

**54 probes total across 2b.2** (9 per migration × 6 migrations),
all PASS, all hash-preserving. v2 shape is empirically proven
Pareto-neutral for Claude synthesis across every archetype gate.

See `tasks/step-2b2-completion-summary.md` for the full 2b.2 close-out.

## Artifacts

- `speed-to-lead.run{1,2,3}.json`
- `win-back.run{1,2,3}.json`
- `review-requester.run{1,2,3}.json`
- Hash utility: `scripts/phase-7-spike/structural-hash.mjs` (shipped
  in Payments migration; standard verification across all 2b.2
  blocks per Max's directive)
