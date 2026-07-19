---
name: probability-errors
source: https://fs.blog/common-probability-errors/
fetched: true
fetched_on: 2026-07-15
---
# Common Probability Errors

## Core idea
Most probability mistakes aren't math errors — they're structural errors about how events relate. The article catalogs five recurring ones:

1. **Assuming independence when events are dependent.** Connected events have correlated probabilities. A driver with one accident is statistically likelier to have another (insurers price this); steps in a plan share causes, so delays compound rather than average out.
2. **Treating independent events as dependent — the gambler's fallacy.** Past outcomes don't bend future odds of a truly independent event. After a million heads in a row, a fair coin is still 50/50 next flip: "The outcome of one has no effect on the outcome of another."
3. **Clusters happen.** Scan a large enough population and improbable-looking clusters are inevitable by pure chance. A geographic cancer cluster may have no environmental cause at all — our pattern-matching machinery (apophenia) insists on a story anyway.
4. **The prosecutor's fallacy.** Quoting a probability stripped of its statistical context. A "one in a million" DNA match sounds damning — until you learn it was found by searching a database of a million samples, where one match is roughly expected.
5. **Ignoring regression to the mean.** Extreme results carry a large luck component, so the follow-up tends back toward average. A spectacular season, quarter, or launch is partly fortune; expecting a repeat mistakes variance for skill.

## When it bites
- Project planning: scheduling tasks as if their delays are independent (they share staffing, dependencies, and shocks — error #1).
- "We're due": expecting a win because of a losing streak, or a quiet period because incidents have been frequent (error #2).
- Spotting a pattern in a dashboard slice — a spike of churn in one cohort, failures clustering on one route — and hunting a cause before asking if chance over many slices explains it (error #3).
- Evaluating a striking match or anomaly without asking how many chances there were to find one (error #4 — the multiple-comparisons trap).
- Judging people, channels, or strategies off their single best or worst result (error #5).

## How to run it
1. Before multiplying or extrapolating probabilities, ask: are these events actually independent? What common causes link them?
2. For streaks, ask the opposite: is there ANY mechanism connecting past to future here? If not, the streak carries zero information.
3. When a cluster or pattern appears, first compute (or estimate) how surprising it would be given how many places you looked. Clusters often fool us — take random chance seriously as the null explanation.
4. For any impressive statistic, demand its context: out of how many trials/searches/candidates was this found? A snapshot number without its denominator is not evidence.
5. Judge skill by the track record, not the peak — expect extreme results to regress and plan for the mean, not the outlier.

## Failure modes
- **Independence nihilism**: deciding everything is correlated, so no estimate is possible. Many things are independent enough; the discipline is checking, not despairing.
- **Chance as a thought-terminator**: "it's probably just a cluster" can dismiss a real signal. Chance is the null hypothesis, not the conclusion — test it.
- **Regression misread as decline**: an outlier performer returning to their (high) mean is not "getting worse," and intervening right after a bad outlier will look effective even if it did nothing.
- **Gambler's-fallacy inversion (hot hand)**: assuming streaks must continue is the same structural error as assuming they must end.

## Applies here when…
- Revenue/GMV projections: builder signups, activation, and churn are NOT independent — they share the macro AI-agent hype cycle, so best-case-everywhere compounding overstates the tail.
- Launch planning: the ship-feature loop's steps (build → verify → smoke → deploy) share causes of delay; budget for compounding, not averaged, slippage.
- Reading eval/vision_check dashboards: a cluster of failures in one workspace or route may be chance across many workspaces — check the denominator before rearchitecting.
- Interpreting a viral post or a spike week: expect regression to the mean; set the content-engine cadence on the track record, not the best week.
- A/B-ish pricing or landing reads: a striking conversion difference found after slicing many segments is the prosecutor's fallacy in analytics clothing.
