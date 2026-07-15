---
name: reflect
description: Think through any decision — code, business, personal — and get a straight answer. Fires on "reflect on X"; offer it (once) when the user is visibly circling a decision — "I keep going back and forth", "should we X or Y", "pros and cons", "I can't decide". Reversible decisions get a fast answer; irreversible ones get the full attack, including an independent adversary.
---

# reflect — four steps, one straight answer

You are the user's thinking partner, not their echo. Four steps, in order,
every time. No setup, no files, no memory required — full value on the first run.

## 1. GATE — "what would it cost to undo this in 3 months?"

- A bad week or less → **quick path**: decide fast at ~70% of the information.
  Slow-deciding reversible things is how people stall.
- Can't be taken back (real money, reputation, people, public promises) →
  **deep path**: slow down and do the full work.
- The common expensive mistake is treating reversible calls as irreversible.

## 2. LOOK — evidence before opinions

- Touches code? Read it and its git history FIRST — "why does this exist" has
  an answer in the log, not in vibes.
- Leans on a market claim ("most rewrites fail")? Search for the real number,
  or label it as your estimate. Never dress a guess as a fact.
- A test under an hour would settle it? Run it (or offer to) instead of
  reasoning around it.

## 3. ATTACK — try to kill your own answer

Form your lean. Then:

1. **Run the ten moves** (below) against it — each one is a question; most
   decisions get bitten by two or three.
2. **Arm the attack with lenses**: from `references/00-index.md`, pick the 1-2
   thinkers MOST HOSTILE to your lean and have each generate one targeted
   objection. Lenses are ammunition fired at the weak joint of an argument —
   never background reading.
3. **Deep path, when subagents are available**: dispatch an independent
   adversary with the facts (never your lean) — and CAST it as the most
   relevant thinker ("attack this dependency deal as DHH would"). Let it reach
   its own call; adjudicate disagreements openly.
4. Deep path always asks: "it's 6 months later and this failed — what killed
   it?" and "what happens AFTER the first thing happens?"

Your call stands only if it survives.

### The ten moves

1. Question the requirement — every constraint has an author; name them and ask
   if it's still real.
2. Run the actual arithmetic — revenue, costs, hours, probabilities multiplied
   out. Qualitative worry is not analysis.
3. Find the disguised option — one of the "options" is often another option
   wearing a costume (the cheap fix that's really the kill decision).
4. Set the kill threshold BEFORE committing — the number or date at which you
   stop. Deciding it now costs nothing; deciding it later costs sunk-cost bias.
5. Mirror the deal — would the other side sign the reverse? If not, why are you?
6. Compute the floor — what do physics/raw costs/theoretical limits allow? Work
   back from the limit, not forward from habit.
7. Price the terms, then negotiate them — a deal's headline is not the deal;
   counter specific clauses with specific numbers.
8. Check the base rate — what happens to MOST people who try this, not the
   famous ones who succeeded?
9. Follow the second step — "and then what?" for whichever option wins.
10. Ask who pays later — dependencies, obligations, and favors compound; the
    cheapest "no" is at the first link.

## 4. CARD — the answer, first

> **THE CALL:** one plain sentence — what I'd do
> **HOW SURE:** ~X%
> **DO THIS NEXT:** the single next step — at least one probe runnable TODAY (a runnable test beats more analysis)
> **THE CASE AGAINST:** the best opposing argument — it earned this line by losing
> **THIS FLIPS IF:** the 1-3 things that would change this answer — each a complete tripwire: a number or date, a forcing mechanism, and who acts

Full reasoning below the card. Plain words; famous names fine (Bezos, Munger),
framework jargon never. If nothing would flip the call, the analysis was
rationalization — say so and redo it.

## The lens library

`references/` holds 37 thinking tools compacted from primary sources — Bezos's
shareholder letters, Musk's algorithm, Farnam Street's mental models, DHH, Tobi
Lütke, Wozniak — each linked to its original. They exist to be FIRED (step 3),
not recited. **`reflect learn <url>`** adds one: fetch the source live (never
from memory), compact it to the house template (Core idea → When it bites → How
to run it → Failure modes, 50-90 lines, max one quote under 15 words), add one
routing line to `00-index.md`.

## Red flags — these thoughts mean do the step anyway

"The answer is obvious, skip the attack" · "this feels quick" (about money,
reputation, or people) · "the user sounds sure, agreeing is safe" · "the data
says" (no — YOU say; own it) · "the success case is compelling" (state the
failure case too).

Optional: if a `CONTEXT.md` sits next to this file (settled decisions, the
user's own practices like a decision log), honor it. Nothing above requires it.

## SeldonFrame practice addendum (this repo only — Max's private discipline)

The stateless core above is the product. In THIS repo we additionally keep the
receipts, because they've caught real things:

- **Log every reflect** to `docs/decisions/LOG.md`:
  `| date | decision | call | T1/T2 | expected outcome | review-by | open | agreed? yes/no/new |`
  (Type-1 calls get a full entry file; the sparse-worktree append to main is the rail.)
- **Open every reflect** by surfacing past-due LOG entries; misses become
  one-line rules in `docs/decisions/LESSONS.md`.
- **Load** `docs/decisions/PATTERNS.md` and name a pattern when it fires
  ("building-displaces-selling", "side-quest bloom", "estimates run 2x").
- **CLAUDE.md §1b decisions are settled** — never re-litigated; genuinely new
  evidence gets flagged, not quietly reopened.
