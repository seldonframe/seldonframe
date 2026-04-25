# SLICE 2 PR 1 regression report — 9 live probes

**Date:** 2026-04-23
**Scope:** SLICE 2 PR 1 (block scaffolding — deterministic core).
**Commits:** Audit `e936f187` → C1 `2eb22eb5` → C2 `5bf83da7` → C3 `2bb97d8f` → C4 `06eb59c4` → C5 `463abeb4` → C6 `b0a5bdb9` → C7 `c14ec9bb`.
**Probe model:** `claude-opus-4-7`

---

## Verdict: **9/9 PASS**

| Archetype | Run 1 | Run 2 | Run 3 | Avg cost | SLICE-1-PR-2 baseline | Δ | Hash |
|---|---|---|---|---|---|---|---|
| speed-to-lead | PASS $0.0761 | PASS $0.0768 | PASS $0.0764 | $0.0764 | $0.0765 | −0.1% | `735f9299ff111080` |
| win-back | PASS $0.0839 | PASS $0.0851 | PASS $0.0841 | $0.0844 | $0.0848 | −0.5% | `72ea1438d6c4a691` |
| review-requester | PASS $0.0703 | PASS $0.0708 | PASS $0.0707 | $0.0706 | $0.0706 | 0.0% | `4464ec782dfd7bad` |

**13-in-a-row** hash preservation streak — extended from SLICE 1 PR 2's 12-in-a-row. All three archetype hashes unchanged across:

  PR 3 (CRM v2) →
  2b.2 Booking / Email / SMS / Payments / Intake / Landing →
  2c PR 1 / PR 2 / PR 3 →
  SLICE 1-a →
  SLICE 1 PR 1 / PR 2 →
  SLICE 2 PR 1

Expected outcome — SLICE 2 PR 1 ships deterministic code-gen infrastructure (BlockSpec schema, renderers, file writer, validation gate, orchestrator, SKILL, CLI). Synthesis context is byte-identical to SLICE 1 PR 2 close:

- The one committed scaffolded artifact (the `notes` block in `packages/crm/src/blocks/notes.block.md` + `notes.tools.ts`) is invisible to synthesis because archetype probing doesn't scan `notes` (emit-block-tools TARGETS is a BUILD-time registry, not a synthesis-time one). Even if it did, `notes` has zero tools that existing archetypes reference.
- Scaffolding infrastructure lives under `packages/crm/src/lib/scaffolding/` — a new directory; no cross-reference from `lib/agents/` or synthesis code paths.

## PR summary — 8 mini-commits

| # | Commit | Scope | LOC |
|---|---|---|---|
| Audit rev | `e936f187` | 6 gates resolved + 5 additions + G-3 follow-up doc | 316 |
| C1 | `2eb22eb5` | BlockSpec Zod schema + helpers + 20 tests | 458 |
| C2 | `5bf83da7` | BLOCK.md + tools.ts renderers + 24 tests + 2 flake fixes | 712 |
| C3 | `2bb97d8f` | Handler stub + test stub renderers + 8 tests | 180 |
| C4 | `06eb59c4` | File writer + orphan detection + 9 tests | 325 |
| C5 | `463abeb4` | Validation gate (parser + tsc + emit) + 6 tests | 258 |
| C6 | `b0a5bdb9` | Orchestrator + CLI wrapper + SKILL.md + 7 tests | 630 |
| C7 | `c14ec9bb` | Notes smoke-test block scaffolded end-to-end | 162 |
| **Total (PR 1 excl. audit rev)** | | | **~2,725** |

**LOC framing:**
- Audit target (Max-approved): 2,000-2,500 LOC
- Stop-and-reassess trigger: 3,250 LOC
- Actual: 2,725 LOC — 9% over upper target, 16% under trigger

The overrun is concentrated in C6 (orchestrator + CLI + SKILL.md = 630) and C2's flake-fix (added ~100 LOC of patches that weren't in the original estimate). Both justified:

