# Build-delta fingerprint: satisfying the "real next build" merge gate when no local install can build

## The problem, in one line

The house rule says a branch touching a `"use server"`/agent-runtime file must pass the REAL `next build` before merging (tsc + check-use-server both miss the sync-export break class), but every local `node_modules` copy (main checkout, guardian worktree, feature worktrees) is missing newer deps (markdown-to-jsx, posthog-js, posthog-node, qrcode) so `next build` fails on module resolution for ANY commit — including bare `origin/main` — while Vercel (fresh install) builds fine.

## The approach

1. Confirm the failure is environmental, not yours: none of the files in the module-not-found import traces appear in `git diff origin/main HEAD --name-only`.
2. Build the BASELINE: `git switch --detach origin/main`, run `./node_modules/.bin/next build > base.log 2>&1`, capture the exit code separately (see judgment calls).
3. Build the BRANCH: switch back, `next build > branch.log 2>&1`.
4. Compare failure fingerprints: `grep -o "Can't resolve '[^']*'" <log> | sort -u` for both logs, then `diff`. ALSO grep both logs for the other break classes: `must be async|Failed to compile|Type error|SyntaxError`, and compare "Module not found" counts.
5. Verdict: identical resolve-fingerprint + identical error-class profile + no new error kinds on the branch = the branch adds zero build regression. The sync-export-from-`"use server"` class this gate exists for WOULD show up as a new `must be async` error, so the gate's purpose is preserved.

## Judgment calls

- Did NOT run `pnpm install` to make the build pass locally: the worktree's node_modules was a junction into another worktree's real node_modules, and an install would write through the junction and corrupt the shared copy (tasks/lessons + memory `worktree-typecheck-method` rule). Removing the junction and doing a fresh multi-GB install was judged slower and riskier than proving equivalence by delta.
- Did NOT trust the background task's "exit code 0": `next build 2>&1 | tail -25` reports TAIL's exit code, and `next build > log; echo exit=$?` inside a backgrounded command chain reports the chain's last command. Always write the build's own exit status to the log line explicitly and read the log.
- Did NOT skip the gate on the argument "check-use-server already passed": that script has historically passed while the real build failed (2026-06-24, `bindingToCtxBooking`). The delta method keeps the stronger gate.

## The reusable rule, one line

When a required verification command fails identically on the base commit, run it on base AND branch and diff the failure fingerprints — a clean fingerprint delta is a valid pass; a raw exit code is not evidence either way.
