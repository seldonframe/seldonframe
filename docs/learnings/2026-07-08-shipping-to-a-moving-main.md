# Shipping to a moving main: concurrent sessions advanced origin/main twice mid-task

## The problem, in one line

Between starting a "merge feature/usage-meter then apply follow-ups" task and pushing, origin/main advanced TWICE (another session merged feature/usage-meter itself, then a third session merged a spawned cleanup task), invalidating the local merge commit and rejecting the first push.

## The approach

1. Keep the actual work as ONE commit on top of whatever base — never interleave your changes with merge commits you can't cheaply re-derive. When main moved, `git rebase --onto origin/main <old-base> <branch>` replayed just the one follow-up commit cleanly and the now-redundant local merge evaporated.
2. `git fetch origin && git log origin/main -1` IMMEDIATELY before every push, and treat a rejected push as "re-fetch, rebase the single commit, re-verify cheaply, push" — not as an error to debug.
3. After a rebase, re-run only the checks whose inputs changed: the targeted specs + the sweep (cheap, definitive) — the reviewer's verdict on the diff CONTENT carries over when `git diff origin/main HEAD` is byte-identical pre/post rebase and the base's overlap with your files is empty (`git diff <old-base> origin/main -- <your dirs>`).
4. Coordination failure to avoid: a verify subagent was dispatched INTO the same worktree, then the orchestrator switched branches and ran builds there mid-run, tainting the subagent's in-flight results. Had to message it to re-run. Either give the checker its OWN worktree, or freeze the shared tree until it returns.

## Judgment calls

- Did NOT re-run the full verify gate after each rebase: the diff content was unchanged and the base overlap with touched files was verified empty; re-running everything would have doubled wall-clock for zero information.
- Did NOT push with `--force` or race the other sessions: each rejection was resolved by rebasing onto the new tip, so every push was a fast-forward.
- Did NOT treat the branch-tip check from session start as still valid at merge time — the local `feature/usage-meter` ref itself had been advanced by another session between my first inspection and my merge, which is how pricing-ladder files appeared "unexpectedly" in the diff. Diffs that show files you didn't expect = re-inspect the refs, don't rationalize.

## The reusable rule, one line

In a repo with concurrent agent sessions, verify refs at USE time not at plan time (fetch before push, re-diff after every surprise), keep your work rebase-able as a single commit, and never mutate a worktree a subagent is verifying in.
