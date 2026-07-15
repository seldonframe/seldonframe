---
name: hemingway-suitcase
source: https://fs.blog/hemingway-suitcase/
fetched: true
fetched_on: 2026-07-15
---
# The Hemingway Suitcase

## Core idea
December 1922, Gare de Lyon, Paris: Hemingway's wife Hadley, traveling to
bring him his work, briefly left their bags with a porter while she bought
water — she was ill and rushing. The suitcase holding nearly everything he
had written vanished: originals, handwritten notes for a novel, and (as he
learned to his horror) the carbon copies too, packed in the same case. Only
two stories survived. Hemingway was devastated enough to travel back to Paris
just to confirm it was real, and wrote about the anguish decades later. The
article draws two lessons. First, on how the loss happened: it wasn't one big
mistake but converging vulnerabilities — illness, time pressure, an
unfamiliar, chaotic environment — the exact conditions under which capable
people commit what Adam Robinson defines as stupidity, "overlooking or
dismissing crucial information." Second, on what the loss produced: Hemingway
didn't quit; forced to rewrite from nothing, he developed the stripped,
short-sentence style he became famous for, and four years later published
*The Sun Also Rises*. The work was gone; the capacity that produced it was
not — and the redo, done by a writer who had already made every mistake once,
came out better.

## When it bites
- Work is destroyed or invalidated — lost files, a dead branch, a rewrite
  forced by a platform change — and the instinct is to mourn the artifact
  instead of asking what the redo could improve.
- You (or your process) are operating under the stupidity-inducing trio:
  rushed, tired/sick, outside routine — precisely when backups get skipped
  and the carbons ride in the same suitcase.
- Sunk-cost grief keeps a team patching a first draft that would honestly be
  faster and better rebuilt from what they now know.
- All copies of something irreplaceable travel together — a single point of
  failure disguised as diligence.

## How to run it
- Separate what's truly lost (the artifact, the hours) from what's retained
  (the judgment, the map of dead ends, the sharpened taste). Usually the
  second list is the valuable one.
- Treat a forced redo as a design opportunity: version two is written by
  someone who has already solved the problem once. Ask what the first version
  taught before retyping it.
- Audit for suitcase risk: never let originals and "backups" share one
  container, one branch, one account, one vendor.
- Notice the conditions, not just the person: when a task must happen under
  time pressure, fatigue, or novelty, add friction — checklists, a second
  pair of eyes — because that's when crucial details get dismissed.
- After any loss, resist the urge to reconstruct verbatim; rewrite toward
  what you were actually trying to say.

## Failure modes
- Romanticizing loss: "it'll come back better" is not a backup strategy, and
  most lost work is just lost. The lesson is resilience *given* a loss, not
  indifference to prevention.
- Using the redo excuse to churn: rewriting things that weren't lost and
  didn't need rewriting (the Runaway Refactor in disguise).
- Blaming the Hadley: pinning a systems failure (no separation of copies) on
  the individual who happened to be holding the bag.
- Assuming capacity always survives — some losses (data, trust, a client's
  records) are genuinely unrecoverable and deserve prevention-grade paranoia.

## Applies here when…
- A branch, worktree, or generated build is lost or superseded — the specs,
  lessons files, and memory notes are the capacity; the code is the suitcase.
- A model deprecation or platform shift invalidates a subsystem: rebuild on
  the thin-harness thesis rather than reconstructing the old shape (that is
  never-goes-stale, practiced).
- Late-night, pre-launch, rushed-merge conditions are exactly when the
  Robinson trio strikes — that's when the verify-build gate must not be
  skipped.
- Client workspace data, souls, and brains must never share one failure
  domain with their backups — no carbons in the suitcase.
- A rejected positioning draft or landing page isn't wasted: the rewrite,
  informed by what got cut, is usually the sharper artifact.
