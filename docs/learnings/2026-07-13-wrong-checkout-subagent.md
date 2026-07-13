# Subagents run git in the wrong checkout — pin the directory hard and verify their test claims

## The problem, in one line
An implementer subagent reported "done, but couldn't run tests (packages/core deleted)" and its commit never appeared on the feature branch — because it ran everything in a *different* checkout of the same repo.

## The approach
1. **Recognize the tell.** A subagent citing an environment problem that doesn't match your worktree (here: "packages/core deleted" — true only of a stale branch checked out at the PRIMARY repo path, false in the clean feature worktree) means it `cd`'d to the wrong directory. A machine often has several worktrees/checkouts of one repo; a bare `cd "<repo>"` lands in whichever branch that path currently has.
2. **Find where the work actually went.** `git -C <feature-worktree> log --oneline -1` shows the feature branch HEAD is unchanged. `git branch --contains <claimed-sha>` reveals the commit landed on the *other* checkout's branch. The files exist — just on the wrong branch.
3. **Recover by cherry-pick.** `git -C <feature-worktree> cherry-pick <claimed-sha>` brings the (clean, additive) commit onto the right branch. Then actually run the test yourself in the correct worktree.
4. **Distrust the "done."** The same weak-model agent had also shipped real defects it never caught, because it never ran the test it claimed to run (a React comment-node split its `+{count}` into `+<!-- -->99` so the literal "+99" never appeared; hardcoded neutral colors that break the theme). The controller running the test surfaced both in one command.
5. **Prevent the recurrence** in every subsequent dispatch: name the exact worktree path, explicitly forbid the primary checkout path by name, make the FIRST command `git rev-parse --abbrev-ref HEAD` with a required expected value, and require the agent to re-verify the branch immediately before committing. And treat any "PASS"/"couldn't run" from a cheap model as unverified until you run the covering test yourself.

## Judgment calls
- **Did NOT reset/clean the wrong checkout's branch** to remove the stray commit — that checkout had uncommitted work, and touching another worktree's branch state is riskier than leaving one additive commit behind. Logged it for later cleanup instead.
- **Did NOT re-dispatch the same cheap model to fix its own defects** — it had twice proven it would go to the wrong directory and skip verification. Re-dispatched a stronger model with the exact diagnosis and hard directory pinning.
- **A separate, self-inflicted variant:** `git stash drop` without first reading `git stash list`. The stash stack is shared repo-wide across ALL worktrees, and a `git stash push` on an already-clean file is a silent no-op — so `stash@{0}` was an unrelated branch's stash, not the one assumed. `git stash drop` prints the dropped commit hash; `git stash store <hash>` restores it. Never drop by position without listing first.

## The reusable rule, one line
When a repo has multiple worktrees, subagent dispatches must hard-pin the working directory (name it, forbid the others, assert `rev-parse` before acting) and the controller must run the covering test itself — a cheap model's "done"/"couldn't run" is unverified, and shared git state (branches, the stash stack) spans every checkout.

Related: `docs/learnings/2026-07-13-vendoring-magic-ui-motion.md` (the build this happened during). Also append to `tasks/lessons.md`.
