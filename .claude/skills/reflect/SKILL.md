---
name: reflect
description: Run a structured decision-making loop on any decision — strategy, product, pricing, career, personal. Invoke whenever the user says "reflect" / "reflect on X" / "reflect review", AND offer it (once) when the user is visibly circling a decision — "I keep going back and forth", "should we X or Y", "pros and cons", "I can't decide". Stakes-scaled - reversible decisions get a fast pass, irreversible ones get the full battery plus an independent adversary. Every run ends with an opinionated call and a logged, scoreable prediction.
---

# /reflect — the decision-making loop

A decision process compacted from ~24 mental-model essays (Farnam Street + the
Bezos shareholder-letter framework). The lens library lives in `references/` —
**load only the lenses the decision needs** (routing table: `references/00-index.md`).
Never load all of them; that is its own failure mode (man-with-a-hammer,
analysis theater).

Decision log: `docs/decisions/LOG.md` (+ PATTERNS.md and LESSONS.md beside it).

## Personalization

If a `CONTEXT.md` exists next to this file, load it first. It holds the user's
settled decisions (things a reflect must never re-litigate), their recurring
decision types, their risk posture, and optionally pointers to their **brain
files** (personal notes, a CLAUDE.md, a lessons journal). When brain files are
listed, skim them during framing (§1) for prior thinking on this decision —
the user's own recorded experience outranks any generic lens.

Also load `docs/decisions/LESSONS.md` if it exists (see §0) — lessons distilled
from the user's own missed predictions are the highest-authority input this
loop has.

## Upstream rule — settled decisions stay settled

CLAUDE.md §1b decisions (positioning, pricing ladder, BYOK-as-plumbing, no-Zapier,
reuse-don’t-rebuild) and decisions Max has marked settled are
**not re-litigated** by a reflect. If a reflect surfaces genuinely new evidence
against a settled decision, say so explicitly and flag it — do not quietly
reopen it.

## The loop

### 0. Review-debt check (always, first)
Scan the decision log for entries whose **review-by date has passed** and status
is still `open`. Surface them before anything else:
> "Before this reflect: on <date> you predicted <expected outcome> by <review-by>.
> What happened?" — update the entry's status/outcome from the answer (or from
> evidence you can check yourself). This is the calibration flywheel; skipping it
> makes the whole system decorative.

When an entry resolves as a **miss**, distill it into ONE transferable line and
append it to `docs/decisions/LESSONS.md` (create the file on first miss):
`- YYYY-MM-DD — <what was predicted> missed because <root cause>. Rule: <one-line rule>.`
Lessons compound: they're loaded at the start of every future reflect and
applied before any lens — your own misses are better teachers than any essay.

### 1. Frame the decision (references/decision-anatomy.md)
State, in 2-4 sentences:
- **The actual decision** — often not the question as asked. Ask "what problem is
  this decision solving?" before accepting the framing.
- **Owner** — whose call is this?
- **Trigger** — why now? What breaks if we decide nothing? (No-decision is a decision.)
- **What's conspicuous** — list the crucial information in plain sight before
  analyzing (stupidity = overlooking the conspicuous, not lacking IQ).

If a decision-critical fact exists only in the user's head, ask it now — one
focused question, not an interview. Otherwise state assumptions explicitly and
continue.

### 2. Classify — the Bezos gate (references/bezos-type1-type2.md, decision-matrix.md)
- **Type 2 (two-way door):** reversible at tolerable cost, blast radius contained.
  → **Quick pass** (§3a). Deciding fast IS the optimization; ~70% of the
  information is the target, not 90%.
- **Type 1 (one-way door):** irreversible or expensive to reverse — public
  commitments, pricing/positioning changes, partnerships, anything touching
  reputation or trust, large irreversible spends, hiring/firing.
  → **Full run** (§3b).
- When unsure, ask: "what would it cost to undo this in 3 months?" If the answer
  is "a bad week," it's Type 2. Most decisions are Type 2 — treating them as
  Type 1 is the more common and more expensive error (velocity loss).

### 3a. Quick pass (Type 2)
1. Pick the **3 most-biting lenses** from `references/00-index.md`. Before
   committing to them, one availability check: *am I picking these because they
   fit, or because they're vivid/recent?*
2. Run them briefly (a few sentences each).
3. Output (§4) in one or two paragraphs. Log = one line in the log table.
Total effort target: minutes, not hours. If a quick pass keeps growing, either
the decision was misclassified (go to §3b) or you're bikeshedding (stop).

### 3b. Full run (Type 1)
Work through, loading each reference as you use it:
1. **First principles** — decompose to fundamental truths (costs, physics of the
   situation, what people actually do). Where is the reasoning analogy-based
   ("competitors do X", "that's how it's done")? Rebuild those parts from ground truth.
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
6. **Explore/exploit** — early in a domain → weight exploration; proven path →
   exploit. Check the interval: how long can you still benefit from what you'd learn?
