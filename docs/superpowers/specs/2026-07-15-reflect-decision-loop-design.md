# /reflect — Decision-Making Loop (Design)

**Date:** 2026-07-15 · **Status:** Approved by Max (chat, 2026-07-15)

## Purpose

Compact ~24 decision-making articles (fs.blog mental models + Bezos framework) into a
skill-driven decision loop. When Max says **"reflect on X"**, Claude runs a structured,
stakes-scaled decision process and logs the outcome for later calibration review.

## Decisions locked (via clarifying Q&A)

| Question | Answer |
| --- | --- |
| Scope | Everything — strategy, product/pricing, build/architecture, personal calls |
| Structure | Core loop (SKILL.md) + per-model reference files loaded on demand |
| Depth | Scaled by stakes — Bezos Type-1/Type-2 gate routes quick vs. full run |
| Decision log | Log everything (`docs/decisions/`) with expected outcome + review-by date |
| Fidelity | Faithful compaction of each article + short "applies here when…" section |
| Sourcing | Fetch all articles live; compact from actual text (no full-text copies — copyright) |
| Interaction | Opinionated recommendation first; ask only decision-critical gaps |
| Calibration | Self-checking — every reflect starts by surfacing past-due review-by entries |

## File layout

```
.claude/skills/reflect/
  SKILL.md                      # the loop: review-debt → frame → classify → run → recommend → log
  references/
    00-index.md                 # routing table: one line per lens, when it bites
    bezos-type1-type2.md        # reversibility gate, 70% rule, disagree-and-commit
    first-principles.md         # Musk physics-not-analogy
    chestertons-fence.md  ooda-loop.md  decision-anatomy.md  decision-matrix.md
    inversion-avoid-stupidity.md   # how-not-to-be-stupid + avoid-bad-decisions (merged)
    availability-bias.md  probability-errors.md  algorithms-bias.md
    slack.md  optionality.md  explore-exploit.md  externalities.md
    bikeshed.md  defensive-decisions.md  captaincy.md
    best-case.md  worst-day.md  break-the-chain.md
    hemingway-suitcase.md  gian-carlo-rota.md
    mental-models-general.md    # the FS hub: latticework + top models not covered above
docs/decisions/
  LOG.md                        # index: date · decision · call · stakes · review-by · status
  YYYY-MM-DD-<slug>.md          # full entries for Type-1 reflects
```

## Reference file format (each ~40–80 lines)

```markdown
---
name: <slug>
source: <url(s)>
fetched: true|false            # false = distilled from knowledge (fetch failed)
fetched_on: 2026-07-15
---
# <Model name>
## Core idea          — faithful compaction of the article
## When it bites      — concrete triggers
## How to run it      — steps / questions to actually apply it
## Failure modes      — how the model misleads when misapplied
## Applies here when… — SeldonFrame-flavored triggers (pricing, positioning, feature bets)
```

Copyright constraint: paraphrase; at most one short quote (<15 words) per file.

## The loop (SKILL.md contract)

1. **Review-debt check** — scan `docs/decisions/LOG.md` for past-due review-by dates; surface first.
2. **Frame** (decision-anatomy) — the actual decision, owner, trigger, cost of no-decision.
3. **Classify** (Bezos gate) — Type 1 (irreversible/high-stakes) vs Type 2 (reversible):
   - Type 2 → quick pass: 3 most-biting lenses from `00-index.md`, one-paragraph
     opinionated recommendation at ~70% information. Log = one line in LOG.md.
   - Type 1 → full run: first-principles decomposition, inversion + pre-mortem
     (mandatory), second-order effects/externalities, optionality check, decision
     matrix when genuinely multi-option, probability sanity-check on estimates.
     Full log entry file.
4. **Recommend** — always ends with: the call, confidence, **"what would change my
   mind"** (mandatory), and cheap tests that would raise confidence.
5. **Log** — append LOG.md line (+ entry file for Type 1) with expected outcome and
   review-by date.

Baked-in guardrails: bikeshed alarm (effort ∝ stakes), availability check on lens
choice, defensive-decision check (protecting outcome vs. protecting self), and
CLAUDE.md §1b settled-decisions rule is upstream of any reflect (never re-litigate).

## Build plan

1. Fan out ~7 subagents; each fetches its assigned URLs live and writes the reference
   files directly (template above). FS hub article gets a dedicated agent.
   Bezos substack fallback: Bezos shareholder letters (primary source), noted in file.
2. Main session writes SKILL.md, 00-index.md, seeds docs/decisions/LOG.md.
3. Review pass over all files (maker ≠ checker spirit: spot-check fidelity + format).
4. Verify end-to-end: run a real reflect on a live pending decision; confirm routing,
   output shape, and log write.
5. Commit → push → PR to main.

## Success criteria

- "reflect on <topic>" reliably triggers the skill and produces a stakes-scaled,
  opinionated output with the mandatory tripwires.
- All ~23 reference files present, faithful, and individually loadable.
- Decision log grows with each reflect; past-due reviews surface automatically.
