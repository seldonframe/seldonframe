---
name: musk-algorithm
source: https://www.elonmuskbook.org/the-book-of-elon-musk-free-online-version/the-algorithm, https://www.elonmuskbook.org/the-book-of-elon-musk-free-online-version/simplicity-wins
fetched: true
fetched_on: 2026-07-15
---
# Musk — the Algorithm: question, delete, simplify, accelerate, automate

## Core idea
A five-step process for improving anything — a product, a factory line, a workflow — where the ORDER is the whole point.
First shrink the problem (question requirements, delete parts), then and only then improve what remains (simplify, accelerate, automate).
Run the steps out of order and you polish, speed up, or robotize things that should not exist.

The book's five steps, in its order and wording:
1. **Make your requirements less dumb.** Every requirement must trace to a named person who takes responsibility — not a department, not "the spec." Requirements from smart people are the most dangerous, because you're less likely to question them.
2. **Try very hard to delete the part or process.** The bias runs toward keeping things "just in case," so counter-bias hard: if you aren't forced to add back roughly 10% of what you deleted, you didn't delete enough.
3. **Simplify or optimize** — only what survived deletion. The most common mistake of smart engineers is optimizing a thing that should not exist; they're trained to answer the question, not to question the question.
4. **Accelerate cycle time.** Speed up only after the process is the right process — digging your own grave faster is not progress.
5. **Automate — last.** The costliest error is automating a flawed process early. Tesla ripped hundreds of robots out of its lines after premature automation.

The canonical cautionary tale: fiberglass mats on Tesla battery packs were automated, accelerated, and optimized — before anyone discovered they served no purpose at all. Deleting them erased ~$2M of robotics along with the part.

The companion simplicity doctrine holds that simplicity IS the win condition — fewer components, fewer failure points, lower cost. "The best part is no part. The best process is no process."
- Simplicity emerges from accumulated small removals, not one dramatic redesign (Fremont output rose ~40% by removing steps).
- Local optimization of many parts in isolation creates global complexity: fifty independently-optimized components needing rivets AND welds AND resin were replaced by a single casting that dissolved the interfaces (Model Y's rear casting cut the body shop ~30%, ~300 robots).
- Honest caveat from the book: simplifying is conceptually easy but brutally hard to actually do.

## When it bites
- **Feature creep** — the roadmap grows because nothing is ever deleted; every feature has a "requirement" behind it that no one owns.
- **Process creep** — standups, approval steps, dashboards, CI stages accumulate; each was once reasonable, none has a named owner who'd defend it today.
- **"Requirements" nobody owns** — a constraint inherited from an old decision, a departed founder, or vague "compliance," treated as physics when it's actually a person's stale opinion.
- **Automating a broken flow** — writing cron jobs, agents, or integrations around a workflow you've never questioned; you've made the dumb thing permanent and load-bearing.
- **Optimizing what should be deleted** — performance-tuning, refactoring, or A/B-testing a page, service, or step whose real best state is "gone."

## How to run it
Run the steps as questions, strictly in this order — never skip forward.
Anything you're about to optimize or automate must first survive steps 1 and 2.

1. **Question every requirement.**
   Ask: "Which named human made this requirement, and would they defend it today?"
   If the answer is a department, a doc, or "that's how it's done," the requirement is unverified.
   Be MOST suspicious of requirements from smart, credible people — those are the ones nobody challenges.
2. **Delete the part or process.**
   Ask: "What happens if this part / step / feature simply doesn't exist?"
   Delete aggressively and expect to restore some of it — if you never add anything back (~10% rule), you were too timid.
3. **Simplify or optimize what survived.**
   Ask: "How do we make this smaller, cheaper, cleaner?"
   Watch for fifty local optimizations creating one global mess; prefer the single-casting move that deletes the interfaces between parts.
4. **Accelerate cycle time.**
   Ask: "How do we shorten the loop?" Faster builds, deploys, feedback — on a flow already verified as the right flow.
   Speeding up the wrong process just gets you to the wrong place sooner.
5. **Automate — last.**
   Ask: "Now that it's questioned, pruned, simple, and fast — should a machine or agent run it?"
   Automation is the reward for finishing steps 1–4, never a substitute for them.

## Failure modes
- **Deleting the load-bearing thing.** The 10% add-back rule assumes cheap reversibility. For one-way doors (data deletion, public API removal, burned trust), pair with Chesterton's fence: understand why the part exists, THEN delete it if the reason is dead.
- **Using "question requirements" to dodge accountability.** Step 1 demands a named owner for every requirement; it is not a license to ignore constraints you dislike. If you delete a constraint, YOUR name goes on that decision.
- **Deletion theater.** Cutting visible, cheap things (a meeting, a button) while the real complexity — the org structure, the architecture — goes unquestioned.
- **Stopping at step 3.** Treating "we simplified it" as done and forfeiting the compounding wins of faster cycles; or the inverse, worshiping speed on a process nobody has questioned.
- **Confusing simple with easy.** The book itself concedes simplifying is hard to execute. Budget real effort; it doesn't fall out of a slogan.

## When building, reach for this when…
- A feature, service, or process step is about to get an optimization/refactor sprint — first ask whether it should exist at all.
- You're about to automate anything (agent, cron, pipeline stage): verify the underlying flow survived questioning and deletion first.
- A spec or backlog keeps growing and nobody can name who owns each requirement — run step 1 as an audit.
- The system has many locally-reasonable parts but the whole feels baroque — look for the single-casting move that deletes the interfaces between them.
- You catch yourself keeping something "just in case" — that phrase is the delete-step trigger; you're supposed to occasionally be wrong about deletions.
