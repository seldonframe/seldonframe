---
name: reflect
description: Run Max's decision-making loop on any decision — strategy, product, pricing, build, or personal. Invoke whenever Max says "reflect" / "reflect on X", or when facing a consequential decision that deserves structured treatment. Stakes-scaled - reversible decisions get a fast pass, irreversible ones get the full battery. Every run ends with an opinionated recommendation and a decision-log entry.
---

# /reflect — the decision-making loop

Compacted from ~24 Farnam Street mental-model articles + the Bezos framework.
The library lives in `references/` — **load only the lenses the decision needs**
(routing table: `references/00-index.md`). Never load all of them; that is its
own failure mode (man-with-a-hammer, analysis theater).

Decision log: `docs/decisions/LOG.md` (+ one file per Type-1 decision).

## Upstream rule — settled decisions stay settled

CLAUDE.md §1b decisions (positioning, pricing ladder, BYOK-as-plumbing, no-Zapier,
reuse-don't-rebuild) are **not re-litigated** by a reflect. If a reflect surfaces
genuinely new evidence against a settled decision, say so explicitly and flag it
for Max — do not quietly reopen it.

## The loop

### 0. Review-debt check (always, first)
Scan `docs/decisions/LOG.md` for entries whose **review-by date has passed** and
status is still `open`. Surface them before anything else:
> "Before this reflect: on <date> we predicted <expected outcome> by <review-by>.
> What happened?" — update the entry's status/outcome from Max's answer (or from
> evidence you can check yourself). This is the calibration flywheel; skipping it
> makes the whole system decorative.

When an entry resolves as a **miss**, distill it into ONE transferable line and
append it to `docs/decisions/LESSONS.md` (create on first miss):
`- YYYY-MM-DD — <prediction> missed because <root cause>. Rule: <one-line rule>.`
Load LESSONS.md at the start of every reflect and apply it before any lens —
Max's own misses outrank any essay.

### 1. Frame the decision (decision-anatomy)
State, in 2-4 sentences:
- **The actual decision** — often not the question as asked. Ask "what problem is
  this decision solving?" before accepting the framing.
- **Owner** — whose call is this? (Max / Claude / a customer / nobody-yet)
- **Trigger** — why now? What breaks if we decide nothing? (No-decision is a decision.)
- **What's conspicuous** — list the crucial information in plain sight before
  analyzing (Robinson: stupidity = overlooking the conspicuous, not lacking IQ).

If a decision-critical fact exists only in Max's head, ask it now — one focused
question, not an interview. Otherwise state assumptions explicitly and continue.

### 2. Classify — the Bezos gate (references/bezos-type1-type2.md, decision-matrix.md)
- **Type 2 (two-way door):** reversible at tolerable cost, blast radius contained.
  → **Quick pass** (§3a). Deciding fast IS the optimization; ~70% of the
  information is the target, not 90%.
- **Type 1 (one-way door):** irreversible or expensive to reverse — public
  commitments, pricing/positioning changes, partnerships, anything touching trust
  ("never-lies"), large irreversible spends, hiring/firing.
  → **Full run** (§3b).
- When unsure, ask: "what would it cost to undo this in 3 months?" If the answer
  is "a bad week," it's Type 2. Most decisions are Type 2 — treating them as
  Type 1 is the more common and more expensive error (velocity loss).

### 3a. Quick pass (Type 2)
1. Pick the **3 most-biting lenses** from `references/00-index.md`. Before
   committing to them, one availability check: *am I picking these because they
   fit, or because they're vivid/recent?*
2. Run them briefly (a few sentences each).
3. Output (§4) in one or two paragraphs. Log = one line in LOG.md.
Total effort target: minutes, not hours. If a quick pass keeps growing, either
the decision was misclassified (go to §3b) or you're bikeshedding (stop).

### 3b. Full run (Type 1)
Work through, loading each reference as you use it:
1. **First principles** — decompose to fundamental truths (costs, physics of the
   business, what customers actually do). Where is the reasoning analogy-based
   ("competitors do X", "that's how SaaS works")? Rebuild those parts from ground truth.
