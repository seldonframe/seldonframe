# Route-parity by shared-function extraction + reconciling a mid-build main advance

## The problem, in one line

Two routes rendering the same workspace (`/w/[slug]` and the subdomain's
`/s/[orgSlug]/[...slug]`) diverged — one honored
`organizations.theme.landingTemplate`, the other silently ignored it — and
while the fix was being built, a sibling PR (#78, live-archetype-at-source)
merged to main touching the exact code region being extracted.

## The approach

1. **Ground the seam before writing the spec.** Read both route files AND the
   loader they share (`loadLandingPayload` in
   `packages/crm/src/lib/landing/r1-save.ts`). The decisive fact was found
   there, not in the routes: the loader's `landingTemplate` is read off the
   org row itself, so /w's two-source precedence
   (`r1?.landingTemplate ?? ctx.theme?.landingTemplate`) collapses to one
   value whenever an r1 payload exists. That collapsed the fix from
   "replicate a precedence chain" to "pass one field through".
2. **Fix divergence by extraction, not duplication.** Lift the diverging
   branch verbatim into one pure function
   (`lib/landing/render-landing-template.tsx` — no db, no async, returns
   `ReactElement | null`) and make BOTH routes call it. Purity is what makes
   it unit-testable without mocks: tests assert on the returned element's
   `type` and `props` (`element.type === LANDING_TEMPLATES[id]`) — no DOM, no
   renderToString needed.
3. **Cover the asymmetric case too.** /w rendered templates for soul-only
   workspaces (no r1 row); /s didn't. The shared function takes
   `r1 | null` + `soul`, so the second route gained the fallback nearly free.
4. **On the mid-build main advance:** after the implementer finished,
   `git diff --stat origin/main..HEAD` showed ~1,900 deletions that nobody
   made — the tell that origin/main had advanced (a subagent's `git fetch`
   had updated the ref). Diagnose with `git merge-base HEAD origin/main` and
   diff against the merge-base to see the REAL change; then read the new main
   commit's diff (`git show <sha>`) BEFORE rebasing, specifically asking "does
   this change the semantics my extraction assumed?" (Here: #78 made the
   loader return an already-live-normalized archetype — which composed
   correctly with the extracted `r1?.archetype ?? themeArchetype` rule.)
5. **After the rebase, sweep for cross-PR dead code.** Two PRs each removing
   one of an import's two usages merge cleanly but leave a stale import that
   neither PR had. Grep the merged file for every identifier the touched
   hunks used (`ARCHETYPES` was imported but unused post-rebase). Re-run the
   affected specs (both branches' — ours AND #78's) before re-verifying.

## Judgment calls

- **Did NOT change /w's archetype precedence** (baked-r1-first) even though it
  looked inconsistent with the design-switch direction — that was the sibling
  PR's territory. Centralizing into one shared function means whoever fixes
  precedence next fixes both routes for free; fixing it here would have been
  a scope collision.
- **Did NOT add a route-level integration test.** Parity is guaranteed
  structurally (one function, provably-equal inputs — the reviewer traced
  both call sites' inputs to the same org-row fields); a db-mocked route test
  would restate that at high cost. The end-to-end check is the post-deploy
  smoke.
- **Did NOT widen the diff for a real adjacent bug found in review** (/s
  r1-home metadata hardcodes `index: true`, skipping the unclaimed-workspace
  noindex rule) — filed as its own follow-up task instead. Minimal impact
  beats opportunistic fixes.
- **Did NOT merge or push to main** — branch + PR (#80) only; the merge call
  is the human gate.

## The reusable rule, one line

When two render paths must never diverge, extract the branch into one pure
shared function both call (drift becomes impossible, tests become mock-free);
and when a subagent build spans time, always diff against
`git merge-base HEAD origin/main` — a reverse-diff full of deletions you
didn't make means main advanced, and the rebase needs a semantic read of the
new commits plus a stale-import sweep, not just conflict resolution.
