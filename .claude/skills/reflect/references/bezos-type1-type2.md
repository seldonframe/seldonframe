---
name: bezos-type1-type2
source: https://productmindset.substack.com/p/bezos-decision-making-framework
fetched: true
fetched_on: 2026-07-15
---
# Bezos Type 1 / Type 2 Decisions

## Core idea
Bezos splits decisions by one axis: reversibility.

- **Type 1 — one-way doors.** Consequential and nearly irreversible (selling the company, quitting a job). Walk through and you can't walk back. These deserve slow, methodical, deliberate process.
- **Type 2 — two-way doors.** Changeable and reversible (launching a service, adjusting pricing, starting a side project). They can feel weighty, but undoing them costs relatively little. These should be made fast, by individuals or small groups close to the work — not by the top of the org.

The article's five rules for high-velocity decision-making: (1) match the process to the decision type instead of one uniform methodology; (2) push decision authority down so leadership isn't the bottleneck; (3) decide "with somewhere around 70 percent of the information you wish you had" — waiting for 90% usually means you're too slow; (4) replace sequential hierarchical approval chains with simultaneous dialogue; (5) use disagree-and-commit to keep moving once perspectives are aired. Bezos modeled the last one himself, greenlighting an Amazon Studios show he was skeptical of because the team had conviction — he asked them to gamble with him rather than demanding consensus.

## When it bites
- You're agonizing over something you could ship behind a flag, watch, and revert in a day.
- A cheap, reversible experiment has been sitting in "needs more analysis" for weeks.
- You're about to make a genuinely irreversible call (public pricing commitment, brand pivot, contract) with the same casualness as a UI tweak.
- A team is escalating routine calls upward, and the calendar of the most senior person is the real constraint on velocity.
- Two smart people disagree and the decision is stalled waiting for consensus that will never come.

## How to run it
1. Ask first: **can this be undone, and at what cost?** Be honest — most decisions that feel like Type 1 are Type 2 (feature flags, small launches, price tests). Very few are true one-way doors.
2. If Type 2: decide now, at ~70% of the information you'd like, with the smallest group that has context. Set a tripwire for what "revert" looks like and move.
3. If Type 1: slow down deliberately. Gather more information, widen the input, sleep on it, model the failure case.
4. When people disagree on a Type 2 call: air the arguments once, then someone says "I disagree and commit" and everyone executes as if they agreed.
5. Audit your process regularly: are you running heavyweight review on two-way doors?

## Failure modes
- **Type-1 process on Type-2 decisions** → slowness, reflexive risk aversion, too few experiments, and ultimately diminished invention. This is the common failure in organizations of any size.
- **Type-2 process on Type-1 decisions** → fast, casual, irreversible disasters. Speed is only a virtue where the door swings both ways.
- **Misclassification** — calling something reversible when unwinding it is actually expensive (reputation, data migration, public commitments). Reversibility is about the real cost to undo, not whether an undo button technically exists.
- **Disagree-and-commit as a gag order** — using it to skip the disagreement stage instead of to end it after genuine airing.

## Applies here when…
- Feature flags make almost every SeldonFrame ship a two-way door — flip on, smoke, flip off. Treat "should we build/merge X" as Type 2 and default to velocity.
- Pricing is the standing Type 1: the ladder ($29/$49/$99+) and the "never-taxes" 2% GMV structure are public commitments (see §1b "do not re-litigate") — changing them again burns trust, so they got deliberate, slow treatment once and are now settled.
- Positioning bets (never-lies / never-taxes / never-goes-stale) are near-Type-1 once broadcast across 90+ SEO guides and the landing — re-messaging costs a full content rewrite.
- Distribution experiments (a Reddit post, an X thread format, one YouTube video) are pure Type 2 — decide at 70%, ship, read the numbers, iterate.
- The build loop already encodes disagree-and-commit: human gates at spec + merge, subagents commit to the approved plan without re-litigating it mid-build.
