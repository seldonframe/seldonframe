# Claim-flow origin fix — build report

**Branch:** `fix/claim-compile-origin-split` (off `origin/main` @ `1aa7bf4c9`)
**Plan:** `docs/superpowers/plans/2026-07-15-claim-flow-origin-fix.md`
**Spec:** `docs/superpowers/specs/2026-07-15-claim-flow-origin-fix-design.md`

## Commits

| Task | SHA | Message |
|---|---|---|
| 1 | `b533cfe0e` | refactor(auth): extract app-host pin helper from signup (verbatim policy, pure core for tests) |
| 2 | `18636228d` | fix(record): pin /record to app host + allowlist claim return + canonical/sitemap move |
| 3 | `7a958f930` | fix(record): render compile failures at the CTA, never navigate away mid-compile |

## Environment note (pre-Task-1, not part of the plan's file list)

Both the `packages/crm/node_modules` junction (per the plan's baseline
instructions) AND the parent repo's own package install were broken before
any work started: `node --import tsx --test ...` failed with
`ERR_MODULE_NOT_FOUND: tsx` in **the main repo itself** (not just the
worktree) — `node_modules/.pnpm/tsx@4.21.0/node_modules/tsx` on disk was an
empty extraction (only a `node_modules/` subfolder, no `package.json`/dist).
Fixed by running `pnpm install --offline --frozen-lockfile` then
`pnpm install --offline --force --filter @seldonframe/crm` in the **parent
repo** (`C:\Users\maxim\CascadeProjects\Seldon Frame`) to re-extract from the
local pnpm store (no network fetch — `downloaded 0` in the log), then
recreating both the `packages/crm/node_modules` and root `node_modules`
junctions from parent → worktree. This is an environment repair, not a code
change — no file under the plan's touched-file list was affected, and no
new dependency was added (pnpm re-extracted an already-declared, already
lockfile-pinned dep from the local store).

## Baselines vs final (judge by delta)

| Check | Baseline | Final | Delta |
|---|---|---|---|
| Unit test files | 735 | 735 | — |
| Unit test failures | 70 (DB-bound Neon baseline) | 70 | **0 new** |
| Failing file set | — | — | **identical set** (diffed by filename, verbatim match — only per-run timings differ) |
| `tsc --noEmit` errors (packages/crm) | 77 | 77 | **0 new** (diffed line-for-line, identical) |

Pre-existing tsc baseline errors are all unrelated stale imports (deleted
`packages/core` subpath modules — `@seldonframe/core/events` etc. — from
other in-flight branch state visible in the parent repo's git status, not
touched by this slice) plus a handful of `implicit any` in
`lib/events/listeners.ts`.

## Task 1 — extract host-pin helper

Moved `normalizeHost` / `isExemptHost` / `redirectToAppHostIfNeeded`
(including the 2026-07-04 prod-incident comment block) **verbatim** from
`(auth)/signup/page.tsx` into new `packages/crm/src/lib/auth/app-host-redirect.ts`,
refactoring the async wrapper around a new pure core,
`resolveAppHostRedirectTarget`, per the plan's interface. `signup/page.tsx`
now imports the four names it needs and its local declarations are gone. No
signup call-site behavior changed — proven by the pre-existing signup specs
staying green and zero tsc delta.

New test `tests/unit/auth/app-host-redirect.spec.ts` (6 tests): www/apex
host → app-origin redirect target with query byte-identical, already-on-
app-host → null, all four exempt hosts (+ empty) → null, plus the two host
helpers. All pass.

## Task 2 — pin /record + allowlist + canonical/sitemap

- `signup-redirect.ts`: added `"/record"` to `SAFE_REDIRECT_PREFIXES` with a
  dated comment naming this incident.
- `record/page.tsx`: rebuilds the `session`/`claimed`/`shared` search string
  from the already-awaited `searchParams` and calls
  `await redirectToAppHostIfNeeded("/record", search)` as the first
  statement after the flag gate — **before** the `auth()` call, so the
  session-cookie read happens on the right host. `metadata.alternates.canonical`
  moved to `https://app.seldonframe.com/record`.
- `sitemap.ts`: the `/record` entry now emits `https://app.seldonframe.com/record`
  explicitly (hardcoded app origin) instead of `${base}/record` (which stays
  the marketing host for every other entry) — one-line change + comment,
  no other entries touched.

