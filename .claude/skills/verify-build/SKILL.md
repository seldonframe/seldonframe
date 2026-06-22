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
