---
name: algorithms-bias
source: https://fs.blog/algorithms-and-bias/
fetched: true
fetched_on: 2026-07-15
---
# Algorithms and Bias

## Core idea
Humans and algorithms fail differently, and the article argues neither should decide alone. Human judgment degrades in predictable ways — we drop information when tired, and we bend evidence toward the outcome we already want. Algorithms are immune to fatigue and motivated reasoning, so they can override those irrationalities and apply a rule consistently. But algorithms are built by humans on human-generated data, so they quietly inherit our prejudices: the article's example is a programmer-recruiting platform that learned to weight visits to Japanese manga sites — a proxy that systematically disadvantaged women with caregiving responsibilities, with no one having intended it.

Two structural sources of algorithmic bias get named. First, data quality — garbage in, garbage out: historical datasets have gaps (women are chronically underrepresented; the default Reference Man — a ~70kg young Caucasian male — stands in for all of humanity in safety gear and medical dosing, with dangerous results). Second, mathematical limits: some fairness problems are provably unsolvable — a recidivism predictor cannot hold both accuracy and error rates equal across demographic groups simultaneously, so a value judgment is baked in no matter what.

The article's stance is ultimately optimistic: nothing inherent in these systems forces them "to repeat the biases of the past." The path: transparency (auditable, regulated models), representative data, and positioning algorithms as decision-support in partnership with a human — not a replacement for judgment.

## When it bites
- You're choosing between "let the model/rule decide" and "let the expert decide" — the real answer is usually a designed division of labor.
- A model performs well on aggregate metrics while quietly failing a subgroup the training data underrepresents.
- A learned proxy feature correlates with a protected or irrelevant trait (the manga-site problem): the algorithm found a shortcut, not the skill.
- The training data describes a Reference User who isn't your actual population.
- Someone claims a scoring system is "objective because it's math" — the values are hidden in the data and the impossibility trade-offs, not absent.

## How to run it
1. Split the decision: let the algorithm do what it's good at (consistency, no fatigue, no motivated reasoning) and reserve the human for what it can't see (context, subgroup harm, changed conditions).
2. Audit the inputs: whose behavior generated this data? Who is missing from it? A gap in the data becomes a systematic failure in the output.
3. Interrogate proxies: for each heavy feature, ask what it actually measures and who it accidentally excludes.
4. Name the fairness trade-off explicitly: when equal accuracy and equal error rates can't coexist, choose deliberately and write the choice down — silence just means the data chose.
5. Demand transparency: if you can't inspect why the model decided, you can't catch inherited bias — prefer auditable rules over opaque scores for consequential calls.
6. Override the algorithm only with a stated reason (new information, known data gap, subgroup harm) — not because the output merely feels wrong; "feels wrong" is often the exact irrationality the algorithm exists to override.

## Failure modes
- **Automation worship**: treating the algorithm's output as objective truth and blindly perpetuating the old injustices encoded in its training data.
- **Reflexive override**: humans discarding algorithmic output whenever it contradicts intuition, which reintroduces fatigue and motivated reasoning — the failure the rule was built to fix.
- **Aggregate blindness**: validating on overall accuracy while a subgroup gets systematically worse outcomes.
- **Fairness hand-waving**: assuming a clever metric can satisfy every fairness definition at once when it's mathematically impossible — someone must own the trade-off.

## Applies here when…
- Never-lies enforcement: guardrails + auto-evals + read-back are the "algorithm" that overrides the LLM's (and the builder's) motivated optimism — keep them deterministic and auditable, and require a stated reason to override a red eval.
- Lead scoring / routing / autopay rules built for agency clients: audit which proxy features drive them, and check performance per client vertical, not just aggregate — an SMB trades dataset has its own "Reference Man."
- The dream/persona reflection loops: cluster-and-propose (algorithm) + Max approves (human) is exactly the partnership pattern — resist auto-applying lessons.
- Build-vs-reuse and pricing calls: run the mechanical checklist/math first (crossover at ~$3.5k GMV, verify-build gates), and treat gut overrides as needing an explicit, written reason.
- Choosing model-graded vs deterministic gates in CI: prefer transparent, inspectable checks for merge-blocking decisions; opaque scorers only as advisory signal.