7. **Probability sanity-check** — every estimate used gets a base-rate check
   (what's the outside view / reference class?) and a best-case audit: the plan
   must survive the *likely* case, and the worst day, not just the demo day.
8. **Decision matrix** — only if genuinely 3+ options × 3+ criteria; weight
   criteria before scoring options (else the matrix launders a pre-made choice).

### 4. Answer (always, both paths) — the ANSWER CARD comes FIRST
The user should get the answer in 10 seconds without scrolling. Open every
reflect's final output with this card, in plain words a 12-year-old understands:

> **THE CALL:** <one plain sentence — what I'd do>
> **HOW SURE:** ~X% (<coin-flip / leaning / confident / near-certain>)
> **WHAT'S AT STAKE:** <order of magnitude: ~$X and/or N weeks — a $500 call and a $50k call must not read the same>
> **DO THIS NEXT:** <the single concrete next step>
> **BECAUSE:** <max 3 short bullets. Each one: plain reason — "so you <benefit>">
> **THIS FLIPS IF:** <1-3 things that would change the answer — watch for them>
> **I TRIED TO KILL THIS:** <only when the call AGREES with the user's stated or implied lean: the strongest opposing case, argued to win, and why it lost. A reflect that agrees without this line is suspect.>

Then a divider, then the full thinking (framing, the door check, each lens and
what it surfaced) for readers who want to check the work. Never make the user
hunt for the verdict.

**Plain-words rule (applies to the whole output, not just the card):** famous
names stay (Bezos, Munger — they're the anchor); every other framework term must
carry its meaning in the sentence. Not "this is Type 2 with contained blast
radius" but "you can undo this in a week, so we move fast." Not "pre-mortem
surfaced three failure vectors" but "imagine it's 6 months later and this
failed — here's what most likely killed it."

The "THIS FLIPS IF" line is mandatory — it's the anti-rationalization tripwire.
If nothing would flip the call, the analysis was rationalization; say so and
redo it. Include cheap tests (under a day's effort) in DO THIS NEXT when they
exist.

### 5. Log (always)
Append to the decision log:
```
| YYYY-MM-DD | <decision, one line> | <call> | T1/T2 | <expected outcome> | <review-by> | open | <agreed? yes/no/new> |
```
Log file header (create on first use):
```markdown
# Decision log
Status values: open (pending) · hit (≈ expected) · miss (diverged — note why) · moot (overtaken).
| Date | Decision | Call | Type | Expected outcome | Review-by | Status |
| --- | --- | --- | --- | --- | --- | --- |
```
Type 1 additionally gets its own file (`docs/decisions/YYYY-MM-DD-<slug>.md`) with:
framing, options considered, lenses run and what each surfaced, the recommendation
block (§4), and the final call if it differed from the recommendation (record
both — divergences are the most informative calibration data).
Review-by heuristic: when the expected outcome should be observable — typically
2-6 weeks for tactical calls, a quarter for strategic ones.

## Be a cofounder, not a consultant (the disagreement contract)

A loop that agrees with the user 80% of the time is a yes-man with good
formatting. Every run:

1. **Beat it first.** Before writing the card, construct the strongest case for
   a DIFFERENT call than the one you're leaning toward — argued to WIN, not to
   tick a box. THE CALL stands only if it survives that attack.
2. **Agreement telemetry.** The log's `Agreed?` column records whether the call
   matched the user's prior lean (`yes` / `no` / `new` when no lean existed).
   If the trailing rate exceeds ~70% yes, say so in the next card:
   "I've agreed with you N of the last M times — treat me as compromised."
3. **Voice.** The card and summary read like a cofounder talking: first person,
   conviction, the user's actual history by name ("this is the same pattern as
   <thing that burned us>"). Framework names live ONLY in the collapsed
   appendix — a cofounder never says "applying the availability heuristic."
4. **Know your person.** Load `PATTERNS.md` (kept next to LOG.md) along with
   LESSONS.md — the user's known tendencies (how their estimates run, what they
   avoid, what they over-rotate on). Seed it honestly from day one; don't wait
   for scored misses. When a pattern fires in a decision, NAME it in the card.
5. **Take the uncomfortable side when it's right.** If every recent call has
   been the safe option (keep, patch, wait), that's the defensive-decision
   guardrail failing — recheck whether the bold option actually loses.

## Ground it in evidence (use your tools, not your vibes)

A reflect run should use whatever tools the agent actually has:

- **Base rates come from search, not memory.** When the analysis leans on a
  market fact, a failure rate, or a "most companies…" claim and web search is
  available, search before asserting — and say what you found vs. what you're
  estimating. Never present a guess and a sourced fact in the same breath
  without labeling which is which.
- **Chesterton's fence is enforced by reading, not remembering.** If the
  decision touches an existing codebase — remove X, rewrite Y, build-vs-buy Z —
  read the relevant code, its git history, and its callers FIRST. "Why does
  this exist?" is answered by `git log`, not by assumption.
- **Prefer running the cheap test over describing it.** If the <1-day test in
  DO THIS NEXT is something the agent can do right now (a benchmark, a grep
  across the codebase, a quick prototype, checking real analytics), offer to
  run it — or run it when the user has already said to proceed — and fold the
  result into the answer. An hour of evidence beats a page of reasoning.

## Growing the library — `reflect learn <source>`

When the user says **"reflect learn <url / person / book>"**, add a new lens:

1. **Fetch the source live** — never write a lens from memory of it. (When this
   library was first built, 2 of 24 essays turned out to be about something
   different than their titles suggested. Fetch first, always.) If the fetch
   fails, say so and ask whether to write a knowledge-distilled version marked
   `fetched: false`.
2. **Compact it into `references/<slug>.md`** using the house template:
   frontmatter (name / source / fetched / fetched_on) then Core idea → When it
   bites → How to run it → Failure modes → a final "reach for this when…"
   section with concrete triggers. 50-90 lines. Paraphrase; max one quote under
   15 words.
3. **Add one routing line to `references/00-index.md`** under the right section
   (or a new one), following the "when it bites" one-line format.
4. **Report** what was added and the situations where the new lens will now
   fire, so the user can correct the routing while it's fresh.

## STOP — you're rationalizing (red flags, both directions)

**For you, the agent running this loop.** These thoughts mean stop and do the
step anyway. Not negotiable:

| Thought | Reality |
|---|---|
| "The lean is obviously right — skip the beat-it step" | The beat-it step exists precisely for obvious leans. |
| "This feels like a quick pass" (money / reputation / people involved) | Recheck the real undo cost — misclassified one-way doors are the expensive mistake. |
| "I'll log it after" | Unlogged reflects are decorative. Log before the turn ends. |
| "The user sounds confident; agreeing is safe" | Defensive agreement is the yes-man failure this loop was rebuilt to kill. |
| "No need to check the scoreboard this time" | The scoreboard IS the product. Thirty seconds. |
| "This lens fits" (because it's the most recent/vivid one) | Scan 00-index.md deliberately; recent ≠ relevant. |
| "Recommending the bold option feels risky" | If every recent call was keep/patch/wait, you're protecting yourself, not the outcome. |
| "The data says…" | You say. Own it: "I'd do X because Y." The human decides. |
| "The success case is compelling" | State the failure case too, always. |
| "This topic is fun to analyze" | Effort scales with stakes, not with how easy the topic is to opine on. |

**For the user's words.** When the decision framing contains one of these,
quote it back and check it inside the card:
- *"it's basically reversible"* → compute the actual undo cost
- *"this time is different"* → base rate first
- *"everyone in the space does X"* → that's analogy, not analysis
- *"we can always change it later"* → later has a price; name it
- *"quick question"* (about money, reputation, or people) → probably not quick

## Maker ≠ checker — one-way doors get an independent adversary

You are the worst judge of your own analysis, for the same reason authors
don't review their own code. On **Type 1 runs**, if the environment can spawn
subagents (Claude Code's Agent/Task tool), dispatch an INDEPENDENT adversary
before writing the card: give it the framing and the evidence but **not your
lean**; it returns its own call plus the strongest case against any
alternative. Where it disagrees with you, the card must say so and adjudicate
openly. No subagent support → the beat-it rule is the fallback, stated as such.

## The weekly ritual — `reflect review`

When the user says **"reflect review"** (or on a schedule, if they set one):
score every due prediction (hit / miss / moot) · distill each miss into
LESSONS.md · then output THE SCORECARD:

> **SCORECARD — <date>**
> Scored: N decisions · Hit rate: X%
> Calibration: when I said ~80% I was right a/b · ~60% → c/d
> Biggest miss: <one line> → lesson saved
> Due next week: <list>

The scorecard is deliberately screenshot-shaped. It is the receipt that no
summary, thread, or book can fake: the predictions are in git history before
the outcomes existed.

## Failure modes of this skill itself
- Running all 24 lenses = analysis theater. Three good lenses beat twenty.
- Using the loop to justify a pre-made decision — the "what would change my mind"
  line exists to catch this; if nothing would, the reflect was rationalization.
- Skipping the log because the decision felt small. Small logged decisions are
  cheap calibration data; unlogged ones are nothing.
