---
name: extract-approach
description: The recorder — after every non-trivial solved problem, write ONE learnings note capturing the approach, the judgment calls, and the reusable rule, written for a weaker model reading cold. A solution without its learnings note is unfinished work.
---

# extract-approach — the recorder

Every hard problem solved in a session leaves reasoning that evaporates when
the session ends. This skill converts it into a permanent asset: one note per
solved problem, readable by every model (and human) that comes after —
especially models LESS capable than the one that solved it.

## When to fire
After every NON-TRIVIAL solved problem: a diagnosed bug with a non-obvious
root cause, an architecture decision, a gnarly integration, a strategy call.
NOT for routine edits, mechanical fixes, or anything a fresh session would
re-derive in under a minute.

## The note — write to `docs/learnings/YYYY-MM-DD-<slug>.md`

Four sections, in this order, each as short as truth allows:

1. **The problem, in one line.** The observable symptom or question — not the
   solution restated.
2. **The approach.** The decomposition that worked, as plain numbered steps a
   weaker model could re-execute. Include the dead ends only if skipping them
   is the insight.
3. **Judgment calls.** What was deliberately NOT done, and why. This is the
   highest-value section — a weaker model can follow steps but cannot
   reconstruct restraint.
4. **The reusable rule, one line.** The generalization that prevents the whole
   class of problem. If it's a correction of how we work, ALSO append it to
   `tasks/lessons.md` (one line, per CLAUDE.md §2.3).

## Rules
- Written for a weaker model reading COLD: no session references ("as we saw
  above"), no unexpanded codenames, absolute dates only.
- One problem = one note. Don't bundle. Atomized notes get retrieved and
  reused; a bundled report gets stored and forgotten.
- If the fact is durable PROJECT state rather than an approach (a config, a
  gotcha, a decision), it belongs in the memory directory instead — this skill
  is for HOW the problem was cracked, not what is now true.
- Cross-link: name related learnings notes and memory entries where they
  genuinely connect.
- The note is part of the task's definition of done. Commit it with the fix.
