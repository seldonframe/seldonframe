# Isolating a broken bump inside a dependabot batch using Vercel preview builds as the test oracle

## The problem, in one line
A 37-update dependabot group PR failed its Vercel build with `Server Actions must be async functions` in a **generated** file (`.well-known/workflow/v1/step/route.js`) that no source change explained — which of the 37 bumps caused it, and how do we land the rest?

## The approach
1. **Read the real build log first** (`npx vercel inspect dpl_<id> --logs`), not just the check status. The log showed the repo's own `check-use-server` gate PASSING and then Turbopack failing on the generated route — so the source files were valid and the *bundler output* was not. That one distinction ("source clean, bundle invalid") pointed away from our code and at the dependency that generates the file (`workflow` / `@workflow/next`).
2. **Search the suspect package's issue tracker for the literal error string** before experimenting. `vercel/workflow#817` documented the exact pattern: the workflow step-route bundler inlines `"use server"` modules into synchronous `__esm({...})` closures, and Next rejects a function-scoped `"use server"` on a non-async function.
3. **Two branches, one variable each, Vercel as the oracle.** Local `next build` in worktrees is unreliable here (stale installs — see the worktree-typecheck memory), and the failure only manifests in the production Turbopack build, so the honest harness is the environment that failed:
   - Branch A: main + ONLY the suspect pair bumped (workflow 4.2.4→4.6.0, @workflow/next 4.0.5→4.1.0), `next` pinned at its old version → predicted FAIL.
   - Branch B: main + all other 35 bumps, suspect pair held → predicted GREEN (and B doubles as the deliverable PR — no wasted build).
   Lockfiles regenerated with `pnpm install --lockfile-only` (no local node_modules churn; Vercel does its own install). Both predictions held: A failed with the identical 3 errors at the same generated-file lines with next unchanged; B built green.
4. **Judge red CI by name-level delta, never absolutely.** main's unit-tests job was itself red (70 DB-bound baseline failures). Extracted failing-test names from both runs (`gh run view --log-failed | grep -oE "✖ [^(]*" | sort -u`) and `comm`-diffed: identical 70 → zero regressions. (Gotcha: `grep -P` dies on non-UTF8 locale in Git Bash — use `-oE` with `LC_ALL=C.UTF-8`.)
5. **Make the hold durable in config, not comments.** `@dependabot ignore` comment-commands don't work on *grouped* PRs — the next weekly group would re-include the broken bump. The durable hold is an `ignore:` entry for the two packages in `.github/dependabot.yml`, committed on the split PR with a comment naming the tracking issue and the removal condition.

## Judgment calls
- **Did NOT rebuild locally.** The known-broken local-build path (stale worktree installs) would have produced ambiguous failures; two remote preview builds cost ~7 min each and are the exact environment that gated the PR. When the failing gate IS reachable as a harness, use it instead of approximating it.
- **Did NOT reuse the dependabot branch.** Its diff vs main deleted files (it was based before a later merge) — a stale base masquerades as a revert. Rebuilt the split from origin/main and applied the package.json diffs, which also avoided inheriting dependabot's stale lockfile.
- **Did NOT chase the @anthropic-ai/sdk bump as a build risk.** Mapped the usage surface, then discarded most flagged "risks" because `stop_reason` values, `usage` shape, and error-message text are *wire-level API contracts served by the provider* — an SDK version bump cannot change them. The genuinely version-sensitive surfaces were only the deep import path (verified present on unpkg) and error-class shape (changelog clean). Distinguish SDK-owned surface from API-owned surface before writing a compat matrix.
- **Did NOT attempt the workaround refactor** (splitting `"use server"` wrappers from the pure lib modules workflows import). It's the right long-term fix per upstream #817, but it's a sizeable seam refactor across payments/bookings/emails — scoped into the tracking issue instead of bolted onto a deps PR (Runaway Refactor guard).

## The reusable rule, one line
When a batched dependency PR fails on generated/bundled output, bisect by pushing one-variable branches and let the failing CI environment itself be the test oracle — then encode the hold in the bot's config (grouped PRs ignore comment-commands), never just in a PR comment.
