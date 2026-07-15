---
name: first-principles
source: https://fs.blog/elon-musk-framework-thinking/
fetched: true
fetched_on: 2026-07-15
---
# First-Principles Thinking

## Core idea
The Farnam Street article contrasts two modes of reasoning. Most people reason **by analogy**: they look at what others are already doing and copy it with small variations. Musk argues the better frame for hard problems is the physicist's: "boil things down to their fundamental truths and reason up from there." Instead of accepting the current form of a thing — its price, its design, its assumed constraints — you decompose it into what is physically or logically true, then rebuild the solution from those parts.

The article is candid that analogy isn't a sin: pure first-principles reasoning is mentally exhausting, and most of daily life runs fine on analogy. The dividing line is novelty — when you're trying to do something genuinely new, analogy only ever gets you a slightly modified copy of the existing thing, while the physics approach can reach counterintuitive answers (the way physics reached quantum mechanics by trusting fundamentals over intuition). The article also carries a second piece of Musk advice: actively solicit negative feedback, especially from friends — obvious-sounding, rarely done, disproportionately valuable.

(Note: this FS article does not include the battery-cost numbers; that example appears in other Musk interviews.)

## When it bites
- You're pricing, packaging, or designing something by copying the incumbent ("everyone in this market charges per-seat, so we will").
- A cost or constraint is being treated as a law of nature when it's actually just the current market's habit.
- Someone justifies a plan mainly by "that's how X company does it" rather than by why it works.
- You're stuck: every option on the table is a variant of the same inherited template.
- An expert's "impossible" is really "nobody has done it," not "physics forbids it."

## How to run it
1. State the received wisdom explicitly ("agents platforms must charge per usage because costs scale").
2. Decompose to fundamentals: what is *actually* true here — real costs, real physics, real user needs, real constraints? Strip out convention, habit, and pricing of the current incumbents.
3. Ask what each fundamental truly costs or requires at floor, not at today's market price.
4. Reason **up** from those fundamentals to a solution, ignoring how the existing product got built.
5. Sanity-check with analogy afterwards — if your first-principles answer differs wildly from everyone else's, know exactly which assumption you rejected and why.
6. Invite negative feedback on the conclusion before committing; you want the flaw found by a friend, not the market.

## Failure modes
- **First-principles theater** — decomposing into "fundamentals" that are actually just your own assumptions restated; the method is only as good as the truths at the bottom.
- **Applying it everywhere** — re-deriving routine decisions from scratch is exhausting and slow; analogy is the correct tool for cheap, low-stakes, well-trodden choices.
- **Ignoring accumulated wisdom** — sometimes the convention encodes a real constraint (regulation, human behavior) you haven't seen yet; deviation should be explainable, not just contrarian.
- **Analysis as procrastination** — using "let me get to fundamentals" to avoid shipping a reversible test that would answer the question empirically.

## Applies here when…
- The flat-pricing bet is first-principles already: fundamental truth = BYOK makes COGS≈0, so per-usage taxing is convention, not necessity — "we don't tax your work" falls out of the physics, not out of copying GHL.
- Build-vs-reuse calls: decompose to what the feature *fundamentally* needs before assuming a new subsystem — the front-office bridge reusing `createFullWorkspace` is reasoning from what exists, not from how competitors structure theirs.
- Positioning: don't copy incumbent messaging by analogy ("all-in-one CRM"); reason from the fundamental buyer pain (agents that lie, platforms that tax, stacks that go stale).
- Distribution: when a channel playbook is inherited ("SaaS must do paid ads"), check the fundamentals — SF's real edge is generatable supply-side content, which favors SEO/YouTube over paid.
- Skip it for low-stakes calls (component naming, minor copy, tooling defaults) — analogy to the codebase's existing patterns is the right answer there.
