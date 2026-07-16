# Shared-checkout collision mid-build: recover by worktree + re-implement, never by stash surgery

## The problem, in one line
An implementer agent working in the repo's main checkout got the branch switched under it mid-task by a concurrent Claude session (reflog showed an unrequested checkout; stashes from both sessions interleaved), leaving its finished diff apparently stranded in `git stash`.

## The approach
1. **Stop all git mutations in the shared checkout immediately.** The implementer correctly reported BLOCKED instead of force-recovering; the controller verified the damage read-only first (`git status -sb`, `git stash list`, `git reflog --date=iso`). The other session's uncommitted work was live in the working tree — any checkout/pop would have destroyed it.
2. **Verify before trusting the stash.** The blocked agent believed its diff was in `stash@{0}`. Extracting the claimed files and diffing against the task's base commit showed the stash actually held a *different session's* WIP (a draft-approvals prop removal from an older branch) — applying it would have silently reverted someone else's feature. The tell: the extracted diff was far smaller than the task's known shape (2 deleted lines where ~70 were expected), and files the task had `git rm`-ed were still present in the stash tree.
3. **Isolate, then redo from the brief.** Created a git worktree for the feature branch (`git worktree add .claude/worktrees/<branch> <branch>`), junctioned `packages/crm/node_modules` from the guardian worktree (PowerShell `New-Item -ItemType Junction`, per the worktree-typecheck-method memory), and dispatched a fresh implementer scoped hard to the worktree ("do NOT run git at the repo root"). Re-implementing a fully-specified task brief took ~7 minutes — far cheaper and safer than forensic stash archaeology.
4. **Leave the other session's state untouched**: its stash entries, working tree, and branch were never modified; only `git show stash@{0}:<path>` (read-only) was ever run against them.

## Judgment calls
- **Did NOT pop or drop any stash** — a stash in a shared checkout must be presumed to contain someone else's work until proven otherwise.
- **Did NOT untangle the mixed stash** even after confirming it was recoverable in principle. When the task is small and the brief contains the complete edits, redoing beats recovering: recovery has unbounded risk (clobbering concurrent work), redo has bounded cost.
- **Did NOT switch the main checkout back** to the feature branch — the other session owned it now; fighting over HEAD is how the collision happened.
- Kept the collision report file the first implementer wrote (it refused to overwrite a pre-existing report from yet another plan — good instinct, same rule).

## The reusable rule, one line
Any multi-agent or long-running build dispatches implementers into a dedicated `git worktree` from the start — the main checkout is a shared surface that another session may own at any moment, and a stash found there is evidence, not property.
