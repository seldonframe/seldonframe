# 2026-07-15 — Triaging a stale PR against a moved main: grep for the seam, then rebase + stash-delta

## The problem, in one line

Two 5-day-old CI-fix PRs (#49, #54) sat unmerged while main moved ~30 commits; a memory note claimed their "key artifacts were re-landed on main by other work," so the default plan was to strip them down or close them as superseded.

## The approach

1. **Disprove or confirm the "already landed" claim against the refs, not the note.** Grep main for the *artifact itself* — the `deps.now` seam in `packages/crm/src/lib/agents/tools.ts`, the `matchMedia` stub in `tests/setup-dom.ts`, the `contract:throw-ok` markers — not for the file name. Result: every one was absent; only the base `setup-dom.ts` file pre-existed, which is what made the claim *look* true. The entire "mostly superseded" framing collapsed in four greps.
2. **Rebase a COPY, not the PR branch**, in a throwaway `git worktree` (`git worktree add <tmp> -b pr49-rebase origin/<branch>`), onto current main. Both rebased in minutes — GitHub's CONFLICTING flag on #54 was one journal file (`tasks/lessons.md`), resolved as main's version + the branch's appended entries.
3. **Judge generated files by re-running the generator, never by eyeballing the diff.** For the committed emitter outputs (`event-registry.json`, `caldiy-booking.block.md`, hero `__generated__/block.ts`) run the emitters on the rebased branch and read `git diff`: empty diff = the PR's regen matches today's emitter. On Windows both emitters' `--check` modes report phantom drift (CRLF); the working-tree diff after a real emit is the truth.
4. **Verify by stash-delta, not absolute counts.** Full unit suite on main tip → failing-name set (extract the `✖` lines, strip durations, `sort -u`); same run on each rebased branch; `comm` the sets. Verdict format: "0 new / N fixed." (#49: 0/9, #54: 0/40 on 9,829 tests.) Absolute red is meaningless here — main carries a ~50-spec DB-bound Neon baseline.
5. Force-push with `--force-with-lease` after a fresh fetch; post the delta verdict as a PR comment so the merger doesn't re-derive it.

## Judgment calls

- **Did NOT drop the PRs' regenerated files in favor of main's**, despite the "stale generated output" warning in the brief — the emitter re-run proved the PR copies were the *current* output and main's were the stale ones (two roundtrip specs flipped from fail to pass).
- **Did NOT trust either memory note** (one said "artifacts re-landed," the other "baseline all DB-bound") — both were wrong in ways that would have inverted the triage decision. Notes recorded under an earlier main are hypotheses, not facts.
- **Did NOT run tests and rebase in the same working tree** — suite ran in the junctioned worktree while rebases happened in scratch worktrees, so neither invalidated the other.
- **Did NOT strip the PRs' docs/journal files** — `docs/learnings/` and `.superpowers/sdd/` are established conventions on main; only the `tasks/lessons.md` conflict needed hand-merging.

## The reusable rule, one line

Before closing or stripping a stale PR as "superseded," grep the target branch for the PR's *load-bearing artifact* (the seam, the marker, the stub) — file existence and memory notes both lie; then let rebase + generator-re-run + stash-delta decide what survives.

Related: `docs/learnings/2026-07-10-clock-rotted-test-fixtures.md`, `docs/learnings/2026-07-10-diagnose-before-updating-tests.md` (both ride the PRs this note triaged); memory `worktree-typecheck-method` (junction + judge-by-delta mechanics), `green-main-ci-fix-2026-07-10` (corrected 2026-07-15).
