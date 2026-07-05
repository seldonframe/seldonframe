---
name: verify-build
description: SeldonFrame merge gate — run unit tests + tsc + check-use-server + migration-journal + regression-grep and return ONE pass/fail verdict. Invoke before merging any branch; nothing merges without a green verdict.
---

# /verify-build — the merge gate

The single objective gate every branch passes before merge. It exists to kill the "looks done" failure: a build ships only when the gate is green, not when an agent says it's finished.

**The rule: no branch merges to `main` without a PASS verdict from this skill.** The agent that wrote the code does NOT get to wave it through (maker ≠ checker).

## Run these five checks (from the worktree root)

1. **Unit tests** — the suites touched by the change (or the package suite):
   `cd packages/crm && node --import tsx --test tests/unit/<area>/*.spec.ts`
   PASS = `fail 0`. Use `node --import tsx`, **not** bare `tsx` (the `@/` alias needs the import hook).

2. **Type check** — `packages/crm/node_modules/.bin/tsc -p packages/crm/tsconfig.json --noEmit`
   PASS = **0 NEW** errors. The ONLY allowed baseline is the ~10 pre-existing `.next/types/validator.ts` React-19 generated artifacts (already `ignoreBuildErrors`-ed). Any other error = FAIL.

3. **use-server hygiene** — `bash scripts/check-use-server.sh src`
   PASS = clean (every `"use server"` module exports only async functions).

4. **Migration journal** (only if the change added a migration) — confirm `packages/crm/drizzle/meta/_journal.json` gained exactly one appended entry (the new tag) and the journal check reports 0 orphans.
   ⚠️ The drizzle dir has pre-existing un-journaled `.sql` files with colliding numbers (0025/0026/0027/0028…). These are known cruft. Judge by the **journal append** + the new migration being **additive**, NOT by `cat 00NN_*.sql` (which globs the orphan too).

5. **Regression grep** — confirm the change did NOT touch the files it promised to leave alone. For each build, name the forbidden set and grep the diff:
   `git diff --name-only origin/main..HEAD | grep -E '<forbidden paths>'` → must be **empty**.
   Common forbidden sets: workspace booking (`bookings/actions.ts`, `bookings/create-for-customer.ts`, `bookings/providers.ts`); messaging confirmation (`messaging/skills/booking-confirmation.ts`, `messaging/dispatch.ts`); email/sms paths when the change shouldn't touch them.

## Verdict (return ONE line)
- **PASS** — all five green. Safe to merge. State: the test count, that tsc/use-server/journal are clean, and that the regression grep was empty.
- **FAIL** — name the exact failing check + the failure. Do NOT merge. Hand back to the implementer.

## Why this is the keystone
This is the one block that turns repetition into progress. Without it a loop bills you in silence (the "Ralph Wiggum" early-exit — an agent declares done on a half-finished job). With it, the maker can be fast + cheap because the gate is strict + independent. Prove it manually a few times, then it becomes the verifier inside `/ship-feature` and the heartbeat of a scheduled green-main guardian.

## Framing the loop this gate closes (the goal contract)

This gate is only the *stop condition* of a loop. A loop converges when its **goal** is written as a contract the runner can check itself against — five parts, stated up front before any code:

1. **Objective** — one sentence, the observable end state ("SeldonChat can set a hero background and the result renders legibly"), not a task list.
2. **Constraints** — the invariants that must hold: files/systems to leave alone, the house rules (add named files only, money-safe, org-scope every query, SSRF-guard user URLs), flag-gating, "no new deps."
3. **Validation command** — the exact runnable check that decides done. For a merge, that command *is* `/verify-build` (the five checks above) — plus `vision-verify` for anything with a visual surface. Name it explicitly so the loop runs it, not guesses.
4. **Stop condition** — when to stop: "validation green AND an independent reviewer approved," or a hard iteration cap. Never "when it looks done."
5. **Docs / context** — the 2-3 files, specs, or seams to read first, so the runner starts with the map, not a blank slate.

**The one rule that protects the whole loop: never weaken the validation to make it pass.** Do not delete or loosen a failing assertion, lower a threshold, `skip` a test, or narrow a rubric to get green. A test that no longer asserts the behavior is worse than a red one — it launders "broken" into "done." If a check is genuinely wrong, fix the check *and say so*; don't quietly file it down. This is what keeps `maker ≠ checker` honest: the gate only means something if the maker can't move it.
