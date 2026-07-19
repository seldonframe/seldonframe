# Pull the real assertion error before rewriting a "stale" test

## The problem, in one line
A briefing labeled ~30 red main-CI specs "stale UI expectations — update the
tests to the live surface," but 16 of them were actually crashing on
`ReferenceError: document is not defined` before any assertion ran.

## The approach
1. Never fix from the failure NAMES. `gh run view <id> --log-failed` gives
   names; the node:test runner prints the actual error + stack in the
   `✖ failing tests:` summary at the END of the log — extract that section
   and read the error per spec file before deciding what "the fix" is.
2. Classify by error type, not by briefing category. Here the split was:
   `AssertionError` with a value diff = genuinely stale expectation (update
   test to live surface, after confirming the product change was intentional
   via git log / in-code comments); `ReferenceError`/`MODULE_NOT_FOUND` =
   harness/environment gap (fix the harness, leave assertions alone).
3. For the harness gap, search for an existing solution before building one:
   `packages/crm/tests/setup-dom.ts` (a complete jsdom bootstrap) already
   existed — it was written to be loaded via `node --import ./tests/setup-dom.ts`,
   but `scripts/run-unit-tests.js` (what CI runs) never passes that flag, so
   every `@testing-library/react` spec died at render(). The fix is one line
   per spec: `import "../../setup-dom";` as the FIRST import (each spec file
   runs as its own child process under node:test, so globals can't leak
   across specs). A parallel implementer built a duplicate bootstrap before
   we found the existing one — the duplicate was deleted and its one real
   addition (a `matchMedia` stub) folded into the canonical file.
4. Verify by failing-list delta, not by exit code: run the full suite on the
   branch, `git stash push -u -- <test dirs>`, run again (= base state),
   `comm` the sorted `✖`-name lists. Ship only on "0 new, N fixed".

## Judgment calls
- Did NOT wire `--import ./tests/setup-dom.ts` into the CI runner globally:
  that would inject `window`/`document` into all ~350 spec processes, and any
  spec (or library) that branches on `typeof window` would silently flip to
  its client path — an unbounded blast radius for a 3-file problem.
- Did NOT update tests to the live surface on the briefing's word alone: for
  each drift class the intent was confirmed first (the default-theme flip is
  documented in `src/lib/theme/types.ts` v1.40.0 comments; the trial removal
  and marketing redesign are recorded decisions). A test that "fails stale"
  can also be the only thing flagging an unintentional regression.
- Did NOT touch the ~50 DB-bound E2E failures (need a product decision:
  CI database vs skip-contract) or files owned by the open PR #49.

## The reusable rule, one line
A failing test name tells you WHERE it broke, never WHY — read the actual
error line and fix harness errors as harness bugs; only value-diff assertion
failures may be "updated to the live surface," and only with evidence the
drift was intentional.
