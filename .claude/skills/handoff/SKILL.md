---
name: handoff
description: Write a session handoff that lets a fresh agent (or you after compaction) resume cold with zero re-discovery. Use when ending or pausing a work session, before a likely compaction, or when passing work to another agent/worktree. Captures STATE (what is true now) over INSTRUCTIONS (what to do) — state survives when plans change; step-lists rot.
---

# handoff — resume cold, lose nothing

A handoff is not a to-do list. It is a **snapshot of reality** precise enough
that a fresh agent with no memory of this session can pick up exactly where you
left off and make the next correct move. Prefer **state over instructions**:
"flag `SF_X` is committed but OFF; flip preconditions are Y" beats "go turn on
the flag." State stays true when plans change; instructions rot the moment
anything shifts.

## When to use
- Ending or pausing a session with unfinished work.
- You sense a compaction coming (long session) and want the load-bearing state
  written down, not summarized away.
- Passing a task to another agent, another worktree, or your future self.

## Write these 8 sections (skip one only if truly empty)

1. **Goal** — the one-sentence objective and why it matters; what "done" looks
   like, observably.
2. **State now** — what is *actually true* this moment: what's built, merged,
   committed (name the shas + branch), deployed, flagged (on/off), reverted.
   The load-bearing section. Facts, not narration.
3. **Where it lives** — branch, worktree path, the 3-5 key files/seams, the
   spec/plan doc, any relevant PR/deploy URL. The map, so the next agent doesn't
   re-discover it.
4. **Next step** — the single most correct next action, concrete enough to start
   on, then the 2-3 that follow. Not a full plan — the next move.
5. **Open decisions** — what's genuinely undecided and needs the human, each
   with the options + your recommendation. Mark what's already *settled* so it
   isn't re-litigated.
6. **Constraints & gotchas** — invariants and traps not obvious from the code:
   house rules, money-safe boundaries, "don't touch X," the sharp edge that
   already bit someone this session.
7. **Verification** — how "done" is proven here (the validation command, the
   gate, the smoke), and what's been verified vs. still assumed.
8. **Preconditions / blockers** — what's waiting on someone else (a key in the
   env, a review, a deploy, an external gate) before the next step can run.

## Quality bar
- **Absolute over relative:** "flip after the Upstash check on 2026-07-05," not
  "flip it soon." Convert every relative date/reference to an absolute one.
- **Shas and paths, not vibes:** name the commit, the branch, the file. A fresh
  agent can `git show` a sha; it can't act on "the change from earlier."
- **Say what's NOT done and what's unverified.** An honest gap is worth more than
  an optimistic "should be fine" — the reader inherits your blind spots unless
  you name them.
- **One artifact.** A handoff the next agent must reassemble from five places
  isn't a handoff. Put it in one file (or one message).

## Why state over instructions
Instructions assume the world holds still: "then do step 4" is wrong the moment
step 3's result differs. State describes the world so the next agent chooses the
right step *given how things actually are*. A good handoff makes itself robust to
being read late — after a merge, a revert, or a changed decision — by recording
what is true, not what was planned. Pairs with `verify-build` (the gate that
defines "done") and, on this project, with the persistent memory index
(`MEMORY.md`) for facts that should outlive the session entirely.
