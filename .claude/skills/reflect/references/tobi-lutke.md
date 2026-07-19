---
name: tobi-lutke
source: https://fs.blog/knowledge-project-podcast/tobi-lutke-2/
fetched: true
fetched_on: 2026-07-15
---
# Tobi Lütke — Subtract by first principles, play the infinite game

## Core idea
Tobi's frame (from The Knowledge Project #152, "Calm Progress") is that companies rot by
addition: every locally-reasonable yes deposits a "sediment layer" of process, features, and
bureaucracy that nobody would ever choose from scratch. The founder's distinctive job is
subtraction — and subtraction requires spending accumulated legitimacy (a bank account of
social credit, riffing on Vitalik Buterin's legitimacy essay) that only someone who has "seen
every version of the company" holds. Around that core sit three supporting moves: derive
decisions from first principles rather than best practices (which he reads as code for "take
no risk, copy everyone"); treat decision-making as input-finding — once all relevant inputs
are surfaced, most honest observers converge on the same answer, so disagreement usually
signals a hidden unshared assumption, not a values clash; and orient to the infinite game
(James Carse) — no win condition, the goal is to keep playing — because only infinite players
adapt when the rules change. He explicitly models second- and tertiary-order effects, arguing
they usually dwarf the primary effect everyone argues about.

## When it bites
- You're deciding whether to add a feature, config option, tier, or process "because a big
  customer asked" — the addition looks cheap and the compounding sediment is invisible.
- A codebase or product has accreted subsystems nobody would rebuild, but every removal
  proposal dies because each layer has a local defender.
- You're about to adopt a "best practice" (framework, org ritual, pricing convention) purely
  because peers do it, not because it derives from your constraints.
- Two smart people on the team keep disagreeing about a technical or product call and it's
  turning personal.
- A metric or monetization dial is sitting there begging to be turned, and turning it would
  quietly trade mission trust for near-term revenue.

## How to run it
- Before adding anything, ask: what am I implicitly saying no to during the time this
  consumes? "Adding things is a lot more expensive than removing things."
- Quarterly, hunt sediment: which subsystem, process, or feature would we NOT build if
  starting today? Do I have the legitimacy to delete it — and if I don't spend that
  legitimacy, who ever will?
- On any disputed decision: stop arguing conclusions; list the inputs each side is using.
  Which input does one of us hold that the other hasn't seen? Resolve that, then re-decide.
- Ask what the company (or codebase) ten years from now wishes I decided today — the popular
  choice now often commits the future self to pain.
- For every intervention, force one pass on second-order effects: what does this incentivize
  people to do next, and what does THAT cause?
- Replace "what's the best practice?" with "what would I derive from scratch given my actual
  constraints?" — then check the delta against convention deliberately (Chesterton's fence:
  understand why the convention exists before discarding it).

## Failure modes
- Subtraction without legitimacy: deleting things you don't have the credibility or context
  to delete burns trust instead of sediment. Earn or borrow the account first.
- First-principles as contrarianism: rederiving everything ignores Chesterton's fence and
  wastes cycles re-learning why conventions exist. Derive, then diff against convention.
- Infinite-game framing as excuse: "we're playing the long game" can rationalize never
  shipping, never monetizing, never keeping score at all.
- Input-hunting as stall: at some point the inputs are gathered; convergence should follow.
  If you're still collecting inputs to avoid deciding, that's a different disease.
- Confusing calm with slow: Tobi's frame is calm progress under volatility, not comfort —
  at Shopify, NOT taking risks is what gets performance-managed.

## When building, reach for this when…
- Scoping a feature request and the real cost is future maintenance, not build time.
- Planning a refactor/deprecation and you need to justify deleting working-but-wrong code.
- Choosing architecture or tooling where "industry standard" is the main argument offered.
- Mediating a technical disagreement that has stopped producing new information.
- Setting pricing or monetization where a short-term revenue dial trades against user trust.