2. **Chesterton's fence** — if the decision removes/replaces something existing,
   establish why it exists before touching it.
3. **Inversion + pre-mortem** (mandatory) — "it's 6 months later and this decision
   failed badly. What killed it?" List the top 3 causes and whether each is
   detectable early or preventable cheaply.
4. **Second-order effects / externalities** — "and then what?" for each option:
   who reacts, what breaks downstream, what incentive does this create?
5. **Optionality & slack** — which option preserves the most future options per
   unit of commitment? Does any option consume all slack (schedule, cash,
   attention) and leave nothing for surprises?
6. **Explore/exploit** — early in a domain → weight exploration; proven channel/
   feature → exploit. Check the interval: how long can we still benefit from
   what we'd learn?
7. **Probability sanity-check** — every estimate used gets a base-rate check
   (what's the outside view / reference class?) and a best-case audit: the plan
   must survive the *likely* case, and the worst day, not just the demo day.
8. **Decision matrix** — only if genuinely 3+ options × 3+ criteria; weight
   criteria before scoring options (else the matrix launders a pre-made choice).

### 4. Answer (always, both paths) — the ANSWER CARD comes FIRST
Max should get the answer in 10 seconds without scrolling. Open the final
output with this card, in plain words a 12-year-old understands:

> **THE CALL:** <one plain sentence — what I'd do>
> **HOW SURE:** ~X% (<coin-flip / leaning / confident / near-certain>)
> **DO THIS NEXT:** <the single concrete next step, incl. any <1-day test>
> **BECAUSE:** <max 3 short bullets. Each: plain reason — "so you <benefit>">
> **THIS FLIPS IF:** <1-3 things that would change the answer — watch for them>

Then a divider, then the full thinking (framing, door check, each lens and what
it surfaced) for when Max wants to check the work. Never make him hunt for the
verdict.

**Plain-words rule (whole output, not just the card):** famous names stay
(Bezos, Munger); every other framework term must carry its meaning in the
sentence — "you can undo this in a week, so we move fast", not "Type 2 with
contained blast radius". "THIS FLIPS IF" is mandatory — if nothing would flip
the call, the analysis was rationalization; say so and redo it.

### 5. Log (always)
Append to `docs/decisions/LOG.md`:
```
| YYYY-MM-DD | <decision, one line> | <call> | T1/T2 | <expected outcome> | <review-by> | open |
```
Type 1 additionally gets `docs/decisions/YYYY-MM-DD-<slug>.md` with: framing,
options considered, lenses run and what each surfaced, the recommendation block
(§4), and Max's final call if it differed from the recommendation (record both —
divergences are the most informative calibration data).
Review-by heuristic: when the expected outcome should be observable — typically
2-6 weeks for tactical calls, a quarter for strategic ones.

## Guardrails (check yourself during every run)
- **Bikeshed alarm** — effort must scale with stakes, not with how easy the topic
  is to have opinions about. If the discussion is vivid but the dollars are small, stop.
- **Availability check** — the lenses and examples that come to mind first are the
  recent/vivid ones, not necessarily the right ones. Scan 00-index.md deliberately.
- **Defensive-decision check** — is this recommendation optimizing the outcome, or
  protecting the recommender? "The safe-looking option" needs the same scrutiny as
  the bold one.
- **Captaincy** — Claude recommends; Max decides. Never launder a recommendation
  as "the data says." Own it: "I'd do X because Y."
- **Break the chain** — if an option creates compounding obligation or dependency
  (favors, vendor/channel reliance, lifestyle-debt-style commitments), price that
  loss of independence in; the cheapest time to say no is at the first link.
- **Optimistic Path** (house rule) — the recommendation must state what happens in
  the failure case, not only the success case.

## Failure modes of this skill itself
- Running all 24 lenses = analysis theater. Three good lenses beat twenty.
- Using the loop to justify a pre-made decision — the "what would change my mind"
  line exists to catch this; if nothing would, the reflect was rationalization.
- Skipping the log because the decision felt small. Small logged decisions are
  cheap calibration data; unlogged ones are nothing.