Extended `tests/unit/auth/signup-redirect.spec.ts` with the plan's exact
3-test block: accepts `/record` and `/record?session=abc&claimed=1`; segment
boundary (`/recordings`, `/recordx` still rejected — **verified failing
before the allowlist change and passing after**, per plan's "pin existing
behavior" requirement); traversal/protocol-relative still rejected
(`//record`, `/record/../oauth/authorize`) — these two passed **even before**
the allowlist entry was added, confirming they were never dependent on
`/record`'s presence.

`record-page-render.spec.ts` (13 tests) renders `<RecordClient>` directly,
not the page/host-pin logic, so it's unaffected — all pass.

## Task 3 — compile-error honesty audit

Audited `handleCompileAgent`/`handleCompileNow` and the `message` state in
`record-client.tsx` against the plan's three points:

**(a) No navigation while `compiling` is true or on failure.**
CONFIRMED — `handleCompileAgent` only calls `setCompiling`/`setMessage`/
`setCompiledTemplateId`; the only `window.location.assign` in the file is in
`handleStartFresh` (the unrelated "start over" affordance, gated behind a
`window.confirm`). No change needed.

**(b) The `message` state renders visibly adjacent to the compile CTA.**
GAP CONFIRMED — `message` rendered once, at the very top of
`record-client.tsx`'s JSX tree (line ~649), well above the recording
slots and the `<RecapPanel>` that hosts both compile CTAs
(`onCompileNow` for authed in-place compile, `onCompileAgent` for the
post-claim "approved" phase). Once slots/recap render, that top banner is
scrolled out of view relative to the CTA the operator is looking at —
exactly the "swallowed on navigation" failure mode the spec calls out,
even without any actual navigation.

**Fix applied:** introduced a dedicated `compileError` state (distinct from
the pre-existing `message`, which is kept for session-mint failures — the
only content on screen at that point, so top-of-page is correct there).
`handleCompileAgent` now calls `setCompileError` (clearing it at the start
of each attempt) instead of reusing `setMessage`. `compileError` threads
into `<RecapPanel>` as a new optional prop and renders as a `role="alert"`
paragraph immediately above the compile CTA block (matching the plan's
snippet and the panel's existing text-size/color classes).

**(c) Failure leaves a retry affordance (CTA re-enabled).**
CONFIRMED — both compile buttons use `disabled={compiling}`; `compiling`
resets to `false` in the `finally` block regardless of success/failure, so
the same button is clickable again immediately. No change needed.

Files changed: `record-client.tsx` (new `compileError` state, threaded to
`setCompileError` in `handleCompileAgent`, passed to `<RecapPanel>`),
`record-ui/recap-panel.tsx` (new `compileError` prop, rendered above the
CTA block).

## Full regression (post-Task-3)

- `node scripts/run-unit-tests.js`: 735 files, 70 failures — **identical
  failing-file set to baseline** (byte-for-byte filename diff, confirmed).
- `pnpm exec tsc --noEmit` (packages/crm): 77 errors — **identical to
  baseline** (line-for-line diff, confirmed).
- `record-page-render.spec.ts` (13/13), `app-host-redirect.spec.ts` (6/6),
  `signup-redirect.spec.ts` (47/47 incl. the 3 new `/record` tests): all
  green.
- Pre-check verify-build greps on the diff: no `sql.raw`, no `"use server"`
  placement changes, no migration files touched.

## Deviations from plan

None. All three tasks landed exactly as specced; Task 3's fix (dedicated
`compileError` state + prop) is the minimal-diff realization of the plan's
"render it under the button" instruction — kept `message` for its original
(session-mint) purpose rather than repurposing it, since collapsing the two
would have made a session-mint failure silently invisible if it happened to
coincide with a stale `compileError`.

## Open risks / out of scope (per spec §6)

- No integration test of the live 307 redirect (needs a running server) —
  the pure-core unit tests (`resolveAppHostRedirectTarget`) plus post-deploy
  smoke are the deliberate coverage split per the plan's self-review.
- Post-deploy smoke (spec §5 a–d) is controller-level, not run from this
  worktree.
- Slice 2 (interview one-question-at-a-time + recap palette/font), any
  cookie-domain change, and `/record` on workspace subdomains remain
  explicitly out of scope.