- C6 includes the SKILL.md (~180 LOC of builder-facing instructions) which wasn't itemized in the audit §11 LOC table separately from the orchestrator — the audit's "MCP tool wiring: 100 / 100 / 0" line combined both. Under-counted by ~180.
- C2's flake fix (~30 LOC edit + ~70 LOC test-updates) caught two wall-clock-sensitive SLICE 1 PR 2 tests that would have silently failed every run after noon UTC on 2026-04-23. Not in the audit because the flake was undiscovered at audit time.

**L-17 1.6x multiplier validation (per audit §4 calibration hook):**

| Component class | Predicted (audit) | Actual |
|---|---|---|
| Production code (1.3x) | ~1,030 | ~985 |
| Test code (1.6x) | ~1,500 | ~1,560 |
| Non-code (SKILL + smoke block + audit rev) | ~150 | ~500 |

Production + test code lands within ~5% of audit prediction. The 1.6x test-multiplier holds for a sequential-pipeline slice. **Adopting 1.6x as the standard for "sequential pipeline, 3+ paths" audits going forward**, per L-17 addendum's calibration rule.

The non-code overhead (SKILL.md + smoke-block artifact + audit revision commit) was under-budgeted in §11 — these are mostly fixed-cost items that scale with "surface area of the shipped capability" rather than path count. Capture as a refinement note for next audit: count SKILL.md / doc / example-artifact LOC separately from renderer/writer LOC.

## Green bar

- `pnpm test:unit` — **570 pass + 1 todo** (the `create_note` test.todo stub the scaffold generated for the notes block; per G-6 these are visible checklist items, not failures).
- `pnpm emit:blocks:check` — clean. The scaffolded `notes.block.md` round-trips cleanly through emit.
- `pnpm emit:event-registry:check` — clean (45 events; SLICE 2 PR 1 does NOT touch the SeldonEvent union per audit §11 containment).
- `tsc --noEmit` — 4 pre-existing errors, zero new.
- 9 archetype regression probes PASS with hash preservation.

## End-to-end pipeline proof

C7 ran the real CLI:

```bash
pnpm scaffold:block --spec /tmp/notes-spec.json --skip-validation
```

The scaffold:
1. Validated the BlockSpec via Zod (C1 layer).
2. Rendered BLOCK.md + tools.ts + test.todo stub (C2 + C3 layers).
3. Wrote all three files via the writer + orphan detection (C4 layer).
4. Skipped the validation gate (intentional — the block wasn't in TARGETS yet; G-5's emit check would fail).

The builder's manual follow-up (per SKILL.md "Next steps"):
5. Added `{ slug: "notes", tools: NOTES_TOOLS }` to emit-block-tools.impl.ts TARGETS.
6. Ran `pnpm emit:blocks` — populated the TOOLS block.
7. Ran `pnpm emit:blocks:check` — clean.
8. Ran `pnpm test:unit` — the test.todo stub surfaced as "todo 1".

The committed `notes.*` files are the byte-for-byte output of the scaffold. Anyone running `pnpm scaffold:block` on the same spec today produces an identical tree.

## What's deferred to PR 2

Per audit §8:
- LLM intent parser (NL → BlockSpec)
- Clarifying-question three-tier flow (G-4) — currently documented in SKILL.md but the builder / Claude Code performs the translation manually
- SeldonEvent union AST editing (ts-morph primary + text-splice fallback, G-2)
- Second smoke-test block driven end-to-end from NL

## Artifacts

- `speed-to-lead.run{1,2,3}.json`
- `win-back.run{1,2,3}.json`
- `review-requester.run{1,2,3}.json`
- Hash utility: `scripts/phase-7-spike/structural-hash.mjs`

## Sign-off

SLICE 2 PR 1 green bar complete. The deterministic scaffold pipeline is live: a BlockSpec in, a validated block skeleton out. 13-in-a-row hash streak preserved. SLICE 2 PR 2 (NL parser + SeldonEvent union AST edit) is unblocked — await Max's GO.

Per rescope discipline: do NOT start SLICE 2 PR 2 until Max confirms.
