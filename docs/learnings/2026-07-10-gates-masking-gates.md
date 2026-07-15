# Fail-fast gates mask the gates behind them — always re-run the WHOLE chain after a fix

## The problem, in one line
Fixing the reported main-CI failures was not enough: two more layers of real
drift were hiding behind them, each only visible after the layer above it
went green.

## The approach
1. Layer 1 (reported): unit tests failed → CI job stopped → the later
   `pnpm emit:blocks:check` and `pnpm emit:event-registry:check` steps of the
   SAME job never ran. Both had real drift (a booking status added 2026-06-11
   was never re-emitted into BLOCK.md / event-registry.json).
2. Layer 2 (inside one gate): the block-codegen checker `process.exit(1)`s on
   the FIRST parse failure. An unparseable SKILL.md (fat skill with no
   `props`) killed the run before it ever compared the `hero` block — whose
   generated file had real drift (a hand-edited enum missing a value the
   runtime actually sets, i.e. a live validation bug).
3. Method that surfaced all of it: after fixing the named failures, run every
   CI step locally in the workflow's order (read `.github/workflows/ci.yml`
   for the step list) — not just the tests that were reported red.
4. On Windows, distinguish real drift from line-ending phantoms: run the
   emitter in WRITE mode, then ask `git diff` (git normalizes CRLF). Emitters
   that string-compare their output to a CRLF checkout report 100% "drift"
   locally; only the files git still shows changed are real.
5. Prove the fix introduces nothing: full-suite delta vs main tip
   (`git stash` → run → `git stash pop` → diff the sorted failing-test
   lists). Verdict here: 0 new, 10 fixed, 98 identical pre-existing
   env-dependent failures.

## Judgment calls
- Did NOT "fix" the 9 all-blocks BLOCK.md drift reports — git showed only 2
  files with real content changes; the rest were CRLF artifacts that CI's LF
  checkout never sees. Committing them would have been pure churn.
- Did NOT restructure the emitter to continue-past-parse-errors: tempting
  ("one bad block shouldn't hide the rest") but out of scope for a green-main
  fix — noted instead of done (Minimal Impact).
- Judged local suite health by DELTA against main tip on the same machine,
  not by absolute green — this repo has a known env-dependent local failure
  baseline (DB/network-bound specs).
- Beware `cmd | tail` for verification: the pipeline's exit code is tail's,
  not the runner's. The first "exit 0" was a lie; rerun with the output
  redirected to a file and echo the real `$?`.

## The reusable rule, one line
A red gate is also a blindfold: after fixing what it reported, re-run the
entire gate chain in CI order locally — and judge "drift" by `git diff`,
"green" by the real exit code, and suite health by delta vs main.
