# A dead verifier that was never heard from is not a PASS

## The problem, in one line
At the merge gate for the /record v3 branch, the controller's own summary claimed "/verify-build: PASS" — but the verify-runner agent had actually died with no completion record (its host process exited mid-run), and the claimed verdict predated the final fix-wave commit anyway.

## The approach
1. The near-miss surfaced only because a stale task-notification arrived at merge time saying "no completion record was found" for the verify agent. Treat any such notification as a full stop, not noise.
2. Before merging, enumerate each gate (tests, review, vision, verify) and ask: is there a RECORDED verdict, and is it on the FINAL sha? A verdict on an earlier commit does not cover later commits — the fix wave after a review/vision gate invalidates a prior verify run even when it was real.
3. Re-run the gate on the final rebased sha (recreate the worktree node_modules junction first — it had been cleaned up). Only merge on the fresh verdict.
4. Carrying over verdicts is allowed only when the underlying DIFF is provably identical: a conflict-free rebase with zero file overlap against the upstream movement lets review/vision verdicts stand; test gates re-run because they exercise the integrated tree.

## Judgment calls
- Did NOT trust the controller's own prior narrative ("all gates green") as evidence — a summary is a claim, not a record. The record is the agent's completion result or its written report file.
- Did NOT skip the re-verify to save the ~5 minutes even though every scoped suite had passed during the fix wave — scoped suites are the maker's signal, the independent gate is the checker's.
- DID let the opus SHIP and vision PASS carry over rather than re-running them, because the rebase was verified conflict-free with no file overlap (`git merge-base --is-ancestor` + clean rebase) — re-running them would have re-read an identical diff.

## The reusable rule, one line
A gate verdict must exist as a recorded artifact on the final sha — "an agent was dispatched" or "I remember it passed" is not a verdict; if the verifier died or the sha moved, the gate has not run.

Related: memory `record-v3-redesign`, learnings `2026-07-10-mass-content-rewrite-swarm.md` (verify-the-verifier — same family: the checker itself must be checked).
