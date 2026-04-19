# Lessons — SeldonFrame

Patterns captured from corrections and near-misses, per CLAUDE.md §2.3.
Read at session start. Add an entry after every user correction.

Format: **Lesson** / **Trigger** / **Rule**

---

## L-01 — `git stash` silently drops tracked modifications mid-session

- **Trigger:** Ran `git stash` to test a hypothesis during the subdomain slice.
  `git stash pop` silently conflicted on `.next/` artifacts and did NOT restore
  the tracked modifications to source files. Lost ~20 minutes recovering via
  `git checkout stash@{0} -- <paths>`.
- **Rule:** Never `git stash` during a long autonomous run that's accumulating
  tracked edits. If you need to test a hypothesis, create a throwaway commit on
  a scratch branch instead. `.next/` drift makes stashes unsafe.

## L-02 — In Next.js 16, middleware is named `proxy.ts`

- **Trigger:** Went looking for `middleware.ts` to add subdomain routing and
  found nothing. Spent time mapping the tree before realizing Next 16 renamed
  the convention.
- **Rule:** Before writing new Next routing code, always skim
  `node_modules/.pnpm/next@*/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/`
  for the current file naming. Assume your training data is stale.

## L-03 — Read-modify-write on `organizations.settings` clobbers sibling keys

- **Trigger:** Code reviewer caught that `checkAndIncrementLlmSpend` was doing
  `{...settings, usage: {...}}` in app code, which would silently lose any
  concurrent write to `settings.blocks` or `settings.soul_compile`.
- **Rule:** Every write to a specific subtree of `organizations.settings` uses
  `sql\`jsonb_set(COALESCE(settings, '{}'), ARRAY[...]::text[], ...)\``.
  Pass the path as a bound `text[]` parameter, never `sql.raw`.

## L-04 — `sql.raw` with interpolated identifiers is a standing injection risk

- **Trigger:** First pass at `enableWorkspaceBlock` used
  `sql.raw(\`'{blocks,${blockSlug}}'\`)` for the jsonb path.
- **Rule:** jsonb path = bound `text[]`:
  `jsonb_set(..., ARRAY['blocks', ${blockSlug}]::text[], ...)`. Applies to every
  identifier that could ever come from user input, even if today's caller is
  internal-only.

## L-05 — Next 16 Opus 4.7 removes `temperature`, `top_p`, `top_k`, `budget_tokens`

- **Trigger:** The claude-api skill documentation.
- **Rule:** Default model is `claude-opus-4-7` with `thinking: {type: "adaptive"}`.
  Never send sampling parameters. Use `tool_use` + `tool_choice` for structured
  output (prefill is also removed on 4.6/4.7). Cache stable system prompts with
  `cache_control: {type: "ephemeral"}`.

## L-06 — Claim there's no staging smoke test when there isn't one

- **Trigger:** Multiple slices shipped with "all green" summaries even though no
  live DB, DNS, or Anthropic API was exercised.
- **Rule:** "Code-correct" and "staging-verified" are different claims. Always
  name which one you have. A green `pnpm build` proves TypeScript coherence, not
  that the endpoint actually works end-to-end.

## L-07 — Pushing straight to main is a high-risk action that deserves explicit confirmation

- **Trigger:** User asked "push all to git main so it's live." Pushing 52
  untested-against-staging source changes directly to main would auto-deploy to
  prod with broken invariants (missing migration, missing DNS, missing env vars).
- **Rule:** Destructive / shared-system actions (push to main, force-push,
  release to prod) get paused for explicit confirmation even when the user
  phrases it casually. Present the risks, offer PR-based alternatives, and do
  not proceed without a clear green light.

## L-08 — Discriminated-union type access requires narrowing

- **Trigger:** Accessed `spend?.anonymous` on a `SpendCheckResult` union where
  `anonymous` only exists on the `allowed: true` branch. TypeScript 400.
- **Rule:** When a function returns `{ok: true, ...} | {ok: false, ...}`, narrow
  to the branch you want before accessing branch-specific fields. Usually:
  `const anon = result?.allowed && result.anonymous;`

---

## Template for new entries

```
## L-NN — <one-line summary>

- **Trigger:** What happened that triggered the correction.
- **Rule:** What you will do (or not do) next time, specifically enough that
  future-you could follow it without re-reading the context.
```
