# Proving a refactor changed zero rendered output (SSR-hash technique)

## The problem, in one line
Dedupe logic shared by two React pricing shells when one of them is a
"do not change the rendered output" legacy view whose tests pin only a
few structural regexes — regex pins can't prove the refactor didn't move
a byte.

## The approach
1. Before touching anything, write a throwaway script INSIDE the package
   (path aliases like `@/` don't resolve from outside the tsconfig root;
   a `.mts` extension also broke tsx interop — use `.tsx` and the same
   relative-import style the spec files use). The script `renderToString`s
   every component variant that matters (here: both shells × authed/
   unauthed) and prints a sha256 per variant.
2. Capture the hashes + run the pinning spec files + save the sorted
   `tsc --noEmit` error list to a file (judge tsc by DELTA, not absolute
   count — see the worktree-typecheck lesson).
3. Do the refactor: extract the duplicated logic into a plain non-JSX
   module (`packages/crm/src/app/pricing/tier-checkout.ts`); each
   component keeps its own `useState` wiring and calls the shared
   function. Extracting only imperative logic cannot change SSR output.
4. Re-run the hash script: all hashes must be byte-equal to step 2.
   Re-run specs; diff the tsc error list (must be empty).
5. When a WIDER test sweep shows failures you never baselined: commit
   your work first (checkpoint), `git checkout origin/main -- <touched
   files>`, re-run exactly the failing specs. Same failures ⇒ proven
   pre-existing; then `git reset --hard HEAD` to restore the commit.
   Never `git stash` for this (lessons L-01: stash pops drop work).
6. Delete the throwaway script; it's verification scaffolding, not repo
   surface.

## Judgment calls
- Did NOT wire the legacy flag-OFF shell to the shared feature-list
  export, even though the task said "import it in the other two": its
  copy had ALREADY drifted (8 old-copy items vs the live 6), so syncing
  it would change the pinned output — the harder constraint ("flag-OFF
  view unchanged") wins over the instruction written before the drift
  was known. Froze + documented the legacy copy instead.
- Did NOT reuse the existing `lib/billing/start-checkout.ts` helper
  despite the reuse-don't-rebuild rule: it has different wire semantics
  (sends `priceId` in the body, `/clients` cancelPath, throws instead of
  returning an error message, no 401→signup bounce). Reuse that changes
  observable behavior isn't reuse; a header comment in the new module
  names the distinction so nobody "consolidates" them later.
- Shared function returns `string | null` (error message or
  navigating-away) instead of throwing — both call sites render errors
  inline, so the seam matches the callers rather than forcing try/catch.

## The reusable rule, one line
When a refactor promises "output unchanged," snapshot-hash the real
output (renderToString per variant) before and after — structural test
pins prove presence, only byte-equality proves absence of change.

Related: tasks/lessons.md L-01 (no stash mid-session), the
worktree-typecheck-method memory (junction node_modules, judge tsc by
delta), the vision-verify skill (the same must-SEE-it principle for
pixels instead of SSR bytes).
